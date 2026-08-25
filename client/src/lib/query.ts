import { QueryClient } from '@tanstack/react-query';

/**
 * Query keys.
 *
 * Every mutation invalidates `reports` wholesale (PRD 10.1): changing one expense can move
 * the numbers for its week, its month, and every month after it, so a surgical
 * invalidation would be wrong more often than right.
 */
export const queryKeys = {
  me: ['me'] as const,
  categories: (includeArchived = false) => ['categories', includeArchived] as const,
  budgets: ['budgets'] as const,
  budget: (period: string) => ['budget', period] as const,
  expenses: (filters: Record<string, unknown>) => ['expenses', filters] as const,
  expense: (id: number) => ['expense', id] as const,
  merchants: (q: string) => ['merchants', q] as const,
  reports: ['reports'] as const,
  monthReport: (period: string) => ['reports', 'month', period] as const,
  weekReport: (period: string, weekIndex: number) => ['reports', 'week', period, weekIndex] as const,
  currentWeekReport: ['reports', 'week', 'current'] as const,
  todayReport: ['reports', 'today'] as const,
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

/** Called after any mutation that can move a budget number. */
export async function invalidateReports(client: QueryClient): Promise<void> {
  await Promise.all([
    client.invalidateQueries({ queryKey: queryKeys.reports }),
    client.invalidateQueries({ queryKey: ['expenses'] }),
    client.invalidateQueries({ queryKey: queryKeys.budgets }),
    client.invalidateQueries({ queryKey: ['merchants'] }),
  ]);
}
