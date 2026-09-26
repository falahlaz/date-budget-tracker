import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { formatRupiah } from '@/lib/format';
import type { Bill } from '@/types/api';
import { BILL_CATEGORY_LABELS, billStatusLine, installmentLine, type BillTone } from './bill-labels';

const TONE_TEXT: Record<BillTone, string> = {
  over: 'text-neg',
  warn: 'text-warn',
  ok: 'text-pos',
  idle: 'text-ink-3',
};

const TONE_DOT: Record<BillTone, string> = {
  over: 'bg-neg',
  warn: 'bg-warn',
  ok: 'bg-pos',
  idle: 'bg-line-strong',
};

/**
 * One bill in a list. The row opens the bill; the Bayar button, when there is one, pays
 * it without leaving the screen -- the whole point of seeing it on Home.
 */
export function BillRow({ bill, onPay }: { bill: Bill; onPay?: (bill: Bill) => void }) {
  const status = billStatusLine(bill);
  const installment = installmentLine(bill);
  // Settled for this month: paying ahead stays possible from the bill itself, but a list
  // full of Bayar buttons on things already paid would bury the ones that are not.
  const payable =
    onPay && !bill.isArchived && bill.schedule.status !== 'DONE' && bill.schedule.status !== 'PAID';

  return (
    <li className="flex items-center gap-3 py-3">
      <Link
        to={`/bills/${bill.id}`}
        data-tap
        className="-mx-2 flex min-w-0 flex-1 items-center gap-3 rounded-sm px-2 transition-colors duration-[var(--t-fast)] ease-out active:bg-surface-2"
      >
        <span aria-hidden className={cn('h-2 w-2 shrink-0 rounded-full', TONE_DOT[status.tone])} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className="truncate text-sm font-medium text-ink">{bill.name}</span>
            <span className="tabular ml-auto shrink-0 font-mono text-[13px] font-medium text-ink">
              {formatRupiah(bill.amount)}
            </span>
          </span>
          <span className="mt-0.5 block truncate text-[11.5px] text-ink-3">
            {[bill.platform, BILL_CATEGORY_LABELS[bill.category], installment]
              .filter(Boolean)
              .join(' · ')}
          </span>
          <span className={cn('mt-0.5 block truncate text-[11.5px] font-medium', TONE_TEXT[status.tone])}>
            {status.text}
          </span>
        </span>
      </Link>

      {payable ? (
        <Button
          size="md"
          variant={bill.schedule.unpaidDueCount > 0 ? 'primary' : 'secondary'}
          className="h-9 shrink-0 px-3 text-[13px]"
          onClick={() => onPay(bill)}
        >
          Bayar
        </Button>
      ) : null}
    </li>
  );
}
