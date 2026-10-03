import { ReceiptText } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/feedback';
import { SectionHead, SectionLink } from '@/components/ui/section';
import { formatRupiah } from '@/lib/format';
import type { Bill } from '@/types/api';
import { BillRow } from './bill-row';
import { BillSheet } from './bill-sheet';
import { useBills } from './hooks';
import { PayBillSheet } from './pay-bill-sheet';

const SHOWN = 3;

/**
 * The bills card on every wallet's Home.
 *
 * Bills belong to the user, not a wallet, so this is the same card whichever wallet is
 * open -- that is what makes "open any wallet, see what I owe" true without a tab of its
 * own. It shows only what needs doing: the most urgent few, each payable in place.
 */
export function BillsHomeCard() {
  const navigate = useNavigate();
  const { data, isLoading } = useBills();
  const [paying, setPaying] = useState<Bill | null>(null);
  const [creating, setCreating] = useState(false);

  if (isLoading) {
    return (
      <section className="mb-7">
        <Skeleton className="h-28 w-full" />
      </section>
    );
  }

  const items = data?.items ?? [];
  const summary = data?.summary;

  // Nothing recorded yet: one quiet line, not an empty state shouting on every Home.
  if (items.length === 0 || !summary) {
    return (
      <section className="mb-7">
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex w-full items-center gap-3 rounded-lg border border-dashed border-line px-4 py-3.5 text-left text-[13px] text-ink-2 transition-colors hover:border-line-strong"
        >
          <ReceiptText className="h-5 w-5 shrink-0 text-ink-3" aria-hidden />
          <span className="flex-1">Catat tagihan bulanan lo di sini, biar nggak kelewat.</span>
          <span className="font-medium text-accent-ink">Tambah</span>
        </button>
        <BillSheet open={creating} onClose={() => setCreating(false)} bill={null} />
      </section>
    );
  }

  // The server already sorts most urgent first; paid and finished ones stay on /bills.
  const pending = items.filter(
    (bill) => bill.schedule.status !== 'PAID' && bill.schedule.status !== 'DONE',
  );
  const shown = pending.slice(0, SHOWN);

  return (
    <section className="mb-7">
      <SectionHead
        title="Tagihan"
        action={<SectionLink onClick={() => navigate('/bills')}>Semua</SectionLink>}
      />

      <Card className="px-4 py-3">
        {summary.monthlyCount > 0 ? (
          <p className="mb-1.5 text-[12px] text-ink-3">
            Total tagihan bulan ini{' '}
            <span className="tabular font-medium text-ink-2">{formatRupiah(summary.monthlyTotal)}</span>
          </p>
        ) : null}
        {summary.unpaidDueCount > 0 ? (
          <p className="border-b border-line pb-3 text-[13px] text-ink-2">
            Belum dibayar{' '}
            <b className="tabular font-semibold text-ink">{formatRupiah(summary.unpaidDueTotal)}</b>
            {summary.overdueCount > 0 ? (
              <span className="font-medium text-neg"> · {summary.overdueCount} telat</span>
            ) : null}
          </p>
        ) : (
          <p className="text-[13px] text-pos">
            Semua tagihan bulan ini beres ✓
            {shown.length > 0 ? <span className="text-ink-3"> · berikutnya:</span> : null}
          </p>
        )}

        {shown.length > 0 ? (
          <ul className="divide-y divide-line">
            {shown.map((bill) => (
              <BillRow key={bill.id} bill={bill} onPay={setPaying} />
            ))}
          </ul>
        ) : null}

        {pending.length > SHOWN ? (
          <button
            type="button"
            onClick={() => navigate('/bills')}
            className="w-full border-t border-line pt-3 text-center text-xs font-medium text-accent-ink"
          >
            +{pending.length - SHOWN} tagihan lagi
          </button>
        ) : null}
      </Card>

      <PayBillSheet bill={paying} onClose={() => setPaying(null)} />
    </section>
  );
}
