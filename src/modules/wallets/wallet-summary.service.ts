import { Injectable } from '@nestjs/common';
import { Wallet, WalletType } from '@prisma/client';
import { ClockService } from '@/common/clock/clock.service';
import { fromDateOnly } from '@/common/utils/date-only';
import { PrismaService } from '@/prisma/prisma.service';
import { ReportsService } from '@/modules/reports/reports.service';
import {
  SavingsTxnInput,
  computeSavings,
} from '@/modules/savings/engine/compute-savings';
import { DateBudgetSummary, SavingsSummary } from './wallet.mapper';

/**
 * The one-line-per-wallet numbers the switcher shows (PRD v2 10.2).
 *
 * Computed here so `GET /api/wallets` is a single request: a switcher that fired one
 * request per wallet would show its rows filling in one at a time, which is exactly the
 * moment the user is trying to compare them.
 */
@Injectable()
export class WalletSummaryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportsService,
    private readonly clock: ClockService,
  ) {}

  summarise(userId: number, wallet: Wallet): Promise<DateBudgetSummary | SavingsSummary> {
    return wallet.type === WalletType.DATE_BUDGET
      ? this.dateBudgetSummary(wallet)
      : this.savingsSummary(userId, wallet);
  }

  /** Reuses the home-screen widget rather than recomputing the same four numbers. */
  private async dateBudgetSummary(wallet: Wallet): Promise<DateBudgetSummary> {
    const today = await this.reports.todayReport(wallet.id);

    return {
      period: this.clock.currentPeriod(),
      dayRemaining: today.remaining,
      weekendBudgetProjected: today.weekendBudgetProjected,
      monthRemaining: today.monthRemaining,
    };
  }

  /**
   * A savings wallet with no goal yet still gets a row.
   *
   * That is a normal state -- the wallet is created before the goal is set -- so the
   * balance is reported and every goal-derived figure comes back null rather than zero.
   * Zero would read as "no progress" when the truth is "no target".
   */
  private async savingsSummary(userId: number, wallet: Wallet): Promise<SavingsSummary> {
    const [goal, rows] = await Promise.all([
      this.prisma.savingsGoal.findFirst({
        where: { walletId: wallet.id, userId, status: 'ACTIVE' },
        orderBy: { id: 'desc' },
      }),
      this.loadSavingsTxns(wallet.id),
    ]);

    if (!goal) {
      const balance = rows.reduce(
        (total, row) => total + (row.kind === 'DEPOSIT' || row.kind === 'TRANSFER_IN' ? row.amount : -row.amount),
        0,
      );

      return { balance, goalName: null, progress: null, paceDelta: null, outstandingAdvance: 0 };
    }

    const allocations = await this.loadAllocations(wallet.id);

    const report = computeSavings({
      goal: {
        targetAmount: goal.targetAmount,
        openingBalance: goal.openingBalance,
        startDate: fromDateOnly(goal.startDate),
        deadline: fromDateOnly(goal.deadline),
        planPerMonth: goal.planPerMonth,
      },
      txns: rows,
      allocations,
      today: this.clock.today(),
    });

    return {
      balance: report.balance,
      goalName: goal.name,
      progress: report.progress,
      paceDelta: report.paceDelta,
      outstandingAdvance: report.outstandingAdvance,
    };
  }

  private async loadSavingsTxns(walletId: number): Promise<SavingsTxnInput[]> {
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

  /** A repayment belongs to the month of the deposit that paid it (PRD v2 5.3). */
  private async loadAllocations(walletId: number): Promise<{ amount: number; depositOccurredOn: string }[]> {
    const rows = await this.prisma.repaymentAllocation.findMany({
      where: { deposit: { walletId, deletedAt: null } },
      select: { amount: true, deposit: { select: { occurredOn: true } } },
    });

    return rows.map((row) => ({
      amount: row.amount,
      depositOccurredOn: fromDateOnly(row.deposit.occurredOn),
    }));
  }
}
