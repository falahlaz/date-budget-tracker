import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, queryString } from '@/lib/api';
import { invalidateReports, queryKeys } from '@/lib/query';
import type { Expense, ExpenseList, MerchantSuggestion, PaymentMethod, Receipt } from '@/types/api';

export interface ExpenseFilters {
  period?: string;
  from?: string;
  to?: string;
  categoryId?: number;
  merchantKey?: string;
  q?: string;
  dayType?: 'WEEKDAY' | 'WEEKEND';
  weekIndex?: number;
  limit?: number;
  offset?: number;
  sort?: string;
}

export interface ExpenseInput {
  spentOn: string;
  amount: number;
  categoryId?: number | null;
  merchant?: string | null;
  paymentMethod?: PaymentMethod;
  note?: string | null;
}

export function useExpenses(filters: ExpenseFilters) {
  return useQuery({
    queryKey: queryKeys.expenses(filters as Record<string, unknown>),
    queryFn: () => api.get<ExpenseList>(`/expenses${queryString(filters as Record<string, string>)}`),
  });
}

export function useExpense(id: number) {
  return useQuery({
    queryKey: queryKeys.expense(id),
    queryFn: () => api.get<Expense>(`/expenses/${id}`),
    enabled: Number.isFinite(id) && id > 0,
  });
}

/**
 * Place suggestions for the quick-add autocomplete (PRD 9.6).
 *
 * An empty query returns the most-used places, which is what fills the chip row the moment
 * the field is focused -- one tap instead of typing.
 */
export function useMerchantSuggestions(q: string, limit = 8) {
  return useQuery({
    queryKey: queryKeys.merchants(q),
    queryFn: () => api.get<{ items: MerchantSuggestion[] }>(`/expenses/merchants${queryString({ q, limit })}`),
    staleTime: 60_000,
  });
}

export function useCreateExpense() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: ExpenseInput) => api.post<Expense>('/expenses', input),
    onSuccess: () => invalidateReports(client),
  });
}

export function useUpdateExpense() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...input }: { id: number } & Partial<ExpenseInput>) =>
      api.patch<Expense>(`/expenses/${id}`, input),
    onSuccess: async (_data, variables) => {
      await client.invalidateQueries({ queryKey: queryKeys.expense(variables.id) });
      await invalidateReports(client);
    },
  });
}

export function useDeleteExpense() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api.delete<void>(`/expenses/${id}`),
    onSuccess: () => invalidateReports(client),
  });
}

/**
 * Uploads receipts for an already-saved expense.
 *
 * Kept separate from the create mutation on purpose: the expense must survive a failed
 * upload (PRD 6.11), so the two can never share a failure path.
 */
export function useUploadReceipts() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: async ({ expenseId, files }: { expenseId: number; files: File[] }) => {
      const form = new FormData();
      files.forEach((file) => form.append('files', file));
      return api.upload<{ items: Receipt[] }>(`/expenses/${expenseId}/receipts`, form);
    },
    onSuccess: async (_data, variables) => {
      await client.invalidateQueries({ queryKey: queryKeys.expense(variables.expenseId) });
      await client.invalidateQueries({ queryKey: ['expenses'] });
    },
  });
}

export function useDeleteReceipt() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api.delete<void>(`/receipts/${id}`),
    onSuccess: () => client.invalidateQueries({ queryKey: ['expense'] }),
  });
}
