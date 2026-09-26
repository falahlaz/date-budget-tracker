import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Chip, ChipWrap } from '@/components/ui/chip';
import { Field, Input, Textarea } from '@/components/ui/input';
import { Sheet } from '@/components/ui/sheet';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatAmountInput, formatRupiah, parseAmountInput } from '@/lib/format';
import { currentPeriod, shiftPeriod, todayInJakarta } from '@/lib/today';
import type { Bill, BillCategory, BillKind } from '@/types/api';
import {
  BILL_CATEGORIES,
  BILL_CATEGORY_LABELS,
  BILL_KINDS,
  BILL_KIND_HINTS,
  BILL_KIND_LABELS,
  monthSpan,
} from './bill-labels';
import { useCreateBill, useUpdateBill, type BillInput } from './hooks';

/** The category a new bill of each kind most likely is, so picking a kind picks one too. */
const DEFAULT_CATEGORY: Record<BillKind, BillCategory> = {
  INSTALLMENT: 'CICILAN',
  RECURRING: 'LANGGANAN',
  ONE_TIME: 'LAINNYA',
};

/**
 * Create or edit a bill.
 *
 * The kind comes first because it decides which date fields exist: an installment has a
 * last month, a subscription has none, and a one-time bill has a single due date rather
 * than a day of the month.
 */
