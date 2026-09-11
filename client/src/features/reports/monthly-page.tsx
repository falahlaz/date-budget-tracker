import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { PageHeader } from '@/components/app-shell';
import { Button, StepButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState, LoadingBlock, Meter } from '@/components/ui/feedback';
import { Money, OverBadge } from '@/components/ui/money';
import { SectionHead, Segmented } from '@/components/ui/section';
import { cn } from '@/lib/cn';
import {
  formatCompactRupiah,
  formatDayShort,
  formatPeriodLong,
  formatRupiah,
} from '@/lib/format';
import { currentPeriod, shiftPeriod } from '@/lib/today';
import { PAYMENT_METHOD_LABELS, type MonthReport, type PaymentMethod } from '@/types/api';
import { useMonthReport } from './hooks';

/** S4 Monthly Dashboard (PRD 9.5) -- the screen that answers "where did the money go". */
export function MonthlyPage() {
  const [period, setPeriod] = useState(currentPeriod());
  const { data, isLoading, error, refetch } = useMonthReport(period);

  return (
    <>
      <PageHeader eyebrow="Rincian bulanan" title="Bulan" />

      <div className="mb-6 flex items-center justify-between gap-2">
        <StepButton onClick={() => setPeriod(shiftPeriod(period, -1))} aria-label="Bulan sebelumnya">
          ‹
        </StepButton>
        <div className="min-w-0 text-center">
          <div className="text-[15px] font-semibold text-ink">{formatPeriodLong(period)}</div>
          {data?.hasBudget ? (
            <div className="mt-0.5 text-[11.5px] text-ink-3">
              {data.weekdayCount} hari weekday · {formatRupiah(data.dailyWeekdayRate)}/hari
            </div>
          ) : null}
        </div>
        <StepButton
          onClick={() => setPeriod(shiftPeriod(period, 1))}
          disabled={period >= currentPeriod()}
          aria-label="Bulan berikutnya"
        >
          ›
        </StepButton>
      </div>

      {isLoading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorState message={(error as Error).message} onRetry={() => refetch()} />
      ) : !data ? null : (
        <>
          <SummaryCard report={data} />
          <WeeklyTable report={data} />
          <CategoryDonut report={data} period={period} />
          <WeekdayWeekendBar report={data} />
          <MerchantRanking report={data} period={period} />
          <TopExpenses report={data} />
          <PaymentMethods report={data} />
        </>
      )}
    </>
  );
}

function SummaryCard({ report }: { report: MonthReport }) {
  if (!report.hasBudget) {
    return (
      <Card className="mb-7 border-accent-line bg-accent-soft">
        <p className="text-sm font-semibold text-ink">Bulan ini belum ada budget</p>
        <p className="mt-1 text-xs text-ink-2">
          Total terpakai {formatRupiah(report.totalSpent)}. Set budget biar angka jatah harian
          muncul.
        </p>
        <Button asChild size="md" className="mt-4">
          <Link to="/budget">Set budget</Link>
        </Button>
      </Card>
    );
  }

  const available = report.monthlyBudget + report.carryIn;
  const paceRatio = report.daysTotal > 0 ? report.daysElapsed / report.daysTotal : 0;
  const spentRatio = available > 0 ? report.totalSpent / available : 0;
  const aheadBy = Math.round((paceRatio - spentRatio) * 1000) / 10;

  return (
    <Card className="mb-7">
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="label-micro mb-1.5 text-[10px] tracking-[0.14em]">Sisa bulan ini</div>
          <p className="amount-display text-[32px]">
            <Money amount={report.spendableRemaining} showOverBadge={false} />
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="label-micro mb-1.5 text-[10px] tracking-[0.14em]">Terpakai</div>
          <p className="tabular font-mono text-sm font-medium text-ink">
            {formatRupiah(report.totalSpent)}
          </p>
        </div>
      </div>

      <div className="mt-5">
        <Meter
          value={report.totalSpent}
          max={available}
          markerRatio={paceRatio}
          size="lg"
          fillClassName={report.isOverspent ? 'bg-neg' : 'bg-accent'}
        />
        <div className="mt-2.5 flex items-baseline justify-between gap-3 text-[11.5px] text-ink-3">
          <span>
            {Math.round(spentRatio * 100)}% budget terpakai di hari ke-{report.daysElapsed}
          </span>
          {/* The pace tick alone only says "behind" or "ahead"; the figure says by how much. */}
          {available > 0 ? (
            <span className={aheadBy >= 0 ? 'text-pos' : 'text-neg'}>
              <b className="font-semibold">
                {aheadBy >= 0 ? 'Lebih hemat' : 'Lebih boros'} {Math.abs(aheadBy).toFixed(1)}%
              </b>{' '}
              dari pace
            </span>
          ) : null}
        </div>
      </div>

      <dl className="mt-4 flex items-baseline justify-between gap-3 border-t border-line pt-3.5 text-[11.5px] text-ink-3">
        <div className="flex items-baseline gap-1.5">
          <dt>Budget</dt>
          <dd className="tabular font-semibold text-ink">
            {formatCompactRupiah(report.monthlyBudget)}
          </dd>
        </div>
        <div className="flex items-baseline gap-1.5">
          <dt>Carry-in</dt>
          <dd
            className={cn(
              'tabular font-semibold',
              report.carryIn < 0 ? 'text-neg' : report.carryIn > 0 ? 'text-pos' : 'text-ink',
            )}
          >
            {report.carryIn > 0 ? '+' : ''}
            {formatCompactRupiah(report.carryIn)}
          </dd>
        </div>
        {report.isOverspent ? <OverBadge /> : null}
      </dl>
    </Card>
  );
}

