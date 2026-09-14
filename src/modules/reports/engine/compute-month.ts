import { floorDivide, sumMoney } from '@/common/utils/money';
import {
  DayType,
  WeekSegment,
  assertPeriod,
  buildWeekSegments,
  countWeekendsInPeriod,
  dayTypeOf,
  daysInPeriod,
  eachDateInRange,
  firstDayOfPeriod,
  lastDayOfPeriod,
} from './calendar';

/**
 * The calculation engine (PRD section 4, NORMATIVE; operation order from Appendix A).
 *
 * The whole point of the product lives in one line: `weekendBudget = weekBudget -
 * weekdaySpent + rolloverIn`. Whatever is left of the weekday allowance IS the weekend
 * budget, so discipline on Monday visibly buys dinner on Saturday.
 *
 * This module is a pure function by contract (PRD 4.7): no database, no `Date.now()`, no
 * side effects. "Today" is an input, not something read from the clock. Nothing derived
 * here is ever a source of truth -- every number is recomputed from expenses + budget.
 */

export interface ExpenseInput {
  /** `YYYY-MM-DD` in Asia/Jakarta. */
  spentOn: string;
  /** Whole rupiah, always >= 1 in practice (PRD 6.8). */
  amount: number;
}

/**
 * Money moved to or from another wallet (PRD v2 6.2).
 *
 * A separate list rather than a `kind` on ExpenseInput, deliberately. A transfer is not
 * spending: it has no weekday/weekend character and no category, it just makes the week
 * poorer or richer. Keeping it apart is also what lets the v1.1 fixtures call this
 * function unchanged -- see the note on `transfers` below.
 */
export interface TransferInput {
  /** `YYYY-MM-DD` in Asia/Jakarta. */
  occurredOn: string;
  /** Whole rupiah, ALWAYS positive; the sign lives in `direction`. */
  amount: number;
  direction: 'IN' | 'OUT';
}

export interface WeekReport extends WeekSegment {
  /** `dailyWeekdayRate * weekdayDays` -- the weekday allowance for this segment. */
  weekBudget: number;
  weekdaySpent: number;
  /** carryIn + roundingRemainder for W1, previous `weekRemaining` afterwards. */
  rolloverIn: number;
  /** Moved out to another wallet during this segment (PRD v2 6.2). */
  transferOut: number;
  /** Moved in from another wallet during this segment. */
  transferIn: number;
  /** What is actually available for the weekend. MAY be negative (PRD 4.4). */
  weekendBudget: number;
  weekendSpent: number;
  /** Rolls into the next week; from the last segment it becomes carryOut. MAY be negative. */
  weekRemaining: number;
  isCurrent: boolean;
}

export interface MonthReport {
  period: string;
  hasBudget: boolean;
  monthlyBudget: number;
  carryIn: number;
  roundingRemainder: number;
  weekdayCount: number;
  weekendCount: number;
  dailyWeekdayRate: number;
  totalSpent: number;
  weekdaySpent: number;
  weekendSpent: number;
  /** Month totals, for the report header (PRD v2 10.4). */
  transferOut: number;
  transferIn: number;
  carryOut: number;
  isOverspent: boolean;
  /** Friendlier alias of carryOut for the UI (PRD 8.6). */
  spendableRemaining: number;
  daysElapsed: number;
  daysTotal: number;
  weeks: WeekReport[];
}

export interface ComputeMonthInput {
  period: string;
  /** 0 when the user has not set a budget for this month (PRD 6.5). */
  monthlyBudget: number;
  /** Carry-over from the previous month with a budget; MAY be negative (PRD 4.5). */
  carryIn: number;
  expenses: readonly ExpenseInput[];
  /**
   * Transfers to and from other wallets (PRD v2 6.2).
   *
   * OPTIONAL, and that is load-bearing rather than convenience: with no transfers the
   * arithmetic below reduces term for term to v1.1, so the golden fixtures that predate
   * wallets call this function exactly as they always did and must keep producing the
   * same numbers (test S11).
   */
  transfers?: readonly TransferInput[];
  /**
   * Today in Asia/Jakarta, `YYYY-MM-DD`. Supplied by the caller so this function stays
   * pure and deterministic; omit it and nothing is marked as current.
   */
  today?: string;
}

