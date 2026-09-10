import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { cn } from '@/lib/cn';

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  /** Dot colour, used for category chips. */
  accent?: string;
  /** A dashed outline for "add something new" affordances. */
  ghost?: boolean;
  /** Forwarded to the button, so a caller can scroll one chip of a long row into view. */
  ref?: Ref<HTMLButtonElement>;
}

/** A single-tap control: the fastest possible input for a small, known set of options. */
export function Chip({ selected, accent, ghost, className, children, ...props }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-sm border px-3.5 text-sm font-medium',
        'transition-[background-color,border-color,color,transform] duration-[var(--t-fast)] ease-out active:scale-[0.96]',
        selected
          ? 'border-accent bg-accent-soft text-accent-ink'
          : 'border-line bg-surface-2 text-ink-2 hover:border-line-strong',
        ghost && !selected && 'border-dashed bg-transparent',
        className,
      )}
      {...props}
    >
      {accent ? (
        <span
          aria-hidden
          className="h-[7px] w-[7px] shrink-0 rounded-full"
          style={{ backgroundColor: accent }}
        />
      ) : null}
      {children}
    </button>
  );
}

export function ChipRow({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {children}
    </div>
  );
}

/** Chips that wrap instead of scrolling: used inside the sheet, where there is no gutter. */
export function ChipWrap({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>;
}
