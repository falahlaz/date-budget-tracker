import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Chip, ChipWrap } from '@/components/ui/chip';
import { Field, Input, Textarea } from '@/components/ui/input';
import { Sheet } from '@/components/ui/sheet';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatAmountInput, formatDateLong, formatRupiah, parseAmountInput } from '@/lib/format';
import { shiftDate, todayInJakarta } from '@/lib/today';
import { depositToastMessage } from './deposit-toast';
import { planFifo, useAdvances, useCreateDeposit } from './hooks';

/**
 * S-Setor (PRD v2 11.3).
 *
 * Plain until there is an unpaid advance, and then it grows a block that says so. The
 * allocation rows are editable because FIFO is a sensible default and not a rule about
 * the user's intentions -- paying back the newest advance first is a legitimate choice,
 * and the server accepts a manual split for exactly that reason.
 */
export function DepositSheet({
  open,
  onClose,
  settleFirst = false,
}: {
  open: boolean;
  onClose: () => void;
  /** Opened from the "Balikin" button on the advance card, which means business. */
  settleFirst?: boolean;
}) {
  const advances = useAdvances();
  const createDeposit = useCreateDeposit();

  const [amountText, setAmountText] = useState('');
  const [occurredOn, setOccurredOn] = useState(todayInJakarta());
  const [note, setNote] = useState('');
  const [applyToAdvances, setApplyToAdvances] = useState(true);
  /** Null until the user edits a row; then it overrides FIFO entirely. */
  const [manual, setManual] = useState<Record<number, number> | null>(null);

  const today = todayInJakarta();
  const amount = parseAmountInput(amountText);
  const open_advances = advances.data?.items ?? [];
  const outstanding = advances.data?.outstanding ?? 0;

  useEffect(() => {
    if (!open) return;

    setAmountText(settleFirst && outstanding > 0 ? formatAmountInput(String(outstanding)) : '');
    setOccurredOn(todayInJakarta());
    setNote('');
    setApplyToAdvances(true);
    setManual(null);
  }, [open, settleFirst, outstanding]);

  const fifo = planFifo(amount, open_advances);
  const plan = manual
    ? Object.entries(manual)
        .map(([id, value]) => ({ transactionId: Number(id), amount: value }))
        .filter((row) => row.amount > 0)
    : fifo;

  const allocated = plan.reduce((total, row) => total + row.amount, 0);
  const fresh = amount - allocated;
  const overAllocated = allocated > amount;
  const canSave = amount >= 1 && !overAllocated && !createDeposit.isPending;

  const submit = async () => {
    if (!canSave) return;

    try {
      const result = await createDeposit.mutateAsync({
        amount,
        occurredOn,
        ...(note.trim() === '' ? {} : { note: note.trim() }),
        // A manual split is sent verbatim; otherwise the server runs the same FIFO shown
        // above, so what was previewed is what happens.
        ...(applyToAdvances && plan.length > 0
          ? manual
            ? { allocations: plan }
            : { applyToAdvances: true }
          : { applyToAdvances: false }),
      });

      const message = depositToastMessage(amount, result.repaid, result.fresh);
      toast.success(message.title, { description: message.description });
      onClose();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Gagal menyimpan setoran');
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title="Setor"
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-baseline gap-2 border-b-2 border-pos pb-3">
          <span className="font-mono text-[13px] font-medium text-ink-3">Rp</span>
          <Input
            autoFocus
            inputMode="numeric"
            placeholder="0"
            aria-label="Nominal setoran"
            value={amountText}
            onChange={(event) => {
              setAmountText(formatAmountInput(event.target.value));
              // A changed amount invalidates a hand-made split; re-deriving from FIFO is
              // less surprising than leaving rows that no longer add up.
              setManual(null);
            }}
            className={cn(
              'amount-display h-auto min-h-0 rounded-none border-0 bg-transparent p-0 text-[38px] focus:border-0',
              amountText === '' && 'text-ink-3',
            )}
          />
        </div>

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

        <Field label="Catatan" hint="opsional">
          <Textarea
            value={note}
            maxLength={500}
            placeholder="gajian"
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>

        {outstanding > 0 ? (
          <section className="rounded-md border border-line bg-surface-2 p-4">
            <p className="text-[13px] font-semibold text-ink">
              Ada {formatRupiah(outstanding)} yang belum lo balikin.
            </p>

            <label className="mt-3 flex items-center gap-2.5 text-[12.5px] text-ink-2">
              <input
                type="checkbox"
                checked={applyToAdvances}
                onChange={(event) => {
                  setApplyToAdvances(event.target.checked);
                  setManual(null);
                }}
                className="h-4 w-4 accent-[var(--pos)]"
              />
              Pakai setoran ini buat nutup dulu
            </label>

            {applyToAdvances && amount >= 1 ? (
              <ul className="mt-3 flex flex-col gap-2">
                {open_advances.map((advance) => {
                  const row = plan.find((entry) => entry.transactionId === advance.id);

                  return (
                    <li key={advance.id} className="flex items-center gap-3">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] text-ink">
                          {advance.reason ?? 'Penarikan'}
                        </span>
                        <span className="block text-[10.5px] text-ink-3">
                          {formatDateLong(advance.occurredOn)} · sisa{' '}
                          {formatRupiah(advance.outstanding)}
                        </span>
                      </span>
                      <Input
                        inputMode="numeric"
                        aria-label={`Alokasi buat ${advance.reason ?? 'penarikan'}`}
                        value={formatAmountInput(String(row?.amount ?? 0))}
                        onChange={(event) => {
                          const next = Math.min(
                            parseAmountInput(event.target.value),
                            advance.outstanding,
                          );
                          setManual({
                            ...(manual ??
                              Object.fromEntries(fifo.map((entry) => [entry.transactionId, entry.amount]))),
                            [advance.id]: next,
                          });
                        }}
                        className="tabular w-32 shrink-0 text-right text-[13px]"
                      />
                    </li>
                  );
                })}
              </ul>
            ) : null}

            {applyToAdvances && amount >= 1 ? (
              <p
                className={cn('mt-3 text-[11.5px]', overAllocated ? 'text-neg' : 'text-ink-2')}
                role={overAllocated ? 'alert' : undefined}
              >
                {overAllocated
                  ? `Alokasi ${formatRupiah(allocated)} lebih gede dari setorannya.`
                  : `${formatRupiah(allocated)} nutup utang, ${formatRupiah(fresh)} nambah tabungan.`}
              </p>
            ) : null}
          </section>
        ) : null}

        <Button size="lg" onClick={() => void submit()} disabled={!canSave}>
          {createDeposit.isPending ? 'Menyimpan…' : 'Setor'}
        </Button>
      </div>
    </Sheet>
  );
}
