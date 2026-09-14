import { Injectable } from '@nestjs/common';
import { ClockService } from '@/common/clock/clock.service';
import { fromDateOnly, toDateOnly } from '@/common/utils/date-only';
import { TransactionKind } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { firstDayOfPeriod, lastDayOfPeriod } from '@/modules/reports/engine/calendar';
import {
  ExpenseInput,
  MonthReport,
  TransferInput,
  computeMonth,
} from '@/modules/reports/engine/compute-month';
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

  /**
   * Amounts and dates only -- everything the engine needs and nothing it does not.
   *
   * `kind: SPEND` is the important filter. The date-budget engine sees spending and
   * transfers and nothing else (PRD v2 4.1), and transfers reach it by a separate route in
   * M14 because they land on the week rather than on a weekday or weekend.
   */
  async loadExpenseInputs(walletId: number, period: string): Promise<ExpenseInput[]> {
    const rows = await this.prisma.transaction.findMany({
      where: {
        walletId,
        kind: TransactionKind.SPEND,
        deletedAt: null,
        occurredOn: { gte: toDateOnly(firstDayOfPeriod(period)), lte: toDateOnly(lastDayOfPeriod(period)) },
      },
      select: { occurredOn: true, amount: true },
    });

    return rows.map((row) => ({ spentOn: fromDateOnly(row.occurredOn), amount: row.amount }));
  }

  /**
   * Transfers to and from other wallets in this period (PRD v2 6.2).
   *
   * Loaded apart from the spending because they behave differently: a transfer has no
   * weekday or weekend character, it just makes the week it lands in poorer or richer.
   */
  async loadTransferInputs(walletId: number, period: string): Promise<TransferInput[]> {
    const rows = await this.prisma.transaction.findMany({
      where: {
        walletId,
        kind: { in: [TransactionKind.TRANSFER_IN, TransactionKind.TRANSFER_OUT] },
        deletedAt: null,
        occurredOn: { gte: toDateOnly(firstDayOfPeriod(period)), lte: toDateOnly(lastDayOfPeriod(period)) },
      },
      select: { occurredOn: true, amount: true, direction: true },
    });

    return rows.map((row) => ({
      occurredOn: fromDateOnly(row.occurredOn),
      amount: row.amount,
      direction: row.direction,
    }));
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
  async resolveCarryIn(walletId: number, period: string): Promise<number> {
    const uncachedChain: { id: number; period: string; amount: number }[] = [];

    let cursor = period;
    let carry = 0;

    for (;;) {
      const previous = await this.budgets.findPreviousBudgetPeriod(walletId, cursor);

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
        expenses: await this.loadExpenseInputs(walletId, budget.period),
        // Without this the replayed months would ignore transfers, and the carry-over
        // chain would drift from the month reports that do count them.
        transfers: await this.loadTransferInputs(walletId, budget.period),
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
  async computeMonthReport(walletId: number, period: string): Promise<MonthReport> {
    const budget = await this.budgets.findOptional(walletId, period);
    const carryIn = budget ? await this.resolveCarryIn(walletId, period) : 0;
    const [expenses, transfers] = await Promise.all([
      this.loadExpenseInputs(walletId, period),
      this.loadTransferInputs(walletId, period),
    ]);

    const report = computeMonth({
      period,
      monthlyBudget: budget?.amount ?? 0,
      carryIn,
      expenses,
      transfers,
      today: this.clock.today(),
    });

    if (budget && budget.carryOutCached !== report.carryOut) {
      await this.budgets.cacheCarryOut(budget.id, report.carryOut);
    }

    return report;
  }
}
