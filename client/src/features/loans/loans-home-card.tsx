import { HandCoins } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/feedback';
import { SectionHead, SectionLink } from '@/components/ui/section';
import { formatRupiah } from '@/lib/format';
import type { Loan } from '@/types/api';
import { useLoans } from './hooks';
import { LoanRow } from './loan-row';
import { LoanSheet } from './loan-sheet';
import { RepayLoanSheet } from './repay-loan-sheet';

const SHOWN = 3;

/**
 * The loans card on every wallet's Home, next to the bills: what is still owed to the
 * user, most urgent first, each one taggable in place. Once everything is paid back the
 * card shrinks to one quiet line.
 */
export function LoansHomeCard() {
  const navigate = useNavigate();
  const { data, isLoading } = useLoans();
  const [repaying, setRepaying] = useState<Loan | null>(null);
  const [creating, setCreating] = useState(false);

  if (isLoading) {
    return (
      <section className="mb-7">
        <Skeleton className="h-20 w-full" />
      </section>
    );
  }

  const open = (data?.items ?? []).filter((loan) => loan.status !== 'SETTLED');
  const summary = data?.summary;

  if (open.length === 0 || !summary) {
    return (
      <section className="mb-7">
        <button
          type="button"
          onClick={() => ((data?.items.length ?? 0) > 0 ? navigate('/loans') : setCreating(true))}
          className="flex w-full items-center gap-3 rounded-lg border border-dashed border-line px-4 py-3.5 text-left text-[13px] text-ink-2 transition-colors hover:border-line-strong"
        >
          <HandCoins className="h-5 w-5 shrink-0 text-ink-3" aria-hidden />
          <span className="flex-1">
            {(data?.items.length ?? 0) > 0
              ? 'Nggak ada yang ngutang ke lo sekarang ✓'
              : 'Ada yang minjem duit? Catat di sini biar gampang nagih.'}
          </span>
          <span className="font-medium text-accent-ink">
            {(data?.items.length ?? 0) > 0 ? 'Lihat' : 'Catat'}
          </span>
        </button>
        <LoanSheet open={creating} onClose={() => setCreating(false)} loan={null} />
      </section>
    );
  }

  const shown = open.slice(0, SHOWN);

  return (
    <section className="mb-7">
      <SectionHead
        title="Piutang"
        action={<SectionLink onClick={() => navigate('/loans')}>Semua</SectionLink>}
      />

      <Card className="px-4 py-3">
        <p className="border-b border-line pb-3 text-[13px] text-ink-2">
          Masih di luar{' '}
          <b className="tabular font-semibold text-ink">{formatRupiah(summary.outstandingTotal)}</b>
          {summary.overdueCount > 0 ? (
            <span className="font-medium text-neg"> · {summary.overdueCount} telat</span>
          ) : null}
        </p>

        <ul className="divide-y divide-line">
          {shown.map((loan) => (
            <LoanRow key={loan.id} loan={loan} onRepay={setRepaying} />
          ))}
        </ul>

        {open.length > SHOWN ? (
          <button
            type="button"
            onClick={() => navigate('/loans')}
            className="w-full border-t border-line pt-3 text-center text-xs font-medium text-accent-ink"
          >
            +{open.length - SHOWN} pinjaman lagi
          </button>
        ) : null}
      </Card>

      <RepayLoanSheet loan={repaying} onClose={() => setRepaying(null)} />
    </section>
  );
}
