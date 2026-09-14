import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, queryString } from '@/lib/api';
import { invalidateReports, queryKeys } from '@/lib/query';
import { useActiveWalletId } from '@/features/wallets/hooks';
import type {
  MerchantSuggestion,
  PaymentMethod,
  Receipt,
  Transaction,
  TransactionList,
} from '@/types/api';

export type ExpenseFilters = {
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
};

export interface ExpenseInput {
  occurredOn: string;
  amount: number;
  categoryId?: number | null;
  merchant?: string | null;
  paymentMethod?: PaymentMethod;
  note?: string | null;
}

export function useExpenses(filters: ExpenseFilters) {
  const walletId = useActiveWalletId();

  return useQuery({
    queryKey: queryKeys.transactions({ ...filters, walletId } as Record<string, unknown>),
    queryFn: () => api.get<TransactionList>(`/transactions${queryString({ ...filters, walletId })}`),
    enabled: walletId !== undefined,
  });
}

/** Paged list for the history screen; pages are stitched together by infinite scroll. */
export function useInfiniteExpenses(filters: ExpenseFilters, pageSize = 30) {
  const walletId = useActiveWalletId();

  return useInfiniteQuery({
    queryKey: queryKeys.transactions({ ...filters, walletId, pageSize } as Record<string, unknown>),
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      api.get<TransactionList>(
        `/transactions${queryString({ ...filters, walletId, limit: pageSize, offset: pageParam })}`,
      ),
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((count, page) => count + page.items.length, 0);
      return loaded < lastPage.total ? loaded : undefined;
    },
    enabled: walletId !== undefined,
  });
}

export function useExpense(id: number) {
  return useQuery({
    queryKey: queryKeys.transaction(id),
    queryFn: () => api.get<Transaction>(`/transactions/${id}`),
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
  const walletId = useActiveWalletId();

  return useQuery({
    queryKey: queryKeys.merchants(walletId, q),
    queryFn: () =>
      api.get<{ items: MerchantSuggestion[] }>(
        `/transactions/merchants${queryString({ q, limit, walletId })}`,
      ),
    staleTime: 60_000,
    enabled: walletId !== undefined,
  });
}

export function useCreateExpense() {
  const client = useQueryClient();
  const walletId = useActiveWalletId();

  return useMutation({
    mutationFn: (input: ExpenseInput) => api.post<Transaction>('/transactions', { ...input, walletId }),
    onSuccess: () => invalidateReports(client),
  });
}

export function useUpdateExpense() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...input }: { id: number } & Partial<ExpenseInput>) =>
      api.patch<Transaction>(`/transactions/${id}`, input),
    onSuccess: async (_data, variables) => {
      await client.invalidateQueries({ queryKey: queryKeys.transaction(variables.id) });
      await invalidateReports(client);
    },
  });
}

export function useDeleteExpense() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api.delete<void>(`/transactions/${id}`),
    onSuccess: () => invalidateReports(client),
  });
}

/**
 * Uploads receipts for an already-saved transaction.
 *
 * Kept separate from the create mutation on purpose: the transaction must survive a failed
 * upload (PRD 6.11), so the two can never share a failure path.
 */
export function useUploadReceipts() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: async ({ expenseId, files }: { expenseId: number; files: File[] }) => {
      const form = new FormData();
      files.forEach((file) => form.append('files', file));
      return api.upload<{ items: Receipt[] }>(`/transactions/${expenseId}/receipts`, form);
    },
    onSuccess: async (_data, variables) => {
      await client.invalidateQueries({ queryKey: queryKeys.transaction(variables.expenseId) });
      await client.invalidateQueries({ queryKey: ['transactions'] });
    },
  });
}

export function useDeleteReceipt() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api.delete<void>(`/receipts/${id}`),
    onSuccess: () => client.invalidateQueries({ queryKey: ['transaction'] }),
  });
}
