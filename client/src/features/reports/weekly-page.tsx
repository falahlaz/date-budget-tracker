import { useState } from 'react';
import { PageHeader } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/feedback';
import { Money, OverBadge, toneFor } from '@/components/ui/money';
import { ExpenseRow } from '@/features/expenses/expense-row';
import { useExpenses } from '@/features/expenses/hooks';
import { cn } from '@/lib/cn';
import { formatDateRange, formatDayShort, formatRupiah, formatWeekdayShort } from '@/lib/format';
import { currentPeriod, shiftPeriod } from '@/lib/today';
import type { DayRow, WeekReport } from '@/types/api';
import { useCurrentWeekReport, useMonthReport, useWeekReport } from './hooks';

/** S3 Weekly Dashboard (PRD 9.4). */
export function WeeklyPage() {
  const current = useCurrentWeekReport();
  const [selection, setSelection] = useState<{ period: string; weekIndex: number } | null>(null);

  const period = selection?.period ?? current.data?.period ?? currentPeriod();
  const month = useMonthReport(period);
  const weekIndex = selection?.weekIndex ?? current.data?.weekIndex ?? 1;
  const week = useWeekReport(period, weekIndex);

  if (current.isLoading || week.isLoading) return <LoadingBlock />;
  if (week.error) return <ErrorState message={(week.error as Error).message} onRetry={() => week.refetch()} />;
  if (!week.data) return null;

  const weekCount = month.data?.weeks.length ?? 5;

  const step = (delta: number) => {
    const next = weekIndex + delta;

    if (next < 1) {
      const previousPeriod = shiftPeriod(period, -1);
      setSelection({ period: previousPeriod, weekIndex: 6 });
      return;
    }
    if (next > weekCount) {
      setSelection({ period: shiftPeriod(period, 1), weekIndex: 1 });
      return;
    }

    setSelection({ period, weekIndex: next });
  };

  return (
    <>
      <PageHeader title="Minggu ini" />

      <div className="mb-3 flex items-center gap-2">
        <Button variant="secondary" size="icon" onClick={() => step(-1)} aria-label="Minggu sebelumnya">
          ‹
        </Button>
        <span className="flex-1 text-center text-sm font-semibold text-ink">
          W{week.data.weekIndex} · {formatDateRange(week.data.startDate, week.data.endDate)}
        </span>
        <Button variant="secondary" size="icon" onClick={() => step(1)} aria-label="Minggu berikutnya">
          ›
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        {week.data.weekdayDays === 0 ? <NoWeekdayBanner /> : null}
        <BreakdownCard week={week.data} />
        <DayTable days={week.data.days} />
        <WeekExpenses period={week.data.period} weekIndex={week.data.weekIndex} />
      </div>
    </>
  );
}

/** PRD 6.1: the first week of a month that opens on a weekend has no allowance yet. */
function NoWeekdayBanner() {
  return (
    <Card className="border-warn/30 bg-warn-soft">
      <p className="text-sm text-warn">
        Minggu ini belum ada jatah weekday, budget weekend-nya minus dulu dan ketutup minggu depan.
      </p>
    </Card>
  );
}

/**
 * The receipt-style breakdown (PRD 9.4).
 *
 * Laid out as a running total rather than a set of statistics, because the point is to
 * make the chain visible: weekday allowance, minus what was spent, plus last week's
 * leftovers, equals the weekend budget.
 */
