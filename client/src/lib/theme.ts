import { useSyncExternalStore } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

/** Shared with the inline no-flash script in index.html. Changing it here changes it there. */
const STORAGE_KEY = 'budget-tracker-theme';

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
export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference !== 'system') return preference;

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * The theme is one value for the whole app, so it lives in a module-level store rather
 * than in each caller's useState.
 *
 * Two components each holding their own copy is the bug this shape exists to prevent: the
 * header toggle would stamp the attribute and persist the choice while the Segmented
 * control in Settings went on rendering whatever it read at mount. There is exactly one
 * <html> element, so there is exactly one source of truth for what is on it.
 */
type Snapshot = { preference: ThemePreference; resolved: ResolvedTheme };

let snapshot: Snapshot | null = null;
const listeners = new Set<() => void>();

function currentSnapshot(): Snapshot {
  // Cached because useSyncExternalStore compares snapshots by identity: returning a fresh
  // object on every read would re-render forever.
  if (snapshot === null) {
    const preference = readThemePreference();
    snapshot = { preference, resolved: resolveTheme(preference) };
  }

  return snapshot;
}

function publish(preference: ThemePreference): void {
  snapshot = { preference, resolved: resolveTheme(preference) };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  // While the preference is "system" the OS can change under us, so the resolved value has
  // to be watched rather than read once. One listener serves every subscriber.
  const query = window.matchMedia('(prefers-color-scheme: dark)');
  const onSystemChange = () => publish(currentSnapshot().preference);
  query.addEventListener('change', onSystemChange);

  return () => {
    listeners.delete(listener);
    query.removeEventListener('change', onSystemChange);
  };
}

export function setTheme(next: ThemePreference): void {
  applyThemePreference(next);
  storeThemePreference(next);
  publish(next);
}

export function useTheme(): Snapshot & { setTheme: typeof setTheme } {
  const { preference, resolved } = useSyncExternalStore(subscribe, currentSnapshot, () => ({
    preference: 'system' as const,
    resolved: 'light' as const,
  }));

  return { preference, resolved, setTheme };
}
