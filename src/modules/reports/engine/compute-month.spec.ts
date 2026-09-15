import { countWeekdaysInPeriod, daysInPeriod, eachDateInRange, lastDayOfPeriod } from './calendar';
import { ExpenseInput, buildDayReports, computeMonth } from './compute-month';

/** Picks the fields the PRD fixture tables actually assert on. */
function weekRows(report: ReturnType<typeof computeMonth>) {
  return report.weeks.map((week) => ({
    weekIndex: week.weekIndex,
    weekdayDays: week.weekdayDays,
    weekBudget: week.weekBudget,
    weekdaySpent: week.weekdaySpent,
    rolloverIn: week.rolloverIn,
    weekendBudget: week.weekendBudget,
    weekendSpent: week.weekendSpent,
    weekRemaining: week.weekRemaining,
  }));
}

describe('computeMonth - Fixture A (PRD 5.1)', () => {
  // February 2027: 28 days starting Monday -> 4 whole segments, 20 weekdays, exactly the
  // "ideal month" the fixture describes.
  const period = '2027-02';
  const expenses: ExpenseInput[] = [
    { spentOn: '2027-02-02', amount: 150_000 }, // W1 weekday
    { spentOn: '2027-02-06', amount: 250_000 }, // W1 weekend
    { spentOn: '2027-02-09', amount: 150_000 }, // W2 weekday
    { spentOn: '2027-02-13', amount: 250_000 }, // W2 weekend
  ];

  const report = computeMonth({ period, monthlyBudget: 2_000_000, carryIn: 0, expenses });

  // T1
  it('derives a 100k daily rate from a 2jt budget over 20 weekdays', () => {
    expect(countWeekdaysInPeriod(period)).toBe(20);
    expect(report.dailyWeekdayRate).toBe(100_000);
    expect(report.roundingRemainder).toBe(0);
    expect(report.weeks.every((week) => week.weekBudget === 500_000)).toBe(true);
  });

  it('matches the fixture table for W1 and W2', () => {
    expect(weekRows(report)[0]).toEqual({
      weekIndex: 1,
      weekdayDays: 5,
      weekBudget: 500_000,
      weekdaySpent: 150_000,
      rolloverIn: 0,
      weekendBudget: 350_000,
      weekendSpent: 250_000,
      weekRemaining: 100_000,
    });

    expect(weekRows(report)[1]).toEqual({
      weekIndex: 2,
      weekdayDays: 5,
      weekBudget: 500_000,
      weekdaySpent: 150_000,
      rolloverIn: 100_000,
      weekendBudget: 450_000,
      weekendSpent: 250_000,
      weekRemaining: 200_000,
    });
  });

  it('carries the untouched W3/W4 allowance into carryOut', () => {
    expect(report.totalSpent).toBe(800_000);
    expect(report.carryOut).toBe(1_200_000);
    expect(report.spendableRemaining).toBe(report.carryOut);
    expect(report.isOverspent).toBe(false);
  });
});

