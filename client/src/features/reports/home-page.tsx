import { ArrowRight, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { EmptyState, ErrorState, LoadingBlock, Skeleton } from '@/components/ui/feedback';
import { Money, OverBadge, toneFor } from '@/components/ui/money';
import { useExpenses } from '@/features/expenses/hooks';
import { ExpenseRow } from '@/features/expenses/expense-row';
import { cn } from '@/lib/cn';
import { formatPeriodLong, formatRupiah, formatWeekdayShort } from '@/lib/format';
import type { DayRow, TodayReport, WeekReport } from '@/types/api';
import { useCurrentWeekReport, useTodayReport } from './hooks';

/**
 * S2 Home / Today (PRD 9.3).
 *
 * The screen answers one question first -- "how much can I spend right now" -- and then
 * immediately shows what today's restraint buys at the weekend. That second card is the
 * whole product thesis made visible.
 */
export function HomePage() {
  const today = useTodayReport();
  const week = useCurrentWeekReport();

  if (today.isLoading || week.isLoading) return <LoadingBlock />;
  if (today.error) return <ErrorState message={(today.error as Error).message} onRetry={() => today.refetch()} />;
  if (!today.data || !week.data) return null;

  const period = today.data.date.slice(0, 7);
  const hasBudget = week.data.weekBudget > 0 || today.data.dayBudget > 0;

  return (
    <>
      <PageHeader
        title="Hari ini"
        subtitle={formatPeriodLong(period)}
        action={
          hasBudget ? undefined : (
            <Button asChild size="md" variant="secondary">
              <Link to="/budget">Set budget</Link>
            </Button>
          )
        }
      />

      {!hasBudget ? <NoBudgetNotice period={period} /> : null}

      <div className="flex flex-col gap-3">
        <HeroCard today={today.data} week={week.data} />
        <WeekendProjectionCard today={today.data} week={week.data} />
        <WeekStrip days={week.data.days} weekIndex={week.data.weekIndex} />
        <RecentExpenses />
      </div>
    </>
  );
}

function NoBudgetNotice({ period }: { period: string }) {
  return (
    <Card className="mb-3 border-brand/30 bg-brand-soft">
      <p className="text-sm font-semibold text-ink">Belum ada budget buat {formatPeriodLong(period)}</p>
      <p className="mt-1 text-xs text-ink-muted">
        Pengeluaran tetap bisa dicatat, tapi angka jatah harian baru muncul setelah budget di-set.
      </p>
      <Button asChild className="mt-3" size="md">
        <Link to="/budget">Set budget bulan ini</Link>
      </Button>
    </Card>
  );
}

/** Weekdays show today's allowance; weekends show what is left of the weekend budget. */
function HeroCard({ today, week }: { today: TodayReport; week: WeekReport }) {
  const isWeekend = today.dayType === 'WEEKEND';
  const value = isWeekend ? week.weekendBudget - week.weekendSpent : today.remaining;
  const total = isWeekend ? week.weekendBudget : today.dayBudget;
  const tone = toneFor(value, total);

  return (
    <Card className="relative overflow-hidden">
      <p className="text-xs font-medium text-ink-muted">
        {isWeekend ? `Sisa jatah weekend W${week.weekIndex}` : 'Sisa hari ini'}
      </p>

      <p
        className={cn(
          'tabular mt-1 text-4xl font-bold',
          tone === 'over' ? 'text-over' : tone === 'warn' ? 'text-warn' : 'text-ink',
        )}
      >
        {formatRupiah(value)}
      </p>

      <div className="mt-1 flex items-center gap-2">
        <p className="text-sm text-ink-muted">
          {isWeekend
            ? `dari ${formatRupiah(week.weekendBudget)} buat weekend ini`
            : `dari ${formatRupiah(today.dayBudget)} jatah hari ini`}
        </p>
        {value < 0 ? <OverBadge /> : null}
      </div>

      <ProgressRing value={total > 0 ? Math.min(Math.max((total - value) / total, 0), 1) : 0} tone={tone} />
    </Card>
  );
}

function ProgressRing({ value, tone }: { value: number; tone: ReturnType<typeof toneFor> }) {
  const stroke = tone === 'over' ? 'var(--color-over)' : tone === 'warn' ? 'var(--color-warn)' : 'var(--color-safe)';
  const circumference = 2 * Math.PI * 26;

  return (
    <svg
      viewBox="0 0 60 60"
      className="absolute right-4 top-4 h-14 w-14 -rotate-90"
      aria-hidden
    >
      <circle cx="30" cy="30" r="26" fill="none" stroke="var(--color-surface-sunken)" strokeWidth="7" />
      <circle
        cx="30"
        cy="30"
        r="26"
        fill="none"
        stroke={stroke}
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - value)}
      />
    </svg>
  );
}

