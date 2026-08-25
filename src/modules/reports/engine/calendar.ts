import { addDays, format, getDay, getDaysInMonth, isValid, parseISO } from 'date-fns';

/**
 * Calendar primitives for the budget engine (PRD section 4.2, NORMATIVE).
 *
 * Everything here works on plain `YYYY-MM-DD` / `YYYY-MM` strings. Dates are calendar
 * facts in Asia/Jakarta, never instants, so no time component ever enters the maths --
 * that is what keeps the whole engine free of timezone bugs. Calendar arithmetic goes
 * through date-fns rather than raw Date maths (PRD 10.1).
 */

export type DayType = 'WEEKDAY' | 'WEEKEND';

export interface WeekSegment {
  /** 1-based, per PRD 4.2. */
  weekIndex: number;
  startDate: string;
  endDate: string;
  /** Monday-Friday days inside this segment. */
  weekdayDays: number;
  /** Saturday-Sunday days inside this segment. */
  weekendDays: number;
}

const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export function isPeriodString(value: string): boolean {
  return PERIOD_PATTERN.test(value);
}

export function isDateString(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const parsed = parseISO(value);
  // Rejects impossible calendar dates such as 2026-02-30, which the regex alone allows.
  return isValid(parsed) && format(parsed, 'yyyy-MM-dd') === value;
}

export function assertPeriod(period: string): string {
  if (!isPeriodString(period)) {
    throw new TypeError(`period must be formatted YYYY-MM, got "${period}"`);
  }
  return period;
}

export function assertDateString(date: string): string {
  if (!isDateString(date)) {
    throw new TypeError(`date must be a real calendar date formatted YYYY-MM-DD, got "${date}"`);
  }
  return date;
}

function toDate(date: string): Date {
  return parseISO(assertDateString(date));
}

function toDateString(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

/** Monday = 0 ... Sunday = 6, the index PRD 4.2's algorithm is written against. */
export function isoWeekdayIndex(date: string): number {
  return (getDay(toDate(date)) + 6) % 7;
}

/** Monday-Friday is a weekday; Saturday-Sunday is a weekend. Public holidays are not special (PRD 3). */
export function dayTypeOf(date: string): DayType {
  return isoWeekdayIndex(date) <= 4 ? 'WEEKDAY' : 'WEEKEND';
}

export function addDaysTo(date: string, days: number): string {
  return toDateString(addDays(toDate(date), days));
}

export function firstDayOfPeriod(period: string): string {
  return `${assertPeriod(period)}-01`;
}

export function daysInPeriod(period: string): number {
  return getDaysInMonth(toDate(firstDayOfPeriod(period)));
}

export function lastDayOfPeriod(period: string): string {
  return `${assertPeriod(period)}-${String(daysInPeriod(period)).padStart(2, '0')}`;
}

/** The `YYYY-MM` a date belongs to. */
export function periodOf(date: string): string {
  return assertDateString(date).slice(0, 7);
}

export function nextPeriod(period: string): string {
  const [year, month] = assertPeriod(period).split('-').map(Number);
  return month === 12
    ? `${year + 1}-01`
    : `${year}-${String(month + 1).padStart(2, '0')}`;
}

export function previousPeriod(period: string): string {
  const [year, month] = assertPeriod(period).split('-').map(Number);
  return month === 1
    ? `${year - 1}-12`
    : `${year}-${String(month - 1).padStart(2, '0')}`;
}

/** Every date from `start` to `end` inclusive. */
export function eachDateInRange(start: string, end: string): string[] {
  assertDateString(start);
  assertDateString(end);
  const dates: string[] = [];
  for (let cursor = start; cursor <= end; cursor = addDaysTo(cursor, 1)) {
    dates.push(cursor);
  }
  return dates;
}

export function countDayTypes(start: string, end: string): { weekdayDays: number; weekendDays: number } {
  let weekdayDays = 0;
  let weekendDays = 0;
  for (const date of eachDateInRange(start, end)) {
    if (dayTypeOf(date) === 'WEEKDAY') weekdayDays += 1;
    else weekendDays += 1;
  }
  return { weekdayDays, weekendDays };
}

/**
 * Splits a month into Monday-Sunday week segments clipped to the month boundary
 * (PRD 4.2, NORMATIVE).
 *
 * Consequences the rest of the engine relies on:
 *  - the first and last segment MAY be shorter than 7 days;
 *  - a month yields between 4 and 6 segments;
 *  - a segment NEVER crosses a month boundary, so the leftover days of a split week
 *    belong to the neighbouring month;
 *  - `weekIndex` starts at 1.
 */
export function buildWeekSegments(period: string): WeekSegment[] {
  assertPeriod(period);

  const monthEnd = lastDayOfPeriod(period);
  const segments: WeekSegment[] = [];

  let cursor = firstDayOfPeriod(period);
  let weekIndex = 1;

  while (cursor <= monthEnd) {
    const daysToSunday = 6 - isoWeekdayIndex(cursor);
    const naturalEnd = addDaysTo(cursor, daysToSunday);
    const segmentEnd = naturalEnd < monthEnd ? naturalEnd : monthEnd;

    segments.push({
      weekIndex,
      startDate: cursor,
      endDate: segmentEnd,
      ...countDayTypes(cursor, segmentEnd),
    });

    cursor = addDaysTo(segmentEnd, 1);
    weekIndex += 1;
  }

  return segments;
}

export function countWeekdaysInPeriod(period: string): number {
  return countDayTypes(firstDayOfPeriod(period), lastDayOfPeriod(period)).weekdayDays;
}

export function countWeekendsInPeriod(period: string): number {
  return countDayTypes(firstDayOfPeriod(period), lastDayOfPeriod(period)).weekendDays;
}

/** The segment a date falls in, or undefined when the date is outside the period. */
export function findSegmentForDate(segments: readonly WeekSegment[], date: string): WeekSegment | undefined {
  return segments.find((segment) => date >= segment.startDate && date <= segment.endDate);
}
