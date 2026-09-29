import { Injectable } from '@nestjs/common';
import {
  Direction,
  Loan,
  PaymentMethod,
  Prisma,
  TransactionKind,
  Wallet,
  WalletType,
} from '@prisma/client';
import { ClockService } from '@/common/clock/clock.service';
import { AppException } from '@/common/errors';
import { fromDateOnly, toDateOnly } from '@/common/utils/date-only';
import { PrismaService } from '@/prisma/prisma.service';
import { BudgetCacheService } from '@/modules/budgets/budget-cache.service';
import { assertDateString, periodOf } from '@/modules/reports/engine/calendar';
import { SavingsComputationService } from '@/modules/savings/savings-computation.service';
import { WalletsService } from '@/modules/wallets/wallets.service';
import { CreateLoanDto } from './dto/create-loan.dto';
import { RepayLoanDto } from './dto/repay-loan.dto';
import { UpdateLoanDto } from './dto/update-loan.dto';
import { LoanStanding, LoanStatus, computeLoanStanding } from './engine/loan-status';

const MONEY_TXN_SELECT = {
  id: true,
  walletId: true,
  amount: true,
  occurredOn: true,
  note: true,
  deletedAt: true,
  wallet: { select: { name: true, color: true } },
} satisfies Prisma.TransactionSelect;

const LOAN_INCLUDE = {
  transaction: { select: MONEY_TXN_SELECT },
  repayments: {
    include: { transaction: { select: MONEY_TXN_SELECT } },
    orderBy: { id: 'asc' },
  },
} satisfies Prisma.LoanInclude;

export type LoanWithMoney = Prisma.LoanGetPayload<{ include: typeof LOAN_INCLUDE }>;
export type LoanRepaymentRow = LoanWithMoney['repayments'][number];
export type LoanWithStanding = LoanWithMoney & { standing: LoanStanding };

export interface BorrowerTotal {
  name: string;
  outstanding: number;
  loanCount: number;
}

export interface LoansSummary {
  /** Everything still owed to the user, across every open loan. */
  outstandingTotal: number;
  outstandingCount: number;
  overdueCount: number;
  /** Who owes what, biggest debt first. Only people who still owe something. */
  borrowers: BorrowerTotal[];
}

/** Overdue first, then open ones, then the paid-back history. */
const STATUS_ORDER: Record<LoanStatus, number> = { OVERDUE: 0, ACTIVE: 1, SETTLED: 2 };

/**
 * Loans (piutang): money lent to someone, and paid back in one go or in parts.
 *
 * The money lives on `transactions`, never on the loan: a LOAN_OUT row in the wallet it
 * left and a LOAN_IN row for each repayment, in whichever wallet it went back to. Both
 * engines read those rows exactly like transfers, so a loan makes its week (or its savings
 * balance) poorer and a repayment makes the week it lands in richer again. How much is
 * still owed is recomputed from the rows every time -- nothing here caches a balance.
 *
 * Every write moves the transaction and the loan rows together in one database
 * transaction, and those rows cannot be edited anywhere else: the generic endpoints refuse
 * LOAN_* kinds and point back here.
 */
