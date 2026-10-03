import { Injectable } from '@nestjs/common';
import {
  Bill,
  BillCategory,
  BillKind,
  PaymentMethod,
  Prisma,
  Transaction,
  Wallet,
  WalletType,
} from '@prisma/client';
import { ClockService } from '@/common/clock/clock.service';
import { AppException } from '@/common/errors';
import { fromDateOnly } from '@/common/utils/date-only';
import { PrismaService } from '@/prisma/prisma.service';
import { SavingsService } from '@/modules/savings/savings.service';
import { TransactionsService } from '@/modules/transactions/transactions.service';
import { WalletsService } from '@/modules/wallets/wallets.service';
import { CreateBillDto } from './dto/create-bill.dto';
import { PayBillDto } from './dto/pay-bill.dto';
import { UpdateBillDto } from './dto/update-bill.dto';
import { BillSchedule, computeBillSchedule, lastPeriodOf, owesIn } from './engine/bill-schedule';

/** The category every bill payment is filed under, in whichever wallet paid it. */
export const BILL_CATEGORY = { name: 'Tagihan', color: '#329DB8', icon: 'receipt' } as const;

const PAYMENT_INCLUDE = {
  transaction: {
    select: {
      id: true,
      walletId: true,
      amount: true,
      occurredOn: true,
      deletedAt: true,
      wallet: { select: { name: true, color: true } },
    },
  },
} satisfies Prisma.BillPaymentInclude;

export type BillPaymentRow = Prisma.BillPaymentGetPayload<{ include: typeof PAYMENT_INCLUDE }>;
export type BillWithPayments = Bill & { payments: BillPaymentRow[] };
export type BillWithSchedule = BillWithPayments & { schedule: BillSchedule };

export interface BillsSummary {
  /** What is owed from the start of every bill through this month and not yet paid. */
  unpaidDueTotal: number;
  unpaidDueCount: number;
  overdueCount: number;
  /** Paid this month, by occurredOn. */
  paidThisMonthTotal: number;
  /** What this month's schedule asks for: every live bill owing this period, paid or not. */
  monthlyTotal: number;
  monthlyCount: number;
  /** `monthlyTotal` split by category, largest first. */
  monthlyByCategory: { category: BillCategory; total: number; count: number }[];
}

/** Most urgent first: overdue, due soon, then upcoming by date, then paid, then done. */
const STATUS_ORDER: Record<BillSchedule['status'], number> = {
  OVERDUE: 0,
  DUE_SOON: 1,
  UPCOMING: 2,
  PAID: 3,
  DONE: 4,
};

/**
 * Bills (tagihan).
 *
 * A bill belongs to the user, not a wallet, so the same list shows in every wallet. Paying
 * one is the only thing here that touches money, and it does so through the doors that
 * already exist -- a SPEND through `TransactionsService.create`, a WITHDRAW through
 * `SavingsService.createWithdrawal` -- so the budget cache, the balance floor and the
 * mandatory withdrawal reason all apply exactly as they do anywhere else.
 */
