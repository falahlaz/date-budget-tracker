import { differenceInCalendarDays, parseISO } from 'date-fns';
import { sumMoney } from '@/common/utils/money';
import { assertDateString, periodOf } from '@/modules/reports/engine/calendar';
import { addMonthsTo, elapsedMonths, monthSpan, precedingPeriods } from './month-span';

/**
 * The savings engine (PRD v2 section 5, NORMATIVE).
 *
 * The mirror image of the date-budget engine. That one answers "how much may I still
 * spend?"; this one answers "how much do I still have to put in?" -- so where the other
 * counts down from a budget, this counts up towards a target and reports how far behind
 * the plan the balance has fallen.
 *
 * Pure by contract, exactly like `reports/engine/compute-month.ts`: no database, no
 * `Date.now()`, no side effects. "Today" is an input. Nothing returned here is ever a
 * source of truth -- every number is recomputed from the goal plus its transactions.
 */

export type SavingsKind = 'DEPOSIT' | 'WITHDRAW' | 'TRANSFER_IN' | 'TRANSFER_OUT';

/** Money coming in. Transfers from another wallet count as deposits (section 5.2). */
const IN_KINDS: ReadonlySet<SavingsKind> = new Set(['DEPOSIT', 'TRANSFER_IN']);
/** Money going out. */
const OUT_KINDS: ReadonlySet<SavingsKind> = new Set(['WITHDRAW', 'TRANSFER_OUT']);

/** How many complete months of history the rate is averaged over (section 5.2). */
const RATE_WINDOW_MONTHS = 3;

export interface SavingsGoalInput {
  /** Whole rupiah, >= 1. */
  targetAmount: number;
  /** What was already in the account when the goal was created; >= 0. */
  openingBalance: number;
  startDate: string;
  deadline: string;
  /** Locked when the goal was created -- the fixed yardstick pace is measured against. */
  planPerMonth: number;
}

export interface SavingsTxnInput {
  /** `YYYY-MM-DD` in Asia/Jakarta. */
  occurredOn: string;
  /** Whole rupiah, ALWAYS positive. Direction is carried by `kind`, never by the sign. */
  amount: number;
  kind: SavingsKind;
  /** "bakal gw balikin" -- only meaningful on a WITHDRAW. */
  expectedReturn?: boolean;
  returnedAmount?: number;
}

/**
 * One repayment: an advance, and the deposit that paid part of it back.
 *
 * The deposit's month is what matters to the monthly rows, not the advance's: a repayment
 * reduces the month in which the money went in, which is the month whose progress would
 * otherwise be overstated (section 5.3).
 *
 * `withdrawalId` is not used by `computeSavings` at all -- it is here because
 * `outstandingAdvanceAsOf` (month-report.ts) cannot attribute a repayment to an advance
 * without it, and one loader feeding two functions beats two loaders that can drift apart.
 */
export interface AllocationInput {
  /** The advance this paid down -- a WITHDRAW row's id. */
  withdrawalId: number;
  amount: number;
  depositOccurredOn: string;
}

export interface ComputeSavingsInput {
  goal: SavingsGoalInput;
  txns: readonly SavingsTxnInput[];
  allocations: readonly AllocationInput[];
  /** Today in Asia/Jakarta, `YYYY-MM-DD`. Injected so this function stays deterministic. */
  today: string;
}

export interface SavingsMonthRow {
  period: string;
  /** DEPOSIT + TRANSFER_IN. */
  depositTotal: number;
  /** WITHDRAW + TRANSFER_OUT. */
  withdrawTotal: number;
  /** The part of `depositTotal` that only patched an earlier withdrawal. */
  repaymentTotal: number;
  /** `depositTotal - repaymentTotal` -- the only figure that is real progress. */
  freshContribution: number;
  net: number;
}

export type RateBasis = 'LAST_3_MONTHS' | 'PLAN_FALLBACK';

