import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Chip, ChipRow, ChipWrap } from '@/components/ui/chip';
import { Field, Input, Textarea } from '@/components/ui/input';
import { Sheet } from '@/components/ui/sheet';
import { CategoryPicker } from '@/features/categories/category-picker';
import { useExpenses } from '@/features/expenses/hooks';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatAmountInput, formatRupiah, parseAmountInput } from '@/lib/format';
import { shiftDate, todayInJakarta } from '@/lib/today';
import type { WithdrawalPreview } from '@/types/api';
import { useCreateWithdrawal, usePreviewWithdrawal } from './hooks';

const MAX_REASON = 200;

/**
 * S-Tarik (PRD v2 11.4).
 *
 * The field order is the feature. Reason comes first and autofocused, before the amount,
 * because asking for it afterwards makes it a formality typed out once the decision is
 * already made -- and an honest sentence here is the whole of goal G2.
 */
export function WithdrawSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const createWithdrawal = useCreateWithdrawal();
  const preview = usePreviewWithdrawal();
  // Reasons already used, as chips: most withdrawals repeat themselves, and a tap is both
  // faster and more honest than retyping a vaguer version of the same sentence.
  const recent = useExpenses({ limit: 30 });

  const [reason, setReason] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [amountText, setAmountText] = useState('');
  const [occurredOn, setOccurredOn] = useState(todayInJakarta());
  const [expectedReturn, setExpectedReturn] = useState(false);
  const [note, setNote] = useState('');
  const [friction, setFriction] = useState<WithdrawalPreview | null>(null);

  const today = todayInJakarta();
  const amount = parseAmountInput(amountText);

  useEffect(() => {
    if (open) return;

    setReason('');
    setCategoryId(null);
    setAmountText('');
    setOccurredOn(todayInJakarta());
    setExpectedReturn(false);
    setNote('');
    setFriction(null);
  }, [open]);

  const usedReasons = [
    ...new Set(
      (recent.data?.items ?? [])
        .filter((txn) => txn.kind === 'WITHDRAW' && txn.reason !== null)
        .map((txn) => txn.reason as string),
    ),
  ].slice(0, 6);

  const canContinue = reason.trim() !== '' && categoryId !== null && amount >= 1;

  /**
   * Asks the server what this costs, then shows the dialog.
   *
   * The numbers in the dialog come from `preview` and are never computed here (v2 11.4,
   * DoD): two places doing the same arithmetic is two places to disagree, and the one the
   * user is being asked to trust must be the one the goal screen uses.
   */
  const askFirst = async () => {
    if (!canContinue) return;

    try {
      setFriction(await preview.mutateAsync(amount));
    } catch (error) {
      // The preview is friction, not a gate: if it cannot be had, the withdrawal still
      // goes through rather than being blocked by a failed dry run.
      toast.error(error instanceof ApiError ? error.message : 'Gagal menghitung dampaknya');
      await save();
    }
  };

  const save = async () => {
    try {
      await createWithdrawal.mutateAsync({
        amount,
        occurredOn,
        reason: reason.trim(),
        categoryId: categoryId as number,
        expectedReturn,
        ...(note.trim() === '' ? {} : { note: note.trim() }),
      });

      toast.success(`${formatRupiah(amount)} ditarik`, { description: reason.trim() });
      setFriction(null);
      onClose();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Gagal menyimpan penarikan');
    }
  };

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (!next) onClose();
        }}
        title="Tarik"
      >
        <div className="flex flex-col gap-4">
          <Field label="Alasan" required hint={`${reason.length}/${MAX_REASON}`}>
            <Input
              autoFocus
              value={reason}
              maxLength={MAX_REASON}
              placeholder="Kado nikahan sepupu"
              onChange={(event) => setReason(event.target.value)}
            />
            {usedReasons.length > 0 ? (
              <div className="mt-2">
                <ChipRow>
                  {usedReasons.map((used) => (
                    <Chip
                      key={used}
                      selected={reason.trim() === used}
                      onClick={() => setReason(used)}
                    >
                      {used}
                    </Chip>
                  ))}
                </ChipRow>
              </div>
            ) : null}
          </Field>

          <CategoryPicker
            value={categoryId}
            onChange={setCategoryId}
            hint="wajib"
            walletType="SAVINGS"
          />

          <Field label="Nominal" required>
            <div className="flex items-baseline gap-2 border-b-2 border-neg pb-3">
              <span className="font-mono text-[13px] font-medium text-ink-3">Rp</span>
              <Input
                inputMode="numeric"
                placeholder="0"
                aria-label="Nominal penarikan"
                value={amountText}
                onChange={(event) => setAmountText(formatAmountInput(event.target.value))}
                className={cn(
                  'amount-display h-auto min-h-0 rounded-none border-0 bg-transparent p-0 text-[38px] focus:border-0',
                  amountText === '' && 'text-ink-3',
                )}
              />
            </div>
          </Field>

          <Field label="Tanggal" required>
            <ChipWrap>
              <Chip selected={occurredOn === today} onClick={() => setOccurredOn(today)}>
                Hari ini
              </Chip>
              <Chip
                selected={occurredOn === shiftDate(today, -1)}
                onClick={() => setOccurredOn(shiftDate(today, -1))}
              >
                Kemarin
              </Chip>
              <Input
                type="date"
                value={occurredOn}
                max={today}
                onChange={(event) => setOccurredOn(event.target.value)}
                className="w-auto shrink-0 py-0"
              />
            </ChipWrap>
          </Field>

          <label className="flex items-center gap-2.5 text-[13px] text-ink-2">
            <input
              type="checkbox"
              checked={expectedReturn}
              onChange={(event) => setExpectedReturn(event.target.checked)}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            Bakal gw balikin
          </label>

          <Field label="Catatan" hint="opsional">
            <Textarea
              value={note}
              maxLength={500}
              placeholder="transfer ke rekening utama"
              onChange={(event) => setNote(event.target.value)}
            />
          </Field>

          <Button
            size="lg"
            onClick={() => void askFirst()}
            disabled={!canContinue || preview.isPending || createWithdrawal.isPending}
          >
            {preview.isPending ? 'Menghitung…' : 'Tarik'}
          </Button>
        </div>
      </Sheet>

      <FrictionDialog
        preview={friction}
        pending={createWithdrawal.isPending}
        onCancel={() => setFriction(null)}
        onConfirm={() => void save()}
      />
    </>
  );
}

