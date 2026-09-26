import { Plus, ReceiptText } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/feedback';
import { MoneyHero } from '@/components/ui/money';
import { SectionHead } from '@/components/ui/section';
import { currentPeriod } from '@/lib/today';
import { formatPeriodLong, formatRupiah } from '@/lib/format';
import type { Bill } from '@/types/api';
import { BillRow } from './bill-row';
import { BillSheet } from './bill-sheet';
import { useBills } from './hooks';
import { PayBillSheet } from './pay-bill-sheet';

/**
 * Every bill, grouped by what the user has to do about it: late first, then this month,
 * then what is already settled. The groups are the order a person pays them in.
 */
export function BillsPage() {
  const [showArchived, setShowArchived] = useState(false);
  const { data, isLoading, error, refetch } = useBills(showArchived);
  const [paying, setPaying] = useState<Bill | null>(null);
  const [creating, setCreating] = useState(false);

  if (isLoading) return <LoadingBlock />;
  if (error) return <ErrorState message={(error as Error).message} onRetry={() => refetch()} />;
  if (!data) return null;

  const period = currentPeriod();
  const active = data.items.filter((bill) => !bill.isArchived);
  const archived = data.items.filter((bill) => bill.isArchived);

  const groups: { title: string; bills: Bill[] }[] = [
    { title: 'Telat', bills: active.filter((b) => b.schedule.status === 'OVERDUE') },
    {
      title: 'Bulan ini',
      bills: active.filter(
        (b) =>
          (b.schedule.status === 'DUE_SOON' || b.schedule.status === 'UPCOMING') &&
          (b.schedule.nextPeriod ?? '') <= period,
      ),
    },
    {
      title: 'Nanti',
      bills: active.filter(
        (b) =>
          (b.schedule.status === 'DUE_SOON' || b.schedule.status === 'UPCOMING') &&
          (b.schedule.nextPeriod ?? '') > period,
      ),
    },
    { title: 'Udah dibayar bulan ini', bills: active.filter((b) => b.schedule.status === 'PAID') },
    { title: 'Selesai', bills: active.filter((b) => b.schedule.status === 'DONE') },
    { title: 'Arsip', bills: archived },
  ];

  return (
    <>
      <PageHeader
        eyebrow={formatPeriodLong(period)}
        title="Tagihan"
        action={
          <Button size="icon" variant="secondary" aria-label="Tambah tagihan" onClick={() => setCreating(true)}>
            <Plus className="h-5 w-5" />
          </Button>
        }
      />

      {active.length === 0 && archived.length === 0 ? (
        <EmptyState
          icon={<ReceiptText className="h-8 w-8" />}
          title="Belum ada tagihan"
          description="Cicilan, langganan, listrik — catat sekali, tiap bulan tinggal tap Bayar."
          action={<Button onClick={() => setCreating(true)}>Tambah tagihan</Button>}
        />
      ) : (
        <>
          <section className="mb-7">
            <div className="label-micro mb-2">Belum dibayar sampai bulan ini</div>
            <MoneyHero
              amount={data.summary.unpaidDueTotal}
              tone={data.summary.overdueCount > 0 ? 'over' : 'neutral'}
            />
            <p className="mt-3 text-[13px] text-ink-2">
              Udah dibayar bulan ini{' '}
              <b className="tabular font-semibold text-ink">
                {formatRupiah(data.summary.paidThisMonthTotal)}
              </b>
              {data.summary.overdueCount > 0
                ? ` · ${data.summary.overdueCount} tagihan telat`
                : ''}
            </p>
          </section>

          {groups.map((group) =>
            group.bills.length > 0 ? (
              <section key={group.title} className="mb-6">
                <SectionHead title={`${group.title} · ${group.bills.length}`} />
                <ul className="divide-y divide-line">
                  {group.bills.map((bill) => (
                    <BillRow key={bill.id} bill={bill} onPay={setPaying} />
                  ))}
                </ul>
              </section>
            ) : null,
          )}

        </>
      )}

      <button
        type="button"
        onClick={() => setShowArchived((value) => !value)}
        className="min-h-11 text-xs font-medium text-ink-3 hover:text-ink-2"
      >
        {showArchived ? 'Sembunyiin arsip' : 'Lihat tagihan yang diarsip'}
      </button>

      <PayBillSheet bill={paying} onClose={() => setPaying(null)} />
      <BillSheet open={creating} onClose={() => setCreating(false)} bill={null} />
    </>
  );
}
