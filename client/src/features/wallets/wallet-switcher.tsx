import { ArrowLeftRight, Check, ChevronsUpDown, Plus, PiggyBank, Wallet as WalletIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Chip, ChipWrap } from '@/components/ui/chip';
import { Field, Input } from '@/components/ui/input';
import { Sheet } from '@/components/ui/sheet';
import { cn } from '@/lib/cn';
import { ApiError } from '@/lib/api';
import { formatCompactRupiah, formatRupiah } from '@/lib/format';
import type { DateBudgetSummary, SavingsSummary, Wallet, WalletType } from '@/types/api';
import { useCreateWallet } from './hooks';
import { useWalletSwitcher } from './wallet-context';
import { TransferSheet } from './transfer-sheet';

/**
 * The wallet switcher (PRD v2 11.1).
 *
 * Lives in the header of every screen, because switching wallet changes what every screen
 * *is* -- the two types have different tabs, different numbers and different questions.
 * Each row carries the summary for its own type, so the choice is made on the figures
 * rather than on the names.
 */
export function WalletSwitcher() {
  const { wallets, activeWallet, selectWallet, isLoading } = useWalletSwitcher();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [transferring, setTransferring] = useState(false);

  if (isLoading || !activeWallet) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Dompet aktif: ${activeWallet.name}. Ganti dompet`}
        className={cn(
          'flex min-h-11 min-w-0 shrink items-center gap-1.5 rounded-sm px-2 text-left',
          'transition-colors duration-[var(--t-fast)] ease-out hover:bg-surface-2 active:scale-[0.97]',
        )}
      >
        <WalletDot wallet={activeWallet} />
        <span className="min-w-0 truncate text-[13px] font-semibold text-ink">
          {activeWallet.name}
        </span>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-ink-3" aria-hidden />
      </button>

      <Sheet open={open} onOpenChange={setOpen} title="Dompet" description="Pilih dompet yang mau dibuka">
        <ul className="flex flex-col gap-1.5">
          {wallets.map((wallet) => (
            <li key={wallet.id}>
              <WalletRow
                wallet={wallet}
                active={wallet.id === activeWallet.id}
                onSelect={() => {
                  selectWallet(wallet.id);
                  setOpen(false);
                }}
              />
            </li>
          ))}
        </ul>

        <div className="mt-5 flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" />
            Dompet baru
          </Button>
          {wallets.length > 1 ? (
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => {
                setOpen(false);
                setTransferring(true);
              }}
            >
              <ArrowLeftRight className="h-4 w-4" />
              Pindah uang
            </Button>
          ) : null}
        </div>
      </Sheet>

      <CreateWalletSheet
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(wallet) => {
          selectWallet(wallet.id);
          setCreating(false);
          setOpen(false);
        }}
      />

      <TransferSheet open={transferring} onClose={() => setTransferring(false)} />
    </>
  );
}

/** The identity colour, as a dot. Savings is `--pos`, date budget `--accent` (v2 11). */
function WalletDot({ wallet }: { wallet: Wallet }) {
  const Icon = wallet.type === 'SAVINGS' ? PiggyBank : WalletIcon;

  return (
    <span
      aria-hidden
      className={cn(
        'grid h-6 w-6 shrink-0 place-items-center rounded-full',
        wallet.type === 'SAVINGS' ? 'bg-pos-soft text-pos' : 'bg-accent-soft text-accent-ink',
      )}
    >
      <Icon className="h-3.5 w-3.5" />
    </span>
  );
}

function WalletRow({
  wallet,
  active,
  onSelect,
}: {
  wallet: Wallet;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'flex w-full items-center gap-3 rounded-md border px-3.5 py-3 text-left',
        'transition-colors duration-[var(--t-fast)] ease-out active:scale-[0.98]',
        active
          ? wallet.type === 'SAVINGS'
            ? 'border-pos/40 bg-pos-soft'
            : 'border-accent-line bg-accent-soft'
          : 'border-line bg-surface hover:border-line-strong',
      )}
    >
      <WalletDot wallet={wallet} />

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-ink">{wallet.name}</span>
          {wallet.isDefault ? (
            <span className="shrink-0 font-mono text-[9px] tracking-[0.1em] text-ink-3 uppercase">
              Utama
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 block truncate text-[11.5px] text-ink-2">
          <WalletSummaryLine wallet={wallet} />
        </span>
      </span>

      {active ? <Check className="h-4 w-4 shrink-0 text-ink-2" aria-hidden /> : null}
    </button>
  );
}

/**
 * One line of numbers, in the vocabulary of the wallet's own engine.
 *
 * A date-budget wallet answers "how much may I still spend?"; a savings wallet answers
 * "how far along am I?". Showing a single shared figure for both would flatten exactly the
 * distinction the switcher exists to make.
 */
function WalletSummaryLine({ wallet }: { wallet: Wallet }) {
  if (!wallet.summary) return <>—</>;

  if (wallet.type === 'SAVINGS') {
    const summary = wallet.summary as SavingsSummary;

    if (summary.goalName === null) {
      return <>Saldo {formatRupiah(summary.balance)} · belum ada target</>;
    }

    return (
      <>
        {summary.goalName} · {formatCompactRupiah(summary.balance)}
        {summary.progress !== null ? ` · ${Math.round(summary.progress * 100)}%` : ''}
      </>
    );
  }

  const summary = wallet.summary as DateBudgetSummary;

  return (
    <>
      Sisa hari ini {formatRupiah(summary.dayRemaining)} · weekend{' '}
      {formatCompactRupiah(summary.weekendBudgetProjected)}
    </>
  );
}

const TYPE_LABELS: Record<WalletType, string> = {
  DATE_BUDGET: 'Kencan',
  SAVINGS: 'Tabungan',
};

const TYPE_HINTS: Record<WalletType, string> = {
  DATE_BUDGET: 'Budget bulanan yang jadi jatah weekend.',
  SAVINGS: 'Target nominal dengan tenggat, plus alasan tiap penarikan.',
};

function CreateWalletSheet({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (wallet: Wallet) => void;
}) {
  const createWallet = useCreateWallet();
  const [name, setName] = useState('');
  const [type, setType] = useState<WalletType>('SAVINGS');

  const submit = async () => {
    const trimmed = name.trim();
    if (trimmed === '' || createWallet.isPending) return;

    try {
      const wallet = await createWallet.mutateAsync({ name: trimmed, type });
      setName('');
      onCreated(wallet);
      toast.success(`Dompet ${wallet.name} dibuat`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Gagal bikin dompet');
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title="Dompet baru"
    >
      <div className="flex flex-col gap-4">
        <Field label="Nama" required>
          <Input
            autoFocus
            value={name}
            maxLength={60}
            placeholder="Tabungan"
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void submit();
            }}
          />
        </Field>

        <Field label="Tipe" required hint={TYPE_HINTS[type]}>
          <ChipWrap>
            {(['SAVINGS', 'DATE_BUDGET'] as WalletType[]).map((option) => (
              <Chip key={option} selected={type === option} onClick={() => setType(option)}>
                {TYPE_LABELS[option]}
              </Chip>
            ))}
          </ChipWrap>
        </Field>

        {/* The type is locked once money lands in the wallet, because switching it would
            hand existing rows to an engine that has no idea what they mean. */}
        <p className="text-[11.5px] text-ink-3">
          Tipe nggak bisa diubah setelah dompetnya dibuat.
        </p>

        <Button size="lg" onClick={() => void submit()} disabled={name.trim() === '' || createWallet.isPending}>
          {createWallet.isPending ? 'Menyimpan…' : 'Bikin dompet'}
        </Button>
      </div>
    </Sheet>
  );
}
