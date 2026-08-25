import { QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider } from '@/features/auth/auth-context';
import { createQueryClient } from '@/lib/query';
import { AppRoutes } from '@/routes/app-routes';

export function App() {
  // Created once per mount so React strict mode's double-render cannot spawn two caches.
  const [queryClient] = useState(createQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
          <Toaster position="top-center" richColors closeButton />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
