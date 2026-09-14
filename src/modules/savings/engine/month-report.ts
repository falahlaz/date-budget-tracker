import { assertDateString, assertPeriod } from '@/modules/reports/engine/calendar';
import { AllocationInput, SavingsMonthRow } from './compute-savings';

/**
 * Point-in-time savings arithmetic (PRD v2 section 10.5).
 *
 * `computeSavings` answers about the present: what the balance is now, what is still owed
 * now. The month report asks a different question -- what was true at the end of *that*
 * month -- and the two are not the same number. A repayment made in October must not
 * reduce August's outstanding advance, or the August screen would quietly rewrite itself
 * every time Falah pays something back.
 *
 * Pure, like everything else in this directory: no database, no `Date.now()`, no dates
 * read from anywhere but the arguments.
 */

/** An advance, for attribution over time. Settled ones belong here too. */
export interface AdvanceInput {
  /** The WITHDRAW row's id -- what `AllocationInput.withdrawalId` points at. */
  id: number;
  occurredOn: string;
  amount: number;
}

export interface MonthBalances {
  period: string;
  openingBalance: number;
  closingBalance: number;
}

/**
 * The balance at the start and end of every month that saw activity.
 *
 * `monthly` comes from `monthlyRows`, which is already sorted oldest first and already
 * carries `net` -- so this is a fold and nothing more. Months with no activity are absent
 * from `monthly` by design; `balancesFor` is what puts them back.
 */
export function runningBalances(
  openingBalance: number,
  monthly: readonly SavingsMonthRow[],
): MonthBalances[] {
  let running = openingBalance;

  return monthly.map((row) => {
    const opening = running;
    running = opening + row.net;

    return { period: row.period, openingBalance: opening, closingBalance: running };
  });
}

/**
 * The balances for one month, whether or not anything happened in it.
 *
 * A month with no transactions is a real answer, not a 404: the balance simply carries
 * through unchanged. Returning the previous month's closing figure for both ends says
 * exactly that, and is what lets the month screen show "nothing moved" rather than an
 * error or a zero balance.
 */
export function balancesFor(
  openingBalance: number,
  monthly: readonly SavingsMonthRow[],
  period: string,
): MonthBalances {
  assertPeriod(period);

  const balances = runningBalances(openingBalance, monthly);
  const exact = balances.find((row) => row.period === period);

  if (exact) return exact;

  // Nothing in this month, so it opens and closes on whatever the last month with activity
  // left behind -- or on the goal's opening balance, if this month predates all of it.
  const carried = balances.filter((row) => row.period < period).at(-1)?.closingBalance;
  const balance = carried ?? openingBalance;

  return { period, openingBalance: balance, closingBalance: balance };
}

/**
 * What was still owed to the wallet as at `asOf`, inclusive (PRD v2 section 10.5).
 *
 * Deliberately NOT derived from `returnedAmount`, which only ever describes the present:
 * an advance taken in August and repaid in October carries `returnedAmount` today, and
 * folding over it would report August's close as though the money had already come back.
 * Attribution is by date on both sides -- the advance must have been taken by `asOf`, and
 * the repayment's *deposit* must have landed by `asOf`.
 *
 * Clamped at zero per advance, matching `computeSavings`: an over-repayment is not a
 * negative debt.
 */
export function outstandingAdvanceAsOf(
  advances: readonly AdvanceInput[],
  allocations: readonly AllocationInput[],
  asOf: string,
): number {
  assertDateString(asOf);

  const repaidByAsOf = new Map<number, number>();

  for (const allocation of allocations) {
    if (allocation.depositOccurredOn > asOf) continue;

    const already = repaidByAsOf.get(allocation.withdrawalId) ?? 0;
    repaidByAsOf.set(allocation.withdrawalId, already + allocation.amount);
  }

  return advances
    .filter((advance) => advance.occurredOn <= asOf)
    .reduce(
      (total, advance) => total + Math.max(0, advance.amount - (repaidByAsOf.get(advance.id) ?? 0)),
      0,
    );
}
