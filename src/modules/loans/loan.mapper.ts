import { fromDateOnly } from '@/common/utils/date-only';
import { LoanStatus } from './engine/loan-status';
import { LoanWithStanding, liveRepayments } from './loans.service';

export interface LoanRepaymentResponse {
  id: number;
  transactionId: number;
  amount: number;
  occurredOn: string;
  walletId: number;
  walletName: string;
  walletColor: string;
  note: string | null;
}

export interface LoanResponse {
  id: number;
  borrowerName: string;
  amount: number;
  lentOn: string;
  dueDate: string | null;
  note: string | null;
  /** The wallet the money left, and where repayments go back to by default. */
  walletId: number;
  walletName: string;
  walletColor: string;
  /** The LOAN_OUT transaction. */
  transactionId: number;
  repaidAmount: number;
  remaining: number;
  status: LoanStatus;
  daysOverdue: number;
  settledAt: string | null;
  /** Oldest first. */
  repayments: LoanRepaymentResponse[];
  createdAt: string;
  updatedAt: string;
}

export function toLoanResponse(loan: LoanWithStanding): LoanResponse {
  return {
    id: loan.id,
    borrowerName: loan.borrowerName,
    amount: loan.transaction.amount,
    lentOn: fromDateOnly(loan.transaction.occurredOn),
    dueDate: loan.dueDate && fromDateOnly(loan.dueDate),
    note: loan.note,
    walletId: loan.walletId,
    walletName: loan.transaction.wallet.name,
    walletColor: loan.transaction.wallet.color,
    transactionId: loan.transactionId,
    repaidAmount: loan.standing.repaidAmount,
    remaining: loan.standing.remaining,
    status: loan.standing.status,
    daysOverdue: loan.standing.daysOverdue,
    settledAt: loan.settledAt?.toISOString() ?? null,
    repayments: liveRepayments(loan)
      .map((repayment) => ({
        id: repayment.id,
        transactionId: repayment.transactionId,
        amount: repayment.transaction.amount,
        occurredOn: fromDateOnly(repayment.transaction.occurredOn),
        walletId: repayment.transaction.walletId,
        walletName: repayment.transaction.wallet.name,
        walletColor: repayment.transaction.wallet.color,
        note: repayment.transaction.note,
      }))
      .sort((a, b) => a.occurredOn.localeCompare(b.occurredOn) || a.id - b.id),
    createdAt: loan.createdAt.toISOString(),
    updatedAt: loan.updatedAt.toISOString(),
  };
}