describe('computeMonth - Fixture B (PRD 5.2)', () => {
  const period = '2026-09';
  const expenses: ExpenseInput[] = [
    // W1 01-06 Sep: 4 weekdays
    { spentOn: '2026-09-02', amount: 150_000 },
    { spentOn: '2026-09-05', amount: 250_000 },
    // W2 07-13 Sep
    { spentOn: '2026-09-08', amount: 150_000 },
    { spentOn: '2026-09-12', amount: 250_000 },
    // W3 14-20 Sep
    { spentOn: '2026-09-15', amount: 200_000 },
    { spentOn: '2026-09-19', amount: 400_000 },
    // W4 21-27 Sep -- weekend overspend
    { spentOn: '2026-09-22', amount: 100_000 },
    { spentOn: '2026-09-26', amount: 500_000 },
    // W5 28-30 Sep: weekdays only
    { spentOn: '2026-09-29', amount: 120_000 },
  ];

  const report = computeMonth({ period, monthlyBudget: 2_200_000, carryIn: 0, expenses });

  // T2
  it('reproduces every row of the fixture table', () => {
    expect(report.weekdayCount).toBe(22);
    expect(report.dailyWeekdayRate).toBe(100_000);
    expect(report.roundingRemainder).toBe(0);

    expect(weekRows(report)).toEqual([
      {
        weekIndex: 1,
        weekdayDays: 4,
        weekBudget: 400_000,
        weekdaySpent: 150_000,
        rolloverIn: 0,
        weekendBudget: 250_000,
        weekendSpent: 250_000,
        weekRemaining: 0,
      },
      {
        weekIndex: 2,
        weekdayDays: 5,
        weekBudget: 500_000,
        weekdaySpent: 150_000,
        rolloverIn: 0,
        weekendBudget: 350_000,
        weekendSpent: 250_000,
        weekRemaining: 100_000,
      },
      {
        weekIndex: 3,
        weekdayDays: 5,
        weekBudget: 500_000,
        weekdaySpent: 200_000,
        rolloverIn: 100_000,
        weekendBudget: 400_000,
        weekendSpent: 400_000,
        weekRemaining: 0,
      },
      {
        weekIndex: 4,
        weekdayDays: 5,
        weekBudget: 500_000,
        weekdaySpent: 100_000,
        rolloverIn: 0,
        weekendBudget: 400_000,
        weekendSpent: 500_000,
        weekRemaining: -100_000,
      },
      {
        weekIndex: 5,
        weekdayDays: 3,
        weekBudget: 300_000,
        weekdaySpent: 120_000,
        rolloverIn: -100_000,
        weekendBudget: 80_000,
        weekendSpent: 0,
        weekRemaining: 80_000,
      },
    ]);
  });

  it('ends with carryOut 80.000 and satisfies the invariant', () => {
    expect(report.totalSpent).toBe(2_120_000);
    expect(report.weekdaySpent).toBe(720_000);
    expect(report.weekendSpent).toBe(1_400_000);
    expect(report.carryOut).toBe(80_000);
    expect(report.carryOut).toBe(2_200_000 + 0 - 2_120_000);
  });

  it('lets a weekend overspend cut straight into the following week', () => {
    expect(report.weeks[3].weekRemaining).toBe(-100_000);
    expect(report.weeks[4].rolloverIn).toBe(-100_000);
    expect(report.weeks[4].weekendBudget).toBe(80_000);
  });
});

describe('computeMonth - Fixture C (PRD 5.3)', () => {
  // T3
  it('floors the daily rate and keeps the leftover rupiah', () => {
    const period = '2026-05'; // 21 weekdays
    expect(countWeekdaysInPeriod(period)).toBe(21);

    const report = computeMonth({ period, monthlyBudget: 2_000_000, carryIn: 0, expenses: [] });

    expect(report.dailyWeekdayRate).toBe(95_238);
    expect(report.roundingRemainder).toBe(2);
    // The two stray rupiah are not lost -- they enter W1 as rollover.
    expect(report.weeks[0].rolloverIn).toBe(2);
    expect(report.carryOut).toBe(2_000_000);
  });
});

describe('computeMonth - invariant (PRD 4.6)', () => {
  // T4
  it('holds for 1000 random expense distributions', () => {
    const periods = ['2026-08', '2026-09', '2026-10', '2027-02', '2027-04'];
    let seed = 20260905;
    const random = () => {
      // Deterministic LCG: a failing case is reproducible, unlike Math.random().
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };

    for (let run = 0; run < 1000; run += 1) {
      const period = periods[Math.floor(random() * periods.length)];
      const dates = eachDateInRange(`${period}-01`, lastDayOfPeriod(period));
      const monthlyBudget = 1 + Math.floor(random() * 5_000_000);
      const carryIn = Math.floor(random() * 1_000_000) - 500_000;

      const expenses: ExpenseInput[] = Array.from({ length: Math.floor(random() * 25) }, () => ({
        spentOn: dates[Math.floor(random() * dates.length)],
        amount: 1 + Math.floor(random() * 400_000),
      }));

      const report = computeMonth({ period, monthlyBudget, carryIn, expenses });
      const totalSpent = expenses.reduce((sum, expense) => sum + expense.amount, 0);

      expect(report.totalSpent).toBe(totalSpent);
      expect(report.carryOut).toBe(monthlyBudget + carryIn - totalSpent);
    }
  });
});

