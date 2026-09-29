import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Chip, ChipWrap } from '@/components/ui/chip';
import { Field, Input } from '@/components/ui/input';
import { Sheet } from '@/components/ui/sheet';
import { useActiveWalletId, useWalletSwitcher } from '@/features/wallets/wallet-context';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatAmountInput, formatRupiah, parseAmountInput } from '@/lib/format';
import { shiftDate, todayInJakarta } from '@/lib/today';
import {
  PAYMENT_METHOD_LABELS,
  type Bill,
  type DateBudgetSummary,
  type PaymentMethod,
  type SavingsSummary,
  type Wallet,
} from '@/types/api';
import { periodLabel } from './bill-labels';
import { usePayBill, useUndoBillPayment } from './hooks';

const BILL_PAYMENT_METHODS: PaymentMethod[] = ['TRANSFER', 'EWALLET', 'DEBIT', 'CREDIT', 'QRIS', 'CASH'];

/**
 * Bayar: pay one month of a bill from a wallet the user picks.
 *
 * The wallet defaults to the one that is open, because that is where the user was looking
 * when they tapped Bayar -- but it is always shown and always one tap to change, since
 * which pocket the money leaves is the one decision this sheet exists to ask about.
 */
export function PayBillSheet({ bill, onClose }: { bill: Bill | null; onClose: () => void }) {
  const { wallets } = useWalletSwitcher();
  const activeWalletId = useActiveWalletId();
  const pay = usePayBill();
  const undo = useUndoBillPayment();

  const [walletId, setWalletId] = useState<number | undefined>(activeWalletId);
  const [amountText, setAmountText] = useState('');
  const [occurredOn, setOccurredOn] = useState(todayInJakarta());
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('TRANSFER');

  const today = todayInJakarta();
  const open = bill !== null;

  useEffect(() => {
    if (!bill) return;
    setWalletId(activeWalletId);
    setAmountText(formatAmountInput(String(bill.amount)));
    setOccurredOn(todayInJakarta());
    setPaymentMethod('TRANSFER');
    // Reset only when a different bill is opened, not on every refetch of the same one.
  }, [bill?.id]);

  const wallet = wallets.find((candidate) => candidate.id === walletId);
  const amount = parseAmountInput(amountText);
  const period = bill?.schedule.nextPeriod ?? null;
  const impact = wallet ? impactOf(wallet, amount) : null;
  const canPay = bill !== null && wallet !== undefined && amount >= 1 && !impact?.blocked;

  const submit = async () => {
    if (!bill || !wallet || !canPay) return;

    try {
      const result = await pay.mutateAsync({
        billId: bill.id,
        walletId: wallet.id,
        amount,
        occurredOn,
        ...(wallet.type === 'DATE_BUDGET' ? { paymentMethod } : {}),
      });

      toast.success(`${bill.name} dibayar`, {
        description: `${formatRupiah(amount)} dari ${wallet.name} · ${periodLabel(result.period)}`,
        action: {
          label: 'Batalin',
          onClick: () =>
            undo.mutate(
              {
                transactionId: result.transaction.id,
                walletId: wallet.id,
                walletType: wallet.type,
              },
              {
                onSuccess: () => toast.success('Pembayaran dibatalin'),
                onError: (error) =>
                  toast.error(error instanceof ApiError ? error.message : 'Gagal membatalkan'),
              },
            ),
        },
      });
      onClose();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Gagal mencatat pembayaran');
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={bill ? `Bayar ${bill.name}` : 'Bayar'}
      description={
        bill && period
          ? `Buat tagihan ${periodLabel(period)}${bill.platform ? ` · ${bill.platform}` : ''}`
          : undefined
      }
    >
      <div className="flex flex-col gap-5">
        <Field label="Nominal" required>
          <div className="flex items-baseline gap-2 border-b-2 border-accent pb-3">
            <span className="font-mono text-[13px] font-medium text-ink-3">Rp</span>
            <Input
              inputMode="numeric"
              placeholder="0"
              aria-label="Nominal pembayaran"
              value={amountText}
              onChange={(event) => setAmountText(formatAmountInput(event.target.value))}
              className={cn(
                'amount-display h-auto min-h-0 rounded-none border-0 bg-transparent p-0 text-[38px] focus:border-0',
                amountText === '' && 'text-ink-3',
              )}
            />
          </div>
        </Field>

        <div>
          <span className="label-micro mb-2.5 flex items-baseline gap-1.5">
            Bayar dari dompet<span className="text-neg">*</span>
          </span>
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
          {impact ? (
            <p
              className={cn('mt-2.5 text-[12.5px]', impact.blocked || impact.warn ? 'text-neg' : 'text-ink-2')}
              role={impact.blocked ? 'alert' : undefined}
            >
              {impact.text}
            </p>
          ) : null}
        </div>

        {wallet?.type === 'DATE_BUDGET' ? (
          <Field label="Metode bayar">
            <ChipWrap>
              {BILL_PAYMENT_METHODS.map((method) => (
                <Chip
                  key={method}
                  selected={paymentMethod === method}
                  onClick={() => setPaymentMethod(method)}
                >
                  {PAYMENT_METHOD_LABELS[method]}
                </Chip>
              ))}
            </ChipWrap>
          </Field>
        ) : null}

        <Field label="Tanggal bayar" required>
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

        <Button size="lg" onClick={() => void submit()} disabled={!canPay || pay.isPending}>
          {pay.isPending ? 'Mencatat…' : `Bayar ${amount >= 1 ? formatRupiah(amount) : ''}`}
        </Button>
      </div>
    </Sheet>
  );
}

export function WalletOption({
  wallet,
  selected,
  onSelect,
}: {
  wallet: Wallet;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-3 rounded-md border px-3.5 py-3 text-left',
        'transition-[background-color,border-color] duration-[var(--t-fast)] ease-out active:scale-[0.99]',
        selected ? 'border-accent bg-accent-soft' : 'border-line bg-surface hover:border-line-strong',
      )}
    >
      <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: wallet.color }} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-ink">{wallet.name}</span>
        <span className="block truncate text-[11.5px] text-ink-3">{walletFigure(wallet)}</span>
      </span>
      <span
        aria-hidden
        className={cn(
          'grid h-4.5 w-4.5 shrink-0 place-items-center rounded-full border-2',
          selected ? 'border-accent' : 'border-line-strong',
        )}
      >
        {selected ? <span className="h-2 w-2 rounded-full bg-accent" /> : null}
      </span>
    </button>
  );
}

