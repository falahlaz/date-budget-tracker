import { Injectable } from '@nestjs/common';
import { GoalStatus, SavingsGoal, TransactionKind } from '@prisma/client';
import { ClockService } from '@/common/clock/clock.service';
import { fromDateOnly } from '@/common/utils/date-only';
import { PrismaService } from '@/prisma/prisma.service';
import {
  AllocationInput,
  SavingsReport,
  SavingsTxnInput,
  computeSavings,
} from './engine/compute-savings';
import { AllocatableAdvance } from './engine/allocate-fifo';
import { AdvanceInput } from './engine/month-report';

/**
 * Bridges the database to the savings engine.
 *
 * The mirror of `MonthComputationService` for the other half of the app: everything here
 * loads rows and hands them to a pure function, and nothing here does arithmetic. That
 * split is what lets Fixture D live in a unit test with no database at all.
 */
@Injectable()
export class SavingsComputationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
  ) {}

  /**
   * The one goal a savings wallet may have running (PRD v2 3, 9.3).
   *
   * ACHIEVED counts as current, not finished: section 8.4 keeps accepting deposits after
   * the target is reached and shows the surplus separately, so the goal is still the one
   * the wallet is about. Only ARCHIVED retires it.
   */
  findCurrentGoal(walletId: number): Promise<SavingsGoal | null> {
    return this.prisma.savingsGoal.findFirst({
      where: { walletId, status: { in: [GoalStatus.ACTIVE, GoalStatus.ACHIEVED] } },
      orderBy: { id: 'desc' },
    });
  }

  /**
   * Every derived figure for a wallet's active goal, or null when it has none.
   *
   * A savings wallet exists before its goal does, so "no goal" is a normal state that
   * callers render differently -- not an error.
   */
  async report(walletId: number): Promise<{ goal: SavingsGoal; report: SavingsReport } | null> {
    const goal = await this.findCurrentGoal(walletId);
    if (!goal) return null;

    return { goal, report: await this.reportFor(goal) };
  }

  /** The same figures for a goal already in hand, without re-reading it. */
  async reportFor(goal: SavingsGoal): Promise<SavingsReport> {
    const [txns, allocations] = await Promise.all([
      this.loadTxns(goal.walletId),
      this.loadAllocations(goal.walletId),
    ]);

    return computeSavings({
      goal: {
        targetAmount: goal.targetAmount,
        openingBalance: goal.openingBalance,
        startDate: fromDateOnly(goal.startDate),
        deadline: fromDateOnly(goal.deadline),
        planPerMonth: goal.planPerMonth,
      },
      txns,
      allocations,
      today: this.clock.today(),
    });
  }

  /**
   * The wallet's balance, goal or no goal.
   *
   * Used by the withdrawal guard, which has to answer "would this go negative?" even for a
   * wallet nobody has set a target on yet.
   */
  async balance(walletId: number): Promise<number> {
    const txns = await this.loadTxns(walletId);
    const goal = await this.findCurrentGoal(walletId);
    const opening = goal?.openingBalance ?? 0;

    return txns.reduce(
      (total, txn) =>
        total + (txn.kind === 'DEPOSIT' || txn.kind === 'TRANSFER_IN' ? txn.amount : -txn.amount),
      opening,
    );
  }

  async loadTxns(walletId: number): Promise<SavingsTxnInput[]> {
    const rows = await this.prisma.transaction.findMany({
      where: { walletId, deletedAt: null },
      select: {
        occurredOn: true,
        amount: true,
        kind: true,
        expectedReturn: true,
        returnedAmount: true,
      },
    });

    return rows.map((row) => ({
      occurredOn: fromDateOnly(row.occurredOn),
      amount: row.amount,
      kind: row.kind as SavingsTxnInput['kind'],
      expectedReturn: row.expectedReturn,
      returnedAmount: row.returnedAmount,
    }));
  }

  /**
   * Repayments, keyed by the month of the deposit that paid them (PRD v2 5.3).
   *
   * The deposit's month, not the advance's: a repayment reduces the month the money went
   * in, which is the month whose progress would otherwise be overstated.
   */
  async loadAllocations(walletId: number): Promise<AllocationInput[]> {
    const rows = await this.prisma.repaymentAllocation.findMany({
      where: { deposit: { walletId, deletedAt: null } },
      select: {
        amount: true,
        withdrawalTransactionId: true,
        deposit: { select: { occurredOn: true } },
      },
    });

    return rows.map((row) => ({
      withdrawalId: row.withdrawalTransactionId,
      amount: row.amount,
      depositOccurredOn: fromDateOnly(row.deposit.occurredOn),
    }));
  }

  /**
   * Every advance the wallet has ever taken, settled ones included (PRD v2 10.5).
   *
   * `loadOpenAdvances` deliberately filters to the unsettled ones, because FIFO allocation
   * only has business with those. `outstandingAdvanceAsOf` needs the opposite: an advance
   * settled last month was still owed the month before, and leaving it out would report
   * that month as debt-free.
   */
  async loadAdvances(walletId: number): Promise<AdvanceInput[]> {
    const rows = await this.prisma.transaction.findMany({
      where: {
        walletId,
        kind: TransactionKind.WITHDRAW,
        expectedReturn: true,
        deletedAt: null,
      },
      orderBy: [{ occurredOn: 'asc' }, { id: 'asc' }],
      select: { id: true, occurredOn: true, amount: true },
    });

    return rows.map((row) => ({
      id: row.id,
      occurredOn: fromDateOnly(row.occurredOn),
      amount: row.amount,
    }));
  }

  /** Advances still owed, oldest first -- the order FIFO allocation depends on (5.4). */
  async loadOpenAdvances(walletId: number): Promise<AllocatableAdvance[]> {
    const rows = await this.prisma.transaction.findMany({
      where: {
        walletId,
        kind: TransactionKind.WITHDRAW,
        expectedReturn: true,
        settledAt: null,
        deletedAt: null,
      },
      orderBy: [{ occurredOn: 'asc' }, { id: 'asc' }],
      select: { id: true, occurredOn: true, amount: true, returnedAmount: true },
    });

    return rows.map((row) => ({
      id: row.id,
      occurredOn: fromDateOnly(row.occurredOn),
      amount: row.amount,
      returnedAmount: row.returnedAmount,
    }));
  }
}
