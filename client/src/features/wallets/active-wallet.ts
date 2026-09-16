import type { Wallet } from '@/types/api';

export const ACTIVE_WALLET_STORAGE_KEY = 'budget-tracker.activeWalletId';

/**
 * Which wallet the app is looking at, given what is stored and what exists.
 *
 * Pure, and separate from the context, because every interesting case here is a case the
 * stored value is wrong: the wallet was archived, deleted on another device, or belongs to
 * an account that has since logged out. Falling back to the default wallet is always
 * better than rendering nothing, and is the same rule the server applies when a request
 * arrives with no wallet at all (v2 4.2).
 */
export function resolveActiveWalletId(
  wallets: readonly Wallet[] | undefined,
  stored: number | null,
): number | undefined {
  if (!wallets || wallets.length === 0) return undefined;

  const chosen = stored === null ? undefined : wallets.find((wallet) => wallet.id === stored);

  return (chosen ?? wallets.find((wallet) => wallet.isDefault) ?? wallets[0]).id;
}

export function readStoredWalletId(): number | null {
  try {
    const raw = window.localStorage.getItem(ACTIVE_WALLET_STORAGE_KEY);
    const parsed = raw === null ? Number.NaN : Number(raw);

    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  } catch {
    // Private mode, or storage disabled. The default wallet is a fine answer.
    return null;
  }
}

export function writeStoredWalletId(id: number): void {
  try {
    window.localStorage.setItem(ACTIVE_WALLET_STORAGE_KEY, String(id));
  } catch {
    // Not being able to remember the choice is survivable; failing the switch is not.
  }
}