describe('computeMonth - edge cases (PRD 6)', () => {
  // T5
  it('gives a month starting on Saturday a weekday-less first segment (6.1)', () => {
    const report = computeMonth({
      period: '2026-08', // 1 Aug 2026 is a Saturday
      monthlyBudget: 2_100_000,
      carryIn: 0,
      expenses: [{ spentOn: '2026-08-01', amount: 300_000 }],
    });

    expect(report.weeks[0].weekdayDays).toBe(0);
    expect(report.weeks[0].weekBudget).toBe(0);
    // With no carry-in there is simply no allowance yet, and the week goes negative.
    expect(report.weeks[0].weekendBudget).toBe(report.roundingRemainder);
    expect(report.weeks[0].weekRemaining).toBeLessThan(0);
    // The deficit is absorbed by the following week rather than being written off.
    expect(report.weeks[1].rolloverIn).toBe(report.weeks[0].weekRemaining);
  });

  it('starts a weekday-less first week at carryIn when one exists (6.1)', () => {
    const report = computeMonth({
      period: '2026-08',
      monthlyBudget: 2_100_000,
      carryIn: 500_000,
      expenses: [],
    });

    expect(report.weeks[0].weekendBudget).toBe(500_000 + report.roundingRemainder);
  });

  // T6
  it('turns a weekend-less final segment entirely into carryOut (6.2)', () => {
    const period = '2027-04'; // 30 Apr 2027 is a Friday
    const report = computeMonth({ period, monthlyBudget: 2_200_000, carryIn: 0, expenses: [] });
    const lastWeek = report.weeks[report.weeks.length - 1];

    expect(lastWeek.weekendDays).toBe(0);
    expect(lastWeek.weekendSpent).toBe(0);
    expect(lastWeek.weekRemaining).toBe(lastWeek.weekendBudget);
    expect(report.carryOut).toBe(lastWeek.weekendBudget);
  });

  // T7
  it('propagates consecutive overspend forward and out of the month', () => {
    const report = computeMonth({
      period: '2026-09',
      monthlyBudget: 2_200_000,
      carryIn: 0,
      expenses: [
        { spentOn: '2026-09-05', amount: 900_000 }, // W1 weekend blowout
        { spentOn: '2026-09-12', amount: 900_000 }, // W2 weekend blowout
        { spentOn: '2026-09-19', amount: 900_000 }, // W3 weekend blowout
      ],
    });

    expect(report.weeks[0].weekRemaining).toBeLessThan(0);
    expect(report.weeks[1].rolloverIn).toBe(report.weeks[0].weekRemaining);
    expect(report.weeks[2].rolloverIn).toBe(report.weeks[1].weekRemaining);
    expect(report.carryOut).toBe(2_200_000 - 2_700_000);
    expect(report.isOverspent).toBe(true);
  });

  // T8
  it('feeds a negative carryIn straight into rolloverIn[1] (4.5)', () => {
    const report = computeMonth({
      period: '2026-09',
      monthlyBudget: 2_200_000,
      carryIn: -300_000,
      expenses: [],
    });

    expect(report.weeks[0].rolloverIn).toBe(-300_000);
    // A carry-in never changes the daily rate; that number stays memorable (4.5).
    expect(report.dailyWeekdayRate).toBe(100_000);
    expect(report.carryOut).toBe(1_900_000);
  });

  // T9
  it('returns the whole budget as carryOut when nothing was spent', () => {
    const report = computeMonth({
      period: '2026-09',
      monthlyBudget: 2_200_000,
      carryIn: 0,
      expenses: [],
    });

    expect(report.totalSpent).toBe(0);
    expect(report.carryOut).toBe(2_200_000);
  });

  it('treats a month without a budget as zero and reports hasBudget false (6.5)', () => {
    const report = computeMonth({
      period: '2026-09',
      monthlyBudget: 0,
      carryIn: 0,
      expenses: [{ spentOn: '2026-09-02', amount: 150_000 }],
    });

    expect(report.hasBudget).toBe(false);
    expect(report.dailyWeekdayRate).toBe(0);
    expect(report.carryOut).toBe(-150_000);
    expect(report.isOverspent).toBe(true);
  });

  it('never rejects an expense for exceeding the budget (4.4)', () => {
    const report = computeMonth({
      period: '2026-09',
      monthlyBudget: 1,
      carryIn: 0,
      expenses: [{ spentOn: '2026-09-02', amount: 50_000_000 }],
    });

    expect(report.carryOut).toBe(1 - 50_000_000);
  });

  it('ignores expenses that fall outside the period', () => {
    const report = computeMonth({
      period: '2026-09',
      monthlyBudget: 2_200_000,
      carryIn: 0,
      expenses: [
        { spentOn: '2026-08-31', amount: 999_000 },
        { spentOn: '2026-09-02', amount: 100_000 },
        { spentOn: '2026-10-01', amount: 999_000 },
      ],
    });

    expect(report.totalSpent).toBe(100_000);
  });

  it('rejects a negative budget and non-integer money', () => {
    const base = { period: '2026-09', carryIn: 0, expenses: [] };
    expect(() => computeMonth({ ...base, monthlyBudget: -1 })).toThrow(RangeError);
    expect(() => computeMonth({ ...base, monthlyBudget: 100.5 })).toThrow(TypeError);
    expect(() =>
      computeMonth({
        ...base,
        monthlyBudget: 100,
        expenses: [{ spentOn: '2026-09-02', amount: 1.5 }],
      }),
    ).toThrow(TypeError);
  });
});