@Injectable()
export class BillsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
    private readonly wallets: WalletsService,
    private readonly transactions: TransactionsService,
    private readonly savings: SavingsService,
  ) {}

  async list(
    userId: number,
    includeArchived = false,
  ): Promise<{ items: BillWithSchedule[]; summary: BillsSummary }> {
    const bills = await this.prisma.bill.findMany({
      where: { userId, ...(includeArchived ? {} : { isArchived: false }) },
      include: { payments: { include: PAYMENT_INCLUDE, orderBy: { period: 'desc' } } },
    });

    const today = this.clock.today();
    const items = bills.map((bill) => this.withSchedule(bill, today));

    items.sort(
      (a, b) =>
        Number(a.isArchived) - Number(b.isArchived) ||
        STATUS_ORDER[a.schedule.status] - STATUS_ORDER[b.schedule.status] ||
        (a.schedule.nextDueDate ?? '9999').localeCompare(b.schedule.nextDueDate ?? '9999') ||
        a.name.localeCompare(b.name),
    );

    const period = today.slice(0, 7);
    const summary: BillsSummary = {
      unpaidDueTotal: 0,
      unpaidDueCount: 0,
      overdueCount: 0,
      paidThisMonthTotal: 0,
      monthlyTotal: 0,
      monthlyCount: 0,
      monthlyByCategory: [],
    };
    const byCategory = new Map<BillCategory, { total: number; count: number }>();

    for (const bill of items) {
      for (const payment of livePayments(bill)) {
        if (fromDateOnly(payment.transaction.occurredOn).slice(0, 7) === period) {
          summary.paidThisMonthTotal += payment.transaction.amount;
        }
      }
      if (bill.isArchived) continue;
      summary.unpaidDueTotal += bill.amount * bill.schedule.unpaidDueCount;
      summary.unpaidDueCount += bill.schedule.unpaidDueCount;
      summary.overdueCount += bill.schedule.overdueCount;

      if (!owesIn(bill, period)) continue;
      summary.monthlyTotal += bill.amount;
      summary.monthlyCount += 1;
      const slot = byCategory.get(bill.category) ?? { total: 0, count: 0 };
      slot.total += bill.amount;
      slot.count += 1;
      byCategory.set(bill.category, slot);
    }

    summary.monthlyByCategory = [...byCategory]
      .map(([category, slot]) => ({ category, ...slot }))
      .sort((a, b) => b.total - a.total);

    return { items, summary };
  }

  async findOne(userId: number, id: number): Promise<BillWithSchedule> {
    return this.withSchedule(await this.findOwned(userId, id), this.clock.today());
  }

  async create(userId: number, dto: CreateBillDto): Promise<BillWithSchedule> {
    const shape = this.assertShape(dto.kind, dto.startPeriod, dto.endPeriod ?? null);

    const bill = await this.prisma.bill.create({
      data: {
        userId,
        name: dto.name,
        platform: dto.platform || null,
        amount: dto.amount,
        kind: dto.kind,
        category: dto.category,
        dueDay: dto.dueDay,
        ...shape,
        note: dto.note ?? null,
      },
      include: { payments: { include: PAYMENT_INCLUDE } },
    });

    return this.withSchedule(bill, this.clock.today());
  }

  async update(userId: number, id: number, dto: UpdateBillDto): Promise<BillWithSchedule> {
    const existing = await this.findOwned(userId, id);
    const kind = dto.kind ?? existing.kind;
    const shape = this.assertShape(
      kind,
      dto.startPeriod ?? existing.startPeriod,
      dto.endPeriod !== undefined ? dto.endPeriod : existing.endPeriod,
    );

    const bill = await this.prisma.bill.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.platform !== undefined ? { platform: dto.platform || null } : {}),
        ...(dto.amount !== undefined ? { amount: dto.amount } : {}),
        ...(dto.category !== undefined ? { category: dto.category } : {}),
        ...(dto.dueDay !== undefined ? { dueDay: dto.dueDay } : {}),
        ...(dto.note !== undefined ? { note: dto.note } : {}),
        ...(dto.isArchived !== undefined ? { isArchived: dto.isArchived } : {}),
        kind,
        ...shape,
      },
      include: { payments: { include: PAYMENT_INCLUDE, orderBy: { period: 'desc' } } },
    });

    return this.withSchedule(bill, this.clock.today());
  }

  /**
   * Deletes a bill that was never paid; archives one that was.
   *
   * A paid bill's payments are the only record of which transaction settled which month,
   * and the transactions themselves stay either way -- so archiving keeps that history
   * readable instead of leaving the transactions unexplained.
   */
  async remove(userId: number, id: number): Promise<{ archived: boolean }> {
    const bill = await this.findOwned(userId, id);

    if (bill.payments.length > 0) {
      await this.prisma.bill.update({ where: { id }, data: { isArchived: true } });
      return { archived: true };
    }

    await this.prisma.bill.delete({ where: { id } });
    return { archived: false };
  }

  /**
   * Pays one period of a bill from the chosen wallet.
   *
   * The transaction is written first, through the wallet type's own door, and the
   * payment link second. If the link cannot be written -- a second tap paid the same
   * month in between -- the transaction is removed again through the same door, so a
   * failed payment never leaves money missing from a wallet.
   */
  async pay(
    userId: number,
    id: number,
    dto: PayBillDto,
  ): Promise<{ bill: BillWithSchedule; transaction: Transaction; period: string }> {
    const bill = await this.findOwned(userId, id);
    const today = this.clock.today();
    const { schedule } = this.withSchedule(bill, today);

    if (bill.isArchived) {
      throw AppException.conflict(`bill ${id} is archived; restore it before paying it`);
    }

    const period = dto.period ?? schedule.nextPeriod;
    if (period === null) {
      throw AppException.conflict(`bill ${id} is already paid in full`);
    }

    const last = lastPeriodOf(bill);
    if (period < bill.startPeriod || (last !== null && period > last)) {
      throw AppException.validation(`bill ${id} owes nothing for ${period}`, [
        { field: 'period', constraint: 'outOfSchedule' },
      ]);
    }

    if (livePayments(bill).some((payment) => payment.period === period)) {
      throw AppException.conflict(`bill ${id} is already paid for ${period}`);
    }

    const wallet = await this.wallets.findOwned(userId, dto.walletId);
    if (wallet.isArchived) {
      throw AppException.validation(`wallet ${wallet.id} is archived`, [
        { field: 'walletId', constraint: 'archived' },
      ]);
    }

    const transaction = await this.writeTransaction(userId, wallet, bill, period, dto, today);

    try {
      await this.prisma.$transaction(async (tx) => {
        // A payment whose transaction was deleted no longer counts, but its row still
        // holds the (bill, period) unique key. Clear it so the month can be paid again.
        await tx.billPayment.deleteMany({
          where: { billId: id, period, transaction: { deletedAt: { not: null } } },
        });
        await tx.billPayment.create({
          data: { userId, billId: id, transactionId: transaction.id, period },
        });
      });
    } catch (error) {
      await this.undoTransaction(userId, wallet, transaction.id);

      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw AppException.conflict(`bill ${id} is already paid for ${period}`);
      }
      throw error;
    }

    return { bill: await this.findOne(userId, id), transaction, period };
  }

  private async writeTransaction(
    userId: number,
    wallet: Wallet,
    bill: Bill,
    period: string,
    dto: PayBillDto,
    today: string,
  ): Promise<Transaction> {
    const amount = dto.amount ?? bill.amount;
    const occurredOn = dto.occurredOn ?? today;
    const categoryId = await this.billCategoryId(userId, wallet.type);
    const label = `${bill.name} (${period})`;
    const note = dto.note?.trim() || `Tagihan ${label}`;

    if (wallet.type === WalletType.SAVINGS) {
      return this.savings.createWithdrawal(userId, wallet.id, {
        amount,
        occurredOn,
        reason: `Bayar tagihan ${label}`.slice(0, 200),
        categoryId,
        expectedReturn: false,
        note,
      });
    }

    return this.transactions.create(userId, {
      walletId: wallet.id,
      occurredOn,
      amount,
      categoryId,
      merchant: bill.platform ?? bill.name,
      paymentMethod: dto.paymentMethod ?? PaymentMethod.TRANSFER,
      note,
    });
  }

  private async undoTransaction(userId: number, wallet: Wallet, transactionId: number) {
    if (wallet.type === WalletType.SAVINGS) {
      await this.savings.removeTransaction(userId, wallet.id, transactionId);
    } else {
      await this.transactions.remove(userId, transactionId);
    }
  }

  /** The wallet type's "Tagihan" category, created the first time a bill is paid there. */
  private async billCategoryId(userId: number, walletType: WalletType): Promise<number> {
    const category = await this.prisma.category.upsert({
      where: {
        userId_walletType_name: { userId, walletType, name: BILL_CATEGORY.name },
      },
      update: {},
      create: {
        userId,
        walletType,
        name: BILL_CATEGORY.name,
        color: BILL_CATEGORY.color,
        icon: BILL_CATEGORY.icon,
        sortOrder: 90,
      },
      select: { id: true },
    });

    return category.id;
  }

  private async findOwned(userId: number, id: number): Promise<BillWithPayments> {
    const bill = await this.prisma.bill.findFirst({
      where: { id, userId },
      include: { payments: { include: PAYMENT_INCLUDE, orderBy: { period: 'desc' } } },
    });

    if (!bill) {
      throw AppException.notFound(`bill ${id} not found`);
    }

    return bill;
  }

  private withSchedule(bill: BillWithPayments, today: string): BillWithSchedule {
    const schedule = computeBillSchedule({
      kind: bill.kind,
      dueDay: bill.dueDay,
      startPeriod: bill.startPeriod,
      endPeriod: bill.endPeriod,
      paidPeriods: new Set(livePayments(bill).map((payment) => payment.period)),
      today,
    });

    return { ...bill, schedule };
  }

  /**
   * Normalises the period fields for a kind: an installment needs an end on or after its
   * start, a one-time bill ends where it starts, and a recurring one never ends.
   */
  private assertShape(
    kind: BillKind,
    startPeriod: string,
    endPeriod: string | null,
  ): { startPeriod: string; endPeriod: string | null } {
    if (kind === BillKind.ONE_TIME) return { startPeriod, endPeriod: startPeriod };
    if (kind === BillKind.RECURRING) return { startPeriod, endPeriod: null };

    if (!endPeriod) {
      throw AppException.validation('an installment needs endPeriod, its last month', [
        { field: 'endPeriod', constraint: 'required' },
      ]);
    }

    if (endPeriod < startPeriod) {
      throw AppException.validation('endPeriod must not be before startPeriod', [
        { field: 'endPeriod', constraint: 'afterStart' },
      ]);
    }

    return { startPeriod, endPeriod };
  }
}

/** Payments whose transaction still exists. A deleted transaction un-pays its month. */
export function livePayments(bill: BillWithPayments): BillPaymentRow[] {
  return bill.payments.filter((payment) => payment.transaction.deletedAt === null);
}
