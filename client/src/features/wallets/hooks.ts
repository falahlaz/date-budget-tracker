import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query';
import type { Wallet } from '@/types/api';

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

/**
 * The wallet every other request is scoped to.
 *
 * Every endpoint below this point needs a wallet id, so this is the one place that decides
 * which. Today it is the default wallet; when the switcher lands (PRD v2 11.1) only the
 * body of this hook changes, and because the id is already part of every query key, the
 * screens refetch on a switch instead of showing the previous wallet's numbers.
 *
 * `undefined` while the wallet list is still loading -- callers pass that straight to
 * `enabled`, so nothing fires against a guessed id.
 */
export function useActiveWalletId(): number | undefined {
  const { data } = useWallets();

  return data?.find((wallet) => wallet.isDefault)?.id ?? data?.[0]?.id;
}

export function useActiveWallet(): Wallet | undefined {
  const { data } = useWallets();
  const activeId = useActiveWalletId();

  return data?.find((wallet) => wallet.id === activeId);
}