export interface SavingsReport {
  balance: number;
  /** Never negative: an overshoot is reported as `surplus`, not as negative remaining. */
  remaining: number;
  surplus: number;
  achieved: boolean;
  /** 0..1, capped at 1 so the progress bar cannot overrun (section 8.4). */
  progress: number;
  totalMonths: number;
  monthsLeft: number;
  requiredPerMonth: number;
  elapsed: number;
  expectedBalance: number;
  /** Negative means behind plan. */
  paceDelta: number;
  rate: number;
  rateBasis: RateBasis;
  projectedMonths: number | null;
  projectedDate: string | null;
  /** Days the projection lands past the deadline; null when there is no projection. */
  projectedDaysLate: number | null;
  /** Days the deadline is already in the past, 0 while it is still ahead (section 8.5). */
  deadlinePassedDays: number;
  /**
   * Total advances not yet paid back.
   *
   * NOT subtracted from `balance`. The money has already left the account and the balance
   * already reflects it; subtracting again would count the withdrawal twice. This is a
   * memo, and the UI has to show it as one (section 5.2).
   */
  outstandingAdvance: number;
  monthly: SavingsMonthRow[];
}

/**
 * The monthly instalment a goal is created with (section 5.2).
 *
 * Locked at creation and only recomputed when the goal is edited, from the original
 * `startDate`, so the pace baseline is one straight line rather than a curve that flatters
 * whatever the balance happens to be today.
 */
export function planPerMonthFor(goal: {
  targetAmount: number;
  openingBalance: number;
  startDate: string;
  deadline: string;
}): number {
  const months = monthSpan(periodOf(goal.startDate), periodOf(goal.deadline));

  if (months < 1) {
    throw new RangeError(
      `deadline ${goal.deadline} is before start date ${goal.startDate}; month span ${months}`,
    );
  }

  return Math.ceil(Math.max(0, goal.targetAmount - goal.openingBalance) / months);
}

export function computeSavings(input: ComputeSavingsInput): SavingsReport {
  const { goal, txns, allocations } = input;
  const today = assertDateString(input.today);

  assertDateString(goal.startDate);
  assertDateString(goal.deadline);

  const inflow = sumMoney(txns.filter((t) => IN_KINDS.has(t.kind)).map((t) => t.amount));
  const outflow = sumMoney(txns.filter((t) => OUT_KINDS.has(t.kind)).map((t) => t.amount));
  const balance = goal.openingBalance + inflow - outflow;

  assertBalance({ balance, openingBalance: goal.openingBalance, inflow, outflow });

  const remaining = Math.max(0, goal.targetAmount - balance);
  const surplus = Math.max(0, balance - goal.targetAmount);

  const totalMonths = monthSpan(periodOf(goal.startDate), periodOf(goal.deadline));
  // Zero once the deadline is behind us, which is what turns requiredPerMonth into
  // "all of it, now" rather than a division by zero (section 8.5).
  const monthsLeft = Math.max(0, monthSpan(periodOf(today), periodOf(goal.deadline)));
  const requiredPerMonth = monthsLeft > 0 ? Math.ceil(remaining / monthsLeft) : remaining;

  const elapsed = elapsedMonths(goal.startDate, today);
  const expectedBalance = Math.round(goal.openingBalance + goal.planPerMonth * elapsed);

  const monthly = monthlyRows(txns, allocations);
  const { rate, rateBasis } = resolveRate(monthly, goal, today);

  // Section 8.2. Every division below this line is guarded by it -- a flat or falling
  // three months has no honest projection, and Infinity is not an answer.
  const projectedMonths = rate > 0 ? remaining / rate : null;
  const projectedDate = projectedMonths === null ? null : addMonthsTo(today, projectedMonths);

  const outstandingAdvance = txns
    .filter((t) => t.kind === 'WITHDRAW' && t.expectedReturn === true)
    .reduce((total, t) => total + Math.max(0, t.amount - (t.returnedAmount ?? 0)), 0);

  return {
    balance,
    remaining,
    surplus,
    achieved: balance >= goal.targetAmount,
    progress: goal.targetAmount > 0 ? Math.min(1, balance / goal.targetAmount) : 1,
    totalMonths,
    monthsLeft,
    requiredPerMonth,
    elapsed,
    expectedBalance,
    paceDelta: balance - expectedBalance,
    rate,
    rateBasis,
    projectedMonths,
    projectedDate,
    projectedDaysLate: projectedDate === null ? null : daysBetween(goal.deadline, projectedDate),
    deadlinePassedDays: Math.max(0, daysBetween(goal.deadline, today)),
    outstandingAdvance,
    monthly,
  };
}

