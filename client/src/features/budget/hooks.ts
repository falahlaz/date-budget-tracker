import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '@/lib/api';
import { invalidateReports, queryKeys } from '@/lib/query';
import type { Budget, BudgetHistoryRow } from '@/types/api';

export function useBudget(period: string) {
  return useQuery({
    queryKey: queryKeys.budget(period),
    queryFn: async () => {
      try {
        return await api.get<Budget>(`/budgets/${period}`);
      } catch (error) {
        // A month with no budget yet is an expected state, not a failure (PRD 6.3).
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
    enabled: Boolean(period),
  });
}

export function useBudgetHistory() {
  return useQuery({
    queryKey: queryKeys.budgets,
    queryFn: () => api.get<{ items: BudgetHistoryRow[]; total: number }>('/budgets'),
  });
}

export function useUpsertBudget() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ period, amount, note }: { period: string; amount: number; note?: string }) =>
      api.put<Budget>(`/budgets/${period}`, { amount, ...(note ? { note } : {}) }),
    // Changing a budget moves this month and every month after it (PRD 6.7).
    onSuccess: async (_data, variables) => {
      await client.invalidateQueries({ queryKey: queryKeys.budget(variables.period) });
      await invalidateReports(client);
    },
  });
}
