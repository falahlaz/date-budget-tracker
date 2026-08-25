import { Injectable } from '@nestjs/common';
import { ClockService } from '@/common/clock/clock.service';
import { fromDateOnly, toDateOnly } from '@/common/utils/date-only';
import { PrismaService } from '@/prisma/prisma.service';
import { firstDayOfPeriod, lastDayOfPeriod } from '@/modules/reports/engine/calendar';
import { ExpenseInput, MonthReport, computeMonth } from '@/modules/reports/engine/compute-month';
import { BudgetsService } from './budgets.service';

/**
 * Bridges the database to the pure calculation engine (PRD 4.7, Appendix A).
 *
 * Nothing derived is a source of truth: every number handed out here is recomputed from
 * `expenses` + `monthly_budgets`. The only stored derivative is `carry_out_cached`, and it
 * is a pure optimisation -- NULL always means "recompute", never "zero".
 */
@Injectable()
export class MonthComputationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly budgets: BudgetsService,
    private readonly clock: ClockService,
  ) {}

  /** Amounts and dates only -- everything the engine needs and nothing it does not. */
  async loadExpenseInputs(userId: number, period: string): Promise<ExpenseInput[]> {
    const rows = await this.prisma.expense.findMany({
      where: {
        userId,
        deletedAt: null,
        spentOn: { gte: toDateOnly(firstDayOfPeriod(period)), lte: toDateOnly(lastDayOfPeriod(period)) },
      },
      select: { spentOn: true, amount: true },
    });

    return rows.map((row) => ({ spentOn: fromDateOnly(row.spentOn), amount: row.amount }));
  }

  /**
   * Resolves the carry-in for a period by walking the chain of budgeted months backwards
   * (Appendix A).
   *
   * The walk stops at the first cached `carry_out`, or at the earliest budget of all,
   * where carry-in is 0 by definition (PRD 4.5). Months with no budget are skipped, so a
   * gap month passes the carry-over straight through rather than swallowing it.
   *
   * Written as a loop rather than the PRD's recursion: the semantics are identical, but a
   * user with years of history cannot blow the stack, and each month is computed once.
   */
  async resolveCarryIn(userId: number, period: string): Promise<number> {
    const uncachedChain: { id: number; period: string; amount: number }[] = [];

    let cursor = period;
    let carry = 0;

    for (;;) {
      const previous = await this.budgets.findPreviousBudgetPeriod(userId, cursor);

      if (!previous) break; // base case: nothing earlier has a budget
      if (previous.carryOutCached !== null) {
        carry = previous.carryOutCached;
        break;
      }

      uncachedChain.unshift({ id: previous.id, period: previous.period, amount: previous.amount });
      cursor = previous.period;
    }

    // Replay the uncached months oldest to newest, caching each result on the way.
    for (const budget of uncachedChain) {
      const report = computeMonth({
        period: budget.period,
        monthlyBudget: budget.amount,
        carryIn: carry,
        expenses: await this.loadExpenseInputs(userId, budget.period),
      });

      await this.budgets.cacheCarryOut(budget.id, report.carryOut);
      carry = report.carryOut;
    }

    return carry;
  }

  /**
   * The full engine report for one month.
   *
   * A month with no budget is computed as `monthlyBudget = 0` with `carryIn = 0`: it is
   * excluded from the carry-over chain (PRD 6.5), so the previous month's surplus stays
   * reserved for the next month that actually has a budget.
   */
  async computeMonthReport(userId: number, period: string): Promise<MonthReport> {
    const budget = await this.budgets.findOptional(userId, period);
    const carryIn = budget ? await this.resolveCarryIn(userId, period) : 0;
    const expenses = await this.loadExpenseInputs(userId, period);

    const report = computeMonth({
      period,
      monthlyBudget: budget?.amount ?? 0,
      carryIn,
      expenses,
      today: this.clock.today(),
    });

    if (budget && budget.carryOutCached !== report.carryOut) {
      await this.budgets.cacheCarryOut(budget.id, report.carryOut);
    }

    return report;
  }
}