/** Positive when `to` is after `from`. */
function daysBetween(from: string, to: string): number {
  return differenceInCalendarDays(parseISO(to), parseISO(from));
}

/**
 * One row per month that saw any activity, oldest first.
 *
 * Months with nothing in them are deliberately absent here; `resolveRate` puts the zeroes
 * back where they matter, because a month with no activity means no progress and the rate
 * has to feel that.
 *
 * Exported because the month report (section 10.5) needs exactly these rows but has no
 * goal to hand -- a wallet can hold deposits before anyone sets a target on it.
 */
export function monthlyRows(
  txns: readonly SavingsTxnInput[],
  allocations: readonly AllocationInput[],
): SavingsMonthRow[] {
  const rows = new Map<string, SavingsMonthRow>();

  const rowFor = (period: string): SavingsMonthRow => {
    const existing = rows.get(period);
    if (existing) return existing;

    const created: SavingsMonthRow = {
      period,
      depositTotal: 0,
      withdrawTotal: 0,
      repaymentTotal: 0,
      freshContribution: 0,
      net: 0,
    };
    rows.set(period, created);
    return created;
  };

  for (const txn of txns) {
    const row = rowFor(periodOf(txn.occurredOn));
    if (IN_KINDS.has(txn.kind)) row.depositTotal += txn.amount;
    if (OUT_KINDS.has(txn.kind)) row.withdrawTotal += txn.amount;
  }

  for (const allocation of allocations) {
    rowFor(periodOf(allocation.depositOccurredOn)).repaymentTotal += allocation.amount;
  }

  for (const row of rows.values()) {
    // Section 5.3: a 2jt deposit that patched 600rb of debt is 1,4jt of progress, and it
    // is this figure -- never depositTotal -- that any pace indicator may compare to plan.
    row.freshContribution = row.depositTotal - row.repaymentTotal;
    row.net = row.depositTotal - row.withdrawTotal;
  }

  return [...rows.values()].sort((a, b) => a.period.localeCompare(b.period));
}

/**
 * Average net growth per month over the last three complete months (section 5.2).
 *
 * The window is three *calendar* months, not "the last three months that happen to have
 * rows". A month where nothing was saved counts as zero and drags the rate down, which is
 * the honest reading: two idle months really do push the target further away, and a window
 * that skipped them would report a pace the account is not keeping.
 *
 * Months before the goal existed are excluded -- they are not evidence about this goal.
 * With no complete month at all, the plan itself is the only estimate available
 * (section 8.3), and `rateBasis` says so so the UI can mark the projection as provisional.
 */
function resolveRate(
  monthly: readonly SavingsMonthRow[],
  goal: SavingsGoalInput,
  today: string,
): { rate: number; rateBasis: RateBasis } {
  const startPeriod = periodOf(goal.startDate);
  const netByPeriod = new Map(monthly.map((row) => [row.period, row.net]));

  const window = precedingPeriods(periodOf(today), RATE_WINDOW_MONTHS).filter(
    (period) => period >= startPeriod,
  );

  if (window.length === 0) {
    return { rate: goal.planPerMonth, rateBasis: 'PLAN_FALLBACK' };
  }

  const total = window.reduce((sum, period) => sum + (netByPeriod.get(period) ?? 0), 0);

  return { rate: total / window.length, rateBasis: 'LAST_3_MONTHS' };
}

/**
 * The one identity this engine cannot get wrong, checked on every call.
 *
 * Mirrors the invariant assertion in the date-budget engine: cheap, and it fails loudly at
 * the source instead of quietly showing someone the wrong savings balance.
 */
function assertBalance(values: {
  balance: number;
  openingBalance: number;
  inflow: number;
  outflow: number;
}): void {
  const expected = values.openingBalance + values.inflow - values.outflow;

  if (values.balance !== expected) {
    throw new Error(
      `savings invariant violated: balance ${values.balance} != openingBalance ` +
        `${values.openingBalance} + inflow ${values.inflow} - outflow ${values.outflow}`,
    );
  }
}
