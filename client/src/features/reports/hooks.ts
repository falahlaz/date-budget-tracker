import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query';
import { useActiveWalletId } from '@/features/wallets/wallet-context';
import type { MonthReport, TodayReport, WeekReport } from '@/types/api';

/**
 * The date-budget screens, scoped to the active wallet (PRD v2 10.1).
 *
 * Each query waits on the wallet id rather than guessing one: firing against the wrong
 * wallet would render a whole screen of plausible, wrong numbers.
 */
export function useTodayReport() {
  const walletId = useActiveWalletId();

  return useQuery({
    queryKey: queryKeys.todayReport(walletId),
    queryFn: () => api.get<TodayReport>(`/wallets/${walletId}/reports/today`),
    enabled: walletId !== undefined,
  });
}

export function useCurrentWeekReport() {
  const walletId = useActiveWalletId();

  return useQuery({
    queryKey: queryKeys.currentWeekReport(walletId),
    queryFn: () => api.get<WeekReport>(`/wallets/${walletId}/reports/week/current`),
    enabled: walletId !== undefined,
  });
}

export function useMonthReport(period: string) {
  const walletId = useActiveWalletId();

  return useQuery({
    queryKey: queryKeys.monthReport(walletId, period),
    queryFn: () => api.get<MonthReport>(`/wallets/${walletId}/reports/month/${period}`),
    enabled: walletId !== undefined && Boolean(period),
  });
}

export function useWeekReport(period: string, weekIndex: number) {
  const walletId = useActiveWalletId();

  return useQuery({
    queryKey: queryKeys.weekReport(walletId, period, weekIndex),
    queryFn: () => api.get<WeekReport>(`/wallets/${walletId}/reports/week/${period}/${weekIndex}`),
    enabled: walletId !== undefined && Boolean(period) && weekIndex > 0,
  });
}