describe('computeMonth - today-dependent fields', () => {
  it('marks the segment containing today as current', () => {
    const report = computeMonth({
      period: '2026-09',
      monthlyBudget: 2_200_000,
      carryIn: 0,
      expenses: [],
      today: '2026-09-09',
    });

    expect(report.weeks.filter((week) => week.isCurrent)).toHaveLength(1);
    expect(report.weeks.find((week) => week.isCurrent)?.weekIndex).toBe(2);
  });

  it('reports elapsed days relative to the supplied today', () => {
    const base = { period: '2026-09', monthlyBudget: 2_200_000, carryIn: 0, expenses: [] };

    expect(computeMonth({ ...base, today: '2026-09-09' }).daysElapsed).toBe(9);
    expect(computeMonth({ ...base, today: '2026-08-31' }).daysElapsed).toBe(0);
    expect(computeMonth({ ...base, today: '2026-10-01' }).daysElapsed).toBe(30);
    expect(computeMonth({ ...base, today: '2026-09-09' }).daysTotal).toBe(daysInPeriod('2026-09'));
  });

  it('stays pure: the same input always yields the same output', () => {
    const input = {
      period: '2026-09',
      monthlyBudget: 2_200_000,
      carryIn: 0,
      expenses: [{ spentOn: '2026-09-02', amount: 150_000 }],
      today: '2026-09-09',
    };

    expect(computeMonth(input)).toEqual(computeMonth(input));
  });
});

describe('buildDayReports (PRD 4.3, 8.6)', () => {
  const report = computeMonth({
    period: '2026-09',
    monthlyBudget: 2_200_000,
    carryIn: 0,
    expenses: [{ spentOn: '2026-09-07', amount: 50_000 }],
  });

  const days = buildDayReports(
    report.weeks[1],
    report.dailyWeekdayRate,
    [{ spentOn: '2026-09-07', amount: 50_000 }],
    '2026-09-09',
  );

  it('covers all seven days of the segment', () => {
    expect(days).toHaveLength(7);
    expect(days[0].date).toBe('2026-09-07');
    expect(days[6].date).toBe('2026-09-13');
  });

  it('gives weekdays the daily rate and weekends none', () => {
    expect(days[0]).toMatchObject({
      dayType: 'WEEKDAY',
      dayBudget: 100_000,
      spent: 50_000,
      remaining: 50_000,
      isToday: false,
      expenseCount: 1,
    });
    expect(days[5]).toMatchObject({ dayType: 'WEEKEND', dayBudget: 0, spent: 0, remaining: 0 });
  });

  it('flags today', () => {
    expect(days.filter((day) => day.isToday)).toHaveLength(1);
    expect(days.find((day) => day.isToday)?.date).toBe('2026-09-09');
  });
});
