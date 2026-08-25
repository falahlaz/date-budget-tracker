import { fromDateOnly, toDateOnly } from './date-only';

describe('date-only conversion', () => {
  it('round-trips a date string unchanged', () => {
    for (const date of ['2026-01-01', '2026-09-05', '2026-12-31', '2028-02-29']) {
      expect(fromDateOnly(toDateOnly(date))).toBe(date);
    }
  });

  it('pins to UTC midnight so no timezone can shift the day', () => {
    expect(toDateOnly('2026-09-05').toISOString()).toBe('2026-09-05T00:00:00.000Z');
  });
});
