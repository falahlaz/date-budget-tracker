import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { AppShell } from '@/components/app-shell';
import { LoginPage } from '@/features/auth/login-page';
import { BudgetPage } from '@/features/budget/budget-page';
import { SettingsPage } from '@/features/categories/settings-page';
import { ExpenseDetailPage } from '@/features/expenses/expense-detail-page';
import { ExpenseListPage } from '@/features/expenses/expense-list-page';
import { QuickAddSheet } from '@/features/expenses/quick-add-sheet';
import { HomePage } from '@/features/reports/home-page';
import { WeeklyPage } from '@/features/reports/weekly-page';
import { LoadingBlock } from '@/components/ui/feedback';
import { ProtectedRoute } from './protected-route';

/**
 * The monthly dashboard is the only screen that pulls in Recharts, which is most of the
 * bundle. Loading it on demand keeps the first paint of the home screen -- the one opened
 * many times a day -- small.
 */
const MonthlyPage = lazy(() =>
  import('@/features/reports/monthly-page').then((module) => ({ default: module.MonthlyPage })),
);

/**
 * Quick add is a route so the + button, a deep link and the back gesture all behave the
 * same way, but it renders as a sheet over whatever screen is underneath rather than
 * replacing it.
 */
function ShellRoutes() {
  const location = useLocation();
  const navigate = useNavigate();
  const quickAddOpen = location.pathname === '/expenses/new';

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/week" element={<WeeklyPage />} />
        <Route
          path="/month"
          element={
            <Suspense fallback={<LoadingBlock />}>
              <MonthlyPage />
            </Suspense>
          }
        />
        <Route path="/expenses" element={<ExpenseListPage />} />
        <Route path="/expenses/new" element={<ExpenseListPage />} />
        <Route path="/expenses/:id" element={<ExpenseDetailPage />} />
        <Route path="/budget" element={<BudgetPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      <QuickAddSheet open={quickAddOpen} onClose={() => navigate(-1)} />
    </AppShell>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="*"
        element={
          <ProtectedRoute>
            <ShellRoutes />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