@Injectable()
export class LoansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
    private readonly wallets: WalletsService,
    private readonly cache: BudgetCacheService,
    private readonly savings: SavingsComputationService,
  ) {}

  async list(userId: number): Promise<{ items: LoanWithStanding[]; summary: LoansSummary }> {
    const loans = await this.prisma.loan.findMany({
      where: { userId, transaction: { deletedAt: null } },
      include: LOAN_INCLUDE,
    });

    const today = this.clock.today();
    const items = loans.map((loan) => this.withStanding(loan, today));

    items.sort(
      (a, b) =>
        STATUS_ORDER[a.standing.status] - STATUS_ORDER[b.standing.status] ||
        b.standing.daysOverdue - a.standing.daysOverdue ||
        dueKey(a).localeCompare(dueKey(b)) ||
        lentOn(b).localeCompare(lentOn(a)) ||
        b.id - a.id,
    );

    return { items, summary: summarise(items) };
  }

  async findOne(userId: number, id: number): Promise<LoanWithStanding> {
    return this.withStanding(await this.findOwned(userId, id), this.clock.today());
  }

  /**
   * Lends money out of a wallet.
   *
   * A savings wallet cannot be lent below zero, for the same reason it cannot be withdrawn
   * or transferred below zero: its balance is a fact about an account. A date-budget
   * wallet can, because a budget is a plan and going over it is valid data.
   */
  async create(userId: number, dto: CreateLoanDto): Promise<LoanWithStanding> {
    const lentOn = this.assertUsableDate(dto.lentOn ?? this.clock.today(), 'lentOn');
    const dueDate = this.assertDueDate(dto.dueDate ?? null, lentOn);
    const wallet = await this.usableWallet(userId, dto.walletId, 'walletId');

    await this.assertCanAfford(wallet, dto.amount);

    const loan = await this.prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.create({
        data: {
          userId,
          walletId: wallet.id,
          kind: TransactionKind.LOAN_OUT,
          direction: Direction.OUT,
          occurredOn: toDateOnly(lentOn),
          amount: dto.amount,
          paymentMethod: PaymentMethod.TRANSFER,
          note: `Pinjaman ke ${dto.borrowerName}`,
        },
      });

      const created = await tx.loan.create({
        data: {
          userId,
          borrowerName: dto.borrowerName,
          walletId: wallet.id,
          transactionId: transaction.id,
          dueDate: dueDate === null ? null : toDateOnly(dueDate),
          note: dto.note || null,
        },
      });

      await this.cache.invalidateFrom(wallet.id, periodOf(lentOn), tx);
      return created;
    });

    return this.findOne(userId, loan.id);
  }

  /**
   * Edits a loan. The amount cannot fall below what has already come back -- that would
   * describe a repayment larger than the debt -- and raising it on a savings wallet has to
   * be affordable, like any other money leaving it.
   */
  async update(userId: number, id: number, dto: UpdateLoanDto): Promise<LoanWithStanding> {
    const loan = await this.findOwned(userId, id);
    const { standing } = this.withStanding(loan, this.clock.today());
    const previousLentOn = fromDateOnly(loan.transaction.occurredOn);

    const lentOn =
      dto.lentOn !== undefined ? this.assertUsableDate(dto.lentOn, 'lentOn') : previousLentOn;
    const dueDate = this.assertDueDate(
      dto.dueDate !== undefined ? dto.dueDate : loan.dueDate && fromDateOnly(loan.dueDate),
      lentOn,
    );

    const firstRepayment = liveRepayments(loan)
      .map((repayment) => fromDateOnly(repayment.transaction.occurredOn))
      .sort()[0];
    if (firstRepayment !== undefined && lentOn > firstRepayment) {
      throw AppException.validation(
        `lentOn must not be after the first repayment (${firstRepayment})`,
        [{ field: 'lentOn', constraint: 'beforeRepayments' }],
      );
    }

    const amount = dto.amount ?? loan.transaction.amount;
    if (amount < standing.repaidAmount) {
      throw AppException.validation(
        `amount must not be below what has already been paid back (${standing.repaidAmount})`,
        [{ field: 'amount', constraint: 'belowRepaid' }],
      );
    }

    if (amount > loan.transaction.amount) {
      const wallet = await this.wallets.findOwned(userId, loan.walletId);
      await this.assertCanAfford(wallet, amount - loan.transaction.amount);
    }

    const borrowerName = dto.borrowerName ?? loan.borrowerName;

    await this.prisma.$transaction(async (tx) => {
      await tx.transaction.update({
        where: { id: loan.transactionId },
        data: {
          amount,
          occurredOn: toDateOnly(lentOn),
          note: `Pinjaman ke ${borrowerName}`,
        },
      });

      await tx.loan.update({
        where: { id },
        data: {
          borrowerName,
          dueDate: dueDate === null ? null : toDateOnly(dueDate),
          ...(dto.note !== undefined ? { note: dto.note || null } : {}),
          settledAt: settledAtFor(amount, standing.repaidAmount, loan.settledAt, this.clock.now()),
        },
      });

      await this.cache.invalidateFromEarliest(
        loan.walletId,
        [periodOf(previousLentOn), periodOf(lentOn)],
        tx,
      );
    });

    return this.findOne(userId, id);
  }

  /**
   * Deletes a loan and puts its money back in the wallet it left.
   *
   * Refused while anything has been paid back: those repayments are money that arrived in
   * a wallet, and deleting the loan out from under them would leave it unexplained. Remove
   * the repayments first, deliberately.
   */
  async remove(userId: number, id: number): Promise<void> {
    const loan = await this.findOwned(userId, id);

    if (liveRepayments(loan).length > 0) {
      throw AppException.conflict(
        `loan ${id} has repayments recorded; delete those first so no wallet is left ` +
          'holding money nobody paid back',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.transaction.update({
        where: { id: loan.transactionId },
        data: { deletedAt: this.clock.now() },
      });
      await tx.loan.delete({ where: { id } });
      await this.cache.invalidateFrom(
        loan.walletId,
        periodOf(fromDateOnly(loan.transaction.occurredOn)),
        tx,
      );
    });
  }

  /**
   * Records money coming back: all that is left by default, or part of it.
   *
   * The loan row is locked for the check, so two taps at once cannot both pass "at most
   * what is still owed" and together pay back more than was lent.
   */
  async repay(
    userId: number,
    id: number,
    dto: RepayLoanDto,
  ): Promise<{ loan: LoanWithStanding; transactionId: number; amount: number }> {
    const loan = await this.findOwned(userId, id);
    const occurredOn = this.assertUsableDate(dto.occurredOn ?? this.clock.today(), 'occurredOn');
    const lentOn = fromDateOnly(loan.transaction.occurredOn);

    if (occurredOn < lentOn) {
      throw AppException.validation(`a repayment cannot be before the loan (${lentOn})`, [
        { field: 'occurredOn', constraint: 'beforeLoan' },
      ]);
    }

    const wallet = await this.usableWallet(userId, dto.walletId ?? loan.walletId, 'walletId');

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM loans WHERE id = ${id} FOR UPDATE`;

      const repayments = await tx.loanRepayment.findMany({
        where: { loanId: id, transaction: { deletedAt: null } },
        select: { transaction: { select: { amount: true } } },
      });
      const repaid = repayments.reduce((total, row) => total + row.transaction.amount, 0);
      const remaining = loan.transaction.amount - repaid;

      if (remaining <= 0) {
        throw AppException.conflict(`loan ${id} is already paid back in full`);
      }

      const amount = dto.amount ?? remaining;
      if (amount > remaining) {
        throw AppException.validation(
          `amount must not be more than what is still owed (${remaining})`,
          [{ field: 'amount', constraint: 'overpay' }],
        );
      }

      const transaction = await tx.transaction.create({
        data: {
          userId,
          walletId: wallet.id,
          kind: TransactionKind.LOAN_IN,
          direction: Direction.IN,
          occurredOn: toDateOnly(occurredOn),
          amount,
          paymentMethod: PaymentMethod.TRANSFER,
          note: dto.note?.trim() || `Pengembalian dari ${loan.borrowerName}`,
        },
      });

      await tx.loanRepayment.create({
        data: { userId, loanId: id, transactionId: transaction.id },
      });

      if (amount === remaining) {
        await tx.loan.update({ where: { id }, data: { settledAt: this.clock.now() } });
      }

      await this.cache.invalidateFrom(wallet.id, periodOf(occurredOn), tx);
      return { transactionId: transaction.id, amount };
    });

    return { loan: await this.findOne(userId, id), ...result };
  }

  /** Takes a repayment back out of its wallet; the loan is owed again by that much. */
  async removeRepayment(
    userId: number,
    id: number,
    repaymentId: number,
  ): Promise<LoanWithStanding> {
    const loan = await this.findOwned(userId, id);
    const repayment = liveRepayments(loan).find((row) => row.id === repaymentId);

    if (!repayment) {
      throw AppException.notFound(`repayment ${repaymentId} not found on loan ${id}`);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.transaction.update({
        where: { id: repayment.transactionId },
        data: { deletedAt: this.clock.now() },
      });
      await tx.loanRepayment.delete({ where: { id: repaymentId } });
      await tx.loan.update({ where: { id }, data: { settledAt: null } });
      await this.cache.invalidateFrom(
        repayment.transaction.walletId,
        periodOf(fromDateOnly(repayment.transaction.occurredOn)),
        tx,
      );
    });

    return this.findOne(userId, id);
  }

  // ------------------------------------------------------------- helpers

  private async findOwned(userId: number, id: number): Promise<LoanWithMoney> {
    const loan = await this.prisma.loan.findFirst({
      where: { id, userId, transaction: { deletedAt: null } },
      include: LOAN_INCLUDE,
    });

    if (!loan) {
      throw AppException.notFound(`loan ${id} not found`);
    }

    return loan;
  }

  private withStanding(loan: LoanWithMoney, today: string): LoanWithStanding {
    const standing = computeLoanStanding({
      amount: loan.transaction.amount,
      repayments: liveRepayments(loan).map((repayment) => repayment.transaction.amount),
      dueDate: loan.dueDate && fromDateOnly(loan.dueDate),
      today,
    });

    return { ...loan, standing };
  }

  private async usableWallet(userId: number, walletId: number, field: string): Promise<Wallet> {
    const wallet = await this.wallets.findOwned(userId, walletId);

    if (wallet.isArchived) {
      throw AppException.validation(`wallet ${wallet.id} is archived`, [
        { field, constraint: 'archived' },
      ]);
    }

    return wallet;
  }

  private async assertCanAfford(wallet: Wallet, amount: number): Promise<void> {
    if (wallet.type !== WalletType.SAVINGS || amount <= 0) return;

    const balance = await this.savings.balance(wallet.id);

    if (balance - amount < 0) {
      throw AppException.validation(
        `this loan would leave the wallet below zero: balance is ${balance}, loan is ${amount}`,
        [{ field: 'amount', constraint: 'insufficientBalance' }],
      );
    }
  }

  /** Same rule as a spend: nothing is recorded in the future (PRD 6.9). */
  private assertUsableDate(value: string, field: string): string {
    const date = assertDateString(value);
    const today = this.clock.today();

    if (date > today) {
      throw AppException.validation(`${field} must not be in the future (today is ${today})`, [
        { field, constraint: 'notInFuture' },
      ]);
    }

    return date;
  }

  private assertDueDate(value: string | null, lentOn: string): string | null {
    if (value === null) return null;

    const date = assertDateString(value);
    if (date < lentOn) {
      throw AppException.validation('dueDate must not be before the loan was made', [
        { field: 'dueDate', constraint: 'afterLentOn' },
      ]);
    }

    return date;
  }
}

/** Repayments whose transaction still exists. */
export function liveRepayments(loan: LoanWithMoney): LoanRepaymentRow[] {
  return loan.repayments.filter((repayment) => repayment.transaction.deletedAt === null);
}

function settledAtFor(
  amount: number,
  repaid: number,
  current: Loan['settledAt'],
  now: Date,
): Date | null {
  if (repaid < amount) return null;
  return current ?? now;
}

function lentOn(loan: LoanWithMoney): string {
  return fromDateOnly(loan.transaction.occurredOn);
}

/** Loans with a due date sort by it; loans without one go after them. */
function dueKey(loan: LoanWithStanding): string {
  if (loan.standing.status === 'SETTLED') return '';
  return loan.dueDate ? fromDateOnly(loan.dueDate) : '9999-12-31';
}

function summarise(items: readonly LoanWithStanding[]): LoansSummary {
  const summary: LoansSummary = {
    outstandingTotal: 0,
    outstandingCount: 0,
    overdueCount: 0,
    borrowers: [],
  };
  const byName = new Map<string, BorrowerTotal>();

  // Oldest first, so a borrower is named the way they were first written down.
  for (const loan of [...items].sort((a, b) => a.id - b.id)) {
    if (loan.standing.status === 'SETTLED') continue;

    summary.outstandingTotal += loan.standing.remaining;
    summary.outstandingCount += 1;
    if (loan.standing.status === 'OVERDUE') summary.overdueCount += 1;

    // One person typed as "budi" once and "Budi " the next time is still one person.
    const key = loan.borrowerName.trim().toLowerCase();
    const entry = byName.get(key) ?? {
      name: loan.borrowerName.trim(),
      outstanding: 0,
      loanCount: 0,
    };
    entry.outstanding += loan.standing.remaining;
    entry.loanCount += 1;
    byName.set(key, entry);
  }

  summary.borrowers = [...byName.values()].sort(
    (a, b) => b.outstanding - a.outstanding || a.name.localeCompare(b.name),
  );

  return summary;
}
