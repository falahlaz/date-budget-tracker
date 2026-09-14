import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '@/lib/api';
import { invalidateReports, queryKeys } from '@/lib/query';
import { useActiveWalletId } from '@/features/wallets/wallet-context';
import type { Budget, BudgetHistoryRow } from '@/types/api';

/** Budgets belong to a wallet from v2 on, and only ever a date-budget one (PRD v2 10.1). */
export function useBudget(period: string) {
  const walletId = useActiveWalletId();

  return useQuery({
    queryKey: queryKeys.budget(walletId, period),
    queryFn: async () => {
      try {
        return await api.get<Budget>(`/wallets/${walletId}/budgets/${period}`);
      } catch (error) {
        // A month with no budget yet is an expected state, not a failure (PRD 6.3).
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
    enabled: walletId !== undefined && Boolean(period),
  });
}

export function useBudgetHistory() {
  const walletId = useActiveWalletId();

  return useQuery({
    queryKey: queryKeys.budgets(walletId),
    queryFn: () =>
      api.get<{ items: BudgetHistoryRow[]; total: number }>(`/wallets/${walletId}/budgets`),
    enabled: walletId !== undefined,
  });
}

export function useUpsertBudget() {
  const client = useQueryClient();
  const walletId = useActiveWalletId();

  return useMutation({
    mutationFn: ({ period, amount, note }: { period: string; amount: number; note?: string }) =>
      api.put<Budget>(`/wallets/${walletId}/budgets/${period}`, {
        amount,
        ...(note ? { note } : {}),
      }),
    // Changing a budget moves this month and every month after it (PRD 6.7).
    onSuccess: async (_data, variables) => {
      await client.invalidateQueries({ queryKey: queryKeys.budget(walletId, variables.period) });
      await invalidateReports(client);
    },
  });
}
