import { Injectable } from '@nestjs/common';
import { Wallet, WalletType } from '@prisma/client';
import { ClockService } from '@/common/clock/clock.service';
import { ReportsService } from '@/modules/reports/reports.service';
import { SavingsComputationService } from '@/modules/savings/savings-computation.service';
import { DateBudgetSummary, SavingsSummary } from './wallet.mapper';

/**
 * The one-line-per-wallet numbers the switcher shows (PRD v2 10.2).
 *
 * Computed here so `GET /api/wallets` is a single request: a switcher that fired one
 * request per wallet would show its rows filling in one at a time, which is exactly the
 * moment the user is trying to compare them.
 *
 * Neither branch does arithmetic -- each asks the service that owns that engine, so the
 * switcher can never drift from the screen it is a summary of.
 */
@Injectable()
export class WalletSummaryService {
  constructor(
    private readonly reports: ReportsService,
    private readonly savings: SavingsComputationService,
    private readonly clock: ClockService,
  ) {}

  summarise(wallet: Wallet): Promise<DateBudgetSummary | SavingsSummary> {
    return wallet.type === WalletType.DATE_BUDGET
      ? this.dateBudgetSummary(wallet)
      : this.savingsSummary(wallet);
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
  private async savingsSummary(wallet: Wallet): Promise<SavingsSummary> {
    const result = await this.savings.report(wallet.id);

    if (!result) {
      return {
        balance: await this.savings.balance(wallet.id),
        goalName: null,
        progress: null,
        paceDelta: null,
        outstandingAdvance: 0,
      };
    }

    return {
      balance: result.report.balance,
      goalName: result.goal.name,
      progress: result.report.progress,
      paceDelta: result.report.paceDelta,
      outstandingAdvance: result.report.outstandingAdvance,
    };
  }
}
