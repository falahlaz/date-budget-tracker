import { ImageIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatDayShort, formatRupiah } from '@/lib/format';
import { PAYMENT_METHOD_LABELS, type Expense } from '@/types/api';

/**
 * One row in any expense list (PRD 9.2, S5).
 *
 * The place name is the headline because that is what the user actually remembers about a
 * spend; when there is none, the category takes its place rather than leaving a blank.
 */
export function ExpenseRow({ expense, showDate = true }: { expense: Expense; showDate?: boolean }) {
  const title = expense.merchant ?? expense.category?.name ?? 'Tanpa kategori';

  return (
    <li>
      <Link
        to={`/expenses/${expense.id}`}
        data-tap
        className="flex items-center gap-3 py-2.5 transition-colors active:bg-surface-sunken"
      >
        <span
          aria-hidden
          className="h-9 w-1 shrink-0 rounded-full"
          style={{ backgroundColor: expense.category?.color ?? 'var(--color-ink-subtle)' }}
        />

        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-ink">{title}</span>
          <span className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-muted">
            {showDate ? <span>{formatDayShort(expense.spentOn)}</span> : null}
            {expense.merchant && expense.category ? (
              <>
                <span aria-hidden>·</span>
                <span className="truncate">{expense.category.name}</span>
              </>
            ) : null}
            <span aria-hidden>·</span>
            <span>{PAYMENT_METHOD_LABELS[expense.paymentMethod]}</span>
            {expense.receipts.length > 0 ? (
              <ImageIcon className="h-3 w-3 shrink-0" aria-label={`${expense.receipts.length} struk`} />
            ) : null}
          </span>
        </span>

        <span className="tabular shrink-0 text-sm font-semibold text-ink">
          {formatRupiah(expense.amount)}
        </span>
      </Link>
    </li>
  );
}