function walletFigure(wallet: Wallet): string {
  if (!wallet.summary) return wallet.type === 'SAVINGS' ? 'Tabungan' : 'Pengeluaran';

  if (wallet.type === 'SAVINGS') {
    return `Saldo ${formatRupiah((wallet.summary as SavingsSummary).balance)}`;
  }

  // The month, not the day: on a weekend the day figure is the weekday allowance and
  // reads as a nonsense negative, while the month is what a bill actually comes out of.
  const summary = wallet.summary as DateBudgetSummary;
  return `Sisa budget bulan ini ${formatRupiah(summary.monthRemaining)}`;
}

/**
 * What paying from this wallet does to it, in one sentence.
 *
 * A savings balance cannot go below zero, so that is a block (the server refuses it too).
 * A date budget can -- a budget is a plan, not an account -- so there it is only a warning.
 */
export function impactOf(
  wallet: Wallet,
  amount: number,
): { text: string; blocked: boolean; warn: boolean } | null {
  if (!wallet.summary || amount < 1) return null;

  if (wallet.type === 'SAVINGS') {
    const after = (wallet.summary as SavingsSummary).balance - amount;
    return after < 0
      ? { text: `Saldo ${wallet.name} nggak cukup buat ini.`, blocked: true, warn: true }
      : { text: `Saldo ${wallet.name} jadi ${formatRupiah(after)}.`, blocked: false, warn: false };
  }

  const after = (wallet.summary as DateBudgetSummary).monthRemaining - amount;

  return {
    text:
      after < 0
        ? `Budget ${wallet.name} bulan ini jadi minus ${formatRupiah(-after)}.`
        : `Sisa budget ${wallet.name} bulan ini jadi ${formatRupiah(after)}.`,
    blocked: false,
    warn: after < 0,
  };
}
