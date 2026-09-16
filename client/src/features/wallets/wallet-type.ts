import type { WalletType } from '@/types/api';

/**
 * What each wallet type is called on screen.
 *
 * One place on purpose: the switcher and the Settings category scope both show this pair,
 * and two copies of it is two chances for the screens to disagree.
 *
 * Presentation only -- what gets stored and sent to the API is the enum value.
 */
export const WALLET_TYPE_LABELS: Record<WalletType, string> = {
  DATE_BUDGET: 'Pengeluaran',
  SAVINGS: 'Tabungan',
};
