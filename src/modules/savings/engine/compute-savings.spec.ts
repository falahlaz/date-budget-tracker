import { SavingsTxnInput, computeSavings, planPerMonthFor } from './compute-savings';
import {
  FIXTURE_D_ALLOCATIONS,
  FIXTURE_D_GOAL,
  FIXTURE_D_TODAY,
  FIXTURE_D_TXNS,
} from './fixture-d.fixture';
import { monthSpan } from './month-span';

/** Picks the fields the PRD v2 fixture tables actually assert on. */
function monthRows(report: ReturnType<typeof computeSavings>) {
  return report.monthly.map((month) => ({
    period: month.period,
    depositTotal: month.depositTotal,
    repaymentTotal: month.repaymentTotal,
    freshContribution: month.freshContribution,
    withdrawTotal: month.withdrawTotal,
    net: month.net,
  }));
}

const GOAL = FIXTURE_D_GOAL;
const TODAY = FIXTURE_D_TODAY;

describe('computeSavings - Fixture D (PRD v2 7.1)', () => {
  const report = computeSavings({
    goal: GOAL,
    txns: FIXTURE_D_TXNS,
    allocations: FIXTURE_D_ALLOCATIONS,
    today: TODAY,
  });

  // S1
  it('locks plan_per_month at creation from the whole goal window', () => {
    expect(monthSpan('2026-05', '2027-08')).toBe(16);
    expect(planPerMonthFor(GOAL)).toBe(1_875_000);
  });

  it('reproduces every row of the fixture history table', () => {
    expect(monthRows(report)).toEqual([
      {
        period: '2026-05',
        depositTotal: 2_000_000,
        repaymentTotal: 0,
        freshContribution: 2_000_000,
        withdrawTotal: 0,
        net: 2_000_000,
      },
      {
        period: '2026-06',
        depositTotal: 1_800_000,
        repaymentTotal: 0,
        freshContribution: 1_800_000,
        withdrawTotal: 600_000,
        net: 1_200_000,
      },
      {
        period: '2026-07',
        depositTotal: 2_000_000,
        repaymentTotal: 600_000,
        freshContribution: 1_400_000,
        withdrawTotal: 0,
        net: 2_000_000,
      },
      {
        period: '2026-08',
        depositTotal: 1_500_000,
        repaymentTotal: 0,
        freshContribution: 1_500_000,
        withdrawTotal: 1_200_000,
        net: 300_000,
      },
      {
        period: '2026-09',
        depositTotal: 1_000_000,
        repaymentTotal: 0,
        freshContribution: 1_000_000,
        withdrawTotal: 0,
        net: 1_000_000,
      },
    ]);
  });

  /**
   * The point of the whole fixture. July's deposit is the second largest of the five
   * months, and its real contribution is the smallest, because 600.000 of it only put back
   * what June took out. If this assertion ever goes, G6 is silently gone with it.
   */
  it('counts July as 1.400.000 of progress, not 2.000.000', () => {
    const july = report.monthly.find((month) => month.period === '2026-07');

    expect(july?.depositTotal).toBe(2_000_000);
    expect(july?.freshContribution).toBe(1_400_000);
  });

  it('makes July the second largest deposit but the smallest real contribution', () => {
    // Complete months only: September is cut off at the 14th, so ranking it against whole
    // months would be comparing half a month's saving with four full ones.
    const complete = report.monthly.filter((month) => month.period !== '2026-09');

    const byDeposit = [...complete].sort((a, b) => b.depositTotal - a.depositTotal);
    expect(byDeposit[1].period).toBe('2026-07');

    const byContribution = [...complete].sort((a, b) => a.freshContribution - b.freshContribution);
    expect(byContribution[0].period).toBe('2026-07');
    expect(byContribution[0].freshContribution).toBe(1_400_000);
  });

  it('matches every derived figure for 14 September 2026', () => {
    expect(report.balance).toBe(6_500_000);
    expect(report.remaining).toBe(23_500_000);
    expect(report.monthsLeft).toBe(12);
    expect(report.requiredPerMonth).toBe(1_958_334);
    expect(report.elapsed).toBeCloseTo(4 + 13 / 30, 6);
    expect(report.expectedBalance).toBe(8_312_500);
    expect(report.paceDelta).toBe(-1_812_500);
  });

  it('is behind plan, so the required instalment has risen above it', () => {
    expect(report.requiredPerMonth).toBeGreaterThan(GOAL.planPerMonth);
    expect(report.paceDelta).toBeLessThan(0);
  });

  it('averages the rate over June, July and August', () => {
    expect(report.rateBasis).toBe('LAST_3_MONTHS');
    expect(report.rate).toBeCloseTo((1_200_000 + 2_000_000 + 300_000) / 3, 6);
  });

  it('projects roughly twenty months out, landing well past the deadline', () => {
    expect(report.projectedMonths).toBeCloseTo(20.14, 2);
    expect(report.projectedDate).toBe('2028-05-18');
    expect(report.projectedDaysLate).toBeGreaterThan(0);
  });

  // S7
  it('reports the outstanding advance without taking it out of the balance', () => {
    expect(report.outstandingAdvance).toBe(700_000);
    // June's 600.000 was paid back; August's 500.000 was never a debt to begin with.
    expect(report.balance).toBe(6_500_000);
  });

  it('is not finished, and has no surplus', () => {
    expect(report.achieved).toBe(false);
    expect(report.surplus).toBe(0);
    expect(report.progress).toBeCloseTo(6_500_000 / 30_000_000, 6);
  });
});

