import { describe, expect, it } from 'vitest';
import type { Wallet } from '@/types/api';
import { resolveActiveWalletId } from './active-wallet';

const wallet = (id: number, isDefault = false): Wallet => ({
  id,
  name: `Dompet ${id}`,
  type: 'DATE_BUDGET',
  color: '#5c63c4',
  icon: null,
  isDefault,
  isArchived: false,
  sortOrder: id,
});

const WALLETS = [wallet(1, true), wallet(2)];

describe('resolveActiveWalletId', () => {
  it('honours a stored choice that still exists', () => {
    expect(resolveActiveWalletId(WALLETS, 2)).toBe(2);
  });

  it('falls back to the default wallet when nothing is stored', () => {
    expect(resolveActiveWalletId(WALLETS, null)).toBe(1);
  });

  /**
   * The stored id can name a wallet that has since been archived, deleted on another
   * device, or that belongs to a different account. Rendering nothing would be worse than
   * any of those; the default wallet is the same answer the server gives a request that
   * names no wallet at all (v2 4.2).
   */
  it('falls back when the stored wallet is gone', () => {
    expect(resolveActiveWalletId(WALLETS, 99)).toBe(1);
  });

  it('takes the first wallet when none is marked default', () => {
    expect(resolveActiveWalletId([wallet(7), wallet(8)], null)).toBe(7);
  });

  it('is undefined while the list is still loading, so nothing fires on a guess', () => {
    expect(resolveActiveWalletId(undefined, 2)).toBeUndefined();
    expect(resolveActiveWalletId([], 2)).toBeUndefined();
  });
});
