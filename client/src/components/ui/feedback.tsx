import { Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-5 w-5 animate-spin text-ink-3', className)} aria-hidden />;
}

export function LoadingBlock({ label = 'Memuat…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-ink-2" role="status">
      <Spinner />
      {label}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-sm bg-surface-2', className)} aria-hidden />;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      {icon ? <div className="mb-1 text-ink-3" aria-hidden>{icon}</div> : null}
      <p className="text-sm font-semibold text-ink">{title}</p>
      {description ? <p className="max-w-xs text-xs text-ink-2">{description}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
  action,
}: {
  message: string;
  onRetry?: () => void;
  /** An escape route for when retrying the same request cannot help. */
  action?: ReactNode;
}) {
  return (
    <div
      className="rounded-lg border border-neg/30 bg-neg-soft p-4 text-sm text-neg"
      role="alert"
    >
      <p className="font-medium">Gagal memuat data</p>
      <p className="mt-1 text-xs opacity-90">{message}</p>
      {onRetry || action ? (
        <div className="mt-3 flex items-center gap-4 text-xs font-semibold">
          {onRetry ? (
            <button type="button" onClick={onRetry} className="min-h-0 underline">
              Coba lagi
            </button>
          ) : null}
          {action}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The meter (PRD 9.5).
 *
 * A sunken track with a fill that animates its width in, plus an optional pace marker --
 * the tick showing where spending *should* be by today. Fill and marker are separate
 * because the interesting reading is which side of the tick the fill lands on.
 */
export function Meter({
  value,
  max,
  markerRatio,
  fillClassName = 'bg-accent',
  className,
  size = 'md',
}: {
  value: number;
  max: number;
  markerRatio?: number;
  /** A tone class from TONE_FILL, or any bg-* utility. */
  fillClassName?: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const ratio = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0;
  const height = { sm: 'h-[3px]', md: 'h-[7px]', lg: 'h-[9px]' }[size];

  return (
    <div className={cn('relative w-full rounded-full bg-surface-3', height, className)}>
      <div
        className={cn(
          'h-full rounded-full transition-[width] duration-700 ease-out',
          fillClassName,
        )}
        style={{ width: `${ratio * 100}%` }}
      />
      {markerRatio !== undefined && markerRatio > 0 && markerRatio < 1 ? (
        <span
          aria-hidden
          className="absolute -top-1 -bottom-1 w-0.5 rounded-[1px] bg-ink/55"
          style={{ left: `${markerRatio * 100}%` }}
        />
      ) : null}
    </div>
  );
}
