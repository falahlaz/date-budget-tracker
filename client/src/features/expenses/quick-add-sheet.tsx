import { Camera, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Chip, ChipRow } from '@/components/ui/chip';
import { Field, Input, Textarea } from '@/components/ui/input';
import { Sheet } from '@/components/ui/sheet';
import { cn } from '@/lib/cn';
import { CategoryPicker } from '@/features/categories/category-picker';
import { useCurrentWeekReport } from '@/features/reports/hooks';
import { ApiError } from '@/lib/api';
import { formatAmountInput, formatRupiah, parseAmountInput } from '@/lib/format';
import { shiftDate, todayInJakarta } from '@/lib/today';
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS, type PaymentMethod } from '@/types/api';
import { useCreateExpense, useMerchantSuggestions, useUploadReceipts } from './hooks';

const MAX_RECEIPTS = 5;

/**
 * S6 Quick Add (PRD 9.6).
 *
 * Field order follows input speed, not data model tidiness: amount first (autofocused,
 * numeric keyboard), then the place. The place sits high because picking a known one
 * auto-fills category and payment method, which makes the rest of the form disappear --
 * that is the whole reason the field earns its position (goal G3, under 20 seconds).
 */
export function QuickAddSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const week = useCurrentWeekReport();
  const createExpense = useCreateExpense();
  const uploadReceipts = useUploadReceipts();

  const [amountText, setAmountText] = useState('');
  const [merchant, setMerchant] = useState('');
  const [merchantQuery, setMerchantQuery] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [spentOn, setSpentOn] = useState(todayInJakarta());
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [note, setNote] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [confirmingOverspend, setConfirmingOverspend] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const amount = parseAmountInput(amountText);
  const today = todayInJakarta();

  // 250ms debounce keeps the suggestion endpoint quiet while the user is mid-word (PRD 9.6).
  useEffect(() => {
    const timer = window.setTimeout(() => setMerchantQuery(merchant.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [merchant]);

  const suggestions = useMerchantSuggestions(merchantQuery);

  const reset = () => {
    setAmountText('');
    setMerchant('');
    setMerchantQuery('');
    setCategoryId(null);
    setSpentOn(todayInJakarta());
    setPaymentMethod('CASH');
    setNote('');
    setFiles([]);
    setConfirmingOverspend(false);
  };

  /**
   * How far this expense would push the current week into the red.
   *
   * Only a warning: an expense is never blocked for exceeding a budget, because accurate
   * data matters more than enforcement (PRD 4.4).
   */
  const overspendWarning = useMemo(() => {
    if (!week.data || amount <= 0) return null;
    if (spentOn < week.data.startDate || spentOn > week.data.endDate) return null;

    const before = week.data.weekendBudget - week.data.weekendSpent;
    const after = before - amount;

    return after < 0 && before >= 0 ? Math.abs(after) : null;
  }, [week.data, amount, spentOn]);

  const canSave = amount >= 1 && !createExpense.isPending;

  const submit = async () => {
    if (overspendWarning !== null && !confirmingOverspend) {
      setConfirmingOverspend(true);
      return;
    }

    try {
      // The expense is saved first and photos are uploaded afterwards, so a flaky upload
      // can never cost the user the record itself (PRD 6.11, 9.6).
      const expense = await createExpense.mutateAsync({
        spentOn,
        amount,
        categoryId,
        merchant: merchant.trim() === '' ? null : merchant.trim(),
        paymentMethod,
        note: note.trim() === '' ? null : note.trim(),
      });

      if (files.length > 0) {
        try {
          await uploadReceipts.mutateAsync({ expenseId: expense.id, files });
        } catch {
          const pending = files;
          toast.error('Foto gagal diupload', {
            description: 'Pengeluarannya udah tersimpan kok.',
            action: {
              label: 'Coba lagi',
              onClick: () => {
                void uploadReceipts.mutateAsync({ expenseId: expense.id, files: pending });
              },
            },
          });
        }
      }

      toast.success(`${formatRupiah(amount)} tercatat`, {
        description:
          week.data && spentOn === today
            ? `Sisa jatah hari ini: ${formatRupiah(
                (week.data.days.find((day) => day.date === today)?.remaining ?? 0) - amount,
              )}`
            : undefined,
      });

      reset();
      onClose();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Gagal menyimpan pengeluaran');
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          reset();
          onClose();
        }
      }}
      title="Catat pengeluaran"
    >
      <div className="flex flex-col gap-4">
        {/*
          inputMode="numeric" hands entry to the keyboard the device already has: the OS
          numeric pad on a phone, the real keyboard on a PC. A custom grid of keys was
          worse than both -- on desktop it replaced a keyboard sitting right there, and on
          a phone it was one more layout to learn for no gain over the system one.
        */}
        <div className="flex items-baseline gap-2 border-b-2 border-accent pb-3">
          <span className="font-mono text-[13px] font-medium text-ink-3">Rp</span>
          <Input
            autoFocus
            inputMode="numeric"
            placeholder="0"
            aria-label="Nominal"
            value={amountText}
            onChange={(event) => setAmountText(formatAmountInput(event.target.value))}
            className={cn(
              'amount-display h-auto min-h-0 rounded-none border-0 bg-transparent p-0 text-[38px] focus:border-0',
              amountText === '' && 'text-ink-3',
            )}
          />
        </div>

        <Field label="Tempat" hint="opsional">
          <Input
            placeholder="Bakmi GM"
            value={merchant}
            maxLength={120}
            onChange={(event) => setMerchant(event.target.value)}
          />
          {suggestions.data && suggestions.data.items.length > 0 ? (
            <div className="mt-2">
              <ChipRow>
                {suggestions.data.items.map((suggestion) => (
                  <Chip
                    key={suggestion.merchantKey}
                    selected={merchant.trim() === suggestion.displayName}
                    onClick={() => {
                      // Picking a place fills in what was used there last; the user can
                      // still override any of it (PRD 9.6).
                      setMerchant(suggestion.displayName);
                      setMerchantQuery(suggestion.displayName);
                      if (suggestion.lastCategoryId !== null)
                        setCategoryId(suggestion.lastCategoryId);
                      setPaymentMethod(suggestion.lastPaymentMethod);
                    }}
                  >
                    {suggestion.displayName}
                  </Chip>
                ))}
              </ChipRow>
            </div>
          ) : null}
        </Field>

        <CategoryPicker value={categoryId} onChange={setCategoryId} />

        <Field label="Tanggal" required>
          <ChipRow>
            <Chip selected={spentOn === today} onClick={() => setSpentOn(today)}>
              Hari ini
            </Chip>
            <Chip
              selected={spentOn === shiftDate(today, -1)}
              onClick={() => setSpentOn(shiftDate(today, -1))}
            >
              Kemarin
            </Chip>
            <Input
              type="date"
              value={spentOn}
              max={today}
              onChange={(event) => setSpentOn(event.target.value)}
              className="w-auto shrink-0 py-0"
            />
          </ChipRow>
        </Field>

        <Field label="Metode bayar" hint="opsional">
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

        <Field label="Catatan" hint="opsional">
          <Textarea
            value={note}
            maxLength={500}
            placeholder="makan malam"
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>

        <Field label="Foto struk" hint={`maks ${MAX_RECEIPTS}`}>
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            multiple
            capture="environment"
            className="hidden"
            onChange={(event) => {
              const picked = Array.from(event.target.files ?? []);
              setFiles((current) => [...current, ...picked].slice(0, MAX_RECEIPTS));
              event.target.value = '';
            }}
          />

          <div className="flex flex-wrap items-center gap-2">
            {files.map((file, index) => (
              <span key={`${file.name}-${index}`} className="relative">
                <img
                  src={URL.createObjectURL(file)}
                  alt={file.name}
                  className="h-16 w-16 rounded-md border border-line object-cover"
                />
                <button
                  type="button"
                  aria-label={`Hapus ${file.name}`}
                  onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}
                  className="absolute -top-2 -right-2 grid h-6 w-6 min-h-0 place-items-center rounded-full bg-ink text-bg"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}

            {files.length < MAX_RECEIPTS ? (
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="h-16 w-16"
                onClick={() => fileInput.current?.click()}
                aria-label="Tambah foto struk"
              >
                <Camera className="h-5 w-5" />
              </Button>
            ) : null}
          </div>
        </Field>

        {confirmingOverspend && overspendWarning !== null ? (
          <p
            className="rounded-md border border-warn/30 bg-warn-soft px-3.5 py-3 text-sm text-warn"
            role="alert"
          >
            Ini bikin weekend minggu ini minus {formatRupiah(overspendWarning)}. Tap Simpan lagi
            buat lanjut.
          </p>
        ) : null}

        <Button size="lg" onClick={submit} disabled={!canSave}>
          {createExpense.isPending ? 'Menyimpan…' : 'Simpan'}
        </Button>
      </div>
    </Sheet>
  );
}
