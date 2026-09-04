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
        <Dialog.Overlay
          className="fixed inset-0 z-40 backdrop-blur-[2px] data-[state=open]:animate-[sheet-fade_var(--t-base)_var(--ease-out)]"
          style={{ backgroundColor: 'rgba(16, 17, 28, 0.42)' }}
        />
        <Dialog.Content
          className={cn(
            'fixed inset-x-0 bottom-0 z-50 max-h-[92dvh] overflow-y-auto rounded-t-xl border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] shadow-lg',
            // Scoped below sm: the desktop variant is centred with a translate of its own,
            // and a transform animation would fight it mid-flight.
            'max-sm:data-[state=open]:animate-[sheet-rise_340ms_var(--ease-spring)]',
            'sm:data-[state=open]:animate-[sheet-fade_var(--t-base)_var(--ease-out)]',
            'sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-[32rem] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:border',
            className,
          )}
        >
          <div className="sticky top-0 z-10 bg-surface px-5 pt-2.5 pb-3">
            {/* The grip is decorative -- the sheet is dismissed by the X or the scrim. */}
            <div aria-hidden className="mx-auto mb-4 h-1 w-9 rounded-full bg-line-strong" />
            <div className="flex items-start justify-between gap-3">
              <div>
                <Dialog.Title className="title-display text-lg text-ink">{title}</Dialog.Title>
                {description ? (
                  <Dialog.Description className="mt-1 text-xs text-ink-2">
                    {description}
                  </Dialog.Description>
                ) : (
                  <Dialog.Description className="sr-only">{title}</Dialog.Description>
                )}
              </div>
              <Dialog.Close
                className="-mt-1 -mr-2 grid h-11 w-11 shrink-0 place-items-center rounded-sm text-ink-3 transition-colors duration-[var(--t-fast)] ease-out hover:bg-surface-2 hover:text-ink-2"
                aria-label="Tutup"
              >
                <X className="h-5 w-5" />
              </Dialog.Close>
            </div>
          </div>
          <div className="px-5 pt-1 pb-6">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
