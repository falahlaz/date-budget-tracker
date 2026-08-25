import { describe, expect, it } from 'vitest';
import {
  formatAmountInput,
  formatCompactRupiah,
  formatDateLong,
  formatDateRange,
  formatDayShort,
  formatPeriodLong,
  formatRoundedRate,
  formatRupiah,
  formatWeekdayShort,
  parseAmountInput,
} from './format';

describe('money formatting', () => {
  it('formats whole rupiah with id-ID grouping and no decimals', () => {
    expect(formatRupiah(1_250_000)).toBe('Rp 1.250.000');
    expect(formatRupiah(0)).toBe('Rp 0');
    expect(formatRupiah(100_000)).toBe('Rp 100.000');
  });

  it('keeps the minus sign on negative amounts', () => {
    expect(formatRupiah(-100_000)).toBe('-Rp 100.000');
  });

  it('shortens large amounts for tight spaces', () => {
    expect(formatCompactRupiah(1_250_000)).toBe('Rp 1,25 jt');
    expect(formatCompactRupiah(2_000_000)).toBe('Rp 2 jt');
    expect(formatCompactRupiah(850_000)).toBe('Rp 850 rb');
    expect(formatCompactRupiah(-2_100_000)).toBe('-Rp 2,1 jt');
    expect(formatCompactRupiah(5_000)).toBe('Rp 5.000');
  });

  it('rounds the displayed daily rate to the nearest thousand (PRD 5.3)', () => {
    expect(formatRoundedRate(95_238)).toBe('Rp 95.000');
    expect(formatRoundedRate(100_000)).toBe('Rp 100.000');
  });
});

describe('amount input', () => {
  it('groups digits while typing', () => {
    expect(formatAmountInput('125000')).toBe('125.000');
    expect(formatAmountInput('1')).toBe('1');
    expect(formatAmountInput('')).toBe('');
  });

  it('ignores non-digits and leading zeros', () => {
    expect(formatAmountInput('Rp 125.000')).toBe('125.000');
    expect(formatAmountInput('00125')).toBe('125');
  });

  it('round-trips back to an integer', () => {
    expect(parseAmountInput('125.000')).toBe(125_000);
    expect(parseAmountInput('')).toBe(0);
  });
});

describe('date formatting', () => {
  it('formats days and full dates in Indonesian', () => {
    expect(formatDayShort('2026-09-05')).toBe('5 Sep');
    expect(formatDateLong('2026-09-05')).toBe('Sabtu, 5 September 2026');
    expect(formatWeekdayShort('2026-09-07')).toBe('Sen');
  });

  it('formats a period and a week range', () => {
    expect(formatPeriodLong('2026-09')).toBe('September 2026');
    expect(formatDateRange('2026-09-07', '2026-09-13')).toBe('7-13 Sep');
    expect(formatDateRange('2026-08-31', '2026-09-06')).toBe('31 Agu - 6 Sep');
  });
});
