import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query';
import type { Wallet, WalletType } from '@/types/api';

/**
 * The wallet list (PRD v2 10.2).
 *
 * Deliberately query-only: which wallet is *active* is a UI decision and lives in
 * `wallet-context.tsx`. Keeping the two apart is what stops this module and the context
 * from importing each other.
 */
export function useWallets(includeArchived = false) {
  return useQuery({
    queryKey: queryKeys.wallets(includeArchived),
    queryFn: () =>
      api.get<Wallet[]>(`/wallets${includeArchived ? '?includeArchived=true' : ''}`),
    // Wallets change far less often than money does, and every screen needs this before
    // it can ask for anything else.
    staleTime: 5 * 60_000,
  });
}

export interface CreateWalletInput {
  name: string;
  type: WalletType;
  color?: string;
  icon?: string | null;
}

export function useCreateWallet() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateWalletInput) => api.post<Wallet>('/wallets', input),
    onSuccess: () => client.invalidateQueries({ queryKey: ['wallets'] }),
  });
}

export function useUpdateWallet() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...input }: { id: number } & Partial<CreateWalletInput> & {
      isDefault?: boolean;
      isArchived?: boolean;
    }) => api.patch<Wallet>(`/wallets/${id}`, input),
    onSuccess: () => client.invalidateQueries({ queryKey: ['wallets'] }),
  });
}

export function useArchiveWallet() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api.delete<void>(`/wallets/${id}`),
    onSuccess: () => client.invalidateQueries({ queryKey: ['wallets'] }),
  });
}
