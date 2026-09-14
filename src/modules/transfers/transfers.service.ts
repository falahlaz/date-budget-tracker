import { Injectable } from '@nestjs/common';
import { Direction, Prisma, Transaction, TransactionKind, WalletType } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { ClockService } from '@/common/clock/clock.service';
import { AppException } from '@/common/errors';
import { fromDateOnly, toDateOnly } from '@/common/utils/date-only';
import { PrismaService } from '@/prisma/prisma.service';
import { BudgetCacheService } from '@/modules/budgets/budget-cache.service';
import { assertDateString, periodOf } from '@/modules/reports/engine/calendar';
import { SavingsComputationService } from '@/modules/savings/savings-computation.service';
import { WalletsService } from '@/modules/wallets/wallets.service';
import { CreateTransferDto, UpdateTransferDto } from './dto/transfer.dto';

export interface TransferPair {
  transferGroupId: string;
  out: Transaction;
  in: Transaction;
}

/**
 * Moving money between wallets (PRD v2 section 6).
 *
 * One action, two rows: a TRANSFER_OUT in the source wallet and a TRANSFER_IN in the
 * destination, sharing a `transfer_group_id`. Every operation here treats the pair as a
 * single unit inside one database transaction -- a half-written transfer is money that
 * left one wallet and arrived nowhere, and nothing in the reports would flag it.
 */
