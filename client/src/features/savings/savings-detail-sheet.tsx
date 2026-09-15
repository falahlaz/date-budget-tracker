import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Chip, ChipWrap } from '@/components/ui/chip';
import { Field, Input, Textarea } from '@/components/ui/input';
import { Sheet } from '@/components/ui/sheet';
import { CategoryPicker } from '@/features/categories/category-picker';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatAmountInput, formatRupiah, parseAmountInput } from '@/lib/format';
import { todayInJakarta } from '@/lib/today';
import type { Transaction } from '@/types/api';
import { useDeleteSavingsTransaction, useUpdateSavingsTransaction } from './hooks';

/**
 * Correcting one savings row.
 *
 * It exists because without it a mistyped deposit is permanent: the savings screens are
 * read-only, and the generic `/expenses/:id` form is spend-shaped — it has no reason
 * field, offers the wrong category vocabulary, and deletes through an endpoint that skips
 * the allocation unwinding (v2 8.7).
 *
 * Both actions here go through `/api/wallets/:walletId/transactions/:id`, which is the
 * only door that undoes what a deposit caused.
 */
export function SavingsDetailSheet({
  transaction,
  onClose,
}: {
  transaction: Transaction | null;
  onClose: () => void;
}) {
  const update = useUpdateSavingsTransaction();
  const remove = useDeleteSavingsTransaction();

  const [amountText, setAmountText] = useState('');
  const [occurredOn, setOccurredOn] = useState(todayInJakarta());
  const [reason, setReason] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [expectedReturn, setExpectedReturn] = useState(false);
  const [note, setNote] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const isWithdrawal = transaction?.kind === 'WITHDRAW';
  const isTransfer = transaction?.transferGroupId !== null;

  useEffect(() => {
    if (!transaction) return;

    setAmountText(formatAmountInput(String(transaction.amount)));
    setOccurredOn(transaction.occurredOn);
    setReason(transaction.reason ?? '');
    setCategoryId(transaction.category?.id ?? null);
    setExpectedReturn(transaction.expectedReturn);
    setNote(transaction.note ?? '');
    setConfirmingDelete(false);
  }, [transaction]);

  const amount = parseAmountInput(amountText);
  const canSave =
    transaction !== null &&
    amount >= 1 &&
    (!isWithdrawal || reason.trim() !== '') &&
    !update.isPending;

  const submit = async () => {
    if (!transaction || !canSave) return;

    try {
      await update.mutateAsync({
        id: transaction.id,
        amount,
        occurredOn,
        note: note.trim() === '' ? null : note.trim(),
        ...(isWithdrawal
          ? {
              reason: reason.trim(),
              expectedReturn,
              ...(categoryId !== null ? { categoryId } : {}),
            }
          : {}),
      });

      toast.success('Tersimpan');
      onClose();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Gagal menyimpan perubahan');
    }
  };

  const destroy = async () => {
    if (!transaction) return;

    try {
      await remove.mutateAsync(transaction.id);
      toast.success('Terhapus');
      onClose();
    } catch (error) {
      // A part-repaid advance answers 409 and says which deposits are in the way (8.8).
      toast.error(error instanceof ApiError ? error.message : 'Gagal menghapus');
    }
  };

  return (
    <Sheet
      open={transaction !== null}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={isWithdrawal ? 'Ubah penarikan' : 'Ubah setoran'}
    >
      {!transaction ? null : isTransfer ? (
        // Both sides move together or the two wallets disagree about how much moved (8.9).
        <p className="text-[13px] text-ink-2">
          Ini salah satu sisi transfer antar dompet. Buat ngubahnya, hapus transfernya lalu
          catat ulang — biar dua sisinya tetap sejalan.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <div
            className={cn(
              'flex items-baseline gap-2 border-b-2 pb-3',
              isWithdrawal ? 'border-neg' : 'border-pos',
            )}
          >
            <span className="font-mono text-[13px] font-medium text-ink-3">Rp</span>
            <Input
              inputMode="numeric"
              aria-label="Nominal"
              value={amountText}
              onChange={(event) => setAmountText(formatAmountInput(event.target.value))}
              className="amount-display h-auto min-h-0 rounded-none border-0 bg-transparent p-0 text-[38px] focus:border-0"
            />
          </div>

          {isWithdrawal ? (
            <>
              <Field label="Alasan" required>
                <Input
                  value={reason}
                  maxLength={200}
                  placeholder="Kado nikahan sepupu"
                  onChange={(event) => setReason(event.target.value)}
                />
              </Field>

              <CategoryPicker
                value={categoryId}
                onChange={setCategoryId}
                hint="wajib"
                walletType="SAVINGS"
              />
            </>
          ) : null}

          <Field label="Tanggal" required>
            <Input
              type="date"
              value={occurredOn}
              max={todayInJakarta()}
              onChange={(event) => setOccurredOn(event.target.value)}
            />
          </Field>

          {isWithdrawal ? (
            <label className="flex items-center gap-2.5 text-[13px] text-ink-2">
              <input
                type="checkbox"
                checked={expectedReturn}
                onChange={(event) => setExpectedReturn(event.target.checked)}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              Bakal gw balikin
              {transaction.returnedAmount > 0 ? (
                <span className="text-[11px] text-ink-3">
                  · {formatRupiah(transaction.returnedAmount)} udah dibalikin
                </span>
              ) : null}
            </label>
          ) : null}

          <Field label="Catatan" hint="opsional">
            <Textarea
              value={note}
              maxLength={500}
              onChange={(event) => setNote(event.target.value)}
            />
          </Field>

          <Button size="lg" onClick={() => void submit()} disabled={!canSave}>
            {update.isPending ? 'Menyimpan…' : 'Simpan perubahan'}
          </Button>

          {confirmingDelete ? (
            <div className="rounded-md border border-neg/30 bg-neg-soft px-3.5 py-3">
              <p className="text-[13px] text-ink">
                Hapus {isWithdrawal ? 'penarikan' : 'setoran'} {formatRupiah(transaction.amount)}?
              </p>
              {!isWithdrawal ? (
                <p className="mt-1 text-[11.5px] text-ink-2">
                  Kalau setoran ini pernah nutup utang, utangnya bakal balik lagi.
                </p>
              ) : null}
              <ChipWrap>
                <div className="mt-3 flex gap-2">
                  <Chip onClick={() => setConfirmingDelete(false)}>Batal</Chip>
                  <Button
                    size="md"
                    variant="secondary"
                    onClick={() => void destroy()}
                    disabled={remove.isPending}
                  >
                    {remove.isPending ? 'Menghapus…' : 'Hapus'}
                  </Button>
                </div>
              </ChipWrap>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="min-h-11 text-[13px] font-medium text-neg hover:underline"
            >
              Hapus
            </button>
          )}
        </div>
      )}
    </Sheet>
  );
}
