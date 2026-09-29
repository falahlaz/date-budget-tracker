import { HandCoins, Plus } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/feedback';
import { MoneyHero } from '@/components/ui/money';
import { SectionHead } from '@/components/ui/section';
import { formatRupiah } from '@/lib/format';
import type { Loan } from '@/types/api';
import { useLoans } from './hooks';
import { LoanRow } from './loan-row';
import { LoanSheet } from './loan-sheet';
import { RepayLoanSheet } from './repay-loan-sheet';

/**
 * Every loan, grouped the way a person chases them: late first, then still open, then
 * the ones already paid back. Above them, the one number that matters -- how much is
 * still out there -- and who holds it.
 */
export function LoansPage() {
  const { data, isLoading, error, refetch } = useLoans();
  const [repaying, setRepaying] = useState<Loan | null>(null);
  const [creating, setCreating] = useState(false);

  if (isLoading) return <LoadingBlock />;
  if (error) return <ErrorState message={(error as Error).message} onRetry={() => refetch()} />;
  if (!data) return null;

  const { items, summary } = data;
  const groups: { title: string; loans: Loan[] }[] = [
    { title: 'Telat', loans: items.filter((loan) => loan.status === 'OVERDUE') },
    { title: 'Belum lunas', loans: items.filter((loan) => loan.status === 'ACTIVE') },
    { title: 'Udah lunas', loans: items.filter((loan) => loan.status === 'SETTLED') },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Piutang"
        title="Pinjaman"
        action={
          <Button
            size="icon"
            variant="secondary"
            aria-label="Catat pinjaman"
            onClick={() => setCreating(true)}
          >
            <Plus className="h-5 w-5" />
          </Button>
        }
      />

      {items.length === 0 ? (
        <EmptyState
          icon={<HandCoins className="h-8 w-8" />}
          title="Belum ada yang minjem"
          description="Catat tiap kali ada yang minjem duit ke lo — dari dompet mana, berapa — biar nggak lupa nagih."
          action={<Button onClick={() => setCreating(true)}>Catat pinjaman</Button>}
        />
      ) : (
        <>
          <section className="mb-7">
            <div className="label-micro mb-2">Masih di luar</div>
            <MoneyHero
              amount={summary.outstandingTotal}
              tone={summary.overdueCount > 0 ? 'over' : 'neutral'}
            />
            <p className="mt-3 text-[13px] text-ink-2">
              {summary.outstandingCount > 0
                ? `${summary.outstandingCount} pinjaman belum lunas`
                : 'Semua udah balik ✓'}
              {summary.overdueCount > 0 ? ` · ${summary.overdueCount} telat` : ''}
            </p>
          </section>

          {summary.borrowers.length > 1 ? (
            <section className="mb-7">
              <SectionHead title="Per orang" />
              <ul className="divide-y divide-line">
                {summary.borrowers.map((borrower) => (
                  <li key={borrower.name} className="flex items-baseline gap-3 py-2.5">
                    <span className="min-w-0 flex-1 truncate text-sm text-ink">
                      {borrower.name}
                      {borrower.loanCount > 1 ? (
                        <span className="text-ink-3"> · {borrower.loanCount}x</span>
                      ) : null}
                    </span>
                    <span className="tabular shrink-0 font-mono text-[13px] font-medium text-ink">
                      {formatRupiah(borrower.outstanding)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {groups.map((group) =>
            group.loans.length > 0 ? (
              <section key={group.title} className="mb-6">
                <SectionHead title={`${group.title} · ${group.loans.length}`} />
                <ul className="divide-y divide-line">
                  {group.loans.map((loan) => (
                    <LoanRow key={loan.id} loan={loan} onRepay={setRepaying} />
                  ))}
                </ul>
              </section>
            ) : null,
          )}
        </>
      )}

      <RepayLoanSheet loan={repaying} onClose={() => setRepaying(null)} />
      <LoanSheet open={creating} onClose={() => setCreating(false)} loan={null} />
    </>
  );
}
