import { Delete } from 'lucide-react';
import { cn } from '@/lib/cn';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', 'del'] as const;

/**
 * The amount keypad (PRD 9.6).
 *
 * Its own keys rather than the OS keyboard: entry has to take seconds (goal G3), and a
 * software keyboard costs a layout shift, arrives in whatever form the device feels like,
 * and buries the Simpan button under itself. `000` is here because every amount in this
 * app is rupiah -- three zeroes is the single most common thing to type.
 *
 * Controlled and digits-only. The caller owns formatting: this never sees a separator.
 */
export function Keypad({
  value,
  onChange,
  maxLength = 12,
  className,
}: {
  value: string;
  onChange: (next: string) => void;
  maxLength?: number;
  className?: string;
}) {
  const press = (key: (typeof KEYS)[number]) => {
    if (key === 'del') {
      onChange(value.slice(0, -1));
      return;
    }

    // A leading zero would let "0" grow into "0500", which formats as 500 and reads as a
    // typo. Dropping it keeps the displayed figure and the stored digits identical.
    const next = (value === '0' ? '' : value) + key;
    if (next.length > maxLength) return;

    onChange(next);
  };

  return (
    <div className={cn('grid grid-cols-3 gap-2', className)}>
      {KEYS.map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => press(key)}
          aria-label={key === 'del' ? 'Hapus satu angka' : key}
          className={cn(
            'grid h-13 place-items-center rounded-md border border-line bg-surface-2 font-mono text-lg font-medium text-ink',
            'transition-[background-color,transform] duration-90 ease-out hover:bg-surface-3 active:scale-95 active:bg-accent-soft',
            key === 'del' || key === '000' ? 'text-sm text-ink-2' : null,
          )}
        >
          {key === 'del' ? <Delete className="h-5 w-5" aria-hidden /> : key}
        </button>
      ))}
    </div>
  );
}
