import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { EmptyState, LoadingBlock } from '@/components/ui/feedback';
import { Field, Input } from '@/components/ui/input';
import { Money } from '@/components/ui/money';
import { useMonthReport } from '@/features/reports/hooks';
import {
  formatAmountInput,
  formatPeriodLong,
  formatPeriodShort,
  formatRoundedRate,
  formatRupiah,
  parseAmountInput,
} from '@/lib/format';
import { currentPeriod, shiftPeriod } from '@/lib/today';
import { useBudget, useBudgetHistory, useUpsertBudget } from './hooks';

/** S8 Budget Setup (PRD 9.7). */
export function BudgetPage() {
  const [period, setPeriod] = useState(currentPeriod());
  const budget = useBudget(period);
  const report = useMonthReport(period);
  const history = useBudgetHistory();
  const upsert = useUpsertBudget();

  const [amountText, setAmountText] = useState('');

  useEffect(() => {
    setAmountText(budget.data ? formatAmountInput(String(budget.data.amount)) : '');
  }, [budget.data, period]);

  const amount = parseAmountInput(amountText);
  const weekdayCount = report.data?.weekdayCount ?? 0;
  const previewRate = weekdayCount > 0 ? Math.floor(amount / weekdayCount) : 0;
  const hasSpending = (report.data?.totalSpent ?? 0) > 0;

  const save = async () => {
    await upsert.mutateAsync({ period, amount });
    toast.success(`Budget ${formatPeriodLong(period)} tersimpan`);
  };

  return (
    <>
      <PageHeader title="Budget" subtitle="Jatah harian dihitung dari sini" />

      <div className="mb-3 flex items-center gap-2">
        <Button variant="secondary" size="icon" onClick={() => setPeriod(shiftPeriod(period, -1))} aria-label="Bulan sebelumnya">
          ‹
        </Button>
        <span className="flex-1 text-center text-sm font-semibold text-ink">
          {formatPeriodLong(period)}
        </span>
        <Button variant="secondary" size="icon" onClick={() => setPeriod(shiftPeriod(period, 1))} aria-label="Bulan berikutnya">
          ›
        </Button>
      </div>

      <Card className="mb-3">
        <Field label={`Budget ${formatPeriodLong(period)}`} required>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lg font-semibold text-ink-muted">
              Rp
            </span>
            <Input
              inputMode="numeric"
              placeholder="0"
              value={amountText}
              onChange={(event) => setAmountText(formatAmountInput(event.target.value))}
              className="tabular pl-11 text-2xl font-bold"
            />
          </div>
        </Field>

        {/* Live preview so the daily number is visible before committing (PRD 9.7). */}
        {amount > 0 && weekdayCount > 0 ? (
          <p className="mt-3 rounded-xl bg-surface-sunken px-3 py-2.5 text-sm text-ink">
            {weekdayCount} hari weekday · <strong>{formatRoundedRate(previewRate)}/hari</strong>
            {report.data && report.data.carryIn !== 0 ? (
              <>
                {' · carry-in dari '}
                {formatPeriodShort(shiftPeriod(period, -1))}: <Money amount={report.data.carryIn} />
              </>
            ) : null}
          </p>
        ) : null}

        {hasSpending && budget.data ? (
          <p className="mt-2 rounded-xl bg-warn-soft px-3 py-2.5 text-xs text-warn">
            Bulan ini udah ada pengeluaran. Ganti budget bakal ngitung ulang semua angka bulan ini
            dan bulan-bulan sesudahnya.
          </p>
        ) : null}

        <Button size="lg" className="mt-3 w-full" onClick={save} disabled={amount < 1 || upsert.isPending}>
          {upsert.isPending ? 'Menyimpan…' : budget.data ? 'Perbarui budget' : 'Simpan budget'}
        </Button>
      </Card>

      <Card>
        <CardHeader title="Riwayat budget" />

        {history.isLoading ? (
          <LoadingBlock />
        ) : !history.data || history.data.items.length === 0 ? (
          <EmptyState title="Belum ada budget tersimpan" />
        ) : (
          <div className="-mx-4 overflow-x-auto px-4">
            <table className="tabular w-full min-w-[26rem] border-collapse text-right text-xs">
              <thead>
                <tr className="border-b border-line text-ink-subtle">
                  <th scope="col" className="py-2 text-left font-medium">Bulan</th>
                  <th scope="col" className="py-2 font-medium">Budget</th>
                  <th scope="col" className="py-2 font-medium">Terpakai</th>
                  <th scope="col" className="py-2 font-medium">Sisa</th>
                </tr>
              </thead>
              <tbody>
                {history.data.items.map((row) => (
                  <tr key={row.period} className="border-b border-line last:border-0">
                    <th scope="row" className="py-2 text-left font-medium text-ink">
                      <button type="button" className="min-h-0 underline-offset-2 hover:underline" onClick={() => setPeriod(row.period)}>
                        {formatPeriodShort(row.period)}
                      </button>
                    </th>
                    <td className="py-2 text-ink-muted">{formatRupiah(row.amount)}</td>
                    <td className="py-2 text-ink-muted">{formatRupiah(row.totalSpent)}</td>
                    <td className="py-2 font-semibold">
                      <Money amount={row.carryOut} showOverBadge={false} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
