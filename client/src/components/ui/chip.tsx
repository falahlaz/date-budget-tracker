import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  /** Dot colour, used for category chips. */
  accent?: string;
}

/** A single-tap control: the fastest possible input for a small, known set of options. */
export function Chip({ selected, accent, className, children, ...props }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors',
        selected
          ? 'border-brand bg-brand text-brand-ink'
          : 'border-line bg-surface text-ink hover:bg-surface-sunken',
        className,
      )}
      {...props}
    >
      {accent ? (
        <span
          aria-hidden
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: selected ? 'currentColor' : accent }}
        />
      ) : null}
      {children}
    </button>
  );
}

export function ChipRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {children}
    </div>
  );
}
