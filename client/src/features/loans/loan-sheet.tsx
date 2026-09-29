import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Chip, ChipWrap } from '@/components/ui/chip';
import { Field, Input, Textarea } from '@/components/ui/input';
import { Sheet } from '@/components/ui/sheet';
import { WalletOption, impactOf } from '@/features/bills/pay-bill-sheet';
import { useActiveWalletId, useWalletSwitcher } from '@/features/wallets/wallet-context';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatAmountInput, formatRupiah, parseAmountInput } from '@/lib/format';
import { shiftDate, todayInJakarta } from '@/lib/today';
import type { Loan } from '@/types/api';
import { useCreateLoan, useUpdateLoan, type LoanInput } from './hooks';

/**
 * Pinjamin: record money lent to someone, and which wallet it came out of.
 *
 * The wallet is picked only when the loan is created. Moving a loan to another wallet
 * afterwards would move money that may already have been partly paid back somewhere --
 * so editing keeps the wallet fixed, and a wrong one means delete and re-record.
 */
export function LoanSheet({
  open,
  onClose,
  loan,
}: {
  open: boolean;
  onClose: () => void;
  /** null to lend something new. */
  loan: Loan | null;
}) {
  const { wallets } = useWalletSwitcher();
  const activeWalletId = useActiveWalletId();
  const create = useCreateLoan();
  const update = useUpdateLoan();

  const [borrowerName, setBorrowerName] = useState('');
  const [amountText, setAmountText] = useState('');
  const [walletId, setWalletId] = useState<number | undefined>(activeWalletId);
  const [lentOn, setLentOn] = useState(todayInJakarta());
  const [hasDueDate, setHasDueDate] = useState(false);
  const [dueDate, setDueDate] = useState(shiftDate(todayInJakarta(), 30));
  const [note, setNote] = useState('');

  const today = todayInJakarta();

  useEffect(() => {
    if (!open) return;

    setBorrowerName(loan?.borrowerName ?? '');
    setAmountText(loan ? formatAmountInput(String(loan.amount)) : '');
    setWalletId(loan?.walletId ?? activeWalletId);
    setLentOn(loan?.lentOn ?? todayInJakarta());
    setHasDueDate(loan ? loan.dueDate !== null : false);
    setDueDate(loan?.dueDate ?? shiftDate(todayInJakarta(), 30));
    setNote(loan?.note ?? '');
    // Keyed on the id, not the object: a background refetch must not wipe a half-edited form.
  }, [open, loan?.id]);

  const amount = parseAmountInput(amountText);
  const wallet = wallets.find((candidate) => candidate.id === walletId);
  // Only new money leaving needs checking: on an edit, the part already lent is already out.
  const impact = wallet ? impactOf(wallet, loan ? amount - loan.amount : amount) : null;

  const errors = {
    lentOn: lentOn === '' || lentOn > today,
    dueDate: hasDueDate && (dueDate === '' || dueDate < lentOn),
    amount: loan !== null && amount < loan.repaidAmount,
  };

  const canSave =
    borrowerName.trim() !== '' &&
    amount >= 1 &&
    wallet !== undefined &&
    !impact?.blocked &&
    !errors.lentOn &&
    !errors.dueDate &&
    !errors.amount;

  const save = async () => {
    if (!canSave || !wallet) return;

    const input: LoanInput = {
      borrowerName: borrowerName.trim(),
      amount,
      lentOn,
      dueDate: hasDueDate ? dueDate : null,
      note: note.trim() || null,
    };

    try {
      if (loan) {
        await update.mutateAsync({ id: loan.id, ...input });
        toast.success('Pinjaman diperbarui');
      } else {
        await create.mutateAsync({ ...input, walletId: wallet.id });
        toast.success(`${formatRupiah(amount)} dipinjamin ke ${input.borrowerName}`, {
          description: `Keluar dari ${wallet.name}`,
        });
      }
      onClose();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Gagal menyimpan pinjaman');
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={loan ? 'Ubah pinjaman' : 'Pinjamin uang'}
      description={loan ? undefined : 'Catat siapa yang minjem, biar gampang ditagih nanti.'}
    >
      <div className="flex flex-col gap-5">
        <Field label="Yang minjem" required>
          <Input
            autoFocus={!loan}
            value={borrowerName}
            maxLength={80}
            placeholder="Nama orangnya"
            onChange={(event) => setBorrowerName(event.target.value)}
          />
        </Field>

        <Field
          label="Nominal"
          required
          error={
            errors.amount && loan
              ? `Udah dibalikin ${formatRupiah(loan.repaidAmount)}, nggak bisa lebih kecil`
              : undefined
          }
        >
          <div className="flex items-baseline gap-2 border-b-2 border-accent pb-3">
            <span className="font-mono text-[13px] font-medium text-ink-3">Rp</span>
            <Input
              inputMode="numeric"
              placeholder="0"
              aria-label="Nominal pinjaman"
              value={amountText}
              onChange={(event) => setAmountText(formatAmountInput(event.target.value))}
              className={cn(
                'amount-display h-auto min-h-0 rounded-none border-0 bg-transparent p-0 text-[32px] focus:border-0',
                amountText === '' && 'text-ink-3',
              )}
            />
          </div>
        </Field>

        <div>
          <span className="label-micro mb-2.5 flex items-baseline gap-1.5">
            Diambil dari dompet<span className="text-neg">*</span>
          </span>
          {loan ? (
            <p className="flex items-center gap-2 text-sm text-ink">
              <span
                aria-hidden
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: loan.walletColor }}
              />
              {loan.walletName}
            </p>
          ) : (
            <ul className="flex flex-col gap-2" role="radiogroup" aria-label="Dompet">
              {wallets.map((candidate) => (
                <li key={candidate.id}>
                  <WalletOption
                    wallet={candidate}
                    selected={candidate.id === walletId}
                    onSelect={() => setWalletId(candidate.id)}
                  />
                </li>
              ))}
            </ul>
          )}
          {impact ? (
            <p
              className={cn(
                'mt-2.5 text-[12.5px]',
                impact.blocked || impact.warn ? 'text-neg' : 'text-ink-2',
              )}
              role={impact.blocked ? 'alert' : undefined}
            >
              {impact.text}
            </p>
          ) : null}
        </div>

        <Field label="Tanggal minjem" required error={errors.lentOn ? 'Nggak boleh di masa depan' : undefined}>
          <ChipWrap>
            <Chip selected={lentOn === today} onClick={() => setLentOn(today)}>
              Hari ini
            </Chip>
            <Chip
              selected={lentOn === shiftDate(today, -1)}
              onClick={() => setLentOn(shiftDate(today, -1))}
            >
              Kemarin
            </Chip>
            <Input
              type="date"
              value={lentOn}
              max={today}
              onChange={(event) => setLentOn(event.target.value)}
              className="w-auto shrink-0 py-0"
            />
          </ChipWrap>
        </Field>

        <Field
          label="Janji balikin"
          hint="opsional — lewat dari sini ditandai telat"
          error={errors.dueDate ? 'Nggak boleh sebelum tanggal minjem' : undefined}
        >
          <ChipWrap>
            <Chip selected={!hasDueDate} onClick={() => setHasDueDate(false)}>
              Nggak ada
            </Chip>
            <Chip selected={hasDueDate} onClick={() => setHasDueDate(true)}>
              Ada tanggalnya
            </Chip>
            {hasDueDate ? (
              <Input
                type="date"
                value={dueDate}
                min={lentOn}
                onChange={(event) => setDueDate(event.target.value)}
                className="w-auto shrink-0 py-0"
              />
            ) : null}
          </ChipWrap>
        </Field>

        <Field label="Catatan" hint="opsional">
          <Textarea
            value={note}
            maxLength={255}
            placeholder="buat apa, bayar lewat mana, dll."
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>

        <Button
          size="lg"
          onClick={() => void save()}
          disabled={!canSave || create.isPending || update.isPending}
        >
          {create.isPending || update.isPending ? 'Menyimpan…' : loan ? 'Simpan' : 'Catat pinjaman'}
        </Button>
      </div>
    </Sheet>
  );
}
