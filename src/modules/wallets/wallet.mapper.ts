import { Wallet, WalletType } from '@prisma/client';

/**
 * What the switcher shows for a DATE_BUDGET wallet: where this month stands.
 */
export interface DateBudgetSummary {
  period: string;
  dayRemaining: number;
  weekendBudgetProjected: number;
  monthRemaining: number;
}

/**
 * What the switcher shows for a SAVINGS wallet.
 *
 * Every field is nullable except the balance: a savings wallet with no goal yet is a
 * normal state, not an error, and the switcher still has to draw a row for it.
 */
export interface SavingsSummary {
  balance: number;
  goalName: string | null;
  progress: number | null;
  paceDelta: number | null;
  outstandingAdvance: number;
}

export interface WalletResponse {
  id: number;
  name: string;
  type: WalletType;
  color: string;
  icon: string | null;
  isDefault: boolean;
  isArchived: boolean;
  sortOrder: number;
  /**
   * Shape follows `type` (PRD v2 10.2). Included in the list so the switcher costs one
   * request rather than one per wallet.
   */
  summary?: DateBudgetSummary | SavingsSummary;
}

export function toWalletResponse(
  wallet: Wallet,
  summary?: DateBudgetSummary | SavingsSummary,
): WalletResponse {
  return {
    id: wallet.id,
    name: wallet.name,
    type: wallet.type,
    color: wallet.color,
    icon: wallet.icon,
    isDefault: wallet.isDefault,
    isArchived: wallet.isArchived,
    sortOrder: wallet.sortOrder,
    ...(summary ? { summary } : {}),
  };
}
