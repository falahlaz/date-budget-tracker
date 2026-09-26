import { ArrowLeft, Archive, ArchiveRestore, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { HeaderChrome } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/feedback';
import { SectionHead } from '@/components/ui/section';
import { Sheet } from '@/components/ui/sheet';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDayShort, formatPeriodShort, formatRupiah } from '@/lib/format';
import {
  BILL_CATEGORY_LABELS,
  BILL_KIND_LABELS,
  billStatusLine,
  installmentLine,
  periodLabel,
} from './bill-labels';
import { BillSheet } from './bill-sheet';
import { useBill, useDeleteBill, useUpdateBill } from './hooks';
import { PayBillSheet } from './pay-bill-sheet';

const TONE_TEXT = { over: 'text-neg', warn: 'text-warn', ok: 'text-pos', idle: 'text-ink-2' } as const;

/** One bill: where it stands, how it recurs, and every payment made against it. */
export function BillDetailPage() {
  const { id } = useParams();
  const billId = Number(id);
  const navigate = useNavigate();

  const { data: bill, isLoading, error, refetch } = useBill(billId);
  const update = useUpdateBill();
  const remove = useDeleteBill();
  const [editing, setEditing] = useState(false);
  const [paying, setPaying] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  if (isLoading) return <LoadingBlock />;
  if (error) return <ErrorState message={(error as Error).message} onRetry={() => refetch()} />;
  if (!bill) return null;

  const status = billStatusLine(bill);
  const installment = installmentLine(bill);
  const payable = !bill.isArchived && bill.schedule.status !== 'DONE';

  const schedule =
    bill.kind === 'ONE_TIME'
      ? `Jatuh tempo ${formatDayShort(`${bill.startPeriod}-${String(bill.dueDay).padStart(2, '0')}`)} ${bill.startPeriod.slice(0, 4)}`
      : bill.kind === 'INSTALLMENT'
        ? `Tiap tgl ${bill.dueDay}, ${formatPeriodShort(bill.startPeriod)} – ${formatPeriodShort(bill.endPeriod ?? bill.startPeriod)}`
        : `Tiap tgl ${bill.dueDay}, mulai ${formatPeriodShort(bill.startPeriod)}`;

  const toggleArchive = async () => {
    try {
      await update.mutateAsync({ id: bill.id, isArchived: !bill.isArchived });
      toast.success(bill.isArchived ? 'Tagihan dipulihin' : 'Tagihan diarsip');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Gagal menyimpan');
    }
  };

  const deleteBill = async () => {
    try {
      const result = await remove.mutateAsync(bill.id);
      toast.success(result.archived ? 'Udah ada pembayaran, jadi diarsip' : 'Tagihan dihapus');
      navigate('/bills', { replace: true });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Gagal menghapus');
    }
  };

  return (
    <>
      <div className="-mx-2 mb-5 flex items-center gap-1">
        <Button asChild variant="ghost" size="icon" aria-label="Kembali">
          <Link to="/bills">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <h1 className="title-display flex-1 truncate text-lg text-ink">{bill.name}</h1>
        <HeaderChrome />
      </div>

      <Card className="mb-7">
        <div className="label-micro mb-2 text-[10px] tracking-[0.14em]">
          {BILL_KIND_LABELS[bill.kind] === BILL_CATEGORY_LABELS[bill.category]
            ? BILL_KIND_LABELS[bill.kind]
            : `${BILL_KIND_LABELS[bill.kind]} · ${BILL_CATEGORY_LABELS[bill.category]}`}
          {bill.isArchived ? ' · Diarsip' : ''}
        </div>
        <p className="amount-display text-[32px] text-ink">{formatRupiah(bill.amount)}</p>
        <p className={cn('mt-1.5 text-[13px] font-medium', TONE_TEXT[status.tone])}>{status.text}</p>

        <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-4 text-sm">
          <Detail label="Platform" value={bill.platform ?? '—'} />
          <Detail label="Jadwal" value={schedule} />
          {installment ? <Detail label="Progres" value={installment} /> : null}
          {bill.schedule.nextPeriod ? (
            <Detail label="Berikutnya" value={periodLabel(bill.schedule.nextPeriod)} />
          ) : null}
          {bill.note ? <Detail label="Catatan" value={bill.note} /> : null}
        </dl>

        <div className="mt-5 flex gap-2">
          {payable ? (
            <Button className="flex-1" onClick={() => setPaying(true)}>
              Bayar
            </Button>
          ) : null}
          <Button variant="secondary" className="flex-1" onClick={() => setEditing(true)}>
            Ubah
          </Button>
          <Button
            variant="secondary"
            size="icon"
            onClick={() => void toggleArchive()}
            aria-label={bill.isArchived ? 'Pulihin' : 'Arsipkan'}
          >
            {bill.isArchived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
          </Button>
          <Button
            variant="danger"
            size="icon"
            onClick={() => setConfirmingDelete(true)}
            aria-label="Hapus"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </Card>

      <section>
        <SectionHead title="Riwayat bayar" />
        {bill.payments.length === 0 ? (
          <EmptyState title="Belum pernah dibayar" />
        ) : (
          <ul className="divide-y divide-line">
            {bill.payments.map((payment) => (
              <li key={payment.id} className="flex items-center gap-3 py-3">
                <span
                  aria-hidden
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: payment.walletColor }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-ink">
                    {periodLabel(payment.period)}
                  </span>
                  <span className="mt-0.5 block truncate text-[11.5px] text-ink-3">
                    {formatDayShort(payment.occurredOn)} · dari {payment.walletName}
                  </span>
                </span>
                <span className="tabular shrink-0 font-mono text-[13px] font-medium text-ink">
                  {formatRupiah(payment.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-[11.5px] text-ink-3">
          Pembayaran kecatat sebagai transaksi di dompetnya. Hapus transaksinya di Riwayat dompet
          itu kalau mau batalin satu bulan.
        </p>
      </section>

      <BillSheet open={editing} onClose={() => setEditing(false)} bill={bill} />
      <PayBillSheet bill={paying ? bill : null} onClose={() => setPaying(false)} />

      <Sheet open={confirmingDelete} onOpenChange={setConfirmingDelete} title="Hapus tagihan?">
        <p className="text-sm text-ink-2">
          {bill.payments.length > 0
            ? 'Tagihan ini udah pernah dibayar, jadi bakal diarsip biar riwayatnya tetap ada. Transaksinya nggak ikut kehapus.'
            : 'Tagihan ini belum pernah dibayar dan bakal dihapus permanen.'}
        </p>
        <div className="mt-5 flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={() => setConfirmingDelete(false)}>
            Batal
          </Button>
          <Button
            variant="danger"
            className="flex-1"
            onClick={() => void deleteBill()}
            disabled={remove.isPending}
          >
            {bill.payments.length > 0 ? 'Arsipkan' : 'Hapus'}
          </Button>
        </div>
      </Sheet>
    </>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="label-micro mb-1">{label}</dt>
      <dd className="break-words text-ink">{value}</dd>
    </div>
  );
}