function BreakdownCard({ week }: { week: WeekReport }) {
  return (
    <Card>
      <CardHeader title="Alur budget minggu ini" />

      <dl className="tabular flex flex-col gap-2 text-sm">
        <Line
          label={`Budget minggu ini (${week.weekdayDays} weekday × ${formatRupiah(week.dailyWeekdayRate)})`}
          value={week.weekBudget}
        />
        <Line label="Terpakai di weekday" value={-week.weekdaySpent} sign="−" />
        <Line label="Rollover dari minggu lalu" value={week.rolloverIn} sign="+" />

        <Divider />
        <Line label="Budget weekend" value={week.weekendBudget} emphasis />
        <Line label="Terpakai di weekend" value={-week.weekendSpent} sign="−" />

        <Divider />
        <Line
          label={`Sisa minggu ini (jadi rollover W${week.weekIndex + 1})`}
          value={week.weekRemaining}
          emphasis
        />
      </dl>
    </Card>
  );
}

function Line({
  label,
  value,
  sign,
  emphasis,
}: {
  label: string;
  value: number;
  sign?: '−' | '+';
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={cn('text-ink-muted', emphasis && 'font-semibold text-ink')}>{label}</dt>
      <dd className={cn('shrink-0', emphasis && 'font-bold')}>
        {sign && value !== 0 ? (
          <span className="tabular">
            {sign} {formatRupiah(Math.abs(value))}
          </span>
        ) : (
          <Money amount={value} showOverBadge={emphasis} />
        )}
      </dd>
    </div>
  );
}

function Divider() {
  return <div className="my-1 border-t border-dashed border-line" />;
}

function DayTable({ days }: { days: DayRow[] }) {
  return (
    <Card>
      <CardHeader title="Per hari" />

      <ul className="divide-y divide-line">
        {days.map((day) => {
          const tone = day.dayType === 'WEEKEND' ? 'neutral' : toneFor(day.remaining, day.dayBudget);

          return (
            <li key={day.date} className="flex items-center gap-3 py-2.5">
              <span className={cn('w-16 shrink-0 text-xs', day.isToday ? 'font-bold text-brand-text' : 'text-ink-muted')}>
                {formatWeekdayShort(day.date)} {formatDayShort(day.date)}
              </span>

              <span className="flex-1 text-xs text-ink-subtle">
                {day.dayType === 'WEEKEND' ? 'Weekend' : formatRupiah(day.dayBudget)}
              </span>

              <span className="tabular w-24 shrink-0 text-right text-sm text-ink">
                {formatRupiah(day.spent)}
              </span>

              <span className="w-24 shrink-0 text-right text-sm">
                {day.dayType === 'WEEKEND' ? (
                  <span className="text-ink-subtle">—</span>
                ) : (
                  <Money amount={day.remaining} tone={tone} showOverBadge={false} />
                )}
              </span>
            </li>
          );
        })}
      </ul>

      {days.some((day) => day.dayType === 'WEEKDAY' && day.remaining < 0) ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-muted">
          <OverBadge /> hari yang lewat dari jatah harian.
        </p>
      ) : null}
    </Card>
  );
}

function WeekExpenses({ period, weekIndex }: { period: string; weekIndex: number }) {
  const { data, isLoading } = useExpenses({ period, weekIndex, limit: 100, sort: 'spentOn:asc,id:asc' });

  if (isLoading) return <LoadingBlock />;
  if (!data || data.items.length === 0) {
    return (
      <Card>
        <EmptyState title="Belum ada pengeluaran minggu ini" />
      </Card>
    );
  }

  const byDate = new Map<string, typeof data.items>();
  for (const expense of data.items) {
    byDate.set(expense.spentOn, [...(byDate.get(expense.spentOn) ?? []), expense]);
  }

  return (
    <Card>
      <CardHeader title="Pengeluaran minggu ini" description={formatRupiah(data.sumAmount)} />

      <div className="flex flex-col gap-3">
        {[...byDate.entries()].map(([date, expenses]) => (
          <section key={date}>
            <h3 className="mb-1 text-xs font-semibold text-ink-subtle">
              {formatWeekdayShort(date)}, {formatDayShort(date)}
            </h3>
            <ul className="divide-y divide-line">
              {expenses.map((expense) => (
                <ExpenseRow key={expense.id} expense={expense} showDate={false} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Card>
  );
}
