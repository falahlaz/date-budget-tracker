import { differenceInCalendarDays, parseISO } from 'date-fns';
import { sumMoney } from '@/common/utils/money';

/**
 * Where a loan stands today. Pure: no database and no clock -- "today" is an input, the
 * same contract as the bill schedule and both budget engines.
 */

export type LoanStatus = 'ACTIVE' | 'OVERDUE' | 'SETTLED';

export interface LoanStatusInput {
  /** What was lent, whole rupiah. */
  amount: number;
  /** Every live repayment, whole rupiah each. */
  repayments: readonly number[];
  /** `YYYY-MM-DD` the borrower promised to pay by, or null for no promise. */
  dueDate: string | null;
  /** Today in Asia/Jakarta, `YYYY-MM-DD`. */
  today: string;
}

export interface LoanStanding {
  repaidAmount: number;
  /** Never negative: repayments are capped at what is still owed when they are recorded. */
  remaining: number;
  status: LoanStatus;
  /** Days past the due date; 0 when not overdue. */
  daysOverdue: number;
}

export function computeLoanStanding(input: LoanStatusInput): LoanStanding {
  const repaidAmount = sumMoney(input.repayments);
  const remaining = Math.max(0, input.amount - repaidAmount);

  if (remaining === 0) {
    return { repaidAmount, remaining, status: 'SETTLED', daysOverdue: 0 };
  }

  const daysOverdue =
    input.dueDate !== null && input.dueDate < input.today
      ? differenceInCalendarDays(parseISO(input.today), parseISO(input.dueDate))
      : 0;

  return {
    repaidAmount,
    remaining,
    status: daysOverdue > 0 ? 'OVERDUE' : 'ACTIVE',
    daysOverdue,
  };
}
