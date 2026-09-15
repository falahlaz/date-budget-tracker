import { eachDateInRange, lastDayOfPeriod } from './calendar';
import { ExpenseInput, TransferInput, computeMonth } from './compute-month';

/**
 * The transfer amendment to the date-budget engine (PRD v2 6.2).
 *
 * Deliberately a separate file from `compute-month.spec.ts`. That one holds the v1.1
 * golden fixtures, and test S11 is the claim that they still pass *unmodified* -- a claim
 * that is only worth anything if nobody edits the file to keep it true.
 */

/** Picks the columns PRD v2 Fixture F tabulates. */
function weekRows(report: ReturnType<typeof computeMonth>) {
  return report.weeks.map((week) => ({
    weekIndex: week.weekIndex,
    rolloverIn: week.rolloverIn,
    transferOut: week.transferOut,
    transferIn: week.transferIn,
    weekendBudget: week.weekendBudget,
    weekRemaining: week.weekRemaining,
  }));
}

/** Fixture B's spending (PRD v1.1 5.2), which Fixture F builds on. */
const FIXTURE_B_EXPENSES: ExpenseInput[] = [
  { spentOn: '2026-09-02', amount: 150_000 },
  { spentOn: '2026-09-05', amount: 250_000 },
  { spentOn: '2026-09-08', amount: 150_000 },
  { spentOn: '2026-09-12', amount: 250_000 },
  { spentOn: '2026-09-15', amount: 200_000 },
  { spentOn: '2026-09-19', amount: 400_000 },
  { spentOn: '2026-09-22', amount: 100_000 },
  { spentOn: '2026-09-26', amount: 500_000 },
  { spentOn: '2026-09-29', amount: 120_000 },
];

const BASE = { period: '2026-09', monthlyBudget: 2_200_000, carryIn: 0 };

/** 320.000 out and 150.000 in, both on one date. */
const transfersOn = (date: string): TransferInput[] => [
  { occurredOn: date, amount: 320_000, direction: 'OUT' },
  { occurredOn: date, amount: 150_000, direction: 'IN' },
];

describe('computeMonth - Fixture F (PRD v2 7.3)', () => {
  // S10
  it('matches the fixture table when the transfers fall in W1', () => {
    const report = computeMonth({
      ...BASE,
      expenses: FIXTURE_B_EXPENSES,
      transfers: transfersOn('2026-09-03'),
    });

    expect(weekRows(report)).toEqual([
      {
        weekIndex: 1,
        rolloverIn: 0,
        transferOut: 320_000,
        transferIn: 150_000,
        weekendBudget: 80_000,
        weekRemaining: -170_000,
      },
      {
        weekIndex: 2,
        rolloverIn: -170_000,
        transferOut: 0,
        transferIn: 0,
        weekendBudget: 180_000,
        weekRemaining: -70_000,
      },
      {
        weekIndex: 3,
        rolloverIn: -70_000,
        transferOut: 0,
        transferIn: 0,
        weekendBudget: 230_000,
        weekRemaining: -170_000,
      },
      {
        weekIndex: 4,
        rolloverIn: -170_000,
        transferOut: 0,
        transferIn: 0,
        weekendBudget: 230_000,
        weekRemaining: -270_000,
      },
      {
        weekIndex: 5,
        rolloverIn: -270_000,
        transferOut: 0,
        transferIn: 0,
        weekendBudget: -90_000,
        weekRemaining: -90_000,
      },
    ]);

    expect(report.carryOut).toBe(-90_000);
  });

  it('matches the fixture table when the same transfers fall in W3', () => {
    const report = computeMonth({
      ...BASE,
      expenses: FIXTURE_B_EXPENSES,
      transfers: transfersOn('2026-09-16'),
    });

    expect(weekRows(report)).toEqual([
      {
        weekIndex: 1,
        rolloverIn: 0,
        transferOut: 0,
        transferIn: 0,
        weekendBudget: 250_000,
        weekRemaining: 0,
      },
      {
        weekIndex: 2,
        rolloverIn: 0,
        transferOut: 0,
        transferIn: 0,
        weekendBudget: 350_000,
        weekRemaining: 100_000,
      },
      {
        weekIndex: 3,
        rolloverIn: 100_000,
        transferOut: 320_000,
        transferIn: 150_000,
        weekendBudget: 230_000,
        weekRemaining: -170_000,
      },
      {
        weekIndex: 4,
        rolloverIn: -170_000,
        transferOut: 0,
        transferIn: 0,
        weekendBudget: 230_000,
        weekRemaining: -270_000,
      },
      {
        weekIndex: 5,
        rolloverIn: -270_000,
        transferOut: 0,
        transferIn: 0,
        weekendBudget: -90_000,
        weekRemaining: -90_000,
      },
    ]);

    expect(report.carryOut).toBe(-90_000);
  });

  /**
   * The property the whole design turns on: a transfer changes WHICH week feels it, never
   * how much is left at the end of the month. If this failed, moving a transfer by a day
   * would quietly change next month's starting point.
   */
  it('puts the same carryOut on the table wherever the transfer lands', () => {
    const carryOuts = eachDateInRange('2026-09-01', '2026-09-30').map(
      (date) =>
        computeMonth({ ...BASE, expenses: FIXTURE_B_EXPENSES, transfers: transfersOn(date) })
          .carryOut,
    );

    expect(new Set(carryOuts)).toEqual(new Set([-90_000]));
  });

  it('checks out against the amended invariant by hand', () => {
    // 2.200.000 + 0 - 2.120.000 - 320.000 + 150.000 = -90.000
    expect(2_200_000 + 0 - 2_120_000 - 320_000 + 150_000).toBe(-90_000);
  });

  it('reports the month totals for the report header (10.4)', () => {
    const report = computeMonth({
      ...BASE,
      expenses: FIXTURE_B_EXPENSES,
      transfers: transfersOn('2026-09-03'),
    });

    expect(report.transferOut).toBe(320_000);
    expect(report.transferIn).toBe(150_000);
  });
});

