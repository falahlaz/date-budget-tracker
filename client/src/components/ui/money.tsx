import { cn } from '@/lib/cn';
import { formatCompactRupiah, formatRupiah } from '@/lib/format';

export type MoneyTone = 'safe' | 'warn' | 'over' | 'neutral';

/**
 * Picks the tone for a remaining/total pair.
 *
 * Amber at 80% is a warning, not a failure: it is the point where the rest of the week
 * starts to get tight but nothing has gone wrong yet.
 */
export function toneFor(remaining: number, total: number): MoneyTone {
  if (remaining < 0) return 'over';
  if (total <= 0) return 'neutral';
  return remaining / total <= 0.2 ? 'warn' : 'safe';
}

const TONE_TEXT: Record<MoneyTone, string> = {
  safe: 'text-pos',
  warn: 'text-warn',
  over: 'text-neg',
  neutral: 'text-ink',
};

/** The same four tones as a fill, for meters and day bars. */
export const TONE_FILL: Record<MoneyTone, string> = {
  safe: 'bg-pos',
  warn: 'bg-warn',
  over: 'bg-neg',
  neutral: 'bg-accent',
};

export interface MoneyProps {
  amount: number;
  tone?: MoneyTone;
  compact?: boolean;
  /** Show the OVER badge when negative. Off inside tables, where a column header carries it. */
  showOverBadge?: boolean;
  className?: string;
}

/**
 * Renders an amount with its tone.
 *
 * A negative amount always carries the literal word OVER alongside the colour: "over
 * budget" must never be communicated by colour alone (PRD 9.1, 11).
 */
export function Money({ amount, tone, compact, showOverBadge = true, className }: MoneyProps) {
  const resolved: MoneyTone = tone ?? (amount < 0 ? 'over' : 'neutral');
  const text = compact ? formatCompactRupiah(amount) : formatRupiah(amount);

  return (
    <span className={cn('tabular inline-flex items-center gap-1.5', TONE_TEXT[resolved], className)}>
      {text}
      {amount < 0 && showOverBadge ? <OverBadge /> : null}
    </span>
  );
}

/**
 * The big figure: Fraunces, tabular, sitting on the ground rather than inside a card.
 *
 * Serif on the money is the whole point of the type system -- it makes an amount read as
 * something personal rather than a line in a corporate report.
 */
export function MoneyHero({
  amount,
  tone,
  compact,
  className,
}: Omit<MoneyProps, 'showOverBadge'>) {
  const resolved: MoneyTone = tone ?? (amount < 0 ? 'over' : 'neutral');

  return (
    <div className={cn('flex items-baseline gap-3', className)}>
      <span className={cn('amount-hero text-[46px]', TONE_TEXT[resolved])}>
        {compact ? formatCompactRupiah(amount) : formatRupiah(amount)}
      </span>
      {amount < 0 ? <OverBadge /> : null}
    </div>
  );
}

export function OverBadge() {
  return (
    <span className="inline-flex shrink-0 items-center rounded-xs bg-neg-soft px-2 py-0.5 font-mono text-[9.5px] font-medium tracking-[0.1em] text-neg uppercase">
      Over
    </span>
  );
}

/** The receipt-card status pill: over / running / settled. */
export function StatusBadge({ tone, children }: { tone: 'over' | 'run' | 'ok'; children: string }) {
  const styles = {
    over: 'bg-neg-soft text-neg',
    run: 'bg-accent-soft text-accent-ink',
    ok: 'bg-pos-soft text-pos',
  } as const;

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-xs px-2 py-0.5 font-mono text-[9.5px] font-medium tracking-[0.1em] uppercase',
        styles[tone],
      )}
    >
      {children}
    </span>
  );
}
