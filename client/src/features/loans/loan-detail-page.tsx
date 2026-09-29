import { ArrowLeft, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { HeaderChrome } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState, LoadingBlock, Meter } from '@/components/ui/feedback';
import { SectionHead } from '@/components/ui/section';
import { Sheet } from '@/components/ui/sheet';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDateLong, formatDayShort, formatRupiah } from '@/lib/format';
import type { LoanRepayment } from '@/types/api';
import { useDeleteLoan, useDeleteRepayment, useLoan } from './hooks';
import { loanStatusLine } from './loan-labels';
import { LoanSheet } from './loan-sheet';
import { RepayLoanSheet } from './repay-loan-sheet';

const TONE_TEXT = { over: 'text-neg', warn: 'text-warn', ok: 'text-pos', idle: 'text-ink-2' } as const;

/** One loan: who, how much, from where, and every rupiah that has come back. */
export function LoanDetailPage() {
  const { id } = useParams();
  const loanId = Number(id);
  const navigate = useNavigate();

  const { data: loan, isLoading, error, refetch } = useLoan(loanId);
  const remove = useDeleteLoan();
  const removeRepayment = useDeleteRepayment();
  const [editing, setEditing] = useState(false);
  const [repaying, setRepaying] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [undoing, setUndoing] = useState<LoanRepayment | null>(null);

  if (isLoading) return <LoadingBlock />;
  if (error) return <ErrorState message={(error as Error).message} onRetry={() => refetch()} />;
  if (!loan) return null;

  const status = loanStatusLine(loan);
  const hasRepayments = loan.repayments.length > 0;

  const deleteLoan = async () => {
    try {
      await remove.mutateAsync(loan.id);
      toast.success(`Pinjaman dihapus, ${formatRupiah(loan.amount)} balik ke ${loan.walletName}`);
      navigate('/loans', { replace: true });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Gagal menghapus');
    }
  };

  const undoRepayment = async () => {
    if (!undoing) return;
    try {
      await removeRepayment.mutateAsync({ loanId: loan.id, repaymentId: undoing.id });
      toast.success('Pembayaran dihapus');
      setUndoing(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Gagal menghapus');
    }
  };

  return (
    <>
      <div className="-mx-2 mb-5 flex items-center gap-1">
        <Button asChild variant="ghost" size="icon" aria-label="Kembali">
          <Link to="/loans">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <h1 className="title-display flex-1 truncate text-lg text-ink">{loan.borrowerName}</h1>
        <HeaderChrome />
      </div>

      <Card className="mb-7">
        <div className="label-micro mb-2 text-[10px] tracking-[0.14em]">
          {loan.status === 'SETTLED' ? 'Udah lunas' : 'Masih ngutang'}
        </div>
        <p className="amount-display text-[32px] text-ink">
          {formatRupiah(loan.status === 'SETTLED' ? loan.amount : loan.remaining)}
        </p>
        <p className={cn('mt-1.5 text-[13px] font-medium', TONE_TEXT[status.tone])}>{status.text}</p>

        <Meter
          value={loan.repaidAmount}
          max={loan.amount}
          fillClassName="bg-pos"
          size="sm"
          className="mt-4"
        />
        <p className="mt-1.5 text-[11.5px] text-ink-3">
          Udah balik {formatRupiah(loan.repaidAmount)} dari {formatRupiah(loan.amount)}
        </p>

        <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-4 text-sm">
          <Detail label="Dipinjam" value={formatDateLong(loan.lentOn)} />
          <Detail label="Dari dompet" value={loan.walletName} />
          <Detail label="Janji balikin" value={loan.dueDate ? formatDateLong(loan.dueDate) : '—'} />
          {loan.note ? <Detail label="Catatan" value={loan.note} /> : null}
        </dl>

        <div className="mt-5 flex gap-2">
          {loan.status !== 'SETTLED' ? (
            <Button className="flex-1" onClick={() => setRepaying(true)}>
              Tagih
            </Button>
          ) : null}
          <Button variant="secondary" className="flex-1" onClick={() => setEditing(true)}>
            Ubah
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
        <SectionHead title="Riwayat dibalikin" />
        {!hasRepayments ? (
          <EmptyState title="Belum ada yang dibalikin" />
        ) : (
          <ul className="divide-y divide-line">
            {loan.repayments.map((repayment) => (
              <li key={repayment.id} className="flex items-center gap-3 py-3">
                <span
                  aria-hidden
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: repayment.walletColor }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-ink">
                    {formatDayShort(repayment.occurredOn)}
                  </span>
                  <span className="mt-0.5 block truncate text-[11.5px] text-ink-3">
                    masuk ke {repayment.walletName}
                  </span>
                </span>
                <span className="tabular shrink-0 font-mono text-[13px] font-medium text-pos">
                  +{formatRupiah(repayment.amount)}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Hapus pembayaran"
                  onClick={() => setUndoing(repayment)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <LoanSheet open={editing} onClose={() => setEditing(false)} loan={loan} />
      <RepayLoanSheet loan={repaying ? loan : null} onClose={() => setRepaying(false)} />

      <Sheet open={confirmingDelete} onOpenChange={setConfirmingDelete} title="Hapus pinjaman?">
        <p className="text-sm text-ink-2">
          {hasRepayments
            ? 'Udah ada pembayaran yang dicatat. Hapus dulu pembayarannya satu-satu di riwayat, baru pinjamannya bisa dihapus.'
            : `Pinjamannya dihapus dan ${formatRupiah(loan.amount)} dianggap balik ke ${loan.walletName} — kayak nggak pernah dipinjemin.`}
        </p>
        <div className="mt-5 flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={() => setConfirmingDelete(false)}>
            Batal
          </Button>
          <Button
            variant="danger"
            className="flex-1"
            onClick={() => void deleteLoan()}
            disabled={remove.isPending || hasRepayments}
          >
            Hapus
          </Button>
        </div>
      </Sheet>

      <Sheet
        open={undoing !== null}
        onOpenChange={(next) => {
          if (!next) setUndoing(null);
        }}
        title="Hapus pembayaran ini?"
      >
        <p className="text-sm text-ink-2">
          {undoing
            ? `${formatRupiah(undoing.amount)} keluar lagi dari ${undoing.walletName}, dan ${loan.borrowerName} dianggap ngutang segitu lagi.`
            : null}
        </p>
        <div className="mt-5 flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={() => setUndoing(null)}>
            Batal
          </Button>
          <Button
            variant="danger"
            className="flex-1"
            onClick={() => void undoRepayment()}
            disabled={removeRepayment.isPending}
          >
            Hapus
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
