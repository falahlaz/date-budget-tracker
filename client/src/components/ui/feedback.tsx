import { Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-5 w-5 animate-spin text-ink-muted', className)} aria-hidden />;
}

export function LoadingBlock({ label = 'Memuat…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-ink-muted" role="status">
      <Spinner />
      {label}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-surface-sunken', className)} aria-hidden />;
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
      {icon ? <div className="mb-1 text-ink-subtle">{icon}</div> : null}
      <p className="text-sm font-semibold text-ink">{title}</p>
      {description ? <p className="max-w-xs text-xs text-ink-muted">{description}</p> : null}
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
    <div className="rounded-2xl border border-over/30 bg-over-soft p-4 text-sm text-over" role="alert">
      <p className="font-medium">Gagal memuat data</p>
      <p className="mt-1 text-xs opacity-90">{message}</p>
      {onRetry || action ? (
        <div className="mt-3 flex items-center gap-4 text-xs font-semibold">
          {onRetry ? (
            <button type="button" onClick={onRetry} className="underline">
              Coba lagi
            </button>
          ) : null}
          {action}
        </div>
      ) : null}
    </div>
  );
}

/** A horizontal bar with an optional pace marker (PRD 9.5). */
export function ProgressBar({
  value,
  max,
  markerRatio,
  tone = 'brand',
}: {
  value: number;
  max: number;
  markerRatio?: number;
  tone?: 'brand' | 'over';
}) {
  const ratio = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0;

  return (
    <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-surface-sunken">
      <div
        className={cn('h-full rounded-full', tone === 'over' ? 'bg-over' : 'bg-brand')}
        style={{ width: `${ratio * 100}%` }}
      />
      {markerRatio !== undefined && markerRatio > 0 && markerRatio < 1 ? (
        <span
          aria-hidden
          className="absolute top-0 h-full w-0.5 bg-ink/50"
          style={{ left: `${markerRatio * 100}%` }}
        />
      ) : null}
    </div>
  );
}
