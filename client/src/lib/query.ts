import { QueryClient } from '@tanstack/react-query';

/**
 * Query keys.
 *
 * Every mutation invalidates `reports` wholesale (PRD 10.1): changing one transaction can
 * move the numbers for its week, its month, and every month after it, so a surgical
 * invalidation would be wrong more often than right.
 *
 * Anything scoped to a wallet carries the wallet id in its key. Without that, switching
 * wallets would show the previous wallet's cached figures under the new wallet's name --
 * the one bug in a multi-wallet app that a user would not think to doubt.
 */
export const queryKeys = {
  me: ['me'] as const,
  wallets: (includeArchived = false) => ['wallets', includeArchived] as const,
  categories: (walletType: string, includeArchived = false) =>
    ['categories', walletType, includeArchived] as const,
  budgets: (walletId?: number) => ['budgets', walletId] as const,
  budget: (walletId: number | undefined, period: string) => ['budget', walletId, period] as const,
  transactions: (filters: Record<string, unknown>) => ['transactions', filters] as const,
  transaction: (id: number) => ['transaction', id] as const,
  merchants: (walletId: number | undefined, q: string) => ['merchants', walletId, q] as const,
  reports: ['reports'] as const,
  monthReport: (walletId: number | undefined, period: string) =>
    ['reports', 'month', walletId, period] as const,
  weekReport: (walletId: number | undefined, period: string, weekIndex: number) =>
    ['reports', 'week', walletId, period, weekIndex] as const,
  currentWeekReport: (walletId: number | undefined) =>
    ['reports', 'week', 'current', walletId] as const,
  todayReport: (walletId: number | undefined) => ['reports', 'today', walletId] as const,

  // Savings (v2 10.3, 10.5). Under the `reports` prefix where the figures are derived, so
  // `invalidateReports` reaches them too: a deposit moves the goal and the month alike.
  goal: (walletId: number | undefined) => ['reports', 'goal', walletId] as const,
  advances: (walletId: number | undefined) => ['reports', 'advances', walletId] as const,
  savingsMonthReport: (walletId: number | undefined, period: string) =>
    ['reports', 'savings', walletId, period] as const,
};

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (failureCount, error) => {
          // Never retry an auth failure; the refresh flow already had its chance.
          const status = (error as { status?: number }).status;
          if (status === 401 || status === 403 || status === 404) return false;
          return failureCount < 2;
        },
        refetchOnWindowFocus: true,
      },
    },
  });
}

/**
 * Called after any mutation that can move a budget number.
 *
 * Invalidates by prefix rather than by exact key, so it does not need to know which wallet
 * the change landed in -- a transfer moves two wallets at once, and getting that wrong
 * would leave one of them stale.
 */
export async function invalidateReports(client: QueryClient): Promise<void> {
  await Promise.all([
    client.invalidateQueries({ queryKey: queryKeys.reports }),
    client.invalidateQueries({ queryKey: ['transactions'] }),
    client.invalidateQueries({ queryKey: ['budgets'] }),
    client.invalidateQueries({ queryKey: ['merchants'] }),
    client.invalidateQueries({ queryKey: ['wallets'] }),
  ]);
}
