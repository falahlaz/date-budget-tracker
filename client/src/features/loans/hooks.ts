import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { invalidateReports, queryKeys } from '@/lib/query';
import type { Loan, LoanList, LoanRepayResult } from '@/types/api';

export function useLoans() {
  return useQuery({
    queryKey: queryKeys.loans,
    queryFn: () => api.get<LoanList>('/loans'),
  });
}

export function useLoan(id: number) {
  return useQuery({
    queryKey: queryKeys.loan(id),
    queryFn: () => api.get<Loan>(`/loans/${id}`),
    enabled: Number.isInteger(id) && id > 0,
  });
}

export interface LoanInput {
  borrowerName: string;
  amount: number;
  lentOn: string;
  dueDate: string | null;
  note: string | null;
}

/**
 * Every loan write moves money in a wallet, so each one refreshes everything a
 * transaction can move -- `invalidateReports` covers the loans keys too.
 */
function useMoneyMutation<TInput, TResult>(mutationFn: (input: TInput) => Promise<TResult>) {
  const client = useQueryClient();
  return useMutation({ mutationFn, onSuccess: () => invalidateReports(client) });
}

export function useCreateLoan() {
  return useMoneyMutation((input: LoanInput & { walletId: number }) =>
    api.post<Loan>('/loans', input),
  );
}

export function useUpdateLoan() {
  return useMoneyMutation(({ id, ...input }: Partial<LoanInput> & { id: number }) =>
    api.patch<Loan>(`/loans/${id}`, input),
  );
}

export function useDeleteLoan() {
  return useMoneyMutation((id: number) => api.delete<void>(`/loans/${id}`));
}

export interface RepayLoanInput {
  loanId: number;
  amount: number;
  walletId: number;
  occurredOn: string;
}

export function useRepayLoan() {
  return useMoneyMutation(({ loanId, ...input }: RepayLoanInput) =>
    api.post<LoanRepayResult>(`/loans/${loanId}/repay`, input),
  );
}

export function useDeleteRepayment() {
  return useMoneyMutation(({ loanId, repaymentId }: { loanId: number; repaymentId: number }) =>
    api.delete<Loan>(`/loans/${loanId}/repayments/${repaymentId}`),
  );
}
