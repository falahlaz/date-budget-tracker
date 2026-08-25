import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { LoadingBlock } from '@/components/ui/feedback';
import { useAuth } from '@/features/auth/auth-context';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <LoadingBlock label="Menyiapkan sesi…" />;
  if (status === 'anonymous') return <Navigate to="/login" replace state={{ from: location }} />;

  return <>{children}</>;
}
