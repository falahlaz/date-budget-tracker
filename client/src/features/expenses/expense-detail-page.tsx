import { ArrowLeft, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { HeaderChrome } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip, ChipRow } from '@/components/ui/chip';
import { ErrorState, LoadingBlock } from '@/components/ui/feedback';
import { Field, Input, Textarea } from '@/components/ui/input';
import { SectionHead } from '@/components/ui/section';
import { Sheet } from '@/components/ui/sheet';
import { CategoryPicker } from '@/features/categories/category-picker';
import { formatAmountInput, formatDateLong, formatRupiah, parseAmountInput } from '@/lib/format';
import { todayInJakarta } from '@/lib/today';
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS, type PaymentMethod } from '@/types/api';
import { useDeleteExpense, useDeleteReceipt, useExpense, useUpdateExpense } from './hooks';

/** S7 Expense Detail (PRD 9.2): every field, the photo gallery, edit and delete. */
export function ExpenseDetailPage() {
  const { id } = useParams();
  const expenseId = Number(id);
  const navigate = useNavigate();

  const { data: expense, isLoading, error, refetch } = useExpense(expenseId);
  const deleteExpense = useDeleteExpense();
  const deleteReceipt = useDeleteReceipt();
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  if (isLoading) return <LoadingBlock />;
  if (error) return <ErrorState message={(error as Error).message} onRetry={() => refetch()} />;
  if (!expense) return null;

  const remove = async () => {
    await deleteExpense.mutateAsync(expense.id);
    toast.success('Pengeluaran dihapus');
    navigate('/expenses', { replace: true });
  };

  return (
    <>
      {/* Its own bar rather than a PageHeader, because this screen leads with a back
          arrow -- but it carries the same chrome, so "every screen" stays true. */}
      <div className="-mx-2 mb-5 flex items-center gap-1">
        <Button asChild variant="ghost" size="icon" aria-label="Kembali">
          <Link to="/expenses">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <h1 className="title-display flex-1 text-lg text-ink">Detail</h1>
        <HeaderChrome />
      </div>

      <Card className="mb-7">
        <div className="label-micro mb-2 text-[10px] tracking-[0.14em]">
          {expense.dayType === 'WEEKEND' ? 'Weekend' : 'Hari kerja'} · Minggu ke-{expense.weekIndex}
        </div>
        <p className="amount-display text-[32px] text-ink">{formatRupiah(expense.amount)}</p>
        <p className="mt-1.5 text-[13px] text-ink-2">{formatDateLong(expense.occurredOn)}</p>

        <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-4 text-sm">
          <Detail label="Tempat" value={expense.merchant ?? '—'} />
          <Detail label="Kategori" value={expense.category?.name ?? 'Tanpa kategori'} />
          <Detail label="Metode bayar" value={PAYMENT_METHOD_LABELS[expense.paymentMethod]} />
          <Detail label="Catatan" value={expense.note ?? '—'} />
        </dl>

        <div className="mt-5 flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={() => setEditing(true)}>
            Edit
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

      {expense.receipts.length > 0 ? (
        <section>
          <SectionHead title={`Struk · ${expense.receipts.length}`} />
          <ul className="grid grid-cols-3 gap-2">
            {expense.receipts.map((receipt) => (
              <li key={receipt.id} className="relative">
                <a href={receipt.url} target="_blank" rel="noreferrer">
                  <img
                    src={receipt.thumbUrl ?? receipt.url}
                    alt={`Struk ${receipt.id}`}
                    loading="lazy"
                    className="aspect-square w-full rounded-md border border-line object-cover"
                  />
                </a>
                <button
                  type="button"
                  aria-label={`Hapus struk ${receipt.id}`}
                  onClick={() => deleteReceipt.mutate(receipt.id)}
                  className="absolute top-1.5 right-1.5 grid h-7 w-7 min-h-0 place-items-center rounded-full bg-ink/80 text-bg"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {editing ? (
        <EditSheet expenseId={expense.id} onClose={() => setEditing(false)} initial={expense} />
      ) : null}

      <Sheet open={confirmingDelete} onOpenChange={setConfirmingDelete} title="Hapus pengeluaran?">
        <p className="text-sm text-ink-2">
          Angka minggu dan bulan ini bakal dihitung ulang otomatis.
        </p>
        <div className="mt-4 flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={() => setConfirmingDelete(false)}>
            Batal
          </Button>
          <Button
            variant="danger"
            className="flex-1"
            onClick={remove}
            disabled={deleteExpense.isPending}
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
    <div>
      <dt className="label-micro text-[10px] tracking-[0.14em]">{label}</dt>
      <dd className="mt-1.5 break-words font-medium text-ink">{value}</dd>
    </div>
  );
}

function EditSheet({
  expenseId,
  initial,
  onClose,
}: {
  expenseId: number;
  initial: {
    amount: number;
    occurredOn: string;
    merchant: string | null;
    note: string | null;
    paymentMethod: PaymentMethod;
    category: { id: number } | null;
  };
  onClose: () => void;
}) {
  const update = useUpdateExpense();

  const [amountText, setAmountText] = useState(formatAmountInput(String(initial.amount)));
  const [spentOn, setSpentOn] = useState(initial.occurredOn);
  const [merchant, setMerchant] = useState(initial.merchant ?? '');
  const [note, setNote] = useState(initial.note ?? '');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(initial.paymentMethod);
  const [categoryId, setCategoryId] = useState<number | null>(initial.category?.id ?? null);

  const save = async () => {
    await update.mutateAsync({
      id: expenseId,
      amount: parseAmountInput(amountText),
      occurredOn: spentOn,
      // Changing the spelling here only affects this row; other expenses at the same place
      // keep theirs (PRD 6.17).
      merchant: merchant.trim() === '' ? null : merchant.trim(),
      note: note.trim() === '' ? null : note.trim(),
      paymentMethod,
      categoryId,
    });

    toast.success('Perubahan tersimpan');
    onClose();
  };

  return (
    <Sheet open onOpenChange={(next) => !next && onClose()} title="Edit pengeluaran">
      <div className="flex flex-col gap-4">
        <Field label="Nominal" required>
          <Input
            inputMode="numeric"
            value={amountText}
            onChange={(event) => setAmountText(formatAmountInput(event.target.value))}
            className="amount-display text-2xl"
          />
        </Field>

        <Field label="Tanggal" required>
          <Input
            type="date"
            value={spentOn}
            max={todayInJakarta()}
            onChange={(event) => setSpentOn(event.target.value)}
          />
        </Field>

        <Field label="Tempat">
          <Input
            value={merchant}
            maxLength={120}
            onChange={(event) => setMerchant(event.target.value)}
          />
        </Field>

        <CategoryPicker value={categoryId} onChange={setCategoryId} />

        <Field label="Metode bayar">
          <ChipRow>
            {PAYMENT_METHODS.map((method) => (
              <Chip
                key={method}
                selected={paymentMethod === method}
                onClick={() => setPaymentMethod(method)}
              >
                {PAYMENT_METHOD_LABELS[method]}
              </Chip>
            ))}
          </ChipRow>
        </Field>

        <Field label="Catatan">
          <Textarea
            value={note}
            maxLength={500}
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>

        <Button size="lg" onClick={save} disabled={update.isPending}>
          {update.isPending ? 'Menyimpan…' : 'Simpan perubahan'}
        </Button>
      </div>
    </Sheet>
  );
}
