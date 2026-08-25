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
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { EmptyState, ErrorState, LoadingBlock, ProgressBar } from '@/components/ui/feedback';
import { Money, OverBadge } from '@/components/ui/money';
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
      <PageHeader title="Bulan ini" />

      <div className="mb-3 flex items-center gap-2">
        <Button variant="secondary" size="icon" onClick={() => setPeriod(shiftPeriod(period, -1))} aria-label="Bulan sebelumnya">
          ‹
        </Button>
        <span className="flex-1 text-center text-sm font-semibold text-ink">
          {formatPeriodLong(period)}
        </span>
        <Button
          variant="secondary"
          size="icon"
          onClick={() => setPeriod(shiftPeriod(period, 1))}
          disabled={period >= currentPeriod()}
          aria-label="Bulan berikutnya"
        >
          ›
        </Button>
      </div>

      {isLoading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorState message={(error as Error).message} onRetry={() => refetch()} />
      ) : !data ? null : (
        <div className="flex flex-col gap-3">
          <SummaryCard report={data} />
          <WeeklyTable report={data} />
          <CategoryDonut report={data} />
          <WeekdayWeekendBar report={data} />
          <MerchantRanking report={data} period={period} />
          <TopExpenses report={data} />
          <PaymentMethods report={data} />
        </div>
      )}
    </>
  );
}

function SummaryCard({ report }: { report: MonthReport }) {
  if (!report.hasBudget) {
    return (
      <Card className="border-brand/30 bg-brand-soft">
        <p className="text-sm font-semibold text-ink">Bulan ini belum ada budget</p>
        <p className="mt-1 text-xs text-ink-muted">
          Total terpakai {formatRupiah(report.totalSpent)}. Set budget biar angka jatah harian muncul.
        </p>
        <Button asChild size="md" className="mt-3">
          <Link to="/budget">Set budget</Link>
        </Button>
      </Card>
    );
  }

  const available = report.monthlyBudget + report.carryIn;
  const paceRatio = report.daysTotal > 0 ? report.daysElapsed / report.daysTotal : 0;

  return (
    <Card>
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-ink-muted">Sisa bulan ini</p>
          <p className="tabular mt-0.5 text-3xl font-bold text-ink">
            <Money amount={report.spendableRemaining} showOverBadge={false} />
          </p>
        </div>
        {report.isOverspent ? <OverBadge /> : null}
      </div>

      <div className="mt-4">
        <ProgressBar
          value={report.totalSpent}
          max={available}
          markerRatio={paceRatio}
          tone={report.isOverspent ? 'over' : 'brand'}
        />
        <div className="mt-1.5 flex justify-between text-[11px] text-ink-muted">
          <span>{formatRupiah(report.totalSpent)} terpakai</span>
          <span>dari {formatRupiah(available)}</span>
        </div>
        <p className="mt-1 text-[11px] text-ink-subtle">
          Garis penanda = seharusnya sampai hari ke-{report.daysElapsed} dari {report.daysTotal}.
        </p>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
        <Stat label="Budget" value={formatCompactRupiah(report.monthlyBudget)} />
        <Stat label="Carry-in" value={formatCompactRupiah(report.carryIn)} tone={report.carryIn < 0 ? 'over' : undefined} />
        <Stat label="Jatah/hari" value={formatCompactRupiah(report.dailyWeekdayRate)} />
      </dl>
    </Card>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'over' }) {
  return (
    <div className="rounded-xl bg-surface-sunken px-2 py-2">
      <dt className="text-[10px] text-ink-subtle">{label}</dt>
      <dd className={cn('tabular mt-0.5 text-sm font-semibold', tone === 'over' ? 'text-over' : 'text-ink')}>
        {value}
      </dd>
    </div>
  );
}

/**
 * The weekly table (PRD 9.5, item 3) -- the most important table in the app.
 *
 * Columns match Fixture B exactly so the numbers can be checked against the spec by eye.
 * It scrolls horizontally rather than wrapping, because collapsing a row would break the
 * left-to-right reading of the calculation.
 */