export interface DayReport {
  date: string;
  dayType: DayType;
  /** `dailyWeekdayRate` on weekdays, 0 on weekends -- the weekend has no per-day rate. */
  dayBudget: number;
  spent: number;
  /** Informative only: daily over/underspend is absorbed weekly, never carried per day (PRD 4.3). */
  remaining: number;
  isToday: boolean;
  expenseCount: number;
}

function assertInteger(value: number, label: string): number {
  if (!Number.isInteger(value)) {
    throw new TypeError(`${label} must be an integer number of rupiah, got ${String(value)}`);
  }
  return value;
}

/**
 * Computes a whole budget period.
 *
 * Expenses outside `period` are ignored rather than trusted, which keeps the section 4.6
 * invariant meaningful no matter what the caller passes in.
 */
export function computeMonth(input: ComputeMonthInput): MonthReport {
  const period = assertPeriod(input.period);
  const monthlyBudget = assertInteger(input.monthlyBudget, 'monthlyBudget');
  const carryIn = assertInteger(input.carryIn, 'carryIn');

  if (monthlyBudget < 0) {
    throw new RangeError(`monthlyBudget must not be negative, got ${monthlyBudget}`);
  }

  const monthStart = firstDayOfPeriod(period);
  const monthEnd = lastDayOfPeriod(period);
  const expenses = input.expenses.filter(
    (expense) => expense.spentOn >= monthStart && expense.spentOn <= monthEnd,
  );
  expenses.forEach((expense) => assertInteger(expense.amount, 'expense.amount'));

  const transfers = (input.transfers ?? []).filter(
    (transfer) => transfer.occurredOn >= monthStart && transfer.occurredOn <= monthEnd,
  );
  transfers.forEach((transfer) => assertInteger(transfer.amount, 'transfer.amount'));

  const segments = buildWeekSegments(period);
  const weekdayCount = segments.reduce((total, segment) => total + segment.weekdayDays, 0);

  // PRD 6.14: impossible in the Gregorian calendar, but guard the division anyway.
  if (weekdayCount === 0) {
    throw new Error(`invalid calendar month: ${period} has no weekdays`);
  }

  const { quotient: dailyWeekdayRate, remainder: roundingRemainder } = floorDivide(
    monthlyBudget,
    weekdayCount,
  );

  // The remainder that FLOOR left behind is money too -- it enters W1 rather than vanishing.
  let rolloverIn = carryIn + roundingRemainder;
  const weeks: WeekReport[] = [];

  for (const segment of segments) {
    const inSegment = expenses.filter(
      (expense) => expense.spentOn >= segment.startDate && expense.spentOn <= segment.endDate,
    );

    const weekdaySpent = sumMoney(
      inSegment.filter((e) => dayTypeOf(e.spentOn) === 'WEEKDAY').map((e) => e.amount),
    );
    const weekendSpent = sumMoney(
      inSegment.filter((e) => dayTypeOf(e.spentOn) === 'WEEKEND').map((e) => e.amount),
    );

    const inSegmentTransfers = transfers.filter(
      (transfer) =>
        transfer.occurredOn >= segment.startDate && transfer.occurredOn <= segment.endDate,
    );

    // A transfer lands in the week its date falls in, not in W1 and not through carryIn
    // (PRD v2 6.2). Moving 320rb to savings on the 3rd should make *that* weekend poorer,
    // where the tradeoff is still a decision rather than a surprise at month end.
    const transferOut = sumMoney(
      inSegmentTransfers.filter((t) => t.direction === 'OUT').map((t) => t.amount),
    );
    const transferIn = sumMoney(
      inSegmentTransfers.filter((t) => t.direction === 'IN').map((t) => t.amount),
    );

    const weekBudget = dailyWeekdayRate * segment.weekdayDays;
    const weekendBudget = weekBudget - weekdaySpent + rolloverIn - transferOut + transferIn;
    const weekRemaining = weekendBudget - weekendSpent;

    weeks.push({
      ...segment,
      weekBudget,
      weekdaySpent,
      rolloverIn,
      transferOut,
      transferIn,
      weekendBudget,
      weekendSpent,
      weekRemaining,
      isCurrent: isDateInSegment(input.today, segment),
    });

    // Deficits roll forward untouched, exactly like surpluses (PRD 4.4).
    rolloverIn = weekRemaining;
  }

  const carryOut = weeks[weeks.length - 1].weekRemaining;
  const weekdaySpent = sumMoney(weeks.map((week) => week.weekdaySpent));
  const weekendSpent = sumMoney(weeks.map((week) => week.weekendSpent));
  const totalSpent = weekdaySpent + weekendSpent;
  const transferOut = sumMoney(weeks.map((week) => week.transferOut));
  const transferIn = sumMoney(weeks.map((week) => week.transferIn));

  assertInvariant({ period, monthlyBudget, carryIn, totalSpent, transferOut, transferIn, carryOut });

  const daysTotal = daysInPeriod(period);

  return {
    period,
    // PRD 6.10 forbids a budget below 1, so 0 unambiguously means "not set yet".
    hasBudget: monthlyBudget > 0,
    monthlyBudget,
    carryIn,
    roundingRemainder,
    weekdayCount,
    weekendCount: countWeekendsInPeriod(period),
    dailyWeekdayRate,
    totalSpent,
    weekdaySpent,
    weekendSpent,
    transferOut,
    transferIn,
    carryOut,
    isOverspent: carryOut < 0,
    spendableRemaining: carryOut,
    daysElapsed: countDaysElapsed(period, input.today),
    daysTotal,
    weeks,
  };
}

