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
import { currentPeriod } from '@/lib/today';
import type { DayRow, WeekReport } from '@/types/api';
import { useCurrentWeekReport, useWeekReport } from './hooks';

/** S3 Weekly Dashboard (PRD 9.4). */
export function WeeklyPage() {
  const current = useCurrentWeekReport();
  const [selection, setSelection] = useState<{ period: string; weekIndex: number } | null>(null);

  const period = selection?.period ?? current.data?.period ?? currentPeriod();
  const weekIndex = selection?.weekIndex ?? current.data?.weekIndex ?? 1;
  const week = useWeekReport(period, weekIndex);

  if (current.isLoading || week.isLoading) return <LoadingBlock />;
  if (week.error) {
    return (
      <ErrorState
        message={(week.error as Error).message}
        onRetry={() => week.refetch()}
        // Retrying cannot help if the week itself is unreachable, and the arrows are not
        // rendered in this branch, so offer the way back to a week that is known to exist.
        action={
          selection ? (
            <button type="button" onClick={() => setSelection(null)} className="underline">
              Kembali ke minggu ini
            </button>
          ) : null
        }
      />
    );
  }
  if (!week.data) return null;

  const data = week.data;

  /**
   * A month holds between 4 and 6 segments (PRD 4.2), so where W1's "previous" lands depends
   * on the shape of the month before it. The report carries both neighbours already resolved
   * rather than having the page guess an index the engine would reject.
   */
  const step = (delta: number) => setSelection(delta < 0 ? data.prevWeek : data.nextWeek);

  return (
    <>
      <PageHeader title="Minggu ini" />

      <div className="mb-3 flex items-center gap-2">
        <Button variant="secondary" size="icon" onClick={() => step(-1)} aria-label="Minggu sebelumnya">
          ‹
        </Button>
        <span className="flex-1 text-center text-sm font-semibold text-ink">
          W{data.weekIndex} · {formatDateRange(data.startDate, data.endDate)}
        </span>
        <Button variant="secondary" size="icon" onClick={() => step(1)} aria-label="Minggu berikutnya">
          ›
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        {data.weekdayDays === 0 ? <NoWeekdayBanner /> : null}
        <BreakdownCard week={data} />
        <DayTable days={data.days} />
        <WeekExpenses period={data.period} weekIndex={data.weekIndex} />
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
  // On the last segment of a month the remainder becomes the month's carryOut, which feeds
  // next month's W1 -- so naming "W{weekIndex + 1}" there points at a week that never exists.
  const rolloverTarget =
    week.nextWeek.period === week.period
      ? `jadi rollover W${week.nextWeek.weekIndex}`
      : 'jadi carry-over ke bulan depan';

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
          label={`Sisa minggu ini (${rolloverTarget})`}
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

/**
 * The per-day breakdown (PRD 9.4).
 *
 * Two lines per day rather than four columns: at 360px four full-precision rupiah figures
 * cannot share a row inside the card, and the ones that did not fit used to push the whole
 * page sideways. The day and its allowance stack on the left, what was spent and what is
 * left on the right, so a row still reads day -> jatah -> terpakai -> sisa.
 */
function DayTable({ days }: { days: DayRow[] }) {
  return (
    <Card>
      <CardHeader title="Per hari" />

      <ul className="divide-y divide-line">
        {days.map((day) => {
          const tone = day.dayType === 'WEEKEND' ? 'neutral' : toneFor(day.remaining, day.dayBudget);

          return (
            <li key={day.date} className="flex items-start justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <span className={cn('block text-sm', day.isToday ? 'font-bold text-brand-text' : 'text-ink')}>
                  {formatWeekdayShort(day.date)} {formatDayShort(day.date)}
                </span>
                <span className="tabular block text-xs text-ink-subtle">
                  {day.dayType === 'WEEKEND' ? 'Weekend' : `jatah ${formatRupiah(day.dayBudget)}`}
                </span>
              </div>

              <div className="shrink-0 text-right">
                <span className="tabular block text-sm text-ink">{formatRupiah(day.spent)}</span>
                <span className="block text-sm">
                  {day.dayType === 'WEEKEND' ? (
                    <span className="text-ink-subtle">—</span>
                  ) : (
                    <Money amount={day.remaining} tone={tone} showOverBadge={false} />
                  )}
                </span>
              </div>
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