describe('computeSavings - rate (PRD v2 5.2, 8.2, 8.3)', () => {
  const base = { goal: GOAL, allocations: [], today: TODAY };

  // S2
  it('falls back to the plan when the goal has no complete month behind it', () => {
    const report = computeSavings({
      ...base,
      txns: [{ occurredOn: '2026-05-03', amount: 500_000, kind: 'DEPOSIT' }],
      today: '2026-05-20',
    });

    expect(report.rateBasis).toBe('PLAN_FALLBACK');
    expect(report.rate).toBe(GOAL.planPerMonth);
  });

  // S3
  it('gives no projection at all when the rate is zero, rather than dividing by it', () => {
    const report = computeSavings({
      ...base,
      txns: [
        { occurredOn: '2026-06-10', amount: 1_000_000, kind: 'DEPOSIT' },
        { occurredOn: '2026-06-20', amount: 1_000_000, kind: 'WITHDRAW' },
      ],
    });

    expect(report.rate).toBe(0);
    expect(report.projectedMonths).toBeNull();
    expect(report.projectedDate).toBeNull();
    expect(report.projectedDaysLate).toBeNull();
  });

  it('gives no projection when the balance went backwards', () => {
    const report = computeSavings({
      ...base,
      txns: [
        { occurredOn: '2026-05-10', amount: 3_000_000, kind: 'DEPOSIT' },
        { occurredOn: '2026-07-20', amount: 1_000_000, kind: 'WITHDRAW' },
      ],
    });

    expect(report.rate).toBeLessThan(0);
    expect(report.projectedMonths).toBeNull();
  });

  /**
   * The month with no activity is the whole reason the window is calendar months. Two
   * idle months out of three really do cut the pace to a third, and a window that only
   * looked at months containing rows would report three times this and call it on track.
   */
  it('counts an idle month as zero rather than skipping over it', () => {
    const report = computeSavings({
      ...base,
      txns: [
        { occurredOn: '2026-06-10', amount: 900_000, kind: 'DEPOSIT' },
        // Nothing at all in July or August.
      ],
    });

    expect(report.rateBasis).toBe('LAST_3_MONTHS');
    expect(report.rate).toBeCloseTo(900_000 / 3, 6);
  });

  it('ignores months from before the goal existed', () => {
    const lateGoal = { ...GOAL, startDate: '2026-08-01' };

    const report = computeSavings({
      goal: lateGoal,
      allocations: [],
      today: TODAY,
      txns: [
        { occurredOn: '2026-06-10', amount: 9_000_000, kind: 'DEPOSIT' },
        { occurredOn: '2026-08-10', amount: 1_000_000, kind: 'DEPOSIT' },
      ],
    });

    // Only August is both complete and inside the goal's life.
    expect(report.rate).toBe(1_000_000);
  });

  it('treats a transfer in from another wallet as a deposit', () => {
    const report = computeSavings({
      ...base,
      txns: [{ occurredOn: '2026-08-10', amount: 320_000, kind: 'TRANSFER_IN' }],
    });

    expect(report.balance).toBe(320_000);
    expect(report.monthly[0].depositTotal).toBe(320_000);
  });
});

describe('computeSavings - goal edges (PRD v2 8.4, 8.5, 8.11, 8.12)', () => {
  // S5
  it('stops remaining at zero and reports the overshoot separately', () => {
    const report = computeSavings({
      goal: { ...GOAL, targetAmount: 1_000_000 },
      allocations: [],
      today: TODAY,
      txns: [{ occurredOn: '2026-06-10', amount: 1_250_000, kind: 'DEPOSIT' }],
    });

    expect(report.achieved).toBe(true);
    expect(report.remaining).toBe(0);
    expect(report.surplus).toBe(250_000);
    expect(report.progress).toBe(1);
  });

  // S6
  it('asks for the whole remainder once the deadline has gone by', () => {
    const report = computeSavings({
      goal: { ...GOAL, deadline: '2026-07-31' },
      allocations: [],
      today: TODAY,
      txns: [{ occurredOn: '2026-05-10', amount: 4_000_000, kind: 'DEPOSIT' }],
    });

    expect(report.monthsLeft).toBe(0);
    expect(report.requiredPerMonth).toBe(report.remaining);
    expect(report.deadlinePassedDays).toBe(45);
  });

  // S13
  it('treats a goal that starts and ends in one month as a one-month plan', () => {
    expect(monthSpan('2026-09', '2026-09')).toBe(1);
    expect(
      planPerMonthFor({
        targetAmount: 5_000_000,
        openingBalance: 1_000_000,
        startDate: '2026-09-01',
        deadline: '2026-09-30',
      }),
    ).toBe(4_000_000);
  });

  it('refuses a deadline that falls before the start date', () => {
    expect(() =>
      planPerMonthFor({
        targetAmount: 5_000_000,
        openingBalance: 0,
        startDate: '2026-09-01',
        deadline: '2026-08-31',
      }),
    ).toThrow(/before start date/);
  });

  it('counts an opening balance as progress already made', () => {
    const report = computeSavings({
      goal: { ...GOAL, openingBalance: 2_000_000 },
      allocations: [],
      today: TODAY,
      txns: [],
    });

    expect(report.balance).toBe(2_000_000);
    expect(report.remaining).toBe(28_000_000);
  });
});

