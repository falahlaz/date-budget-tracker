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
import { DepositSheet } from '@/features/savings/deposit-sheet';
import { SavingsHomePage } from '@/features/savings/savings-home-page';
import { SavingsMonthPage } from '@/features/savings/savings-month-page';
import { WithdrawSheet } from '@/features/savings/withdraw-sheet';
import { WalletProvider, useActiveWalletType } from '@/features/wallets/wallet-context';
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
 * Quick add, Setor and Tarik are routes so a button, a deep link and the back gesture all
 * behave the same way, but each renders as a sheet over whatever screen is underneath
 * rather than replacing it.
 */
function ShellRoutes() {
  const location = useLocation();
  const navigate = useNavigate();
  const walletType = useActiveWalletType();
  const savings = walletType === 'SAVINGS';

  const close = () => navigate(-1);

  return (
    <AppShell>
      {/*
        The path stays the same and the wallet type decides which screen answers it. That
        keeps every deep link and the back gesture working across a wallet switch, and it
        is the honest reading of section 11.1: "/" means "this wallet's home", and the two
        types genuinely have different homes.
      */}
      <Routes>
        <Route path="/" element={savings ? <SavingsHomePage /> : <HomePage />} />
        <Route
          path="/month"
          element={
            savings ? (
              <SavingsMonthPage />
            ) : (
              <Suspense fallback={<LoadingBlock />}>
                <MonthlyPage />
              </Suspense>
            )
          }
        />

        {/* A savings wallet has no week segments and no monthly budget, so these two have
            nothing to render rather than an empty state to show. */}
        <Route path="/week" element={savings ? <Navigate to="/" replace /> : <WeeklyPage />} />
        <Route path="/budget" element={savings ? <Navigate to="/" replace /> : <BudgetPage />} />

        {/* Riwayat serves both types: the list is wallet-scoped already. */}
        <Route path="/expenses" element={<ExpenseListPage />} />
        <Route path="/expenses/new" element={<ExpenseListPage />} />
        <Route path="/expenses/:id" element={<ExpenseDetailPage />} />
        <Route path="/savings/deposit" element={savings ? <SavingsHomePage /> : <Navigate to="/" replace />} />
        <Route path="/savings/withdraw" element={savings ? <SavingsHomePage /> : <Navigate to="/" replace />} />

        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      <QuickAddSheet open={location.pathname === '/expenses/new'} onClose={close} />
      <DepositSheet open={savings && location.pathname === '/savings/deposit'} onClose={close} />
      <WithdrawSheet open={savings && location.pathname === '/savings/withdraw'} onClose={close} />
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
            {/* Inside the protected route: the wallet list is an authenticated request,
                and asking for it before there is a session would only ever 401. */}
            <WalletProvider>
              <ShellRoutes />
            </WalletProvider>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