describe('computeMonth - backward compatibility (S11)', () => {
  /**
   * The same call the v1.1 fixtures make, with nothing about transfers in it. Their own
   * spec file asserts the full table; this asserts the reduction itself, so a future
   * change that breaks it fails here too with an obvious name.
   */
  it('is identical with no transfers, an empty list, or the argument omitted', () => {
    const omitted = computeMonth({ ...BASE, expenses: FIXTURE_B_EXPENSES });
    const empty = computeMonth({ ...BASE, expenses: FIXTURE_B_EXPENSES, transfers: [] });

    expect(omitted.carryOut).toBe(80_000);
    expect(empty).toEqual(omitted);
    expect(omitted.transferOut).toBe(0);
    expect(omitted.transferIn).toBe(0);
    expect(omitted.weeks.every((week) => week.transferOut === 0 && week.transferIn === 0)).toBe(
      true,
    );
  });

  it('ignores a transfer dated outside the month', () => {
    const report = computeMonth({
      ...BASE,
      expenses: FIXTURE_B_EXPENSES,
      transfers: [{ occurredOn: '2026-08-31', amount: 500_000, direction: 'OUT' }],
    });

    expect(report.carryOut).toBe(80_000);
    expect(report.transferOut).toBe(0);
  });
});

describe('computeMonth - amended invariant (PRD v2 6.2)', () => {
  // S12
  it('holds for 1000 random distributions of spending and transfers', () => {
    const periods = ['2026-08', '2026-09', '2026-10', '2027-02', '2027-04'];
    let seed = 20260914;
    const random = () => {
      // Deterministic LCG, like the v1.1 property test: a failing case is reproducible.
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

      const transfers: TransferInput[] = Array.from({ length: Math.floor(random() * 6) }, () => ({
        occurredOn: dates[Math.floor(random() * dates.length)],
        amount: 1 + Math.floor(random() * 800_000),
        direction: random() < 0.5 ? 'IN' : ('OUT' as const),
      }));

      const report = computeMonth({ period, monthlyBudget, carryIn, expenses, transfers });

      const totalSpent = expenses.reduce((sum, expense) => sum + expense.amount, 0);
      const out = transfers
        .filter((t) => t.direction === 'OUT')
        .reduce((sum, t) => sum + t.amount, 0);
      const into = transfers
        .filter((t) => t.direction === 'IN')
        .reduce((sum, t) => sum + t.amount, 0);

      expect(report.transferOut).toBe(out);
      expect(report.transferIn).toBe(into);
      expect(report.carryOut).toBe(monthlyBudget + carryIn - totalSpent - out + into);
    }
  });

  /** Where the transfers sit cannot move carryOut, for any random month (S10 generalised). */
  it('gives the same carryOut however the transfers are rearranged within the month', () => {
    // Derived from BASE rather than repeated, so the dates cannot drift out of the month
    // the report is actually computed for.
    const dates = eachDateInRange(`${BASE.period}-01`, lastDayOfPeriod(BASE.period));
    const amounts: TransferInput[] = [
      { occurredOn: '', amount: 320_000, direction: 'OUT' },
      { occurredOn: '', amount: 150_000, direction: 'IN' },
      { occurredOn: '', amount: 75_000, direction: 'OUT' },
    ];

    let seed = 7;
    const pick = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return dates[Math.floor((seed / 2147483648) * dates.length)];
    };

    const carryOuts = Array.from(
      { length: 50 },
      () =>
        computeMonth({
          ...BASE,
          expenses: FIXTURE_B_EXPENSES,
          transfers: amounts.map((transfer) => ({ ...transfer, occurredOn: pick() })),
        }).carryOut,
    );

    expect(new Set(carryOuts).size).toBe(1);
  });
});
