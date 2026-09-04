import { useCallback, useEffect, useState } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';

/** Shared with the inline no-flash script in index.html. Changing it here changes it there. */
const STORAGE_KEY = 'datebud-theme';

function isPreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function readThemePreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return isPreference(saved) ? saved : 'system';
  } catch {
    // Private mode can deny storage outright. "system" is the honest answer then.
    return 'system';
  }
}

/**
 * Stamps the preference onto <html>.
 *
 * "system" *removes* the attribute rather than writing a value, which is what hands
 * control back to the prefers-color-scheme block in index.css. Writing data-theme="system"
 * would match neither layer and strand the page on the light palette.
 */
export function applyThemePreference(preference: ThemePreference): void {
  const root = document.documentElement;

  if (preference === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', preference);
  }
}

export function storeThemePreference(preference: ThemePreference): void {
  try {
    if (preference === 'system') {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, preference);
    }
  } catch {
    // The attribute is already stamped, so the current session still looks right; only
    // persistence is lost. Not worth failing the interaction over.
  }
}

/** The theme actually on screen, once the OS has had its say. */
export function resolveTheme(preference: ThemePreference): 'light' | 'dark' {
  if (preference !== 'system') return preference;

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>(readThemePreference);
  const [resolved, setResolved] = useState<'light' | 'dark'>(() => resolveTheme(preference));

  // While the preference is "system" the OS can change under us, so the resolved value
  // has to be watched rather than read once.
  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = () => setResolved(resolveTheme(preference));

    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, [preference]);

  const setTheme = useCallback((next: ThemePreference) => {
    applyThemePreference(next);
    storeThemePreference(next);
    setPreference(next);
  }, []);

  return { preference, resolved, setTheme };
}
