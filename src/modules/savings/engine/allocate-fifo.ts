/**
 * Default allocation of a deposit against outstanding advances (PRD v2 section 5.4).
 *
 * Pure: it proposes an allocation, it does not write one. The service applies the result
 * inside a DB transaction together with the deposit itself.
 */

export interface AllocatableAdvance {
  id: number;
  /** `YYYY-MM-DD`; oldest debt is settled first. */
  occurredOn: string;
  amount: number;
  returnedAmount: number;
}

export interface ProposedAllocation {
  withdrawalId: number;
  amount: number;
}

export interface FifoAllocation {
  allocations: ProposedAllocation[];
  /** What the deposit repaid. */
  repaid: number;
  /** What is left over -- the part that is actually new progress (section 5.3). */
  fresh: number;
}

/**
 * Oldest debt first, until the deposit runs out or every advance is settled.
 *
 * Ties on `occurredOn` are broken by id, so the same inputs always produce the same
 * allocation -- without that, two runs could repay different advances and the report
 * would move under the user for no visible reason.
 */
export function allocateFifo(
  depositAmount: number,
  advances: readonly AllocatableAdvance[],
): FifoAllocation {
  let left = depositAmount;
  const allocations: ProposedAllocation[] = [];

  const oldestFirst = [...advances].sort(
    (a, b) => a.occurredOn.localeCompare(b.occurredOn) || a.id - b.id,
  );

  for (const advance of oldestFirst) {
    if (left <= 0) break;

    const owed = advance.amount - advance.returnedAmount;
    if (owed <= 0) continue;

    const take = Math.min(owed, left);
    allocations.push({ withdrawalId: advance.id, amount: take });
    left -= take;
  }

  return { allocations, repaid: depositAmount - left, fresh: left };
}
