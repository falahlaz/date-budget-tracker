import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Chip, ChipWrap } from '@/components/ui/chip';
import { Field, Input } from '@/components/ui/input';
import { Sheet } from '@/components/ui/sheet';
import { WalletOption } from '@/features/bills/pay-bill-sheet';
import { useWalletSwitcher } from '@/features/wallets/wallet-context';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatAmountInput, formatRupiah, parseAmountInput } from '@/lib/format';
import { shiftDate, todayInJakarta } from '@/lib/today';
import type { Loan } from '@/types/api';
import { useDeleteRepayment, useRepayLoan } from './hooks';

/**
 * Tagih: money coming back from a borrower.
 *
 * Defaults to everything still owed, back into the wallet it left -- the common case is
 * one tap. Both stay editable: people pay back in parts, and sometimes into a different
 * account than the one the money came from.
 */
export function RepayLoanSheet({ loan, onClose }: { loan: Loan | null; onClose: () => void }) {
  const { wallets } = useWalletSwitcher();
  const repay = useRepayLoan();
  const undo = useDeleteRepayment();

  const [walletId, setWalletId] = useState<number | undefined>(undefined);
  const [amountText, setAmountText] = useState('');
  const [occurredOn, setOccurredOn] = useState(todayInJakarta());

  const today = todayInJakarta();

  useEffect(() => {
    if (!loan) return;
    setWalletId(loan.walletId);
    setAmountText(formatAmountInput(String(loan.remaining)));
    setOccurredOn(todayInJakarta());
    // Reset only when a different loan is opened, not on every refetch of the same one.
  }, [loan?.id]);

  const amount = parseAmountInput(amountText);
  const wallet = wallets.find((candidate) => candidate.id === walletId);
  const tooMuch = loan !== null && amount > loan.remaining;
  const tooEarly = loan !== null && occurredOn < loan.lentOn;
  const canSave =
    loan !== null && wallet !== undefined && amount >= 1 && !tooMuch && !tooEarly && occurredOn <= today;

  const submit = async () => {
    if (!loan || !wallet || !canSave) return;

    try {
      const result = await repay.mutateAsync({
        loanId: loan.id,
        amount,
        walletId: wallet.id,
        occurredOn,
      });
      const repayment = result.loan.repayments.find(
        (row) => row.transactionId === result.transactionId,
      );

      toast.success(
        result.loan.status === 'SETTLED'
          ? `Pinjaman ${loan.borrowerName} lunas`
          : `${formatRupiah(amount)} dari ${loan.borrowerName} dicatat`,
        {
          description:
            result.loan.status === 'SETTLED'
              ? `Masuk ke ${wallet.name}`
              : `Masuk ke ${wallet.name} · sisa ${formatRupiah(result.loan.remaining)}`,
          action: repayment
            ? {
                label: 'Batalin',
                onClick: () =>
                  undo.mutate(
                    { loanId: loan.id, repaymentId: repayment.id },
                    {
                      onSuccess: () => toast.success('Pembayaran dibatalin'),
                      onError: (error) =>
                        toast.error(error instanceof ApiError ? error.message : 'Gagal membatalkan'),
                    },
                  ),
              }
            : undefined,
        },
      );
      onClose();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Gagal mencatat pembayaran');
    }
  };

  return (
    <Sheet
      open={loan !== null}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={loan ? `Tagih ${loan.borrowerName}` : 'Tagih'}
      description={
        loan
          ? `Masih ${formatRupiah(loan.remaining)} dari ${formatRupiah(loan.amount)}`
          : undefined
      }
    >
      <div className="flex flex-col gap-5">
        <Field
          label="Yang dibalikin"
          required
          error={tooMuch && loan ? `Maksimal ${formatRupiah(loan.remaining)}` : undefined}
        >
          <div className="flex items-baseline gap-2 border-b-2 border-accent pb-3">
            <span className="font-mono text-[13px] font-medium text-ink-3">Rp</span>
            <Input
              inputMode="numeric"
              placeholder="0"
              aria-label="Nominal yang dibalikin"
              value={amountText}
              onChange={(event) => setAmountText(formatAmountInput(event.target.value))}
              className={cn(
                'amount-display h-auto min-h-0 rounded-none border-0 bg-transparent p-0 text-[38px] focus:border-0',
                amountText === '' && 'text-ink-3',
              )}
            />
          </div>
          {loan && amount >= 1 && amount < loan.remaining ? (
            <p className="mt-2 text-[12.5px] text-ink-2">
              Nyicil — sisa {formatRupiah(loan.remaining - amount)} lagi.
            </p>
          ) : null}
        </Field>

        <div>
          <span className="label-micro mb-2.5 flex items-baseline gap-1.5">
            Masuk ke dompet<span className="text-neg">*</span>
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
          {loan && wallet && wallet.id !== loan.walletId ? (
            <p className="mt-2.5 text-[12.5px] text-ink-2">
              Beda dari dompet asalnya ({loan.walletName}).
            </p>
          ) : null}
        </div>

        <Field
          label="Tanggal dibalikin"
          required
          error={tooEarly ? 'Nggak boleh sebelum tanggal minjem' : undefined}
        >
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
              min={loan?.lentOn}
              max={today}
              onChange={(event) => setOccurredOn(event.target.value)}
              className="w-auto shrink-0 py-0"
            />
          </ChipWrap>
        </Field>

        <Button size="lg" onClick={() => void submit()} disabled={!canSave || repay.isPending}>
          {repay.isPending
            ? 'Mencatat…'
            : loan && amount === loan.remaining
              ? 'Tandai lunas'
              : `Catat ${amount >= 1 ? formatRupiah(amount) : ''}`}
        </Button>
      </div>
    </Sheet>
  );
}
