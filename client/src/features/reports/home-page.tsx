import { Wallet } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { ButterCard, Card } from '@/components/ui/card';
import { EmptyState, ErrorState, LoadingBlock, Meter, Skeleton } from '@/components/ui/feedback';
import { Money, MoneyHero, TONE_FILL, toneFor } from '@/components/ui/money';
import { SectionHead, SectionLink } from '@/components/ui/section';
import { useExpenses } from '@/features/expenses/hooks';
import { ExpenseRow } from '@/features/expenses/expense-row';
import { cn } from '@/lib/cn';
import { formatDateLong, formatPeriodLong, formatRupiah, formatWeekdayShort } from '@/lib/format';
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
  if (today.error)
    return <ErrorState message={(today.error as Error).message} onRetry={() => today.refetch()} />;
  if (!today.data || !week.data) return null;

  const period = today.data.date.slice(0, 7);
  const hasBudget = week.data.weekBudget > 0 || today.data.dayBudget > 0;

  return (
    <>
      <PageHeader
        eyebrow={formatDateLong(today.data.date)}
        title="Hari ini"
        action={
          hasBudget ? undefined : (
            <Button asChild size="md" variant="secondary">
              <Link to="/budget">Set budget</Link>
            </Button>
          )
        }
      />

      {!hasBudget ? <NoBudgetNotice period={period} /> : null}

      <Hero today={today.data} week={week.data} />
      <WeekendProjection today={today.data} week={week.data} />
      <WeekStrip days={week.data.days} weekIndex={week.data.weekIndex} />
      <RecentExpenses />
    </>
  );
}

function NoBudgetNotice({ period }: { period: string }) {
  return (
    <Card className="mb-6 border-accent-line bg-accent-soft">
      <p className="text-sm font-semibold text-ink">
        Belum ada budget buat {formatPeriodLong(period)}
      </p>
      <p className="mt-1 text-xs text-ink-2">
        Pengeluaran tetap bisa dicatat, tapi angka jatah harian baru muncul setelah budget
        di-set.
      </p>
      <Button asChild className="mt-4" size="md">
        <Link to="/budget">Set budget bulan ini</Link>
      </Button>
    </Card>
  );
}

/**
 * The number of the screen. No card, no border, no shadow -- it sits straight on the
 * ground.
 *
 * That is deliberate: if every block gets a box then nothing outranks anything else, and
 * this figure is the one thing the screen exists to say. Weekdays show today's allowance;
 * weekends show what is left of the weekend budget.
 */
function Hero({ today, week }: { today: TodayReport; week: WeekReport }) {
  const isWeekend = today.dayType === 'WEEKEND';
  const value = isWeekend ? week.weekendBudget - week.weekendSpent : today.remaining;
  const total = isWeekend ? week.weekendBudget : today.dayBudget;
  const spent = isWeekend ? week.weekendSpent : today.spent;
  const tone = toneFor(value, total);

  return (
    <section className="mb-7">
      <div className="label-micro mb-2">
        {isWeekend ? `Sisa jatah weekend W${week.weekIndex}` : 'Sisa hari ini'}
      </div>

      <MoneyHero amount={value} tone={tone} />

      <Meter value={spent} max={total} fillClassName={TONE_FILL[tone]} className="mt-3.5" />

      <div className="mt-3 flex items-baseline justify-between gap-3 text-[13px] text-ink-2">
        <span>
          dari{' '}
          <b className="tabular font-semibold text-ink">
            {formatRupiah(total)}
          </b>{' '}
          {isWeekend ? 'jatah weekend' : 'jatah harian'}
        </span>
        <span>
          terpakai <b className="tabular font-semibold text-ink">{formatRupiah(spent)}</b>
        </span>
      </div>
    </section>
  );
}

/**
 * The discipline card (PRD 9.3, item 3).
 *
 * Butter, because a weekend is the only thing butter ever marks. Phrased as a consequence
 * rather than a statistic: "spend nothing more today and the weekend has X" is what
 * actually changes behaviour.
 */
