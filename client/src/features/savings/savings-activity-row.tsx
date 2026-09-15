import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatDayShort } from '@/lib/format';
import { Money } from '@/components/ui/money';
import type { Transaction, TransactionKind } from '@/types/api';

const INCOMING: TransactionKind[] = ['DEPOSIT', 'TRANSFER_IN'];

/**
 * One line of savings history.
 *
 * A withdrawal leads with its reason, a deposit with its note or the plain word. That is
 * not a styling choice: the reason is the only thing that makes a past withdrawal
 * reviewable, and burying it under a category name is how a savings account quietly
 * becomes a list of unexplained holes (goal G2).
 */
export function SavingsActivityRow({
  transaction,
  onSelect,
}: {
  transaction: Transaction;
  /** Opens the edit sheet. Omitted where there is nothing to open, so the row stays inert. */
  onSelect?: (transaction: Transaction) => void;
}) {
  const incoming = INCOMING.includes(transaction.kind);
  const isTransfer = transaction.transferGroupId !== null;

  const Icon = isTransfer ? ArrowLeftRight : incoming ? ArrowDownLeft : ArrowUpRight;
  const headline = isTransfer
    ? incoming
      ? 'Masuk dari dompet lain'
      : 'Dipindah ke dompet lain'
    : incoming
      ? (transaction.note ?? 'Setoran')
      : (transaction.reason ?? 'Penarikan');

  const detail = [
    formatDayShort(transaction.occurredOn),
    transaction.category?.name,
    !incoming && transaction.expectedReturn
      ? transaction.settled
        ? 'udah dibalikin'
        : 'bakal dibalikin'
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const body = (
    <>
      <span
        aria-hidden
        className={cn(
          'grid h-8 w-8 shrink-0 place-items-center rounded-full',
          incoming ? 'bg-pos-soft text-pos' : 'bg-surface-2 text-ink-3',
        )}
      >
        <Icon className="h-4 w-4" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-medium text-ink">{headline}</span>
        <span className="block truncate text-[11px] text-ink-3">{detail}</span>
      </span>

      <Money
        amount={incoming ? transaction.amount : -transaction.amount}
        tone={incoming ? 'safe' : 'neutral'}
        showOverBadge={false}
        className="shrink-0 text-[13.5px] font-semibold"
      />
    </>
  );

  if (!onSelect) {
    return <li className="flex items-center gap-3 py-3">{body}</li>;
  }

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(transaction)}
        data-tap
        className="-mx-2 flex w-full items-center gap-3 rounded-sm px-2 py-3 text-left transition-colors duration-[var(--t-fast)] ease-out active:bg-surface-2"
      >
        {body}
      </button>
    </li>
  );
}
