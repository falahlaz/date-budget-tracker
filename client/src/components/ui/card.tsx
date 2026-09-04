import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Not everything is a card.
 *
 * A box is for something that is genuinely a separate object. The hero figure on Home
 * sits directly on the ground with no border and no shadow: if every block gets a box,
 * the hierarchy flattens and nothing reads as more important than anything else.
 */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-lg border border-line bg-surface p-5 shadow-sm', className)}
      {...props}
    />
  );
}

/** The butter variant. Only ever a weekend: the projection card and the weekend rows. */
export function ButterCard({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-lg border border-butter-line bg-butter-soft p-5', className)}
      {...props}
    />
  );
}

export function CardHeader({
  title,
  action,
  description,
}: {
  title: ReactNode;
  action?: ReactNode;
  description?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div>
        <h2 className="label-micro">{title}</h2>
        {description ? <p className="mt-1.5 text-xs text-ink-2">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
