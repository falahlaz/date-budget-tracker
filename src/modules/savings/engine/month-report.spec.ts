import { monthlyRows } from './compute-savings';
import {
  FIXTURE_D_ADVANCES,
  FIXTURE_D_ALLOCATIONS,
  FIXTURE_D_GOAL,
  FIXTURE_D_TXNS,
} from './fixture-d.fixture';
import { balancesFor, outstandingAdvanceAsOf, runningBalances } from './month-report';

const ROWS = monthlyRows(FIXTURE_D_TXNS, FIXTURE_D_ALLOCATIONS);
const OPENING = FIXTURE_D_GOAL.openingBalance;

describe('runningBalances - Fixture D (PRD v2 7.1)', () => {
  it('reproduces the Saldo column of the fixture table', () => {
    expect(runningBalances(OPENING, ROWS)).toEqual([
      { period: '2026-05', openingBalance: 0, closingBalance: 2_000_000 },
      { period: '2026-06', openingBalance: 2_000_000, closingBalance: 3_200_000 },
      { period: '2026-07', openingBalance: 3_200_000, closingBalance: 5_200_000 },
      { period: '2026-08', openingBalance: 5_200_000, closingBalance: 5_500_000 },
      { period: '2026-09', openingBalance: 5_500_000, closingBalance: 6_500_000 },
    ]);
  });

  it('opens each month exactly where the previous one closed', () => {
    const balances = runningBalances(OPENING, ROWS);

    balances.slice(1).forEach((row, index) => {
      expect(row.openingBalance).toBe(balances[index].closingBalance);
    });
  });

  it('starts from the goal opening balance, not from zero', () => {
    expect(runningBalances(1_000_000, ROWS)[0]).toEqual({
      period: '2026-05',
      openingBalance: 1_000_000,
      closingBalance: 3_000_000,
    });
  });
});

describe('balancesFor', () => {
  // The exact month section 10.5 prints.
  it('gives August the fixture opening and closing balances', () => {
    expect(balancesFor(OPENING, ROWS, '2026-08')).toEqual({
      period: '2026-08',
      openingBalance: 5_200_000,
      closingBalance: 5_500_000,
    });
  });

  /**
   * An empty month is an answer, not a 404. The balance carries straight through, which is
   * what lets the month screen say "nothing moved" instead of showing a zero balance.
   */
  it('carries the balance through a month with no activity', () => {
    expect(balancesFor(OPENING, ROWS, '2026-10')).toEqual({
      period: '2026-10',
      openingBalance: 6_500_000,
      closingBalance: 6_500_000,
    });
  });

  it('reports the goal opening balance for a month before any activity', () => {
    expect(balancesFor(250_000, ROWS, '2026-04')).toEqual({
      period: '2026-04',
      openingBalance: 250_000,
      closingBalance: 250_000,
    });
  });

  it('refuses anything that is not a YYYY-MM period', () => {
    expect(() => balancesFor(OPENING, ROWS, '2026-08-01')).toThrow();
  });
});

describe('outstandingAdvanceAsOf', () => {
  const asOf = (date: string) =>
    outstandingAdvanceAsOf(FIXTURE_D_ADVANCES, FIXTURE_D_ALLOCATIONS, date);

  it('is section 10.5 figure for the close of August: 700.000', () => {
    expect(asOf('2026-08-31')).toBe(700_000);
  });

  it('walks Fixture D month by month', () => {
    expect(asOf('2026-05-31')).toBe(0); // nothing borrowed yet
    expect(asOf('2026-06-30')).toBe(600_000); // June's advance, unpaid
    expect(asOf('2026-07-31')).toBe(0); // July's deposit settled it
    expect(asOf('2026-08-31')).toBe(700_000); // August's advance, unpaid
    expect(asOf('2026-09-30')).toBe(700_000); // still unpaid
  });

  it('counts an advance from the day it was taken, not the month end', () => {
    expect(asOf('2026-06-17')).toBe(0);
    expect(asOf('2026-06-18')).toBe(600_000);
  });

  /**
   * The reason this function exists at all. `returnedAmount` on the June advance is
   * 600.000 today, so folding over it -- which is what `computeSavings` does for the live
   * figure -- would report June's close as 0. It was 600.000.
   */
  it('does not let a later repayment rewrite an earlier month', () => {
    expect(asOf('2026-06-30')).toBe(600_000);

    // August's advance paid back in October. August still closed owing all of it.
    const repaidLater = outstandingAdvanceAsOf(
      FIXTURE_D_ADVANCES,
      [
        ...FIXTURE_D_ALLOCATIONS,
        { withdrawalId: 81, amount: 700_000, depositOccurredOn: '2026-10-05' },
      ],
      '2026-08-31',
    );

    expect(repaidLater).toBe(700_000);

    // And by October's close it is genuinely gone.
    expect(
      outstandingAdvanceAsOf(
        FIXTURE_D_ADVANCES,
        [
          ...FIXTURE_D_ALLOCATIONS,
          { withdrawalId: 81, amount: 700_000, depositOccurredOn: '2026-10-05' },
        ],
        '2026-10-31',
      ),
    ).toBe(0);
  });

  it('attributes a repayment to its own advance, not to the oldest open one', () => {
    const paidAugustOnly = outstandingAdvanceAsOf(
      FIXTURE_D_ADVANCES,
      [{ withdrawalId: 81, amount: 700_000, depositOccurredOn: '2026-08-20' }],
      '2026-08-31',
    );

    // June's 600.000 is untouched; only August's was settled.
    expect(paidAugustOnly).toBe(600_000);
  });

  it('never reports a negative debt, however much was paid back', () => {
    const overpaid = outstandingAdvanceAsOf(
      [{ id: 61, occurredOn: '2026-06-18', amount: 600_000 }],
      [{ withdrawalId: 61, amount: 900_000, depositOccurredOn: '2026-07-09' }],
      '2026-07-31',
    );

    expect(overpaid).toBe(0);
  });

  /**
   * The live figure and the as-at figure are two code paths over the same facts, so they
   * are pinned to each other here: as at today, they must agree. If they ever diverge, one
   * of the two definitions has drifted.
   */
  it('agrees with the live outstandingAdvance when asked about today', () => {
    expect(asOf('2026-09-14')).toBe(700_000);
  });

  it('refuses a period where a date belongs', () => {
    expect(() => asOf('2026-08')).toThrow();
  });
});
