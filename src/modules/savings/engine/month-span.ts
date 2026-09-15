import { addMonths, format, parseISO } from 'date-fns';
import { addDaysTo, assertPeriod, daysInPeriod, periodOf } from '@/modules/reports/engine/calendar';

/**
 * Month arithmetic for the savings engine (PRD v2 section 5.2).
 *
 * The date-budget engine counts days; this one counts months, and that is the only reason
 * it exists as a separate file. Everything else -- parsing, periods, day counts -- is
 * borrowed from `reports/engine/calendar.ts` rather than reimplemented, so there is one
 * calendar vocabulary in the codebase and not two.
 */

/**
 * The PRD's conversion factor between months and days (Lampiran A).
 *
 * 30.44 is the mean Gregorian month. It is only ever used for projections, which are
 * estimates by nature -- never for deciding which month a transaction belongs to.
 */
export const AVG_DAYS_PER_MONTH = 30.44;

/**
 * Months from `from` to `to`, counting both ends (PRD v2 section 5.2).
 *
 *   monthSpan('2026-05', '2027-08') === 16
 *   monthSpan('2026-05', '2026-05') === 1     // section 8.11: valid, not an error
 *
 * Returns zero or less when `to` is before `from`; callers that need a floor say so, so
 * that "the deadline has passed" stays distinguishable from "one month left".
 */
export function monthSpan(from: string, to: string): number {
  const [fromYear, fromMonth] = assertPeriod(from).split('-').map(Number);
  const [toYear, toMonth] = assertPeriod(to).split('-').map(Number);

  return (toYear - fromYear) * 12 + (toMonth - fromMonth) + 1;
}

/**
 * Whole months between the goal starting and today, counted on the calendar.
 *
 * Calendar months, not anniversaries: a goal started on the 20th has its first month tick
 * over at the turn of the month, not on the 20th of the next one. That matches
 * `monthSpan`, which is what `plan_per_month` is divided by -- if `elapsed` used
 * anniversaries while the plan used calendar months, `expected_balance` would drift away
 * from the plan by up to a month for no reason the user could see.
 */
export function completeMonthsElapsed(startDate: string, today: string): number {
  return Math.max(0, monthSpan(periodOf(startDate), periodOf(today)) - 1);
}

/**
 * How far through the goal we are, in months, as a fraction (PRD v2 section 5.2).
 *
 * The whole months so far, plus the portion of the current month already gone. Day 1 of a
 * month contributes nothing -- the month has not been lived through yet.
 */
export function elapsedMonths(startDate: string, today: string): number {
  const period = periodOf(today);
  const dayOfMonth = Number(today.slice(8, 10));

  return completeMonthsElapsed(startDate, today) + (dayOfMonth - 1) / daysInPeriod(period);
}

/**
 * `date` plus a fractional number of months.
 *
 * Whole months move the calendar; the leftover fraction is converted to days at
 * AVG_DAYS_PER_MONTH. Used only for `projectedDate`, where the input is already an
 * estimate -- 2026-09-14 plus 20.14 months lands on 2028-05-18.
 */
export function addMonthsTo(date: string, months: number): string {
  const whole = Math.floor(months);
  const shifted = format(addMonths(parseISO(date), whole), 'yyyy-MM-dd');

  return addDaysTo(shifted, Math.round((months - whole) * AVG_DAYS_PER_MONTH));
}

/** The `count` calendar months immediately before `period`, oldest first. */
export function precedingPeriods(period: string, count: number): string[] {
  const [year, month] = assertPeriod(period).split('-').map(Number);
  const periods: string[] = [];

  for (let back = count; back >= 1; back -= 1) {
    // Month arithmetic in a zero-based index, so December rolls the year over by itself.
    const index = year * 12 + (month - 1) - back;
    periods.push(`${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`);
  }

  return periods;
}
