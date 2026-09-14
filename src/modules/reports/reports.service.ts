import { Injectable } from '@nestjs/common';
import { ClockService } from '@/common/clock/clock.service';
import { AppException } from '@/common/errors';
import { fromDateOnly } from '@/common/utils/date-only';
import { MonthComputationService } from '@/modules/budgets/month-computation.service';
import { TransactionsService } from '@/modules/transactions/transactions.service';
import { TransactionWithRelations } from '@/modules/transactions/transaction.mapper';
import {
  AggregatableExpense,
  CategoryBreakdown,
  MerchantBreakdown,
  PaymentMethodBreakdown,
  TopExpense,
  aggregateByCategory,
  aggregateByMerchant,
  aggregateByPaymentMethod,
  topExpenses,
} from './engine/aggregate';
import {
  DayType,
  addDaysTo,
  buildWeekSegments,
  dayTypeOf,
  nextPeriod,
  periodOf,
  previousPeriod,
} from './engine/calendar';
import { DayReport, ExpenseInput, MonthReport, WeekReport, buildDayReports } from './engine/compute-month';

export interface MonthReportResponse extends MonthReport {
  byCategory: CategoryBreakdown[];
  byPaymentMethod: PaymentMethodBreakdown[];
  byMerchant: MerchantBreakdown[];
  topExpenses: TopExpense[];
}

/** Where the week navigation controls land, resolved against the real segment count. */
export interface WeekNeighbour {
  period: string;
  weekIndex: number;
}

export interface WeekReportResponse extends WeekReport {
  period: string;
  dailyWeekdayRate: number;
  days: DayReport[];
  /**
   * The adjacent segments, month boundaries already crossed.
   *
   * A month yields between 4 and 6 segments (PRD 4.2), so a client cannot know where W1's
   * "previous" lands without knowing the shape of the month before it. The engine does, so
   * it says, rather than leaving the caller to guess an index that may not exist.
   */
  prevWeek: WeekNeighbour;
  nextWeek: WeekNeighbour;
  projection: {
    weekendBudgetIfNoMoreWeekdaySpend: number;
    remainingWeekdayDays: number;
  };
}

export interface TodayReportResponse {
  date: string;
  dayType: DayType;
  dayBudget: number;
  spent: number;
  remaining: number;
  weekIndex: number;
  weekendBudgetProjected: number;
  monthRemaining: number;
}

