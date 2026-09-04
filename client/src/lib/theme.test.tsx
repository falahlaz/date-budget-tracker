import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveTheme, setTheme, useTheme } from './theme';

/**
 * jsdom has no real prefers-color-scheme, so the OS answer is stubbed per test. Only
 * `matches` and the listener pair are used by the store.
 */
function stubSystem(prefersDark: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: prefersDark,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

/** Two independent consumers, exactly as the header and Settings are. */
function Consumer({ id }: { id: string }) {
  const { preference, resolved } = useTheme();
  return <span data-testid={id}>{`${preference}/${resolved}`}</span>;
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  stubSystem(false);
  // The store caches its snapshot across tests in the module, so reset it through the
  // public API rather than reaching into module internals.
  act(() => setTheme('system'));
});

describe('theme store', () => {
  it('keeps every consumer in step when one of them sets the theme', () => {
    render(
      <>
        <Consumer id="header" />
        <Consumer id="settings" />
      </>,
    );

    expect(screen.getByTestId('header').textContent).toBe('system/light');
    expect(screen.getByTestId('settings').textContent).toBe('system/light');

    // The header toggle fires. Settings must move with it -- when each consumer held its
    // own useState, this is the assertion that failed and the toggle looked half-broken.
    act(() => setTheme('dark'));

    expect(screen.getByTestId('header').textContent).toBe('dark/dark');
    expect(screen.getByTestId('settings').textContent).toBe('dark/dark');
  });

  it('stamps data-theme for an explicit choice and clears it for system', () => {
    render(<Consumer id="header" />);

    act(() => setTheme('dark'));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    act(() => setTheme('light'));
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');

    // "system" removes the attribute rather than writing a value: data-theme="system"
    // would match neither CSS layer and strand the page on the light palette.
    act(() => setTheme('system'));
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('persists an explicit choice and forgets it again on system', () => {
    render(<Consumer id="header" />);

    act(() => setTheme('dark'));
    expect(localStorage.getItem('datebud-theme')).toBe('dark');

    act(() => setTheme('system'));
    expect(localStorage.getItem('datebud-theme')).toBeNull();
  });

  it('resolves system against the OS, and an explicit choice against itself', () => {
    stubSystem(true);
    expect(resolveTheme('system')).toBe('dark');
    expect(resolveTheme('light')).toBe('light');

    stubSystem(false);
    expect(resolveTheme('system')).toBe('light');
    expect(resolveTheme('dark')).toBe('dark');
  });
});
