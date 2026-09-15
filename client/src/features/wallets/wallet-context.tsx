import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Wallet, WalletType } from '@/types/api';
import { readStoredWalletId, resolveActiveWalletId, writeStoredWalletId } from './active-wallet';
import { useWallets } from './hooks';

interface WalletContextValue {
  wallets: Wallet[];
  activeWalletId: number | undefined;
  activeWallet: Wallet | undefined;
  selectWallet: (id: number) => void;
  isLoading: boolean;
}

const WalletContext = createContext<WalletContextValue | null>(null);

/**
 * Which wallet every screen is about (PRD v2 4.2, 11.1).
 *
 * One place decides, and the id is already part of every wallet-scoped query key, so
 * switching refetches rather than relabelling the previous wallet's cached figures --
 * the one bug in a multi-wallet app a user would have no reason to doubt.
 *
 * The choice is remembered in localStorage per device rather than on the server: it is a
 * view preference, not account state, and a phone and a laptop can reasonably sit on
 * different wallets.
 */
export function WalletProvider({ children }: { children: ReactNode }) {
  const { data, isLoading } = useWallets();
  const [stored, setStored] = useState<number | null>(() => readStoredWalletId());

  const selectWallet = useCallback((id: number) => {
    setStored(id);
    writeStoredWalletId(id);
  }, []);

  const value = useMemo<WalletContextValue>(() => {
    const wallets = data ?? [];
    const activeWalletId = resolveActiveWalletId(wallets, stored);

    return {
      wallets,
      activeWalletId,
      activeWallet: wallets.find((wallet) => wallet.id === activeWalletId),
      selectWallet,
      isLoading,
    };
  }, [data, stored, selectWallet, isLoading]);

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

function useWalletContext(): WalletContextValue {
  const context = useContext(WalletContext);

  if (!context) {
    throw new Error('useWalletContext must be used inside <WalletProvider>');
  }

  return context;
}

/**
 * The wallet id every other request is scoped to.
 *
 * `undefined` while the wallet list is still loading -- callers pass that straight to
 * `enabled`, so nothing fires against a guessed id.
 */
export function useActiveWalletId(): number | undefined {
  return useWalletContext().activeWalletId;
}

export function useActiveWallet(): Wallet | undefined {
  return useWalletContext().activeWallet;
}

/** The active wallet's type, defaulting to the date-budget shape while the list loads. */
export function useActiveWalletType(): WalletType {
  return useWalletContext().activeWallet?.type ?? 'DATE_BUDGET';
}

export function useWalletSwitcher(): Pick<
  WalletContextValue,
  'wallets' | 'activeWallet' | 'selectWallet' | 'isLoading'
> {
  const { wallets, activeWallet, selectWallet, isLoading } = useWalletContext();

  return { wallets, activeWallet, selectWallet, isLoading };
}
