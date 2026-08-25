import { describe, expect, it } from 'vitest';
import { shiftDate, shiftPeriod, todayInJakarta } from './today';

describe('date helpers', () => {
  it('returns today as an ISO date string', () => {
    expect(todayInJakarta()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('shifts days across month and year boundaries', () => {
    expect(shiftDate('2026-09-05', -1)).toBe('2026-09-04');
    expect(shiftDate('2026-09-01', -1)).toBe('2026-08-31');
    expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftDate('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('shifts periods across a year boundary', () => {
    expect(shiftPeriod('2026-09', 1)).toBe('2026-10');
    expect(shiftPeriod('2026-12', 1)).toBe('2027-01');
    expect(shiftPeriod('2027-01', -1)).toBe('2026-12');
    expect(shiftPeriod('2026-09', -12)).toBe('2025-09');
  });
});