function WeeklyTable({ report }: { report: MonthReport }) {
  return (
    <Card>
      <CardHeader title="Rincian per minggu" description="Geser ke samping buat lihat semua kolom" />

      <div className="-mx-4 overflow-x-auto px-4">
        <table className="tabular w-full min-w-[38rem] border-collapse text-right text-xs">
          <thead>
            <tr className="border-b border-line text-ink-subtle">
              <th scope="col" className="py-2 text-left font-medium">Minggu</th>
              <th scope="col" className="py-2 font-medium">Budget</th>
              <th scope="col" className="py-2 font-medium">Weekday</th>
              <th scope="col" className="py-2 font-medium">Rollover</th>
              <th scope="col" className="py-2 font-medium">Weekend</th>
              <th scope="col" className="py-2 font-medium">Terpakai</th>
              <th scope="col" className="py-2 font-medium">Sisa</th>
            </tr>
          </thead>
          <tbody>
            {report.weeks.map((week) => (
              <tr
                key={week.weekIndex}
                className={cn('border-b border-line last:border-0', week.isCurrent && 'bg-brand-soft')}
              >
                <th scope="row" className="py-2 text-left font-medium text-ink">
                  W{week.weekIndex}
                  <span className="block text-[10px] font-normal text-ink-subtle">
                    {formatDayShort(week.startDate)}–{formatDayShort(week.endDate)}
                  </span>
                </th>
                <td className="py-2 text-ink-muted">{formatCompactRupiah(week.weekBudget)}</td>
                <td className="py-2 text-ink-muted">{formatCompactRupiah(week.weekdaySpent)}</td>
                <td className={cn('py-2', week.rolloverIn < 0 ? 'text-over' : 'text-ink-muted')}>
                  {formatCompactRupiah(week.rolloverIn)}
                </td>
                <td className="py-2 font-medium text-ink">{formatCompactRupiah(week.weekendBudget)}</td>
                <td className="py-2 text-ink-muted">{formatCompactRupiah(week.weekendSpent)}</td>
                <td className={cn('py-2 font-semibold', week.weekRemaining < 0 ? 'text-over' : 'text-ink')}>
                  {formatCompactRupiah(week.weekRemaining)}
                  {week.weekRemaining < 0 ? <span className="ml-1 text-[9px] font-bold">OVER</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/**
 * Spend by category (PRD 9.5, item 4) -- the answer to goal G1.
 *
 * Category colours are user-owned (PRD 7.4), so the chart cannot guarantee they are
 * distinguishable to a colourblind reader -- two of the seed colours are close. Identity
 * therefore never rests on the fill: every slice is named with its amount and share in the
 * legend beside it, and the segments are separated by a surface-coloured gap.
 */
function CategoryDonut({ report }: { report: MonthReport }) {
  if (report.byCategory.length === 0) {
    return (
      <Card>
        <CardHeader title="Uangnya lari ke mana" />
        <EmptyState title="Belum ada pengeluaran bulan ini" />
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader title="Uangnya lari ke mana" description={`Total ${formatRupiah(report.totalSpent)}`} />

      <div className="h-52 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={report.byCategory}
              dataKey="amount"
              nameKey="name"
              innerRadius="58%"
              outerRadius="88%"
              paddingAngle={2}
              stroke="var(--color-surface-raised)"
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
                borderRadius: 12,
                border: '1px solid var(--color-line)',
                background: 'var(--color-surface-raised)',
                fontSize: 12,
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <ul className="mt-2 flex flex-col gap-1.5">
        {report.byCategory.map((slice) => (
          <li key={slice.categoryId ?? 'none'} className="flex items-center gap-2 text-sm">
            <span
              aria-hidden
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: slice.color }}
            />
            <span className="flex-1 truncate text-ink">{slice.name}</span>
            <span className="tabular shrink-0 text-ink-muted">{Math.round(slice.share * 100)}%</span>
            <span className="tabular w-24 shrink-0 text-right font-medium text-ink">
              {formatRupiah(slice.amount)}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Weekday vs weekend (PRD 9.5, item 5): one measure, two bars, labelled directly. */
function WeekdayWeekendBar({ report }: { report: MonthReport }) {
  const data = [
    { label: 'Hari kerja', amount: report.weekdaySpent },
    { label: 'Weekend', amount: report.weekendSpent },
  ];

  return (
    <Card>
      <CardHeader title="Hari kerja vs weekend" />

      <div className="h-40 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 0, right: 56, top: 4, bottom: 4 }}>
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="label"
              axisLine={false}
              tickLine={false}
              width={80}
              tick={{ fill: 'var(--color-ink-muted)', fontSize: 12 }}
            />
            <Bar
              dataKey="amount"
              fill="var(--color-brand)"
              radius={[4, 4, 4, 4]}
              barSize={22}
              isAnimationActive={false}
              label={{
                position: 'right',
                formatter: (value: number) => formatCompactRupiah(value),
                fill: 'var(--color-ink)',
                fontSize: 12,
              }}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
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
      <Card>
        <CardHeader title="Tempat paling nguras" />
        <EmptyState title="Belum ada tempat tercatat" description="Isi kolom tempat pas nyatat biar ranking ini kebaca." />
      </Card>
    );
  }

  const rows = [...report.byMerchant].sort((a, b) => {
    // The "no place" bucket always stays at the bottom, whichever sort is active (PRD 6.18).
    if ((a.merchantKey === null) !== (b.merchantKey === null)) return a.merchantKey === null ? 1 : -1;
    return b[sortBy] - a[sortBy];
  });

  return (
    <Card>
      <CardHeader
        title="Tempat paling nguras"
        action={
          <div className="flex rounded-lg bg-surface-sunken p-0.5 text-[11px] font-semibold">
            <ToggleButton active={sortBy === 'amount'} onClick={() => setSortBy('amount')}>
              Total
            </ToggleButton>
            <ToggleButton active={sortBy === 'avgAmount'} onClick={() => setSortBy('avgAmount')}>
              Rata-rata
            </ToggleButton>
          </div>
        }
      />

      <ul className="divide-y divide-line">
        {rows.map((row) => {
          const content = (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">{row.displayName}</span>
                <span className="text-xs text-ink-muted">
                  {row.count}× {row.categoryName ? `· ${row.categoryName}` : ''}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="tabular block text-sm font-semibold text-ink">
                  {formatRupiah(sortBy === 'amount' ? row.amount : row.avgAmount)}
                </span>
                <span className="tabular block text-xs text-ink-muted">
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
                  className="flex items-center gap-3 py-2.5 active:bg-surface-sunken"
                >
                  {content}
                </Link>
              ) : (
                <div className="flex items-center gap-3 py-2.5">{content}</div>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function ToggleButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'min-h-0 rounded-md px-2.5 py-1.5 transition-colors',
        active ? 'bg-surface-raised text-ink shadow-sm' : 'text-ink-muted',
      )}
    >
      {children}
    </button>
  );
}

function TopExpenses({ report }: { report: MonthReport }) {
  if (report.topExpenses.length === 0) return null;

  return (
    <Card>
      <CardHeader title="Pengeluaran terbesar" />
      <ul className="divide-y divide-line">
        {report.topExpenses.map((expense) => (
          <li key={expense.id}>
            <Link to={`/expenses/${expense.id}`} data-tap className="flex items-center gap-3 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">
                  {expense.merchant ?? expense.categoryName ?? 'Tanpa tempat'}
                </span>
                <span className="block truncate text-xs text-ink-muted">
                  {formatDayShort(expense.spentOn)}
                  {expense.note ? ` · ${expense.note}` : ''}
                </span>
              </span>
              <span className="tabular shrink-0 text-sm font-semibold text-ink">
                {formatRupiah(expense.amount)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function PaymentMethods({ report }: { report: MonthReport }) {
  if (report.byPaymentMethod.length === 0) return null;

  return (
    <Card>
      <CardHeader title="Metode bayar" />
      <ul className="divide-y divide-line">
        {report.byPaymentMethod.map((row) => (
          <li key={row.paymentMethod} className="flex items-center gap-3 py-2">
            <span className="flex-1 text-sm text-ink">
              {PAYMENT_METHOD_LABELS[row.paymentMethod as PaymentMethod] ?? row.paymentMethod}
            </span>
            <span className="text-xs text-ink-muted">{row.count}×</span>
            <span className="tabular w-24 text-right text-sm font-medium text-ink">
              {formatRupiah(row.amount)}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
