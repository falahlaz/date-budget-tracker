import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/app-shell';
import { Button, StepButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, LoadingBlock } from '@/components/ui/feedback';
import { Field, Input } from '@/components/ui/input';
import { Money } from '@/components/ui/money';
import { SectionHead } from '@/components/ui/section';
import { useMonthReport } from '@/features/reports/hooks';
import {
  formatAmountInput,
  formatPeriodLong,
  formatPeriodShort,
  formatRoundedRate,
  formatRupiah,
  parseAmountInput,
} from '@/lib/format';
import { cn } from '@/lib/cn';
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
      <PageHeader eyebrow="Jatah harian dihitung dari sini" title="Budget" />

      <div className="mb-6 flex items-center justify-between gap-2">
        <StepButton
          onClick={() => setPeriod(shiftPeriod(period, -1))}
          aria-label="Bulan sebelumnya"
        >
          ‹
        </StepButton>
        <div className="text-[15px] font-semibold text-ink">{formatPeriodLong(period)}</div>
        <StepButton onClick={() => setPeriod(shiftPeriod(period, 1))} aria-label="Bulan berikutnya">
          ›
        </StepButton>
      </div>

      <Card className="mb-7">
        <Field label={`Budget ${formatPeriodLong(period)}`} required>
          <div className="flex items-baseline gap-2 border-b-2 border-accent pb-3">
            <span className="font-mono text-[13px] font-medium text-ink-3">Rp</span>
            <Input
              inputMode="numeric"
              placeholder="0"
              value={amountText}
              onChange={(event) => setAmountText(formatAmountInput(event.target.value))}
              className={cn(
                'amount-display h-auto min-h-0 rounded-none border-0 bg-transparent p-0 text-[32px] focus:border-0',
                amountText === '' && 'text-ink-3',
              )}
            />
          </div>
        </Field>

        {/* Live preview so the daily number is visible before committing (PRD 9.7). */}
        {amount > 0 && weekdayCount > 0 ? (
          <p className="mt-4 rounded-md bg-surface-2 px-3.5 py-3 text-sm text-ink">
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
          <p className="mt-3 rounded-md border border-warn/30 bg-warn-soft px-3.5 py-3 text-xs text-warn">
            Bulan ini udah ada pengeluaran. Ganti budget bakal ngitung ulang semua angka bulan ini
            dan bulan-bulan sesudahnya.
          </p>
        ) : null}

        <Button
          size="lg"
          className="mt-4 w-full"
          onClick={save}
          disabled={amount < 1 || upsert.isPending}
        >
          {upsert.isPending ? 'Menyimpan…' : budget.data ? 'Perbarui budget' : 'Simpan budget'}
        </Button>
      </Card>

      <section>
        <SectionHead title="Riwayat budget" />

        {history.isLoading ? (
          <LoadingBlock />
        ) : !history.data || history.data.items.length === 0 ? (
          <EmptyState title="Belum ada budget tersimpan" />
        ) : (
          <div className="-mx-5 overflow-x-auto px-5 pb-1">
            <table className="tabular w-full min-w-[26rem] border-collapse text-right font-mono text-[11.5px] whitespace-nowrap">
              <thead>
                <tr className="border-b border-line-strong">
                  {['Bulan', 'Budget', 'Terpakai', 'Sisa'].map((heading, index) => (
                    <th
                      key={heading}
                      scope="col"
                      className={cn(
                        'py-2.5 pr-2 text-[9.5px] font-medium tracking-[0.1em] text-ink-3 uppercase',
                        index === 0 && 'pl-0 text-left',
                        index === 3 && 'pr-0',
                      )}
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.data.items.map((row) => (
                  <tr key={row.period} className="border-b border-line last:border-0">
                    <th scope="row" className="py-2.5 pr-2 text-left font-medium text-ink">
                      <button
                        type="button"
                        className="min-h-0 underline-offset-2 hover:underline"
                        onClick={() => setPeriod(row.period)}
                      >
                        {formatPeriodShort(row.period)}
                      </button>
                    </th>
                    <td className="py-2.5 pr-2 text-ink-2">{formatRupiah(row.amount)}</td>
                    <td className="py-2.5 pr-2 text-ink-2">{formatRupiah(row.totalSpent)}</td>
                    <td className="py-2.5 font-medium">
                      <Money amount={row.carryOut} showOverBadge={false} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
