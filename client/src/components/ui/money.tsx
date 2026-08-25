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
  safe: 'text-safe',
  warn: 'text-warn',
  over: 'text-over',
  neutral: 'text-ink',
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

export function OverBadge() {
  return (
    <span className="rounded bg-over-soft px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-over uppercase">
      Over
    </span>
  );
}
