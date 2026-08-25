import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { api, setAccessToken, setSessionLostHandler } from '@/lib/api';
import type { AuthUser, LoginResponse } from '@/types/api';

interface AuthState {
  user: AuthUser | null;
  status: 'loading' | 'authenticated' | 'anonymous';
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/** Refresh this many seconds before the access token actually expires. */
const REFRESH_MARGIN_SECONDS = 60;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthState['status']>('loading');
  const refreshTimer = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (refreshTimer.current !== null) {
      window.clearTimeout(refreshTimer.current);
      refreshTimer.current = null;
    }
  }, []);

  /**
   * Renews the access token shortly before it expires.
   *
   * Without this, an app left open on the home screen would hit a 401 on the user's next
   * tap and only recover after a retry; the refresh cookie makes it invisible instead.
   */
  const scheduleRefresh = useCallback(
    (expiresIn: number) => {
      clearTimer();
      const delay = Math.max(expiresIn - REFRESH_MARGIN_SECONDS, 30) * 1000;

      refreshTimer.current = window.setTimeout(() => {
        void api.refreshSession().then((ok) => {
          if (ok) scheduleRefresh(expiresIn);
          else setStatus('anonymous');
        });
      }, delay);
    },
    [clearTimer],
  );

  const signOutLocally = useCallback(() => {
    clearTimer();
    setAccessToken(null);
    setUser(null);
    setStatus('anonymous');
  }, [clearTimer]);

  // A reload has no access token in memory, but the refresh cookie survives -- so try to
  // resume the session before showing the login screen.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const restored = await api.refreshSession();

      if (!restored) {
        if (!cancelled) setStatus('anonymous');
        return;
      }

      try {
        const me = await api.get<AuthUser>('/auth/me');
        if (cancelled) return;
        setUser(me);
        setStatus('authenticated');
        scheduleRefresh(15 * 60);
      } catch {
        if (!cancelled) setStatus('anonymous');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [scheduleRefresh]);

  useEffect(() => {
    setSessionLostHandler(signOutLocally);
    return () => setSessionLostHandler(null);
  }, [signOutLocally]);

  useEffect(() => clearTimer, [clearTimer]);

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await api.post<LoginResponse>('/auth/login', { email, password });
      setAccessToken(result.accessToken);
      setUser(result.user);
      setStatus('authenticated');
      scheduleRefresh(result.expiresIn);
    },
    [scheduleRefresh],
  );

  const logout = useCallback(async () => {
    try {
      await api.post<void>('/auth/logout');
    } finally {
      signOutLocally();
    }
  }, [signOutLocally]);

  const value = useMemo<AuthState>(
    () => ({ user, status, login, logout }),
    [user, status, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
