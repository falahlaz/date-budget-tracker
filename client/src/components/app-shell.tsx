import { CalendarDays, Home, Moon, PieChart, Plus, Receipt, Settings, Sun } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { useTheme } from '@/lib/theme';

const TABS = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/week', label: 'Minggu', icon: CalendarDays, end: false },
  { to: '/month', label: 'Bulan', icon: PieChart, end: false },
  { to: '/expenses', label: 'Riwayat', icon: Receipt, end: false },
];

/**
 * The app frame (PRD 9.2): four bottom tabs and the add button, all inside one bar.
 *
 * Everything lives at the bottom because that is the only region a thumb reaches without
 * re-gripping the phone, and adding an expense has to take seconds (goal G3).
 *
 * The add button used to float above the bar. It no longer does: a circle hovering over a
 * scrolling list sits on top of exactly the thing the list exists to show -- the amounts
 * in the last row. Inside the bar it is just as reachable and covers nothing.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col bg-bg">
      <main className="flex-1 px-5 pt-6 pb-28">{children}</main>

      <nav
        aria-label="Navigasi utama"
        className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-2xl border-t border-line pb-[env(safe-area-inset-bottom)] backdrop-blur-[16px]"
        style={{ backgroundColor: 'color-mix(in srgb, var(--surface) 92%, transparent)' }}
      >
        <ul className="flex items-center gap-1 px-3 py-2">
          {TABS.map((tab) => (
            <TabItem key={tab.to} {...tab} />
          ))}

          <li className="flex shrink-0 pl-1.5">
            <button
              type="button"
              onClick={() => navigate('/expenses/new', { state: { background: location } })}
              aria-label="Catat pengeluaran"
              className="grid h-11 w-13 place-items-center rounded-md bg-accent text-accent-on transition-transform duration-[var(--t-fast)] ease-[var(--ease-spring)] hover:-translate-y-px active:scale-[0.93]"
              style={{ boxShadow: '0 6px 16px -8px color-mix(in srgb, var(--accent) 80%, transparent)' }}
            >
              <Plus className="h-5 w-5" />
            </button>
          </li>
        </ul>
      </nav>
    </div>
  );
}

function TabItem({
  to,
  label,
  icon: Icon,
  end,
}: {
  to: string;
  label: string;
  icon: typeof Home;
  end: boolean;
}) {
  return (
    <li className="min-w-0 flex-1">
      <NavLink
        to={to}
        end={end}
        data-tap
        className={({ isActive }) =>
          cn(
            'flex h-12 flex-col items-center justify-center gap-1 rounded-sm text-[10.5px] font-medium',
            'transition-colors duration-[var(--t-fast)] ease-out active:scale-95',
            isActive ? 'text-accent-ink' : 'text-ink-3',
          )
        }
      >
        <Icon className="h-5 w-5" aria-hidden />
        {label}
      </NavLink>
    </li>
  );
}

/**
 * The screen header: a mono eyebrow over a Fraunces title.
 *
 * The eyebrow is where the date or period lives, so the title can stay a name rather than
 * growing into a sentence.
 */
export function PageHeader({
  title,
  subtitle,
  eyebrow,
  action,
  chrome = true,
}: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  action?: ReactNode;
  /** Off on Settings itself, where both controls point at the screen you are on. */
  chrome?: boolean;
}) {
  return (
    <header className="mb-6 flex items-start justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? <div className="label-micro mb-2">{eyebrow}</div> : null}
        <h1 className="title-display text-2xl text-ink">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-ink-2">{subtitle}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {action}
        {chrome ? <HeaderChrome /> : null}
      </div>
    </header>
  );
}

/**
 * The two controls every screen carries: flip the theme, or open Settings.
 *
 * Settings had a route and no way in -- the only way to reach it was to type the URL --
 * so everything behind it, the theme control included, may as well not have existed.
 */
export function HeaderChrome() {
  const { resolved, setTheme } = useTheme();
  const next = resolved === 'dark' ? 'light' : 'dark';

  return (
    <>
      <button
        type="button"
        // Flips against what is on screen rather than against the stored preference, so a
        // tap while on "Sistem" pins a real choice instead of appearing to do nothing.
        onClick={() => setTheme(next)}
        aria-label={next === 'dark' ? 'Ganti ke mode gelap' : 'Ganti ke mode terang'}
        className={ICON_BUTTON}
      >
        {resolved === 'dark' ? (
          <Sun className="h-5 w-5" aria-hidden />
        ) : (
          <Moon className="h-5 w-5" aria-hidden />
        )}
      </button>

      <Link to="/settings" aria-label="Pengaturan" data-tap className={ICON_BUTTON}>
        <Settings className="h-5 w-5" aria-hidden />
      </Link>
    </>
  );
}

const ICON_BUTTON =
  'grid h-11 w-11 shrink-0 place-items-center rounded-sm text-ink-3 transition-colors duration-[var(--t-fast)] ease-out hover:bg-surface-2 hover:text-ink-2 active:scale-95';
