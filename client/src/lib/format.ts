/**
 * Money and date formatting (PRD 9.1).
 *
 * Amounts are whole rupiah integers everywhere, so nothing here ever introduces a decimal.
 * Negative values keep their minus sign and are always accompanied by an OVER label in the
 * UI -- colour alone is never the signal (PRD 11).
 */

const rupiah = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const plain = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });

/** `Rp 1.250.000`, or `-Rp 1.250.000` when negative. */
export function formatRupiah(amount: number): string {
  // Intl renders IDR as "Rp 1.250.000" with a non-breaking space; normalise it so the
  // string is predictable to test and to search.
  return rupiah.format(amount).replace(/ /g, ' ');
}

/** `1.250.000` without the currency prefix, for tight table cells. */
export function formatAmount(amount: number): string {
  return plain.format(amount);
}

/**
 * Short form for cramped spaces: `1,25 jt`, `850 rb`, `-2,1 jt`.
 *
 * Deliberately loses precision -- it is only ever used where the exact figure is one tap
 * away.
 */
export function formatCompactRupiah(amount: number): string {
  const sign = amount < 0 ? '-' : '';
  const value = Math.abs(amount);

  if (value >= 1_000_000) {
    return `${sign}Rp ${trimZero((value / 1_000_000).toFixed(2))} jt`;
  }
  if (value >= 10_000) {
    return `${sign}Rp ${trimZero((value / 1_000).toFixed(0))} rb`;
  }
  return formatRupiah(amount);
}

/** Drops trailing zeros from a decimal and switches to the Indonesian decimal comma. */
function trimZero(value: string): string {
  if (!value.includes('.')) return value;
  return value.replace(/0+$/, '').replace(/\.$/, '').replace('.', ',');
}

/** Rounds a daily rate to the nearest thousand for display only (PRD 5.3). */
export function formatRoundedRate(amount: number): string {
  return formatRupiah(Math.round(amount / 1000) * 1000);
}

/** Groups digits as the user types an amount: `125000` -> `125.000`. */
export function formatAmountInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  if (digits === '') return '';
  return plain.format(Number(digits));
}

/** Reads the integer back out of a grouped input string. */
export function parseAmountInput(raw: string): number {
  const digits = raw.replace(/\D/g, '');
  return digits === '' ? 0 : Number(digits);
}

const WEEKDAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

function parts(date: string): { year: number; month: number; day: number } {
  const [year, month, day] = date.split('-').map(Number);
  return { year, month, day };
}

/** Day of week for a `YYYY-MM-DD` string, computed in UTC so no timezone can shift it. */
function weekdayIndex(date: string): number {
  const { year, month, day } = parts(date);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** `5 Sep` */
export function formatDayShort(date: string): string {
  const { month, day } = parts(date);
  return `${day} ${MONTH_NAMES[month - 1].slice(0, 3)}`;
}

/** `Sabtu, 5 September 2026` */
export function formatDateLong(date: string): string {
  const { year, month, day } = parts(date);
  return `${WEEKDAY_NAMES[weekdayIndex(date)]}, ${day} ${MONTH_NAMES[month - 1]} ${year}`;
}

/** `Sen` */
export function formatWeekdayShort(date: string): string {
  return WEEKDAY_NAMES[weekdayIndex(date)].slice(0, 3);
}

/** `September 2026` */
export function formatPeriodLong(period: string): string {
  const [year, month] = period.split('-').map(Number);
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

/** `Sep 2026` */
export function formatPeriodShort(period: string): string {
  const [year, month] = period.split('-').map(Number);
  return `${MONTH_NAMES[month - 1].slice(0, 3)} ${year}`;
}

/** `7-13 Sep` for a week segment. */
export function formatDateRange(start: string, end: string): string {
  const from = parts(start);
  const to = parts(end);

  if (from.month === to.month) {
    return `${from.day}-${to.day} ${MONTH_NAMES[from.month - 1].slice(0, 3)}`;
  }
  return `${formatDayShort(start)} - ${formatDayShort(end)}`;
}
