import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Grows a small control's tap target to clear the 44px floor (PRD 11) without growing its
 * box. Needs `relative` on the same element.
 */
const HIT_AREA = "before:absolute before:inset-x-0 before:-inset-y-2.5 before:content-['']";

/**
 * The band above a list or table: a mono micro-label on the left, an optional text link
 * on the right. It repeats on nearly every screen, so it is one component rather than a
 * dozen copies of the same two spans.
 */
export function SectionHead({
  title,
  action,
  className,
}: {
  title: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-3 flex items-baseline justify-between gap-3', className)}>
      <span className="label-micro">{title}</span>
      {action}
    </div>
  );
}

export function SectionLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative min-h-0 text-xs font-medium text-accent-ink hover:underline',
        // A 44px-tall button beside an 11px label would set the whole row's height, so the
        // box stays small and an invisible pseudo-element carries the tap target instead.
        HIT_AREA,
      )}
    >
      {children}
    </button>
  );
}

/**
 * A two-option segmented control (Total ⇄ Rata-rata, Terang ⇄ Gelap ⇄ Sistem).
 *
 * Rendered from a list rather than as children so the pressed state can never disagree
 * with the value the caller holds.
 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex gap-0.5 rounded-sm border border-line bg-surface-2 p-0.5"
    >
      {options.map((option) => {
        const selected = option.value === value;

        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'relative min-h-0 rounded-xs px-2.5 py-1.5 font-mono text-[10px] font-medium tracking-[0.08em] uppercase',
              HIT_AREA,
              'transition-[background-color,color] duration-[var(--t-fast)] ease-out',
              selected ? 'bg-surface text-ink shadow-sm' : 'text-ink-3 hover:text-ink-2',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