@Injectable()
export class TransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallets: WalletsService,
    private readonly cache: BudgetCacheService,
    private readonly savings: SavingsComputationService,
    private readonly clock: ClockService,
  ) {}

  async create(userId: number, dto: CreateTransferDto): Promise<TransferPair> {
    const occurredOn = this.assertUsableDate(dto.occurredOn);

    if (dto.fromWalletId === dto.toWalletId) {
      throw AppException.validation('a transfer needs two different wallets', [
        { field: 'toWalletId', constraint: 'differentWallet' },
      ]);
    }

    const [from, to] = await Promise.all([
      this.wallets.findOwned(userId, dto.fromWalletId),
      this.wallets.findOwned(userId, dto.toWalletId),
    ]);

    await this.assertSourceCanAfford(from.id, from.type, dto.amount);

    const transferGroupId = uuidv4();

    const pair = await this.prisma.$transaction(async (tx) => {
      const common = {
        userId,
        occurredOn: toDateOnly(occurredOn),
        amount: dto.amount,
        note: dto.note ?? null,
        transferGroupId,
        // Transfers carry no category and appear in no category breakdown (6.1).
        categoryId: null,
      };

      const outgoing = await tx.transaction.create({
        data: {
          ...common,
          walletId: from.id,
          kind: TransactionKind.TRANSFER_OUT,
          direction: Direction.OUT,
          counterpartWalletId: to.id,
        },
      });

      const incoming = await tx.transaction.create({
        data: {
          ...common,
          walletId: to.id,
          kind: TransactionKind.TRANSFER_IN,
          direction: Direction.IN,
          counterpartWalletId: from.id,
        },
      });

      await this.invalidateBoth(tx, [from.id, to.id], [periodOf(occurredOn)]);

      return { transferGroupId, out: outgoing, in: incoming };
    });

    return pair;
  }

  /** Both sides, or a 404. Never one. */
  async findPair(userId: number, transferGroupId: string): Promise<TransferPair> {
    const rows = await this.prisma.transaction.findMany({
      where: { transferGroupId, userId, deletedAt: null },
    });

    const outgoing = rows.find((row) => row.kind === TransactionKind.TRANSFER_OUT);
    const incoming = rows.find((row) => row.kind === TransactionKind.TRANSFER_IN);

    if (!outgoing || !incoming) {
      throw AppException.notFound(`transfer ${transferGroupId} not found`);
    }

    return { transferGroupId, out: outgoing, in: incoming };
  }

  /**
   * Edits both rows together (PRD v2 10.4).
   *
   * Moving the date can move the transfer between months, so the carry-over chain is
   * invalidated from the earlier of the two periods in both wallets -- the same rule that
   * applies when a spend changes month (PRD 6.6).
   */
  async update(
    userId: number,
    transferGroupId: string,
    dto: UpdateTransferDto,
  ): Promise<TransferPair> {
    const pair = await this.findPair(userId, transferGroupId);
    const previousPeriod = periodOf(fromDateOnly(pair.out.occurredOn));

    const data: Prisma.TransactionUpdateManyMutationInput = {};
    let nextPeriod = previousPeriod;

    if (dto.occurredOn !== undefined) {
      const occurredOn = this.assertUsableDate(dto.occurredOn);
      data.occurredOn = toDateOnly(occurredOn);
      nextPeriod = periodOf(occurredOn);
    }

    if (dto.note !== undefined) data.note = dto.note;

    if (dto.amount !== undefined && dto.amount !== pair.out.amount) {
      const source = await this.wallets.findOwned(userId, pair.out.walletId);
      // Only the increase has to be affordable; the amount already out is already out.
      await this.assertSourceCanAfford(source.id, source.type, dto.amount - pair.out.amount);
      data.amount = dto.amount;
    }

    await this.prisma.$transaction(async (tx) => {
      // updateMany on the group, so the two rows cannot be edited into disagreeing.
      await tx.transaction.updateMany({
        where: { transferGroupId, deletedAt: null },
        data,
      });

      await this.invalidateBoth(
        tx,
        [pair.out.walletId, pair.in.walletId],
        [previousPeriod, nextPeriod],
      );
    });

    return this.findPair(userId, transferGroupId);
  }

  /** Soft-deletes both sides at once (PRD v2 8.9, test E23). */
  async remove(userId: number, transferGroupId: string): Promise<void> {
    const pair = await this.findPair(userId, transferGroupId);
    const period = periodOf(fromDateOnly(pair.out.occurredOn));

    await this.prisma.$transaction(async (tx) => {
      await tx.transaction.updateMany({
        where: { transferGroupId, deletedAt: null },
        data: { deletedAt: this.clock.now() },
      });

      await this.invalidateBoth(tx, [pair.out.walletId, pair.in.walletId], [period]);
    });
  }

  /**
   * A savings wallet may not go below zero, even on the way out to another wallet.
   *
   * The date-budget wallet is exempt on purpose: a budget is a plan and overspending it is
   * valid data (5.5), while a savings balance is a fact about an account.
   */
  private async assertSourceCanAfford(
    walletId: number,
    type: WalletType,
    amount: number,
  ): Promise<void> {
    if (type !== WalletType.SAVINGS || amount <= 0) return;

    const balance = await this.savings.balance(walletId);

    if (balance - amount < 0) {
      throw AppException.validation(
        `this transfer would leave the wallet below zero: balance is ${balance}, ` +
          `transfer is ${amount}`,
        [{ field: 'amount', constraint: 'insufficientBalance' }],
      );
    }
  }

  /**
   * Both wallets, because a transfer moves two carry-over chains at once.
   *
   * Invalidating only the source would leave the destination's cached carryOut describing
   * a month that no longer exists.
   */
  private invalidateBoth(
    tx: Prisma.TransactionClient,
    walletIds: readonly number[],
    periods: readonly string[],
  ): Promise<void[]> {
    return Promise.all(
      walletIds.map((walletId) => this.cache.invalidateFromEarliest(walletId, periods, tx)),
    );
  }

  /** Same rule as a spend: nothing is recorded in the future (PRD 6.9). */
  private assertUsableDate(value: string): string {
    const date = assertDateString(value);
    const today = this.clock.today();

    if (date > today) {
      throw AppException.validation(`occurredOn must not be in the future (today is ${today})`, [
        { field: 'occurredOn', constraint: 'notInFuture' },
      ]);
    }

    return date;
  }
}
