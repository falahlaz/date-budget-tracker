import { CalendarDays, Home, PieChart, Plus, Receipt } from 'lucide-react';
import type { ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/cn';

const TABS = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/week', label: 'Minggu', icon: CalendarDays, end: false },
  { to: '/month', label: 'Bulan', icon: PieChart, end: false },
  { to: '/expenses', label: 'Riwayat', icon: Receipt, end: false },
];

/**
 * The app frame (PRD 9.2): four bottom tabs with a floating add button in the middle.
 *
 * Both live at the bottom of the screen because that is the only region a thumb reaches
 * without re-gripping the phone, and adding an expense has to take seconds (goal G3).
 */
export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col bg-surface-sunken">
      <main className="flex-1 px-4 pb-28 pt-4">{children}</main>

      <nav
        aria-label="Navigasi utama"
        className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-2xl border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]"
      >
        <ul className="grid grid-cols-5 items-center">
          {TABS.slice(0, 2).map((tab) => (
            <TabItem key={tab.to} {...tab} />
          ))}

          <li className="flex justify-center">
            <button
              type="button"
              onClick={() => navigate('/expenses/new', { state: { background: location } })}
              aria-label="Catat pengeluaran"
              className="-mt-6 grid h-14 w-14 place-items-center rounded-full bg-brand text-brand-ink shadow-lg shadow-brand/30 transition-transform active:scale-95"
            >
              <Plus className="h-7 w-7" />
            </button>
          </li>

          {TABS.slice(2).map((tab) => (
            <TabItem key={tab.to} {...tab} />
          ))}
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
    <li>
      <NavLink
        to={to}
        end={end}
        className={({ isActive }) =>
          cn(
            'flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors',
            isActive ? 'text-brand' : 'text-ink-muted',
          )
        }
      >
        <Icon className="h-5 w-5" aria-hidden />
        {label}
      </NavLink>
    </li>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-4 flex items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold text-ink">{title}</h1>
        {subtitle ? <p className="mt-0.5 text-sm text-ink-muted">{subtitle}</p> : null}
      </div>
      {action}
    </header>
  );
}
