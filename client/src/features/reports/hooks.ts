import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query';
import type { MonthReport, TodayReport, WeekReport } from '@/types/api';

export function useTodayReport() {
  return useQuery({
    queryKey: queryKeys.todayReport,
    queryFn: () => api.get<TodayReport>('/reports/today'),
  });
}

export function useCurrentWeekReport() {
  return useQuery({
    queryKey: queryKeys.currentWeekReport,
    queryFn: () => api.get<WeekReport>('/reports/week/current'),
  });
}

export function useMonthReport(period: string) {
  return useQuery({
    queryKey: queryKeys.monthReport(period),
    queryFn: () => api.get<MonthReport>(`/reports/month/${period}`),
    enabled: Boolean(period),
  });
}

export function useWeekReport(period: string, weekIndex: number) {
  return useQuery({
    queryKey: queryKeys.weekReport(period, weekIndex),
    queryFn: () => api.get<WeekReport>(`/reports/week/${period}/${weekIndex}`),
    enabled: Boolean(period) && weekIndex > 0,
  });
}
