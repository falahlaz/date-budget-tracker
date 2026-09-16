import { useState } from 'react';
import { PageHeader } from '@/components/app-shell';
import { StepButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState, LoadingBlock, Meter } from '@/components/ui/feedback';
import { OverBadge, StatusBadge, TONE_FILL, toneFor } from '@/components/ui/money';
import {
  ReceiptCard,
  ReceiptLine,
  ReceiptRule,
  ReceiptTotal,
} from '@/components/ui/receipt';
import { SectionHead, Segmented } from '@/components/ui/section';
import { ExpenseRow } from '@/features/expenses/expense-row';
import { useExpenses } from '@/features/expenses/hooks';
import { cn } from '@/lib/cn';
import { formatDateRange, formatDayShort, formatRupiah, formatWeekdayShort } from '@/lib/format';
import { currentPeriod, todayInJakarta } from '@/lib/today';
import type { DayRow, WeekReport } from '@/types/api';
import { dayFigure, readStoredDayView, writeStoredDayView, type DayView } from './day-view';
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
            <button
              type="button"
              onClick={() => setSelection(null)}
              className="underline"
            >
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
      <PageHeader eyebrow="Rincian mingguan" title="Minggu" />

      <div className="mb-6 flex items-center justify-between gap-2">
        <StepButton onClick={() => step(-1)} aria-label="Minggu sebelumnya">
          ‹
        </StepButton>
        <div className="min-w-0 text-center">
          <div className="text-[15px] font-semibold text-ink">
            W{data.weekIndex} · {formatDateRange(data.startDate, data.endDate)}
          </div>
          <div className="mt-0.5 text-[11.5px] text-ink-3">
            {data.weekdayDays} hari weekday · {data.days.length - data.weekdayDays} hari weekend
          </div>
        </div>
        <StepButton onClick={() => step(1)} aria-label="Minggu berikutnya">
          ›
        </StepButton>
      </div>

      {data.weekdayDays === 0 ? <NoWeekdayBanner weekIndex={data.weekIndex} /> : null}
      <Breakdown week={data} />
      <DayTable days={data.days} />
      <WeekExpenses period={data.period} weekIndex={data.weekIndex} />
    </>
  );
}

/** PRD 6.1: the first week of a month that opens on a weekend has no allowance yet. */
function NoWeekdayBanner({ weekIndex }: { weekIndex: number }) {
  return (
    <Card className="mb-6 border-warn/30 bg-warn-soft">
      <p className="text-sm text-warn">
        Minggu W{weekIndex} belum ada jatah weekday, budget weekend-nya minus dulu dan ketutup
        minggu depan.
      </p>
    </Card>
  );
}

/** Where the week being viewed sits relative to today. */
export type WeekTimeState = 'past' | 'current' | 'future';

type WeekStatus = {
  tone: 'over' | 'run' | 'ok' | 'idle';
  label: string;
  /** What happens to the remainder, phrased in the tense the week deserves. */
  rollover: string;
};

/**
 * The closing line of the receipt: how the week stands, and where its remainder goes.
 *
 * The arrows walk into weeks that have not happened yet, so "contains today or not" is one
 * distinction short -- an unstarted week is not finished, it has not begun. `today` is a
 * parameter rather than a call inside so the whole thing stays pure.
 */
export function weekStatus(
  week: Pick<
    WeekReport,
    'startDate' | 'endDate' | 'period' | 'weekRemaining' | 'nextWeek'
  >,
  today: string,
): WeekStatus {
  const state: WeekTimeState =
    today < week.startDate ? 'future' : today > week.endDate ? 'past' : 'current';

  // On the last segment of a month the remainder becomes the month's carryOut, which feeds
  // next month's W1 -- so naming "W{weekIndex + 1}" there points at a week that never exists.
  const target =
    week.nextWeek.period === week.period
      ? `jadi rollover W${week.nextWeek.weekIndex}`
      : 'jadi carry-over ke bulan depan';
  const rollover = state === 'future' ? `nanti ${target}` : target;

  // Over outranks the time state on purpose. A week whose remaining is already negative
  // before it starts has had its allowance eaten by an incoming deficit, and "over budget"
  // must never be carried by colour alone (PRD 9.1, 11).
  if (week.weekRemaining < 0) return { tone: 'over', label: 'Over', rollover };
  if (state === 'future') return { tone: 'idle', label: 'Akan datang', rollover };
  if (state === 'current') return { tone: 'run', label: 'Berjalan', rollover };
  return { tone: 'ok', label: 'Selesai', rollover };
}

/**
 * The transfer rows of the weekly receipt (PRD v2 11.6).
 *
 * They earn lines of their own rather than disappearing into "terpakai": money moved to
 * savings is not money spent, but it does cut this week's weekend budget, and the receipt
 * has to say which of the two happened.
 *
 * A row appears only when it has a figure. Most weeks have no transfer at all, and two
 * permanent "Rp 0" lines would push the rows that always matter further down the card for
 * nothing -- so the rule is a function rather than two conditionals in the JSX, because it
 * is the rule and not the markup that is worth testing.
 */
export function transferRows(week: Pick<WeekReport, 'transferOut' | 'transferIn'>) {
  const rows: {
    label: string;
    amount: number;
    tone: 'pos' | 'neg';
    signed: boolean | 'minus';
  }[] = [];

  if (week.transferOut > 0) {
    rows.push({
      label: 'Dipindah ke dompet lain',
      amount: week.transferOut,
      tone: 'neg',
      signed: 'minus',
    });
  }

  if (week.transferIn > 0) {
    rows.push({ label: 'Masuk dari dompet lain', amount: week.transferIn, tone: 'pos', signed: true });
  }

  return rows;
}

