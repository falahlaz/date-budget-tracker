import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '@/lib/api';
import { invalidateReports, queryKeys } from '@/lib/query';
import { useActiveWalletId } from '@/features/wallets/wallet-context';
import type {
  Advance,
  AdvanceList,
  DepositResult,
  GoalWithReport,
  SavingsGoal,
  SavingsMonthReport,
  Transaction,
  WithdrawalPreview,
} from '@/types/api';

/**
 * The savings half of the API (PRD v2 10.3, 10.5).
 *
 * Every figure on these screens is computed server-side. Nothing here does arithmetic --
 * in particular the friction dialog's delay, which the client must never work out for
 * itself, or the number in the dialog could disagree with the number on the home screen.
 */

/**
 * The wallet's goal, with every derived figure.
 *
 * A savings wallet with no goal is a normal empty state rather than an error, so a 404 is
 * translated to `null` instead of being thrown -- the screen then offers to create one.
 */
export function useGoal(walletId?: number) {
  const activeId = useActiveWalletId();
  const id = walletId ?? activeId;

  return useQuery({
    queryKey: queryKeys.goal(id),
    queryFn: async () => {
      try {
        return await api.get<GoalWithReport>(`/wallets/${id}/goal`);
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
    enabled: id !== undefined,
  });
}

export interface GoalInput {
  name: string;
  targetAmount: number;
  openingBalance?: number;
  startDate: string;
  deadline: string;
  note?: string | null;
}

export function useCreateGoal() {
  const client = useQueryClient();
  const walletId = useActiveWalletId();

  return useMutation({
    mutationFn: (input: GoalInput) => api.post<SavingsGoal>(`/wallets/${walletId}/goal`, input),
    onSuccess: () => invalidateReports(client),
  });
}

/** Recomputes `planPerMonth` from the original start date and stamps `planRevisedAt` (8.6). */
export function useUpdateGoal() {
  const client = useQueryClient();
  const walletId = useActiveWalletId();

  return useMutation({
    mutationFn: (input: Partial<GoalInput>) =>
      api.patch<SavingsGoal>(`/wallets/${walletId}/goal`, input),
    onSuccess: () => invalidateReports(client),
  });
}

export function useArchiveGoal() {
  const client = useQueryClient();
  const walletId = useActiveWalletId();

  return useMutation({
    mutationFn: () => api.post<SavingsGoal>(`/wallets/${walletId}/goal/archive`),
    onSuccess: () => invalidateReports(client),
  });
}

export interface DepositInput {
  amount: number;
  occurredOn: string;
  note?: string | null;
  applyToAdvances?: boolean;
  allocations?: { transactionId: number; amount: number }[];
}

export function useCreateDeposit() {
  const client = useQueryClient();
  const walletId = useActiveWalletId();

  return useMutation({
    mutationFn: (input: DepositInput) =>
      api.post<DepositResult>(`/wallets/${walletId}/deposits`, input),
    onSuccess: () => invalidateReports(client),
  });
}

export interface WithdrawalInput {
  amount: number;
  occurredOn: string;
  reason: string;
  categoryId: number;
  expectedReturn?: boolean;
  note?: string | null;
}

export function useCreateWithdrawal() {
  const client = useQueryClient();
  const walletId = useActiveWalletId();

  return useMutation({
    mutationFn: (input: WithdrawalInput) =>
      api.post<Transaction>(`/wallets/${walletId}/withdrawals`, input),
    onSuccess: () => invalidateReports(client),
  });
}

/**
 * What this withdrawal would cost, in time (v2 10.3, goal G4).
 *
 * A mutation rather than a query because it is a POST that writes nothing: it is fired
 * once, at the moment the user taps Tarik, and its answer is shown and then discarded.
 */
export function usePreviewWithdrawal() {
  const walletId = useActiveWalletId();

  return useMutation({
    mutationFn: (amount: number) =>
      api.post<WithdrawalPreview>(`/wallets/${walletId}/withdrawals/preview`, { amount }),
  });
}

export function useAdvances(walletId?: number) {
  const activeId = useActiveWalletId();
  const id = walletId ?? activeId;

  return useQuery({
    queryKey: queryKeys.advances(id),
    queryFn: () => api.get<AdvanceList>(`/wallets/${id}/advances`),
    enabled: id !== undefined,
  });
}

export function useSavingsMonthReport(period: string) {
  const walletId = useActiveWalletId();

  return useQuery({
    queryKey: queryKeys.savingsMonthReport(walletId, period),
    queryFn: () =>
      api.get<SavingsMonthReport>(`/wallets/${walletId}/reports/savings/${period}`),
    enabled: walletId !== undefined && Boolean(period),
  });
}

/** Deposits and withdrawals go out through the savings door, which undoes allocations (8.7). */
export function useDeleteSavingsTransaction() {
  const client = useQueryClient();
  const walletId = useActiveWalletId();

  return useMutation({
    mutationFn: (id: number) => api.delete<void>(`/wallets/${walletId}/transactions/${id}`),
    onSuccess: () => invalidateReports(client),
  });
}

/** FIFO, oldest first -- the same rule the server applies, shown before it is applied (5.4). */
export function planFifo(
  amount: number,
  advances: readonly Advance[],
): { transactionId: number; amount: number }[] {
  let left = amount;
  const plan: { transactionId: number; amount: number }[] = [];

  for (const advance of advances) {
    if (left <= 0) break;
    if (advance.outstanding <= 0) continue;

    const take = Math.min(advance.outstanding, left);
    plan.push({ transactionId: advance.id, amount: take });
    left -= take;
  }

  return plan;
}
