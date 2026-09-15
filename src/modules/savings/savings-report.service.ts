import { Injectable } from '@nestjs/common';
import { TransactionKind } from '@prisma/client';
import { fromDateOnly, toDateOnly } from '@/common/utils/date-only';
import { PrismaService } from '@/prisma/prisma.service';
import { CategoryBreakdown, aggregateByCategory } from '@/modules/reports/engine/aggregate';
import { firstDayOfPeriod, lastDayOfPeriod, periodOf } from '@/modules/reports/engine/calendar';
import { SavingsMonthRow, monthlyRows } from './engine/compute-savings';
import { balancesFor, outstandingAdvanceAsOf } from './engine/month-report';
import { SavingsComputationService } from './savings-computation.service';

/** One withdrawal, with the sentence that explains it (PRD v2 10.5, goal G2). */
export interface SavingsWithdrawalRow {
  id: number;
  occurredOn: string;
  amount: number;
  reason: string | null;
  categoryId: number | null;
  categoryName: string | null;
  categoryColor: string | null;
  expectedReturn: boolean;
  returnedAmount: number;
  settled: boolean;
  note: string | null;
}

export interface SavingsMonthReportResponse {
  period: string;
  openingBalance: number;
  closingBalance: number;
  /** DEPOSIT + TRANSFER_IN. */
  depositTotal: number;
  repaymentTotal: number;
  freshContribution: number;
  /** WITHDRAW + TRANSFER_OUT. */
  withdrawTotal: number;
  net: number;
  /**
   * Memos, not extra money: both are already inside `depositTotal` / `withdrawTotal`.
   * They exist so the receipt card in section 11.5 can show its own line for a transfer
   * and still add up, rather than folding it silently into "setoran".
   */
  transferInTotal: number;
  transferOutTotal: number;
  /** Null when the wallet has no goal -- a wallet can hold money before it has a target. */
  planPerMonth: number | null;
  vsPlan: number | null;
  /** WITHDRAW rows only, oldest first. The headline of the screen, not the breakdown. */
  withdrawals: SavingsWithdrawalRow[];
  withdrawalsByCategory: CategoryBreakdown[];
  outstandingAdvanceAtClose: number;
}

/**
 * The savings month report (PRD v2 10.5).
 *
 * Everything that is arithmetic lives in `engine/`; this loads rows, hands them over, and
 * attaches the names. The one figure it is tempting to compute here -- `vsPlan` -- is the
 * one with a comment explaining what it must never be.
 */
@Injectable()
export class SavingsReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly computation: SavingsComputationService,
  ) {}

  async monthReport(walletId: number, period: string): Promise<SavingsMonthReportResponse> {
    const [goal, txns, allocations, advances, withdrawals] = await Promise.all([
      this.computation.findCurrentGoal(walletId),
      this.computation.loadTxns(walletId),
      this.computation.loadAllocations(walletId),
      this.computation.loadAdvances(walletId),
      this.loadWithdrawals(walletId, period),
    ]);

    const rows = monthlyRows(txns, allocations);
    const row = rows.find((candidate) => candidate.period === period) ?? emptyRow(period);
    const balances = balancesFor(goal?.openingBalance ?? 0, rows, period);

    const inPeriod = txns.filter((txn) => periodOf(txn.occurredOn) === period);
    const totalOf = (kind: string): number =>
      inPeriod.filter((txn) => txn.kind === kind).reduce((total, txn) => total + txn.amount, 0);

    return {
      period,
      openingBalance: balances.openingBalance,
      closingBalance: balances.closingBalance,
      depositTotal: row.depositTotal,
      repaymentTotal: row.repaymentTotal,
      freshContribution: row.freshContribution,
      withdrawTotal: row.withdrawTotal,
      net: row.net,
      transferInTotal: totalOf(TransactionKind.TRANSFER_IN),
      transferOutTotal: totalOf(TransactionKind.TRANSFER_OUT),
      planPerMonth: goal?.planPerMonth ?? null,
      // Against `freshContribution`, NEVER `depositTotal` (section 5.3, goal G6). A
      // 2.000.000 deposit that only patched 600.000 of earlier withdrawals is 1.400.000 of
      // progress; comparing the gross figure would report "target tercapai" for a month
      // whose balance had merely climbed back to where it started.
      vsPlan: goal ? row.freshContribution - goal.planPerMonth : null,
      withdrawals,
      withdrawalsByCategory: this.byCategory(withdrawals),
      outstandingAdvanceAtClose: outstandingAdvanceAsOf(
        advances,
        allocations,
        lastDayOfPeriod(period),
      ),
    };
  }

  /**
   * WITHDRAW rows only, deliberately.
   *
   * `withdrawTotal` also counts TRANSFER_OUT, because the balance does. But a transfer has
   * no reason and no category -- it is money moved, not money spent -- and listing it here
   * among the reasons would dilute exactly the thing this list exists to show. The
   * transfer's own total is reported separately above.
   */
  private async loadWithdrawals(walletId: number, period: string): Promise<SavingsWithdrawalRow[]> {
    const rows = await this.prisma.transaction.findMany({
      where: {
        walletId,
        kind: TransactionKind.WITHDRAW,
        deletedAt: null,
        occurredOn: {
          gte: toDateOnly(firstDayOfPeriod(period)),
          lte: toDateOnly(lastDayOfPeriod(period)),
        },
      },
      orderBy: [{ occurredOn: 'asc' }, { id: 'asc' }],
      include: { category: { select: { id: true, name: true, color: true } } },
    });

    return rows.map((row) => ({
      id: row.id,
      occurredOn: fromDateOnly(row.occurredOn),
      amount: row.amount,
      reason: row.reason,
      categoryId: row.category?.id ?? null,
      categoryName: row.category?.name ?? null,
      categoryColor: row.category?.color ?? null,
      expectedReturn: row.expectedReturn,
      returnedAmount: row.returnedAmount,
      settled: row.settledAt !== null,
      note: row.note,
    }));
  }

  /** Reuses the date-budget breakdown so both halves of the app group and sort alike. */
  private byCategory(withdrawals: readonly SavingsWithdrawalRow[]): CategoryBreakdown[] {
    return aggregateByCategory(
      withdrawals.map((withdrawal) => ({
        id: withdrawal.id,
        occurredOn: withdrawal.occurredOn,
        amount: withdrawal.amount,
        merchant: null,
        merchantKey: null,
        paymentMethod: 'TRANSFER',
        note: withdrawal.note,
        category:
          withdrawal.categoryId === null
            ? null
            : {
                id: withdrawal.categoryId,
                name: withdrawal.categoryName ?? '',
                color: withdrawal.categoryColor ?? '',
              },
      })),
    );
  }
}

function emptyRow(period: string): SavingsMonthRow {
  return {
    period,
    depositTotal: 0,
    withdrawTotal: 0,
    repaymentTotal: 0,
    freshContribution: 0,
    net: 0,
  };
}
