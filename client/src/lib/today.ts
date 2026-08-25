const JAKARTA = 'Asia/Jakarta';

const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: JAKARTA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * Today in Asia/Jakarta as `YYYY-MM-DD`.
 *
 * The client computes this in WIB rather than in the device's own timezone so a phone set
 * to another zone cannot offer a date the server will reject as being in the future
 * (PRD 6.9, 6.13). `en-CA` is used because it formats as ISO.
 */
export function todayInJakarta(): string {
  return formatter.format(new Date());
}

export function currentPeriod(): string {
  return todayInJakarta().slice(0, 7);
}

/** Shifts a `YYYY-MM-DD` string by whole days, in UTC so no zone can shift the result. */
export function shiftDate(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

export function shiftPeriod(period: string, months: number): string {
  const [year, month] = period.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1 + months, 1));
  return shifted.toISOString().slice(0, 7);
}
