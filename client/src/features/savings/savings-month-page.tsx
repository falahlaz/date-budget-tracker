import { useState } from 'react';
import { PageHeader } from '@/components/app-shell';
import { StepButton } from '@/components/ui/button';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/feedback';
import { ReceiptCard, ReceiptLine, ReceiptRule, ReceiptTotal } from '@/components/ui/receipt';
import { SectionHead } from '@/components/ui/section';
import { cn } from '@/lib/cn';
import { formatDayShort, formatPeriodLong, formatRupiah } from '@/lib/format';
import { currentPeriod, shiftPeriod } from '@/lib/today';
import type { SavingsMonthReport, SavingsWithdrawalRow } from '@/types/api';
import { useSavingsMonthReport } from './hooks';

/**
 * The savings month screen (PRD v2 11.5).
 *
 * Same receipt card as the date wallet's week, because that format is already proven to
 * read at a glance and a second visual language for the same idea would be worse than
 * either. Below it, the list this whole feature exists for.
 */
export function SavingsMonthPage() {
  const [period, setPeriod] = useState(currentPeriod());
  const { data, isLoading, error, refetch } = useSavingsMonthReport(period);

  return (
    <>
      <PageHeader eyebrow="Rincian bulanan" title="Bulan" />

      <div className="mb-6 flex items-center justify-between gap-2">
        <StepButton onClick={() => setPeriod(shiftPeriod(period, -1))} aria-label="Bulan sebelumnya">
          ‹
        </StepButton>
        <div className="min-w-0 text-center">
          <div className="text-[15px] font-semibold text-ink">{formatPeriodLong(period)}</div>
          {data?.planPerMonth ? (
            <div className="mt-0.5 text-[11.5px] text-ink-3">
              Rencana {formatRupiah(data.planPerMonth)}/bulan
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
          <MonthReceipt report={data} />
          <Withdrawals report={data} />
          <ByCategory report={data} />
        </>
      )}
    </>
  );
}

/**
 * Saldo awal → setoran → pelunasan → setoran baru → penarikan → saldo akhir.
 *
 * "Pelunasan" is subtracted from the deposit and "setoran baru" introduced by a rule,
 * because that intermediate figure is the one that measures progress: a deposit that only
 * patched an earlier withdrawal moved the balance without moving the goal (v2 5.3).
 */
function MonthReceipt({ report }: { report: SavingsMonthReport }) {
  return (
    <div className="mb-7">
      <ReceiptCard caption={`Alur tabungan ${formatPeriodLong(report.period)}`}>
        <ReceiptLine label="Saldo awal" amount={report.openingBalance} />
        <ReceiptLine label="Setoran" amount={report.depositTotal} tone="pos" signed />
        {report.transferInTotal > 0 ? (
          <ReceiptLine
            label="— termasuk masuk dari dompet lain"
            amount={report.transferInTotal}
            tone="neutral"
          />
        ) : null}
        <ReceiptLine label="Dipakai nutup utang" amount={report.repaymentTotal} tone="neg" signed="minus" />

        <ReceiptRule />

        <ReceiptLine label="Setoran baru" amount={report.freshContribution} strong />
        {report.planPerMonth !== null && report.vsPlan !== null ? (
          <ReceiptLine
            label="Dibanding rencana"
            detail={`rencana ${formatRupiah(report.planPerMonth)}/bulan`}
            amount={report.vsPlan}
            tone={report.vsPlan < 0 ? 'neg' : 'pos'}
            signed
          />
        ) : null}

        <ReceiptRule />

        <ReceiptLine label="Penarikan" amount={report.withdrawTotal} tone="neg" signed="minus" />
        {report.transferOutTotal > 0 ? (
          <ReceiptLine
            label="— termasuk pindah ke dompet lain"
            amount={report.transferOutTotal}
            tone="neutral"
          />
        ) : null}

        <ReceiptRule double />

        <ReceiptTotal
          label="Saldo akhir"
          amount={report.closingBalance}
          note={
            report.outstandingAdvanceAtClose > 0 ? (
              <span>
                Akhir bulan ini masih ada {formatRupiah(report.outstandingAdvanceAtClose)} yang
                belum dibalikin.
              </span>
            ) : undefined
          }
        />
      </ReceiptCard>
    </div>
  );
}

/**
 * The list this screen exists for (PRD v2 11.5, goal G2).
 *
 * One row per withdrawal with the reason as the headline, before the category breakdown
 * and not a donut. What Falah is looking for when he opens this screen is a sentence, not
 * a percentage -- the aggregate can only ever tell him which bucket, never which decision.
 */
function Withdrawals({ report }: { report: SavingsMonthReport }) {
  if (report.withdrawals.length === 0) {
    return (
      <section className="mb-7">
        <SectionHead title="Penarikan" />
        <EmptyState
          title="Nggak ada penarikan bulan ini"
          description="Sebulan penuh tanpa nyolek tabungan."
        />
      </section>
    );
  }

  return (
    <section className="mb-7">
      <SectionHead title={`Penarikan · ${report.withdrawals.length}`} />
      <ul className="divide-y divide-line">
        {report.withdrawals.map((withdrawal) => (
          <WithdrawalRow key={withdrawal.id} withdrawal={withdrawal} />
        ))}
      </ul>
    </section>
  );
}

function WithdrawalRow({ withdrawal }: { withdrawal: SavingsWithdrawalRow }) {
  return (
    <li className="flex items-start gap-3 py-3">
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-medium text-ink">
          {withdrawal.reason ?? 'Tanpa alasan'}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink-3">
          <span>{formatDayShort(withdrawal.occurredOn)}</span>
          {withdrawal.categoryName ? (
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className="h-[6px] w-[6px] rounded-full"
                style={{ backgroundColor: withdrawal.categoryColor ?? 'var(--line-strong)' }}
              />
              {withdrawal.categoryName}
            </span>
          ) : null}
          {withdrawal.expectedReturn ? (
            <span
              className={cn(
                'rounded-xs px-1.5 py-0.5 font-mono text-[9px] tracking-[0.08em] uppercase',
                withdrawal.settled ? 'bg-pos-soft text-pos' : 'bg-neg-soft text-neg',
              )}
            >
              {withdrawal.settled ? 'Lunas' : 'Utang'}
            </span>
          ) : null}
        </span>
      </span>

      <span className="tabular shrink-0 text-[13.5px] font-semibold text-ink">
        {formatRupiah(withdrawal.amount)}
      </span>
    </li>
  );
}

/** The supporting act, deliberately after the list of reasons. */
function ByCategory({ report }: { report: SavingsMonthReport }) {
  if (report.withdrawalsByCategory.length === 0) return null;

  return (
    <section className="mb-7">
      <SectionHead title="Per kategori" />
      <ul className="flex flex-col gap-2.5">
        {report.withdrawalsByCategory.map((row) => (
          <li key={row.categoryId ?? 'none'} className="flex items-center gap-3">
            <span
              aria-hidden
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: row.color || 'var(--line-strong)' }}
            />
            <span className="min-w-0 flex-1 truncate text-[13px] text-ink-2">{row.name}</span>
            <span className="shrink-0 text-[11px] text-ink-3">{row.count}×</span>
            <span className="tabular shrink-0 text-[13px] font-medium text-ink">
              {formatRupiah(row.amount)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