function WeekendProjection({ today, week }: { today: TodayReport; week: WeekReport }) {
  if (today.dayType === 'WEEKEND') {
    return (
      <Card className="mb-7">
        <div className="label-micro mb-2.5">Rollover ke minggu depan</div>
        <p className="text-[13px] leading-snug text-ink-2">
          Sisa minggu ini bakal jadi jatah tambahan minggu depan
        </p>
        <div className="mt-1.5">
          <Money amount={week.weekRemaining} className="amount-display text-3xl" />
        </div>
      </Card>
    );
  }

  return (
    <ButterCard className="mb-7">
      <div className="mb-2.5 font-mono text-[10px] font-medium tracking-[0.14em] text-butter-ink uppercase">
        Proyeksi weekend
      </div>
      <p className="text-[13px] leading-snug text-ink-2">
        Kalau ga jajan lagi hari ini, weekend nanti dapet
      </p>
      <p className="amount-display mt-1.5 text-3xl text-ink">
        {formatRupiah(week.projection.weekendBudgetIfNoMoreWeekdaySpend)}
      </p>
      <p className="mt-2 text-[11.5px] text-ink-3">
        Masih ada {week.projection.remainingWeekdayDays} hari kerja di minggu ini.
      </p>
    </ButterCard>
  );
}

/** The seven-day strip (PRD 9.3, item 4). */
function WeekStrip({ days, weekIndex }: { days: DayRow[]; weekIndex: number }) {
  const navigate = useNavigate();

  return (
    <section className="mb-7">
      <SectionHead
        title={`Minggu ini · W${weekIndex}`}
        action={<SectionLink onClick={() => navigate('/week')}>Lihat rincian</SectionLink>}
      />

      {/* Figures are thousands of rupiah -- seven cells have no room for a full amount,
          and the exact figure is one tap away on /week. */}
      <ul className="grid grid-cols-7 gap-1.5">
        {days.map((day) => (
          <li key={day.date}>
            <DayCell day={day} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * One day of the strip.
 *
 * Weekend days take the butter surface; the bar inside carries the safe/warn/over tone.
 * The two never collide because butter is only ever the card and warn is only ever the
 * fill -- one is the ground, the other is the reading.
 */
function DayCell({ day }: { day: DayRow }) {
  const isWeekend = day.dayType === 'WEEKEND';
  const tone = toneFor(day.remaining, day.dayBudget);
  const spentNothing = day.spent === 0;

  return (
    <div
      className={cn(
        'flex flex-col items-center gap-1.5 rounded-md border px-0.5 py-2.5',
        'transition-[background-color,border-color] duration-[var(--t-base)] ease-out',
        isWeekend ? 'border-butter-line bg-butter-soft' : 'border-line bg-surface',
        day.isToday && 'border-accent ring-2 ring-accent-soft',
      )}
      title={`${day.date}: ${formatRupiah(day.spent)} terpakai`}
    >
      <span className="font-mono text-[9px] font-medium tracking-[0.06em] text-ink-3 uppercase">
        {formatWeekdayShort(day.date)}
      </span>
      <span
        className={cn(
          'tabular text-[13px] font-semibold',
          spentNothing ? 'text-ink-3' : day.isToday ? 'text-ink' : 'text-ink-2',
        )}
      >
        {spentNothing ? '—' : day.spent < 1000 ? '<1' : Math.round(day.spent / 1000)}
      </span>
      <Meter
        value={day.spent}
        max={day.dayBudget}
        size="sm"
        fillClassName={isWeekend && day.remaining >= 0 ? 'bg-butter' : TONE_FILL[tone]}
      />
      {day.remaining < 0 ? (
        <span className="font-mono text-[8px] font-semibold tracking-wide text-neg">OVER</span>
      ) : null}
    </div>
  );
}

function RecentExpenses() {
  const navigate = useNavigate();
  const { data, isLoading } = useExpenses({ limit: 5 });

  return (
    <section>
      <SectionHead
        title="Terakhir dicatat"
        action={<SectionLink onClick={() => navigate('/expenses')}>Semua</SectionLink>}
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
    </section>
  );
}