export function BillSheet({
  open,
  onClose,
  bill,
}: {
  open: boolean;
  onClose: () => void;
  /** null to create a new bill. */
  bill: Bill | null;
}) {
  const create = useCreateBill();
  const update = useUpdateBill();

  const [kind, setKind] = useState<BillKind>('INSTALLMENT');
  const [category, setCategory] = useState<BillCategory>('CICILAN');
  const [name, setName] = useState('');
  const [platform, setPlatform] = useState('');
  const [amountText, setAmountText] = useState('');
  const [dueDayText, setDueDayText] = useState('');
  const [startPeriod, setStartPeriod] = useState(currentPeriod());
  const [endPeriod, setEndPeriod] = useState(shiftPeriod(currentPeriod(), 5));
  const [dueDate, setDueDate] = useState(todayInJakarta());
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!open) return;

    const today = todayInJakarta();
    setKind(bill?.kind ?? 'INSTALLMENT');
    setCategory(bill?.category ?? 'CICILAN');
    setName(bill?.name ?? '');
    setPlatform(bill?.platform ?? '');
    setAmountText(bill ? formatAmountInput(String(bill.amount)) : '');
    setDueDayText(String(bill?.dueDay ?? Number(today.slice(8, 10))));
    setStartPeriod(bill?.startPeriod ?? currentPeriod());
    setEndPeriod(bill?.endPeriod ?? shiftPeriod(bill?.startPeriod ?? currentPeriod(), 5));
    setDueDate(
      bill?.kind === 'ONE_TIME'
        ? `${bill.startPeriod}-${String(bill.dueDay).padStart(2, '0')}`
        : today,
    );
    setNote(bill?.note ?? '');
    // Keyed on the id, not the object: a background refetch must not wipe a half-edited form.
  }, [open, bill?.id]);

  const amount = parseAmountInput(amountText);
  const dueDay = Number(dueDayText);
  const monthly = kind !== 'ONE_TIME';
  const count = kind === 'INSTALLMENT' ? monthSpan(startPeriod, endPeriod) : null;

  const errors = {
    dueDay: monthly && !(Number.isInteger(dueDay) && dueDay >= 1 && dueDay <= 31),
    endPeriod: kind === 'INSTALLMENT' && (endPeriod === '' || endPeriod < startPeriod),
    dueDate: !monthly && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate),
  };

  const canSave =
    name.trim() !== '' &&
    amount >= 1 &&
    startPeriod !== '' &&
    !errors.dueDay &&
    !errors.endPeriod &&
    !errors.dueDate;

  const pickKind = (next: BillKind) => {
    setKind(next);
    // Only nudge the category while it is still the previous kind's default.
    if (category === DEFAULT_CATEGORY[kind]) setCategory(DEFAULT_CATEGORY[next]);
  };

  const save = async () => {
    if (!canSave) return;

    const input: BillInput = {
      name: name.trim(),
      platform: platform.trim() || null,
      amount,
      kind,
      category,
      dueDay: monthly ? dueDay : Number(dueDate.slice(8, 10)),
      startPeriod: monthly ? startPeriod : dueDate.slice(0, 7),
      endPeriod: kind === 'INSTALLMENT' ? endPeriod : null,
      note: note.trim() || null,
    };

    try {
      if (bill) {
        await update.mutateAsync({ id: bill.id, ...input });
        toast.success('Tagihan diperbarui');
      } else {
        await create.mutateAsync(input);
        toast.success(`${input.name} dicatat`);
      }
      onClose();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Gagal menyimpan tagihan');
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={bill ? 'Ubah tagihan' : 'Tagihan baru'}
    >
      <div className="flex flex-col gap-5">
        <Field label="Jenis" hint={BILL_KIND_HINTS[kind]}>
          <ChipWrap>
            {BILL_KINDS.map((option) => (
              <Chip key={option} selected={kind === option} onClick={() => pickKind(option)}>
                {BILL_KIND_LABELS[option]}
              </Chip>
            ))}
          </ChipWrap>
        </Field>

        <Field label="Nama tagihan" required>
          <Input
            autoFocus={!bill}
            value={name}
            maxLength={80}
            placeholder={kind === 'INSTALLMENT' ? 'Cicilan HP' : 'Netflix'}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>

        <Field label="Platform" hint="opsional">
          <Input
            value={platform}
            maxLength={60}
            placeholder="Shopee PayLater, PLN, BCA…"
            onChange={(event) => setPlatform(event.target.value)}
          />
        </Field>

        <Field label={monthly ? 'Nominal per bulan' : 'Nominal'} required>
          <div className="flex items-baseline gap-2 border-b-2 border-accent pb-3">
            <span className="font-mono text-[13px] font-medium text-ink-3">Rp</span>
            <Input
              inputMode="numeric"
              placeholder="0"
              aria-label="Nominal tagihan"
              value={amountText}
              onChange={(event) => setAmountText(formatAmountInput(event.target.value))}
              className={cn(
                'amount-display h-auto min-h-0 rounded-none border-0 bg-transparent p-0 text-[32px] focus:border-0',
                amountText === '' && 'text-ink-3',
              )}
            />
          </div>
        </Field>

        {monthly ? (
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Jatuh tempo tgl"
              required
              error={errors.dueDay ? 'Tanggal 1–31' : undefined}
            >
              <Input
                inputMode="numeric"
                value={dueDayText}
                maxLength={2}
                onChange={(event) => setDueDayText(event.target.value.replace(/\D/g, ''))}
              />
            </Field>
            <Field label="Mulai bulan" required>
              <Input
                type="month"
                value={startPeriod}
                onChange={(event) => setStartPeriod(event.target.value)}
              />
            </Field>
          </div>
        ) : (
          <Field label="Jatuh tempo" required error={errors.dueDate ? 'Isi tanggalnya' : undefined}>
            <Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
          </Field>
        )}

        {kind === 'INSTALLMENT' ? (
          <Field
            label="Bulan terakhir"
            required
            hint={
              count !== null && count >= 1 && amount >= 1
                ? `${count}x · total ${formatRupiah(count * amount)}`
                : undefined
            }
            error={errors.endPeriod ? 'Nggak boleh sebelum bulan mulai' : undefined}
          >
            <Input
              type="month"
              value={endPeriod}
              min={startPeriod}
              onChange={(event) => setEndPeriod(event.target.value)}
            />
          </Field>
        ) : null}

        <Field label="Kategori">
          <ChipWrap>
            {BILL_CATEGORIES.map((option) => (
              <Chip key={option} selected={category === option} onClick={() => setCategory(option)}>
                {BILL_CATEGORY_LABELS[option]}
              </Chip>
            ))}
          </ChipWrap>
        </Field>

        <Field label="Catatan" hint="opsional">
          <Textarea
            value={note}
            maxLength={255}
            placeholder="no. kontrak, VA, dll."
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>

        <Button
          size="lg"
          onClick={() => void save()}
          disabled={!canSave || create.isPending || update.isPending}
        >
          {create.isPending || update.isPending ? 'Menyimpan…' : bill ? 'Simpan' : 'Catat tagihan'}
        </Button>
      </div>
    </Sheet>
  );
}
