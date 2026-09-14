import { ArrowRight } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Chip, ChipWrap } from '@/components/ui/chip';
import { Field, Input, Textarea } from '@/components/ui/input';
import { Sheet } from '@/components/ui/sheet';
import { ApiError, api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatAmountInput, formatRupiah, parseAmountInput } from '@/lib/format';
import { invalidateReports } from '@/lib/query';
import { shiftDate, todayInJakarta } from '@/lib/today';
import type { Transfer, Wallet } from '@/types/api';
import { useWalletSwitcher } from './wallet-context';

/**
 * Moving money between wallets (PRD v2 10.4, 6.2).
 *
 * Two sides of one action, written together by the server. The note under the amount is
 * the point of the whole feature: a transfer out of the date wallet is not a neutral
 * bookkeeping move, it cuts that week's weekend budget, and the form says so before the
 * money goes rather than letting the weekend screen explain it afterwards.
 */
export function TransferSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { wallets, activeWallet } = useWalletSwitcher();
  const client = useQueryClient();

  const [fromId, setFromId] = useState<number | null>(null);
  const [toId, setToId] = useState<number | null>(null);
  const [amountText, setAmountText] = useState('');
  const [occurredOn, setOccurredOn] = useState(todayInJakarta());
  const [note, setNote] = useState('');

  const today = todayInJakarta();
  const amount = parseAmountInput(amountText);

  const createTransfer = useMutation({
    mutationFn: (input: {
      fromWalletId: number;
      toWalletId: number;
      amount: number;
      occurredOn: string;
      note?: string;
    }) => api.post<Transfer>('/transfers', input),
    onSuccess: () => invalidateReports(client),
  });

  // Opens on the wallet the user is already looking at, with the other side left blank --
  // guessing the destination would be wrong half the time and silently so.
  useEffect(() => {
    if (!open) return;

    setFromId(activeWallet?.id ?? null);
    setToId(null);
    setAmountText('');
    setOccurredOn(todayInJakarta());
    setNote('');
  }, [open, activeWallet?.id]);

  const from = wallets.find((wallet) => wallet.id === fromId);
  const to = wallets.find((wallet) => wallet.id === toId);
  const canSave = from !== undefined && to !== undefined && amount >= 1 && !createTransfer.isPending;

  const submit = async () => {
    if (!canSave) return;

    try {
      await createTransfer.mutateAsync({
        fromWalletId: from.id,
        toWalletId: to.id,
        amount,
        occurredOn,
        ...(note.trim() === '' ? {} : { note: note.trim() }),
      });

      toast.success(`${formatRupiah(amount)} dipindah`, {
        description: `Dari ${from.name} ke ${to.name}.`,
      });
      onClose();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Gagal memindahkan uang');
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title="Pindah uang"
      description="Dua dompet, satu pencatatan"
    >
      <div className="flex flex-col gap-4">
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

        <Field label="Dari" required>
          <WalletChips
            wallets={wallets}
            value={fromId}
            onChange={(id) => {
              setFromId(id);
              // The server answers 422 for a transfer to the same wallet (8.10); clearing
              // it here means the user never has to be told.
              if (id === toId) setToId(null);
            }}
          />
        </Field>

        <Field label="Ke" required>
          <WalletChips
            wallets={wallets.filter((wallet) => wallet.id !== fromId)}
            value={toId}
            onChange={setToId}
          />
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

        <Field label="Catatan" hint="opsional">
          <Textarea
            value={note}
            maxLength={500}
            placeholder="nabung dari sisa bulan ini"
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>

        {from && to && amount >= 1 ? (
          <div className="rounded-md border border-line bg-surface-2 px-3.5 py-3">
            <p className="flex flex-wrap items-center gap-1.5 text-[13px] font-medium text-ink">
              {from.name}
              <ArrowRight className="h-3.5 w-3.5 text-ink-3" aria-hidden />
              {to.name}
            </p>
            {from.type === 'DATE_BUDGET' ? (
              <p className="mt-1.5 text-[11.5px] text-ink-2">
                Ini motong budget weekend di minggu tanggal {occurredOn}.
              </p>
            ) : (
              <p className="mt-1.5 text-[11.5px] text-ink-2">
                Saldo tabungan nggak boleh minus — kalau kurang, servernya bakal nolak.
              </p>
            )}
          </div>
        ) : null}

        <Button size="lg" onClick={() => void submit()} disabled={!canSave}>
          {createTransfer.isPending ? 'Memindahkan…' : 'Pindahkan'}
        </Button>
      </div>
    </Sheet>
  );
}

function WalletChips({
  wallets,
  value,
  onChange,
}: {
  wallets: Wallet[];
  value: number | null;
  onChange: (id: number) => void;
}) {
  return (
    <ChipWrap>
      {wallets.map((wallet) => (
        <Chip
          key={wallet.id}
          selected={value === wallet.id}
          onClick={() => onChange(wallet.id)}
          accent={wallet.type === 'SAVINGS' ? 'var(--pos)' : 'var(--accent)'}
        >
          {wallet.name}
        </Chip>
      ))}
    </ChipWrap>
  );
}
