import {
  addDaysTo,
  buildWeekSegments,
  countWeekdaysInPeriod,
  countWeekendsInPeriod,
  dayTypeOf,
  daysInPeriod,
  eachDateInRange,
  findSegmentForDate,
  isoWeekdayIndex,
  lastDayOfPeriod,
  nextPeriod,
  periodOf,
  previousPeriod,
} from './calendar';

describe('calendar primitives', () => {
  it('indexes weekdays with Monday = 0 (PRD 4.2)', () => {
    expect(isoWeekdayIndex('2026-09-07')).toBe(0); // Monday
    expect(isoWeekdayIndex('2026-09-11')).toBe(4); // Friday
    expect(isoWeekdayIndex('2026-09-12')).toBe(5); // Saturday
    expect(isoWeekdayIndex('2026-09-13')).toBe(6); // Sunday
  });

  it('treats Mon-Fri as weekday and Sat-Sun as weekend', () => {
    expect(dayTypeOf('2026-09-11')).toBe('WEEKDAY');
    expect(dayTypeOf('2026-09-12')).toBe('WEEKEND');
    expect(dayTypeOf('2026-09-13')).toBe('WEEKEND');
    expect(dayTypeOf('2026-09-14')).toBe('WEEKDAY');
  });

  it('rejects malformed and impossible dates', () => {
    expect(() => dayTypeOf('2026-9-1')).toThrow();
    expect(() => dayTypeOf('2026-02-30')).toThrow();
    expect(() => dayTypeOf('not-a-date')).toThrow();
  });

  it('moves between periods across a year boundary', () => {
    expect(nextPeriod('2026-12')).toBe('2027-01');
    expect(previousPeriod('2027-01')).toBe('2026-12');
    expect(periodOf('2026-09-05')).toBe('2026-09');
  });

  it('knows month lengths including leap years', () => {
    expect(daysInPeriod('2026-09')).toBe(30);
    expect(daysInPeriod('2026-02')).toBe(28);
    expect(daysInPeriod('2028-02')).toBe(29);
    expect(lastDayOfPeriod('2026-09')).toBe('2026-09-30');
  });

  it('adds days across month and year boundaries', () => {
    expect(addDaysTo('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDaysTo('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysTo('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('buildWeekSegments (PRD 4.2)', () => {
  it('reproduces the worked September 2026 example', () => {
    // 1 Sep 2026 is a Tuesday and the month has 30 days -> 5 segments.
    expect(buildWeekSegments('2026-09')).toEqual([
      { weekIndex: 1, startDate: '2026-09-01', endDate: '2026-09-06', weekdayDays: 4, weekendDays: 2 },
      { weekIndex: 2, startDate: '2026-09-07', endDate: '2026-09-13', weekdayDays: 5, weekendDays: 2 },
      { weekIndex: 3, startDate: '2026-09-14', endDate: '2026-09-20', weekdayDays: 5, weekendDays: 2 },
      { weekIndex: 4, startDate: '2026-09-21', endDate: '2026-09-27', weekdayDays: 5, weekendDays: 2 },
      { weekIndex: 5, startDate: '2026-09-28', endDate: '2026-09-30', weekdayDays: 3, weekendDays: 0 },
    ]);
  });

  it('starts a month that begins on Saturday with a weekday-less segment (PRD 6.1)', () => {
    // 1 Aug 2026 is a Saturday.
    const segments = buildWeekSegments('2026-08');
    expect(segments[0]).toEqual({
      weekIndex: 1,
      startDate: '2026-08-01',
      endDate: '2026-08-02',
      weekdayDays: 0,
      weekendDays: 2,
    });
  });

  it('gives a month starting on Monday whole 7-day segments', () => {
    // February 2027: 28 days, starts Monday -> exactly 4 full weeks, 20 weekdays.
    const segments = buildWeekSegments('2027-02');
    expect(segments).toHaveLength(4);
    expect(segments.every((s) => s.weekdayDays === 5 && s.weekendDays === 2)).toBe(true);
    expect(countWeekdaysInPeriod('2027-02')).toBe(20);
  });

  it('ends a segment with no weekend when the month ends on a Friday (PRD 6.2)', () => {
    // 30 Apr 2027 is a Friday.
    const segments = buildWeekSegments('2027-04');
    expect(segments[segments.length - 1].weekendDays).toBe(0);
  });

  // T10
  it('produces continuous, gap-free, overlap-free segments for 24 consecutive months', () => {
    let period = '2026-01';

    for (let month = 0; month < 24; month += 1) {
      const segments = buildWeekSegments(period);
      const total = daysInPeriod(period);

      expect(segments.length).toBeGreaterThanOrEqual(4);
      expect(segments.length).toBeLessThanOrEqual(6);
      expect(segments[0].startDate).toBe(`${period}-01`);
      expect(segments[segments.length - 1].endDate).toBe(lastDayOfPeriod(period));

      // Week indexes are 1-based and sequential.
      segments.forEach((segment, index) => expect(segment.weekIndex).toBe(index + 1));

      // No gaps and no overlaps: each segment starts the day after the previous one ends.
      for (let i = 1; i < segments.length; i += 1) {
        expect(segments[i].startDate).toBe(addDaysTo(segments[i - 1].endDate, 1));
      }

      // Every segment ends on a Sunday, unless clipped by the end of the month.
      segments.slice(0, -1).forEach((segment) => expect(isoWeekdayIndex(segment.endDate)).toBe(6));
      // Every segment starts on a Monday, unless clipped by the start of the month.
      segments.slice(1).forEach((segment) => expect(isoWeekdayIndex(segment.startDate)).toBe(0));

      // The days accounted for add up to exactly the month.
      const counted = segments.reduce((sum, s) => sum + s.weekdayDays + s.weekendDays, 0);
      expect(counted).toBe(total);
      expect(segments.reduce((sum, s) => sum + s.weekdayDays, 0)).toBe(countWeekdaysInPeriod(period));
      expect(segments.reduce((sum, s) => sum + s.weekendDays, 0)).toBe(countWeekendsInPeriod(period));

      // Every day of the month lands in exactly one segment.
      for (const date of eachDateInRange(`${period}-01`, lastDayOfPeriod(period))) {
        const matches = segments.filter((s) => date >= s.startDate && date <= s.endDate);
        expect(matches).toHaveLength(1);
      }

      period = nextPeriod(period);
    }
  });

  it('never yields a month without weekdays (guards the 4.3 division)', () => {
    let period = '2026-01';
    for (let month = 0; month < 36; month += 1) {
      expect(countWeekdaysInPeriod(period)).toBeGreaterThan(0);
      period = nextPeriod(period);
    }
  });

  it('locates the segment a date belongs to', () => {
    const segments = buildWeekSegments('2026-09');
    expect(findSegmentForDate(segments, '2026-09-09')?.weekIndex).toBe(2);
    expect(findSegmentForDate(segments, '2026-09-30')?.weekIndex).toBe(5);
    expect(findSegmentForDate(segments, '2026-10-01')).toBeUndefined();
  });
});