function isDateInSegment(date: string | undefined, segment: WeekSegment): boolean {
  return date !== undefined && date >= segment.startDate && date <= segment.endDate;
}

/**
 * How far into the month we are: the day-of-month for the current month, the full month
 * once it is over, and 0 for a month that has not started.
 */
function countDaysElapsed(period: string, today?: string): number {
  const daysTotal = daysInPeriod(period);
  if (!today) return daysTotal;
  if (today > lastDayOfPeriod(period)) return daysTotal;
  if (today < firstDayOfPeriod(period)) return 0;
  return Number(today.slice(8, 10));
}

/**
 * PRD 4.6 as amended by PRD v2 6.2 -- the one identity that must hold for every possible
 * distribution of spending and transfers:
 *
 *   carryOut == monthlyBudget + carryIn - totalSpent - transferOut + transferIn
 *
 * The amendment is why *where* a transfer falls cannot change `carryOut`: the month total
 * appears here whatever week it landed in, so moving it only shifts which week feels it
 * (test S10). With no transfers the two new terms are zero and this is v1.1's identity
 * unchanged.
 *
 * If this ever fails the implementation is wrong, so it is checked on every call rather
 * than only under test -- it is a cheap comparison of numbers already computed.
 */
function assertInvariant(values: {
  period: string;
  monthlyBudget: number;
  carryIn: number;
  totalSpent: number;
  transferOut: number;
  transferIn: number;
  carryOut: number;
}): void {
  const expected =
    values.monthlyBudget +
    values.carryIn -
    values.totalSpent -
    values.transferOut +
    values.transferIn;

  if (values.carryOut !== expected) {
    throw new Error(
      `budget invariant violated for ${values.period}: carryOut ${values.carryOut} != ` +
        `monthlyBudget ${values.monthlyBudget} + carryIn ${values.carryIn} - totalSpent ` +
        `${values.totalSpent} - transferOut ${values.transferOut} + transferIn ${values.transferIn}`,
    );
  }
}

/**
 * Per-day breakdown of one week segment (PRD 4.3, 8.6).
 *
 * `remaining` is informative only. Daily surplus and shortfall are deliberately NOT
 * carried day to day -- everything is absorbed at week level through `weekendBudget`, so
 * the user only ever has to remember one number per day.
 */
export function buildDayReports(
  segment: WeekSegment,
  dailyWeekdayRate: number,
  expenses: readonly ExpenseInput[],
  today?: string,
): DayReport[] {
  return eachDateInRange(segment.startDate, segment.endDate).map((date) => {
    const onDate = expenses.filter((expense) => expense.spentOn === date);
    const dayType = dayTypeOf(date);
    const dayBudget = dayType === 'WEEKDAY' ? dailyWeekdayRate : 0;
    const spent = sumMoney(onDate.map((expense) => expense.amount));

    return {
      date,
      dayType,
      dayBudget,
      spent,
      remaining: dayBudget - spent,
      isToday: date === today,
      expenseCount: onDate.length,
    };
  });
}