/**
 * The discipline card (PRD 9.3, item 3).
 *
 * Phrased as a consequence rather than a statistic, because "spend nothing more today and
 * the weekend has X" is what actually changes behaviour.
 */
function WeekendProjectionCard({ today, week }: { today: TodayReport; week: WeekReport }) {
  if (today.dayType === 'WEEKEND') {
    return (
      <Card>
        <p className="text-sm text-ink">
          Sisa minggu ini bakal jadi rollover ke minggu depan:{' '}
          <Money amount={week.weekRemaining} className="font-semibold" />
        </p>
      </Card>
    );
  }

  return (
    <Card className="bg-brand-soft">
      <p className="text-sm text-ink">
        Kalau ga jajan lagi hari ini, weekend nanti dapet{' '}
        <Money amount={week.projection.weekendBudgetIfNoMoreWeekdaySpend} className="font-bold" />
      </p>
      <p className="mt-1 text-xs text-ink-muted">
        Masih ada {week.projection.remainingWeekdayDays} hari kerja di minggu ini.
      </p>
    </Card>
  );
}

/** The seven-day strip (PRD 9.3, item 4). */
function WeekStrip({ days, weekIndex }: { days: DayRow[]; weekIndex: number }) {
  return (
    <Card>
      <CardHeader
        title={`Minggu ke-${weekIndex}`}
        action={
          <Link to="/week" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-text">
            Detail <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        }
      />

      <ul className="grid grid-cols-7 gap-1">
        {days.map((day) => (
          <li key={day.date}>
            <DayDot day={day} />
          </li>
        ))}
      </ul>
    </Card>
  );
}

function DayDot({ day }: { day: DayRow }) {
  const tone = day.dayType === 'WEEKEND' ? 'neutral' : toneFor(day.remaining, day.dayBudget);
  const usedNothing = day.spent === 0;

  const background =
    tone === 'over'
      ? 'bg-over text-white'
      : tone === 'warn'
        ? 'bg-warn text-white'
        : usedNothing
          ? 'bg-surface-sunken text-ink-muted'
          : 'bg-safe text-white';

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[10px] font-medium text-ink-subtle">{formatWeekdayShort(day.date)}</span>
      <span
        className={cn(
          'grid h-8 w-8 place-items-center rounded-full text-[11px] font-semibold',
          background,
          day.isToday && 'ring-2 ring-brand ring-offset-2 ring-offset-[var(--color-surface-raised)]',
        )}
        title={`${day.date}: ${formatRupiah(day.spent)} terpakai`}
      >
        {Number(day.date.slice(8))}
      </span>
      {day.remaining < 0 ? <span className="text-[9px] font-bold text-over">OVER</span> : null}
    </div>
  );
}

function RecentExpenses() {
  const { data, isLoading } = useExpenses({ limit: 5 });

  return (
    <Card>
      <CardHeader
        title="Pengeluaran terakhir"
        action={
          <Link to="/expenses" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-text">
            Semua <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        }
      />

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      ) : data && data.items.length > 0 ? (
        <ul className="divide-y divide-line">
          {data.items.map((expense) => (
            <ExpenseRow key={expense.id} expense={expense} />
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={<Wallet className="h-8 w-8" />}
          title="Belum ada pengeluaran"
          description="Tap tombol + buat catat pengeluaran pertama."
        />
      )}
    </Card>
  );
}
