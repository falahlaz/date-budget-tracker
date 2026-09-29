import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { formatDayShort, formatRupiah } from '@/lib/format';
import type { Loan } from '@/types/api';
import { loanStatusLine, type LoanTone } from './loan-labels';

const TONE_TEXT: Record<LoanTone, string> = {
  over: 'text-neg',
  warn: 'text-warn',
  ok: 'text-pos',
  idle: 'text-ink-3',
};

const TONE_DOT: Record<LoanTone, string> = {
  over: 'bg-neg',
  warn: 'bg-warn',
  ok: 'bg-pos',
  idle: 'bg-line-strong',
};

/**
 * One loan in a list. The row opens the loan; the Tagih button records money coming back
 * without leaving the screen.
 */
export function LoanRow({ loan, onRepay }: { loan: Loan; onRepay?: (loan: Loan) => void }) {
  const status = loanStatusLine(loan);
  const repayable = onRepay && loan.status !== 'SETTLED';

  return (
    <li className="flex items-center gap-3 py-3">
      <Link
        to={`/loans/${loan.id}`}
        data-tap
        className="-mx-2 flex min-w-0 flex-1 items-center gap-3 rounded-sm px-2 transition-colors duration-[var(--t-fast)] ease-out active:bg-surface-2"
      >
        <span aria-hidden className={cn('h-2 w-2 shrink-0 rounded-full', TONE_DOT[status.tone])} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className="truncate text-sm font-medium text-ink">{loan.borrowerName}</span>
            <span className="tabular ml-auto shrink-0 font-mono text-[13px] font-medium text-ink">
              {formatRupiah(loan.status === 'SETTLED' ? loan.amount : loan.remaining)}
            </span>
          </span>
          <span className="mt-0.5 block truncate text-[11.5px] text-ink-3">
            {formatDayShort(loan.lentOn)} · dari {loan.walletName}
            {loan.repaidAmount > 0 && loan.status !== 'SETTLED'
              ? ` · dari ${formatRupiah(loan.amount)}`
              : ''}
          </span>
          <span className={cn('mt-0.5 block truncate text-[11.5px] font-medium', TONE_TEXT[status.tone])}>
            {status.text}
          </span>
        </span>
      </Link>

      {repayable ? (
        <Button
          size="md"
          variant={loan.status === 'OVERDUE' ? 'primary' : 'secondary'}
          className="h-9 shrink-0 px-3 text-[13px]"
          onClick={() => onRepay(loan)}
        >
          Tagih
        </Button>
      ) : null}
    </li>
  );
}