/**
 * The friction dialog (PRD v2 11.4, goal G4).
 *
 * Friction, not a block. Cancel sits on the left and is not the emphasised control, but
 * "Lanjut tarik" is one tap away and always available -- a withdrawal the app refuses is a
 * withdrawal that happens outside the app and never gets recorded at all.
 */
function FrictionDialog({
  preview,
  pending,
  onCancel,
  onConfirm,
}: {
  preview: WithdrawalPreview | null;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog.Root
      open={preview !== null}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-[60] backdrop-blur-[2px]"
          style={{ backgroundColor: 'rgba(16, 17, 28, 0.42)' }}
        />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-[70] w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-line bg-surface p-5 shadow-lg">
          {preview ? (
            <>
              <Dialog.Title className="title-display text-lg text-ink">
                {preview.delayLabel
                  ? `Narik ${formatRupiah(preview.amount)} bikin target lo ${preview.delayLabel}.`
                  : `Narik ${formatRupiah(preview.amount)}.`}
              </Dialog.Title>

              <Dialog.Description className="mt-2 text-[13px] text-ink-2">
                Sisa jadi {formatRupiah(preview.balanceAfter)}.
                {preview.projectionNote ? ` ${preview.projectionNote}` : ''}
              </Dialog.Description>

              {preview.wouldGoNegative ? (
                <p className="mt-3 rounded-md bg-neg-soft px-3 py-2 text-[12px] text-neg" role="alert">
                  Ini bikin saldo tabungan minus, dan itu nggak diizinin.
                </p>
              ) : null}

              <div className="mt-5 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={onCancel}
                  className="min-h-11 rounded-sm px-3 text-sm font-medium text-ink-2 transition-colors hover:bg-surface-2"
                >
                  Batal
                </button>
                <Button
                  variant="secondary"
                  onClick={onConfirm}
                  disabled={pending || preview.wouldGoNegative}
                >
                  {pending ? 'Menarik…' : 'Lanjut tarik'}
                </Button>
              </div>
            </>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
