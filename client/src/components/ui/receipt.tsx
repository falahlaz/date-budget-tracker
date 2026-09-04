import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { formatRupiah } from '@/lib/format';

/**
 * The weekly breakdown, set as a till receipt.
 *
 * Mono here is not decoration: the card *is* a receipt -- a running total where each line
 * feeds the next -- and a receipt is the form that already explains that arithmetic
 * without a legend. The dotted leader carries the eye from label to figure.
 */
export function ReceiptCard({
  caption,
  children,
  className,
}: {
  caption: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn('tabular rounded-lg border border-line bg-surface p-5 font-mono', className)}
    >
      <div className="label-micro mb-3.5 border-b border-dashed border-line-strong pb-3.5 text-[10px] tracking-[0.14em]">
        {caption}
      </div>
      {children}
    </div>
  );
}

export function ReceiptLine({
  label,
  detail,
  amount,
  tone = 'neutral',
  strong,
  signed,
}: {
  label: string;
  /**
   * The arithmetic behind the label, on its own line.
   *
   * It lives here rather than inside `label` because a wrapped label breaks the leader:
   * the dots end mid-row and the figure drifts off the last line. Keeping the leader row
   * to one line is what makes the column of figures readable at all.
   */
  detail?: string;
  amount: number;
  tone?: 'neutral' | 'pos' | 'neg';
  /** The subtotal lines a rule introduces: the label reads at full ink. */
  strong?: boolean;
  /**
   * Render an explicit + / − rather than a bare figure.
   *
   * `'minus'` for a row that always takes away: spending nothing is still a subtraction,
   * and negating it leaves -0, which is not `< 0` and would otherwise read "+ Rp 0".
   */
  signed?: boolean | 'minus';
}) {
  const text = signed
    ? `${signed === 'minus' || amount < 0 ? '−' : '+'} ${formatRupiah(Math.abs(amount))}`
    : formatRupiah(amount);

  return (
    <div className="py-1.5 text-[12.5px] text-ink-2">
      <div className="flex items-baseline gap-2">
        <span className={cn('min-w-0 shrink truncate', strong && 'text-ink')} title={label}>
          {label}
        </span>
        <span
          aria-hidden
          className="min-w-4 -translate-y-[3px] flex-1 border-b border-dotted border-line-strong"
        />
        <span
          className={cn(
            'shrink-0 font-medium whitespace-nowrap',
            tone === 'pos' ? 'text-pos' : tone === 'neg' ? 'text-neg' : 'text-ink',
          )}
        >
          {text}
        </span>
      </div>
      {detail ? <div className="mt-0.5 text-[10.5px] text-ink-3">{detail}</div> : null}
    </div>
  );
}

export function ReceiptRule({ double }: { double?: boolean }) {
  if (double) {
    return <div aria-hidden className="my-3 h-[3px] border-t border-b border-line-strong" />;
  }

  return <div aria-hidden className="my-2.5 h-px bg-line-strong" />;
}

export function ReceiptTotal({
  label,
  amount,
  note,
}: {
  label: string;
  amount: number;
  note?: ReactNode;
}) {
  return (
    <>
      <div className="flex items-baseline justify-between gap-3 pt-1">
        <span className="label-micro min-w-0 truncate text-[11px] tracking-[0.1em]">{label}</span>
        <span
          className={cn(
            'amount-display shrink-0 text-[26px] whitespace-nowrap',
            amount < 0 ? 'text-neg' : 'text-ink',
          )}
        >
          {formatRupiah(amount)}
        </span>
      </div>
      {note ? <div className="mt-2 font-sans text-[11.5px] text-ink-3">{note}</div> : null}
    </>
  );
}
