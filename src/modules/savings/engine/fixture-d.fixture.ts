import { AllocationInput, SavingsGoalInput, SavingsTxnInput } from './compute-savings';
import { AdvanceInput } from './month-report';

/**
 * Fixture D (PRD v2 section 7.1), as a literal table.
 *
 * Lives in its own file rather than inside one spec because two specs assert against it --
 * `compute-savings.spec.ts` for the derived figures and `month-report.spec.ts` for the
 * point-in-time ones. One copy, so a number cannot be corrected in one place and left
 * wrong in the other.
 */

export const FIXTURE_D_TODAY = '2026-09-14';

export const FIXTURE_D_GOAL: SavingsGoalInput = {
  targetAmount: 30_000_000,
  openingBalance: 0,
  startDate: '2026-05-01',
  deadline: '2027-08-31',
  planPerMonth: 1_875_000,
};

/**
 * The August withdrawal is deliberately two rows rather than one of 1.200.000: one
 * withdrawal is one reason, and only the 700.000 is money Falah said he would put back.
 */
export const FIXTURE_D_TXNS: SavingsTxnInput[] = [
  { occurredOn: '2026-05-12', amount: 2_000_000, kind: 'DEPOSIT' },

  { occurredOn: '2026-06-10', amount: 1_800_000, kind: 'DEPOSIT' },
  {
    occurredOn: '2026-06-18',
    amount: 600_000,
    kind: 'WITHDRAW',
    expectedReturn: true,
    returnedAmount: 600_000,
  },

  // The 600.000 of this deposit is allocated against June's advance, below.
  { occurredOn: '2026-07-09', amount: 2_000_000, kind: 'DEPOSIT' },

  { occurredOn: '2026-08-05', amount: 1_500_000, kind: 'DEPOSIT' },
  {
    occurredOn: '2026-08-09',
    amount: 700_000,
    kind: 'WITHDRAW',
    expectedReturn: true,
    returnedAmount: 0,
  },
  { occurredOn: '2026-08-22', amount: 500_000, kind: 'WITHDRAW', expectedReturn: false },

  { occurredOn: '2026-09-03', amount: 1_000_000, kind: 'DEPOSIT' },
];

/** The two withdrawals marked "bakal gw balikin", with the ids repayments point at. */
export const FIXTURE_D_ADVANCES: AdvanceInput[] = [
  { id: 61, occurredOn: '2026-06-18', amount: 600_000 },
  { id: 81, occurredOn: '2026-08-09', amount: 700_000 },
];

export const FIXTURE_D_ALLOCATIONS: AllocationInput[] = [
  { withdrawalId: 61, amount: 600_000, depositOccurredOn: '2026-07-09' },
];