describe('computeSavings - invariants (PRD v2 5.2)', () => {
  const KINDS: SavingsTxnInput['kind'][] = ['DEPOSIT', 'WITHDRAW', 'TRANSFER_IN', 'TRANSFER_OUT'];
  const IN_KINDS = new Set(['DEPOSIT', 'TRANSFER_IN']);

  it('holds for 1000 random histories', () => {
    let seed = 20260914;
    const random = () => {
      // Deterministic LCG, same as the date-budget engine's property test: a failing case
      // is reproducible, which Math.random() would not be.
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };

    const days = [
      '2026-05-04',
      '2026-05-27',
      '2026-06-02',
      '2026-06-19',
      '2026-07-08',
      '2026-07-30',
      '2026-08-01',
      '2026-08-21',
      '2026-09-03',
      '2026-09-12',
    ];

    for (let run = 0; run < 1000; run += 1) {
      const openingBalance = Math.floor(random() * 3_000_000);

      const txns: SavingsTxnInput[] = Array.from({ length: Math.floor(random() * 15) }, () => ({
        occurredOn: days[Math.floor(random() * days.length)],
        amount: 1 + Math.floor(random() * 900_000),
        kind: KINDS[Math.floor(random() * KINDS.length)],
      }));

      const report = computeSavings({
        goal: { ...GOAL, openingBalance },
        txns,
        allocations: [],
        today: TODAY,
      });

      const inflow = txns.filter((t) => IN_KINDS.has(t.kind)).reduce((s, t) => s + t.amount, 0);
      const outflow = txns.filter((t) => !IN_KINDS.has(t.kind)).reduce((s, t) => s + t.amount, 0);

      expect(report.balance).toBe(openingBalance + inflow - outflow);

      // remaining and surplus are two views of one number and can never both be non-zero.
      expect(report.remaining).toBeGreaterThanOrEqual(0);
      expect(report.surplus).toBeGreaterThanOrEqual(0);
      expect(Math.min(report.remaining, report.surplus)).toBe(0);
      expect(report.balance - GOAL.targetAmount).toBe(report.surplus - report.remaining);

      // Section 8.2: no projection is ever produced from a non-positive rate.
      if (report.rate <= 0) {
        expect(report.projectedMonths).toBeNull();
        expect(report.projectedDate).toBeNull();
      }

      // Section 5.3: the monthly rows must add back up to the whole history.
      const monthlyDeposits = report.monthly.reduce((s, m) => s + m.depositTotal, 0);
      const monthlyWithdrawals = report.monthly.reduce((s, m) => s + m.withdrawTotal, 0);
      expect(monthlyDeposits).toBe(inflow);
      expect(monthlyWithdrawals).toBe(outflow);
    }
  });

  it('never lets the outstanding advance touch the balance', () => {
    const withAdvance = computeSavings({
      goal: GOAL,
      allocations: [],
      today: TODAY,
      txns: [
        { occurredOn: '2026-06-10', amount: 2_000_000, kind: 'DEPOSIT' },
        { occurredOn: '2026-06-20', amount: 700_000, kind: 'WITHDRAW', expectedReturn: true },
      ],
    });

    const withoutFlag = computeSavings({
      goal: GOAL,
      allocations: [],
      today: TODAY,
      txns: [
        { occurredOn: '2026-06-10', amount: 2_000_000, kind: 'DEPOSIT' },
        { occurredOn: '2026-06-20', amount: 700_000, kind: 'WITHDRAW', expectedReturn: false },
      ],
    });

    // Marking a withdrawal "I'll pay it back" changes the memo and nothing else.
    expect(withAdvance.outstandingAdvance).toBe(700_000);
    expect(withoutFlag.outstandingAdvance).toBe(0);
    expect(withAdvance.balance).toBe(withoutFlag.balance);
    expect(withAdvance.remaining).toBe(withoutFlag.remaining);
  });
});