/**
 * The weekly table (PRD 9.5, item 3) -- the most important table in the app.
 *
 * Columns match Fixture B exactly so the numbers can be checked against the spec by eye.
 * It scrolls horizontally rather than wrapping, because collapsing a row would break the
 * left-to-right reading of the calculation. The mask on the right edge is the affordance
 * that says so -- a scrollbar does not appear on touch until you already scrolled.
 */
function WeeklyTable({ report }: { report: MonthReport }) {
  return (
    <section className="mb-7">
      <SectionHead title="Per minggu" />

      <div
        className="-mx-5 overflow-x-auto px-5 pb-1"
        style={{
          maskImage: 'linear-gradient(to right, #000 0, #000 calc(100% - 26px), transparent 100%)',
          WebkitMaskImage:
            'linear-gradient(to right, #000 0, #000 calc(100% - 26px), transparent 100%)',
        }}
      >
        <table className="tabular w-full min-w-[34rem] border-collapse text-right font-mono text-[11.5px] whitespace-nowrap">
          <thead>
            <tr className="border-b border-line-strong">
              {['W', 'Budget', 'Weekday', 'Rollover', 'Weekend', 'Kepakai', 'Sisa'].map(
                (heading, index) => (
                  <th
                    key={heading}
                    scope="col"
                    className={cn(
                      'py-2.5 pr-2 text-[9.5px] font-medium tracking-[0.1em] text-ink-3 uppercase',
                      index === 0 ? 'pr-2 pl-0 text-left' : null,
                      index === 6 ? 'pr-0' : null,
                    )}
                  >
                    {heading}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {report.weeks.map((week) => (
              <tr
                key={week.weekIndex}
                className={cn(
                  'border-b border-line last:border-0',
                  week.isCurrent && '[&>*]:bg-accent-soft',
                )}
              >
                <th
                  scope="row"
                  className="rounded-l-xs py-2.5 pr-2 text-left font-medium text-ink"
                >
                  W{week.weekIndex}
                  <span className="block text-[9px] font-normal text-ink-3">
                    {formatDayShort(week.startDate)}–{formatDayShort(week.endDate)}
                  </span>
                </th>
                <td className="py-2.5 pr-2 text-ink-2">{formatCompactRupiah(week.weekBudget)}</td>
                <td className="py-2.5 pr-2 text-ink-2">
                  {formatCompactRupiah(week.weekdaySpent)}
                </td>
                <td
                  className={cn(
                    'py-2.5 pr-2 font-medium',
                    week.rolloverIn < 0
                      ? 'text-neg'
                      : week.rolloverIn > 0
                        ? 'text-pos'
                        : 'text-ink-2',
                  )}
                >
                  {week.rolloverIn > 0 ? '+' : ''}
                  {formatCompactRupiah(week.rolloverIn)}
                </td>
                <td
                  className={cn(
                    'py-2.5 pr-2 font-medium',
                    week.weekendBudget < 0 ? 'text-neg' : 'text-ink',
                  )}
                >
                  {formatCompactRupiah(week.weekendBudget)}
                </td>
                <td className="py-2.5 pr-2 text-ink-2">
                  {formatCompactRupiah(week.weekendSpent)}
                </td>
                <td
                  className={cn(
                    'rounded-r-xs py-2.5 font-medium',
                    week.weekRemaining < 0 ? 'text-neg' : 'text-pos',
                  )}
                >
                  {week.weekRemaining > 0 ? '+' : ''}
                  {formatCompactRupiah(week.weekRemaining)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* The Sisa column is signed, so the OVER badge that normally rides a negative
          amount would repeat on every row. One legend covers the column instead. */}
      <p className="mt-2 text-[11px] text-ink-3">
        Kolom Sisa: <span className="font-medium text-neg">merah</span> = lewat dari budget
        minggu itu.
      </p>
    </section>
  );
}

/** How many legend rows show before "Lihat semua". The donut always draws every slice. */
const CATEGORY_LEGEND_PREVIEW = 5;

/** Target of the toggle's aria-controls. One donut per screen, so a literal id is safe. */
const CATEGORY_LEGEND_ID = 'category-legend';

const CATEGORY_LEGEND_ROW = 'grid grid-cols-[9px_1fr_auto] items-center gap-2.5 text-[12.5px]';

/**
 * Spend by category (PRD 9.5, item 4) -- the answer to goal G1.
 *
 * Category colours are user-owned (PRD 7.4), so the chart cannot guarantee they are
 * distinguishable to a colourblind reader. Identity therefore never rests on the fill:
 * every slice is named with its amount and share in the legend beside it, and the segments
 * are separated by a surface-coloured gap.
 */
function CategoryDonut({ report, period }: { report: MonthReport; period: string }) {
  // Sits above the empty-state return because a hook cannot follow a conditional return.
  const [showAll, setShowAll] = useState(false);

  if (report.byCategory.length === 0) {
    return (
      <section className="mb-7">
        <SectionHead title="Uangnya lari ke mana" />
        <EmptyState title="Belum ada pengeluaran bulan ini" />
      </section>
    );
  }

  // The server returns byCategory amount-desc with "Tanpa kategori" pinned last (PRD 6.18),
  // so the head of the list is already "the biggest few" -- nothing to sort here.
  const canTruncate = report.byCategory.length > CATEGORY_LEGEND_PREVIEW;
  const legendRows = showAll
    ? report.byCategory
    : report.byCategory.slice(0, CATEGORY_LEGEND_PREVIEW);
  const hiddenAmount = report.byCategory
    .slice(CATEGORY_LEGEND_PREVIEW)
    .reduce((sum, slice) => sum + slice.amount, 0);

  return (
    <section className="mb-7">
      <SectionHead
        title="Uangnya lari ke mana"
        action={
          <span className="tabular font-mono text-xs text-ink-2">
            {formatCompactRupiah(report.totalSpent)}
          </span>
        }
      />

      {/* The legend is taller than the 132px donut once its rows are tap targets, so the
          chart stays centred against it rather than hanging off the top. */}
      <div className="flex items-center gap-5">
        <div className="h-[132px] w-[132px] shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={report.byCategory}
                dataKey="amount"
                nameKey="name"
                innerRadius="62%"
                outerRadius="92%"
                paddingAngle={2}
                stroke="var(--bg)"
                strokeWidth={2}
                isAnimationActive={false}
              >
                {report.byCategory.map((slice) => (
                  <Cell key={slice.categoryId ?? 'none'} fill={slice.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number, name: string) => [formatRupiah(value), name]}
                contentStyle={{
                  borderRadius: 14,
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  color: 'var(--text)',
                  fontSize: 12,
                  boxShadow: 'var(--sh-md)',
                }}
                itemStyle={{ color: 'var(--text)' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* No gap: every row is its own 44px tap target, which already spaces the list. */}
        <ul id={CATEGORY_LEGEND_ID} className="flex min-w-0 flex-1 flex-col">
          {legendRows.map((slice) => {
            const content = (
              <>
                <span
                  aria-hidden
                  className="h-[9px] w-[9px] shrink-0 rounded-[2px]"
                  style={{ backgroundColor: slice.color }}
                />
                <span className="truncate text-ink-2">{slice.name}</span>
                <span className="shrink-0 text-right">
                  <span className="tabular block font-mono text-[11.5px] text-ink">
                    {formatCompactRupiah(slice.amount)}
                  </span>
                  <span className="tabular block font-mono text-[10.5px] text-ink-3">
                    {Math.round(slice.share * 100)}%
                  </span>
                </span>
              </>
            );

            return (
              <li key={slice.categoryId ?? 'none'}>
                {slice.categoryId !== null ? (
                  <Link
                    to={`/expenses?period=${period}&categoryId=${slice.categoryId}`}
                    data-tap
                    className={cn(
                      CATEGORY_LEGEND_ROW,
                      '-mx-2 rounded-sm px-2 transition-colors duration-[var(--t-fast)] ease-out active:bg-surface-2',
                    )}
                  >
                    {content}
                  </Link>
                ) : (
                  // Riwayat cannot express "no category", so this row does not pretend to be
                  // a link. It keeps the 44px the links get from index.css so the list is even.
                  <div className={cn(CATEGORY_LEGEND_ROW, 'min-h-11 px-2')}>{content}</div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {canTruncate ? (
        <Button
          variant="secondary"
          onClick={() => setShowAll((open) => !open)}
          aria-expanded={showAll}
          aria-controls={CATEGORY_LEGEND_ID}
          className="mt-3 w-full text-xs font-medium"
        >
          {/* The collapsed rows still count towards the total in the section head, so the
              label carries what they add up to -- otherwise the column reads as wrong. */}
          {showAll
            ? 'Ciutkan'
            : `Lihat semua (${report.byCategory.length}) · +${formatCompactRupiah(hiddenAmount)}`}
        </Button>
      ) : null}
    </section>
  );
}

/** Weekday vs weekend (PRD 9.5, item 5): one measure, two bars, labelled directly. */
function WeekdayWeekendBar({ report }: { report: MonthReport }) {
  const data = [
    { label: 'Hari kerja', amount: report.weekdaySpent },
    { label: 'Weekend', amount: report.weekendSpent },
  ];

  return (
    <section className="mb-7">
      <SectionHead title="Hari kerja vs weekend" />

      <div className="h-32 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 0, right: 64, top: 4, bottom: 4 }}>
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="label"
              axisLine={false}
              tickLine={false}
              width={80}
              tick={{ fill: 'var(--text-2)', fontSize: 12 }}
            />
            <Bar
              dataKey="amount"
              radius={[4, 4, 4, 4]}
              barSize={22}
              isAnimationActive={false}
              label={{
                position: 'right',
                formatter: (value: number) => formatCompactRupiah(value),
                fill: 'var(--text)',
                fontSize: 12,
              }}
            >
              {/* Butter is the weekend marker everywhere else in the app; it would be odd
                  for the one chart that is literally about the weekend to opt out. */}
              <Cell fill="var(--accent)" />
              <Cell fill="var(--butter)" />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

/**
 * "Tempat paling nguras" (PRD 9.5, item 6).
 *
 * The toggle exists because total and average answer different questions: a cheap warung
 * visited ten times tops the total, while one expensive dinner tops the average. Sorting
 * only by total would hide exactly the pattern the user is trying to find.
 */
function MerchantRanking({ report, period }: { report: MonthReport; period: string }) {
  const [sortBy, setSortBy] = useState<'amount' | 'avgAmount'>('amount');

  if (report.byMerchant.length === 0) {
    return (
      <section className="mb-7">
        <SectionHead title="Tempat paling nguras" />
        <EmptyState
          title="Belum ada tempat tercatat"
          description="Isi kolom tempat pas nyatat biar ranking ini kebaca."
        />
      </section>
    );
  }

  const rows = [...report.byMerchant].sort((a, b) => {
    // The "no place" bucket always stays at the bottom, whichever sort is active (PRD 6.18).
    if ((a.merchantKey === null) !== (b.merchantKey === null))
      return a.merchantKey === null ? 1 : -1;
    return b[sortBy] - a[sortBy];
  });

  return (
    <section className="mb-7">
      <SectionHead
        title="Tempat paling nguras"
        action={
          <Segmented
            label="Urutkan tempat"
            value={sortBy}
            onChange={setSortBy}
            options={[
              { value: 'amount', label: 'Total' },
              { value: 'avgAmount', label: 'Rata-rata' },
            ]}
          />
        }
      />

      <ul className="divide-y divide-line">
        {rows.map((row) => {
          const content = (
            <>
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    'block truncate text-sm font-medium',
                    row.merchantKey ? 'text-ink' : 'text-ink-3 italic',
                  )}
                >
                  {row.displayName}
                </span>
                <span className="text-[11.5px] text-ink-3">
                  {row.count}× {row.categoryName ? `· ${row.categoryName}` : ''}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="tabular block font-mono text-[13px] font-medium text-ink">
                  {formatRupiah(sortBy === 'amount' ? row.amount : row.avgAmount)}
                </span>
                <span className="tabular block font-mono text-[10px] text-ink-3">
                  {sortBy === 'amount'
                    ? `${formatRupiah(row.avgAmount)}/kunjungan`
                    : `total ${formatRupiah(row.amount)}`}
                </span>
              </span>
            </>
          );

          return (
            <li key={row.merchantKey ?? 'none'}>
              {row.merchantKey ? (
                <Link
                  to={`/expenses?period=${period}&merchantKey=${encodeURIComponent(row.merchantKey)}`}
                  data-tap
                  className="-mx-2 flex items-center gap-3 rounded-sm px-2 py-3 transition-colors duration-[var(--t-fast)] ease-out active:bg-surface-2"
                >
                  {content}
                </Link>
              ) : (
                <div className="flex items-center gap-3 py-3">{content}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function TopExpenses({ report }: { report: MonthReport }) {
  if (report.topExpenses.length === 0) return null;

  return (
    <section className="mb-7">
      <SectionHead title="Pengeluaran terbesar" />
      <ul className="divide-y divide-line">
        {report.topExpenses.map((expense) => (
          <li key={expense.id}>
            <Link
              to={`/expenses/${expense.id}`}
              data-tap
              className="-mx-2 flex items-center gap-3 rounded-sm px-2 py-3 transition-colors duration-[var(--t-fast)] ease-out active:bg-surface-2"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">
                  {expense.merchant ?? expense.categoryName ?? 'Tanpa tempat'}
                </span>
                <span className="block truncate text-[11.5px] text-ink-3">
                  {formatDayShort(expense.spentOn)}
                  {expense.note ? ` · ${expense.note}` : ''}
                </span>
              </span>
              <span className="tabular shrink-0 font-mono text-[13px] font-medium text-ink">
                {formatRupiah(expense.amount)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PaymentMethods({ report }: { report: MonthReport }) {
  if (report.byPaymentMethod.length === 0) return null;

  return (
    <section>
      <SectionHead title="Metode bayar" />
      <ul className="divide-y divide-line">
        {report.byPaymentMethod.map((row) => (
          <li key={row.paymentMethod} className="flex items-center gap-3 py-3">
            <span className="flex-1 text-sm text-ink">
              {PAYMENT_METHOD_LABELS[row.paymentMethod as PaymentMethod] ?? row.paymentMethod}
            </span>
            <span className="font-mono text-[11px] text-ink-3">{row.count}×</span>
            <span className="tabular w-24 text-right font-mono text-[13px] font-medium text-ink">
              {formatRupiah(row.amount)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
