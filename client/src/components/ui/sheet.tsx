import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * A bottom sheet: the quick-add form and every confirmation live in one.
 *
 * Bottom-anchored on purpose -- on a phone held one-handed, the bottom of the screen is
 * the only part the thumb reaches comfortably.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" />
        <Dialog.Content
          className={cn(
            'fixed inset-x-0 bottom-0 z-50 max-h-[92dvh] overflow-y-auto rounded-t-3xl border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] shadow-2xl',
            'sm:inset-x-auto sm:left-1/2 sm:bottom-auto sm:top-1/2 sm:w-[32rem] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl sm:border',
            className,
          )}
        >
          <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-line bg-surface px-4 py-3">
            <div>
              <Dialog.Title className="text-base font-semibold text-ink">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-0.5 text-xs text-ink-muted">
                  {description}
                </Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">{title}</Dialog.Description>
              )}
            </div>
            <Dialog.Close
              className="-mr-1 grid h-11 w-11 place-items-center rounded-full text-ink-muted hover:bg-surface-sunken"
              aria-label="Tutup"
            >
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>
          <div className="px-4 py-4">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
