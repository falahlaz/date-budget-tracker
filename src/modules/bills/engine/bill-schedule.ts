import { BillKind } from '@prisma/client';
import { daysInPeriod, nextPeriod, periodOf } from '@/modules/reports/engine/calendar';
import { monthSpan } from '@/modules/savings/engine/month-span';

/**
 * Where a bill stands today. Pure: no clock, no database.
 *
 * A bill owes one payment per period from `startPeriod` to its last period (INSTALLMENT:
 * `endPeriod`; ONE_TIME: `startPeriod` itself; RECURRING: never ends). The payment to make
 * next is always the OLDEST unpaid period, so a missed month is not silently skipped over
 * by paying the current one.
 */

/** A bill falling due this many days out (or fewer) is flagged as due soon. */
export const DUE_SOON_DAYS = 3;

export type BillStatus =
  /** An unpaid period's due date has passed. */
  | 'OVERDUE'
  /** Unpaid and due within DUE_SOON_DAYS. */
  | 'DUE_SOON'
  /** This month is settled; the next one is still ahead. */
  | 'PAID'
  /** Nothing is owed yet this month. */
  | 'UPCOMING'
  /** Every period has been paid. Only INSTALLMENT and ONE_TIME bills ever get here. */
  | 'DONE';

export interface BillScheduleInput {
  kind: BillKind;
  dueDay: number;
  startPeriod: string;
  endPeriod: string | null;
  /** Periods with a live payment (its transaction not deleted). */
  paidPeriods: ReadonlySet<string>;
  today: string;
}

export interface BillSchedule {
  status: BillStatus;
  /** The period the next payment settles; null once DONE. */
  nextPeriod: string | null;
  /** Due date of `nextPeriod`. */
  nextDueDate: string | null;
  /** Days from today to `nextDueDate`; negative when overdue. */
  daysUntilDue: number | null;
  /** Unpaid periods from the start up to and including this month. */
  unpaidDueCount: number;
  /** Of those, how many are already past their due date. */
  overdueCount: number;
  /** Total number of payments; null for a RECURRING bill. */
  totalCount: number | null;
  paidCount: number;
  /** Payments still to make; null for a RECURRING bill. */
  remainingCount: number | null;
}

/** The last period a bill owes, or null when it never ends. */
export function lastPeriodOf(input: Pick<BillScheduleInput, 'kind' | 'startPeriod' | 'endPeriod'>) {
  if (input.kind === BillKind.ONE_TIME) return input.startPeriod;
  if (input.kind === BillKind.RECURRING) return null;
  return input.endPeriod;
}

/** Whether a bill owes a payment in `period`, paid or not. */
export function owesIn(
  input: Pick<BillScheduleInput, 'kind' | 'startPeriod' | 'endPeriod'>,
  period: string,
): boolean {
  const last = lastPeriodOf(input);
  return period >= input.startPeriod && (last === null || period <= last);
}

/** The due date in a period, with the day clamped to the month (31 -> 28 Feb). */
export function dueDateIn(period: string, dueDay: number): string {
  const day = Math.min(dueDay, daysInPeriod(period));
  return `${period}-${String(day).padStart(2, '0')}`;
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function computeBillSchedule(input: BillScheduleInput): BillSchedule {
  const { dueDay, startPeriod, paidPeriods, today } = input;
  const last = lastPeriodOf(input);
  const current = periodOf(today);
  const inRange = (period: string) => period >= startPeriod && (last === null || period <= last);

  const totalCount = last === null ? null : Math.max(monthSpan(startPeriod, last), 0);
  const paidCount = [...paidPeriods].filter(inRange).length;

  // Periods owed so far: from the start through this month, but not past the end.
  let unpaidDueCount = 0;
  let overdueCount = 0;
  let next: string | null = null;

  for (
    let period = startPeriod;
    period <= current && inRange(period);
    period = nextPeriod(period)
  ) {
    if (paidPeriods.has(period)) continue;
    next ??= period;
    unpaidDueCount += 1;
    if (dueDateIn(period, dueDay) < today) overdueCount += 1;
  }

  // Everything owed so far is paid: the next payment is the first unpaid period after
  // this month, if the schedule has one. The paid set is finite, so this terminates.
  if (next === null) {
    let period = startPeriod > current ? startPeriod : nextPeriod(current);
    while (inRange(period) && paidPeriods.has(period)) period = nextPeriod(period);
    next = inRange(period) ? period : null;
  }

  const base = {
    unpaidDueCount,
    overdueCount,
    totalCount,
    paidCount,
    remainingCount: totalCount === null ? null : Math.max(totalCount - paidCount, 0),
  };

  if (next === null) {
    return { ...base, status: 'DONE', nextPeriod: null, nextDueDate: null, daysUntilDue: null };
  }

  const nextDueDate = dueDateIn(next, dueDay);
  const daysUntilDue = daysBetween(today, nextDueDate);

  let status: BillStatus;
  if (daysUntilDue < 0) status = 'OVERDUE';
  else if (paidPeriods.has(current) && inRange(current)) status = 'PAID';
  else if (daysUntilDue <= DUE_SOON_DAYS) status = 'DUE_SOON';
  else status = 'UPCOMING';

  return { ...base, status, nextPeriod: next, nextDueDate, daysUntilDue };
}