function toAggregatable(expense: TransactionWithRelations): AggregatableExpense {
  return {
    id: expense.id,
    occurredOn: fromDateOnly(expense.occurredOn),
    amount: expense.amount,
    merchant: expense.merchant,
    merchantKey: expense.merchantKey,
    paymentMethod: expense.paymentMethod,
    note: expense.note,
    category: expense.category
      ? { id: expense.category.id, name: expense.category.name, color: expense.category.color }
      : null,
  };
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly computation: MonthComputationService,
    private readonly transactions: TransactionsService,
    private readonly clock: ClockService,
  ) {}

  /**
   * The monthly dashboard payload (PRD 8.6).
   *
   * One expense query feeds both the week maths and every aggregation, so the endpoint
   * stays a couple of queries rather than one per week (PRD 11, < 300 ms).
   */
  async monthReport(walletId: number, period: string): Promise<MonthReportResponse> {
    const [report, rows] = await Promise.all([
      this.computation.computeMonthReport(walletId, period),
      this.transactions.loadForPeriod(walletId, period),
    ]);

    const aggregatable = rows.map(toAggregatable);

    return {
      ...report,
      byCategory: aggregateByCategory(aggregatable),
      byPaymentMethod: aggregateByPaymentMethod(aggregatable),
      byMerchant: aggregateByMerchant(aggregatable),
      topExpenses: topExpenses(aggregatable),
    };
  }

  /** The week segment containing today (PRD 8.6). */
  async currentWeekReport(walletId: number): Promise<WeekReportResponse> {
    const today = this.clock.today();
    const period = periodOf(today);
    const segment = buildWeekSegments(period).find(
      (candidate) => today >= candidate.startDate && today <= candidate.endDate,
    );

    // Every day of every month belongs to a segment, so this cannot miss.
    return this.weekReport(walletId, period, segment?.weekIndex ?? 1);
  }

  async weekReport(walletId: number, period: string, weekIndex: number): Promise<WeekReportResponse> {
    const report = await this.computation.computeMonthReport(walletId, period);
    const week = report.weeks.find((candidate) => candidate.weekIndex === weekIndex);

    if (!week) {
      throw AppException.notFound(`week ${weekIndex} does not exist in ${period}`);
    }

    const expenses = await this.computation.loadExpenseInputs(walletId, period);
    const today = this.clock.today();

    return {
      ...week,
      period,
      dailyWeekdayRate: report.dailyWeekdayRate,
      days: buildDayReports(week, report.dailyWeekdayRate, expenses, today),
      prevWeek: previousWeekOf(period, weekIndex),
      nextWeek: nextWeekOf(period, weekIndex, report.weeks.length),
      projection: {
        // "If nothing more is spent on weekdays" is exactly the weekend budget as it
        // already stands: weekBudget - weekdaySpent so far + rolloverIn.
        weekendBudgetIfNoMoreWeekdaySpend: week.weekendBudget,
        remainingWeekdayDays: countRemainingWeekdayDays(week, today),
      },
    };
  }

  /** The compact widget at the top of the home screen (PRD 8.6, 9.3). */
  async todayReport(walletId: number): Promise<TodayReportResponse> {
    const today = this.clock.today();
    const period = periodOf(today);

    const [report, expenses] = await Promise.all([
      this.computation.computeMonthReport(walletId, period),
      this.computation.loadExpenseInputs(walletId, period),
    ]);

    const week = report.weeks.find((candidate) => candidate.isCurrent) ?? report.weeks[0];
    const dayType = dayTypeOf(today);
    const dayBudget = dayType === 'WEEKDAY' ? report.dailyWeekdayRate : 0;
    const spent = sumOnDate(expenses, today);

    return {
      date: today,
      dayType,
      dayBudget,
      spent,
      remaining: dayBudget - spent,
      weekIndex: week.weekIndex,
      weekendBudgetProjected: week.weekendBudget,
      // monthlyBudget + carryIn - totalSpent, which is exactly carryOut as it stands now.
      monthRemaining: report.carryOut,
    };
  }
}

function sumOnDate(expenses: readonly ExpenseInput[], date: string): number {
  return expenses
    .filter((expense) => expense.spentOn === date)
    .reduce((total, expense) => total + expense.amount, 0);
}

/**
 * The segment before this one, stepping into the previous month when there is no W0.
 *
 * `buildWeekSegments` is pure calendar arithmetic, so resolving the neighbouring month
 * costs no query.
 */
function previousWeekOf(period: string, weekIndex: number): WeekNeighbour {
  if (weekIndex > 1) return { period, weekIndex: weekIndex - 1 };

  const earlier = previousPeriod(period);
  return { period: earlier, weekIndex: buildWeekSegments(earlier).length };
}

/** The segment after this one, stepping into the next month past the last one. */
function nextWeekOf(period: string, weekIndex: number, weekCount: number): WeekNeighbour {
  if (weekIndex < weekCount) return { period, weekIndex: weekIndex + 1 };

  return { period: nextPeriod(period), weekIndex: 1 };
}

/** Weekday days left in this segment, today included. Zero once the segment is over. */
function countRemainingWeekdayDays(week: WeekReport, today: string): number {
  if (today > week.endDate) return 0;

  const from = today < week.startDate ? week.startDate : today;
  let remaining = 0;

  for (let cursor = from; cursor <= week.endDate; cursor = addDaysTo(cursor, 1)) {
    if (dayTypeOf(cursor) === 'WEEKDAY') remaining += 1;
  }

  return remaining;
}
