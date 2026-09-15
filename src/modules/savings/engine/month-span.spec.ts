import {
  AVG_DAYS_PER_MONTH,
  addMonthsTo,
  completeMonthsElapsed,
  elapsedMonths,
  monthSpan,
  precedingPeriods,
} from './month-span';

describe('monthSpan (PRD v2 5.2)', () => {
  it('counts both ends', () => {
    expect(monthSpan('2026-05', '2027-08')).toBe(16);
    expect(monthSpan('2026-09', '2027-08')).toBe(12);
  });

  // S13
  it('is 1 for a single month, not 0', () => {
    expect(monthSpan('2026-09', '2026-09')).toBe(1);
  });

  it('crosses a year boundary', () => {
    expect(monthSpan('2026-12', '2027-01')).toBe(2);
  });

  /**
   * Goes non-positive rather than clamping, so callers can tell "the deadline has passed"
   * from "one month left". `computeSavings` is what applies the floor (section 8.5).
   */
  it('goes to zero and below once the range runs backwards', () => {
    expect(monthSpan('2026-09', '2026-08')).toBe(0);
    expect(monthSpan('2026-09', '2026-07')).toBe(-1);
  });

  it('rejects anything that is not YYYY-MM', () => {
    expect(() => monthSpan('2026-09-01', '2026-10')).toThrow(/YYYY-MM/);
  });
});

describe('elapsedMonths (PRD v2 5.2)', () => {
  it('matches Fixture D: four whole months and 13/30 of September', () => {
    expect(completeMonthsElapsed('2026-05-01', '2026-09-14')).toBe(4);
    expect(elapsedMonths('2026-05-01', '2026-09-14')).toBeCloseTo(4 + 13 / 30, 9);
  });

  it('counts nothing on the first day of the starting month', () => {
    expect(elapsedMonths('2026-05-01', '2026-05-01')).toBe(0);
  });

  /**
   * Calendar months, not anniversaries. A goal opened on the 20th still ticks over at the
   * turn of the month, because that is the clock `monthSpan` -- and therefore
   * `plan_per_month` -- runs on.
   */
  it('measures from the start month, not the start day', () => {
    expect(completeMonthsElapsed('2026-05-20', '2026-09-14')).toBe(4);
  });

  it('never goes negative for a goal that has not started yet', () => {
    expect(completeMonthsElapsed('2026-09-01', '2026-07-15')).toBe(0);
  });
});

describe('addMonthsTo', () => {
  it('lands where the PRD preview says it does', () => {
    // 20 whole months to 2028-05-14, then 0.142 * 30.44 ~ 4 days.
    expect(addMonthsTo('2026-09-14', 20.142)).toBe('2028-05-18');
  });

  it('adds whole months without touching the day', () => {
    expect(addMonthsTo('2026-09-14', 3)).toBe('2026-12-14');
  });

  it('clamps to the end of a shorter month', () => {
    expect(addMonthsTo('2026-01-31', 1)).toBe('2026-02-28');
  });

  it('uses the mean Gregorian month for the fractional part', () => {
    expect(AVG_DAYS_PER_MONTH).toBe(30.44);
    expect(addMonthsTo('2026-09-01', 0.5)).toBe('2026-09-16');
  });
});

describe('precedingPeriods', () => {
  it('returns the three months before, oldest first', () => {
    expect(precedingPeriods('2026-09', 3)).toEqual(['2026-06', '2026-07', '2026-08']);
  });

  it('rolls back over a year boundary', () => {
    expect(precedingPeriods('2027-01', 3)).toEqual(['2026-10', '2026-11', '2026-12']);
  });

  it('rolls back over several years', () => {
    expect(precedingPeriods('2026-02', 3)).toEqual(['2025-11', '2025-12', '2026-01']);
  });
});