/**
 * The receipt (PRD 9.4).
 *
 * A running total rather than a set of statistics, because the point is to make the chain
 * visible: weekday allowance, minus what was spent, plus last week's leftovers, equals the
 * weekend budget.
 */
function Breakdown({ week }: { week: WeekReport }) {
  const status = weekStatus(week, todayInJakarta());

  return (
    <div className="mb-7">
      <ReceiptCard caption={`Alur budget minggu W${week.weekIndex}`}>
        <ReceiptLine
          label="Budget minggu"
          detail={`${week.weekdayDays} hari weekday × ${formatRupiah(week.dailyWeekdayRate)}`}
          amount={week.weekBudget}
        />
        <ReceiptLine label="Terpakai di weekday" amount={week.weekdaySpent} tone="neg" signed="minus" />
        <ReceiptLine
          label="Rollover dari minggu lalu"
          amount={week.rolloverIn}
          tone={week.rolloverIn < 0 ? 'neg' : 'pos'}
          signed
        />

        {transferRows(week).map((row) => (
          <ReceiptLine key={row.label} {...row} />
        ))}

        <ReceiptRule />

        <ReceiptLine label="Budget weekend" amount={week.weekendBudget} strong />
        <ReceiptLine label="Terpakai di weekend" amount={week.weekendSpent} tone="neg" signed="minus" />

        <ReceiptRule double />

        <ReceiptTotal
          label={`Sisa minggu W${week.weekIndex}`}
          amount={week.weekRemaining}
          note={
            <span className="inline-flex flex-wrap items-center gap-1.5">
              <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
              <span>{status.rollover}.</span>
            </span>
          }
        />
      </ReceiptCard>
    </div>
  );
}

/**
 * The per-day breakdown (PRD 9.4).
 *
 * A label, a track and a figure: three columns fit at 360px where four full-precision
 * rupiah figures never did. The bar carries the proportion, so the numbers only have to
 * carry the amount.
 *
 * Which amount is the toggle's job. The column used to switch meaning on its own -- an
 * untouched day printed its allowance, a day with an expense printed what went out -- so
 * "Rp 62.037" and "Rp 21.000" sat one above the other measuring opposite things. The figure
 * now means whatever the control says, and the control opens on Sisa, because what is left
 * to spend is the question the page is opened to answer.
 */
export function DayTable({ days }: { days: DayRow[] }) {
  const [view, setView] = useState<DayView>(readStoredDayView);

  const changeView = (next: DayView) => {
    setView(next);
    writeStoredDayView(next);
  };

  return (
    <section className="mb-7">
      <SectionHead
        title="Per hari"
        action={
          <Segmented
            label="Tampilan per hari"
            value={view}
            onChange={changeView}
            options={[
              { value: 'remaining', label: 'Sisa' },
              { value: 'spent', label: 'Terpakai' },
            ]}
          />
        }
      />

      <ul className="divide-y divide-line">
        {days.map((day) => {
          const isWeekend = day.dayType === 'WEEKEND';
          const tone = toneFor(day.remaining, day.dayBudget);
          const figure = dayFigure(day, view);

          return (
            <li
              key={day.date}
              className="grid grid-cols-[3.25rem_1fr_auto] items-center gap-3 py-3"
            >
              <span
                className={cn(
                  'font-mono text-[10.5px] font-medium tracking-[0.06em] uppercase',
                  day.isToday ? 'text-accent-ink' : 'text-ink-3',
                )}
              >
                {formatWeekdayShort(day.date)} {formatDayShort(day.date).split(' ')[0]}
              </span>

              {/* The bar reads the same in both views -- it is how much of the day went out,
                  and the figure beside it is the amount the control asked for. */}
              <Meter
                value={day.spent}
                max={isWeekend ? Math.max(day.spent, 1) : day.dayBudget}
                size="sm"
                fillClassName={isWeekend ? 'bg-butter' : TONE_FILL[tone]}
              />

              <span className="tabular text-right font-mono text-[12.5px] font-medium">
                {figure.kind === 'weekend' ? (
                  <span className="text-ink-3">weekend</span>
                ) : (
                  <span
                    className={figure.over ? 'text-neg' : figure.muted ? 'text-ink-3' : 'text-ink'}
                  >
                    {formatRupiah(figure.amount)}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>

      {days.some((day) => day.dayType === 'WEEKDAY' && day.remaining < 0) ? (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-2">
          <OverBadge /> hari yang lewat dari jatah harian.
        </p>
      ) : null}
    </section>
  );
}

function WeekExpenses({ period, weekIndex }: { period: string; weekIndex: number }) {
  const { data, isLoading } = useExpenses({
    period,
    weekIndex,
    limit: 100,
    sort: 'occurredOn:asc,id:asc',
  });

  if (isLoading) return <LoadingBlock />;
  if (!data || data.items.length === 0) {
    return <EmptyState title={`Belum ada pengeluaran di minggu W${weekIndex}`} />;
  }

  const byDate = new Map<string, typeof data.items>();
  for (const expense of data.items) {
    byDate.set(expense.occurredOn, [...(byDate.get(expense.occurredOn) ?? []), expense]);
  }

  return (
    <section>
      <SectionHead
        title={`Pengeluaran minggu W${weekIndex}`}
        action={
          <span className="tabular font-mono text-xs text-ink-2">
            {formatRupiah(data.sumAmount)}
          </span>
        }
      />

      <div className="flex flex-col gap-5">
        {[...byDate.entries()].map(([date, expenses]) => (
          <section key={date}>
            <h3 className="mb-1 font-mono text-[10px] font-medium tracking-[0.12em] text-ink-3 uppercase">
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
    </section>
  );
}
