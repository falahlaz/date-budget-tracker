import { Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Chip, ChipRow } from '@/components/ui/chip';
import { Field, Input } from '@/components/ui/input';
import { ApiError } from '@/lib/api';
import { useAddCategory, useCategories } from './hooks';

const MAX_NAME_LENGTH = 50;

/**
 * The Kategori field shared by quick add and the edit sheet.
 *
 * The "+ Baru" chip exists because the alternative is abandoning a half-typed expense to go
 * to Settings -- in practice that means the expense gets saved uncategorised and never
 * fixed. Creating one here costs a name and nothing else: the colour is picked server-side,
 * so the keyboard never has to go away mid-entry.
 */
export function CategoryPicker({
  value,
  onChange,
  hint = 'opsional',
}: {
  value: number | null;
  onChange: (id: number | null) => void;
  hint?: string;
}) {
  const categories = useCategories();
  const addCategory = useAddCategory();

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const cancel = () => {
    setAdding(false);
    setName('');
  };

  /**
   * Escape backs out of the name field instead of closing the sheet around it.
   *
   * The sheet is a Radix dialog, and it listens for Escape at *document* capture -- which
   * runs before any handler on the input, so a plain onKeyDown cannot stop it and the whole
   * half-typed expense would go away. Listening on `window` gets there first: capture flows
   * window -> document, so this wins by event-flow position rather than by the registration
   * order two components happen to mount in.
   */
  useEffect(() => {
    if (!adding) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setAdding(false);
      setName('');
    };

    window.addEventListener('keydown', handleEscape, { capture: true });
    return () => window.removeEventListener('keydown', handleEscape, { capture: true });
  }, [adding]);

  const submit = async () => {
    const trimmed = name.trim();
    if (trimmed === '' || addCategory.isPending) return;

    // Typing the name of a category that is already on screen means "use that one", not
    // "make a second one" -- the server would reject it anyway.
    const existing = (categories.data ?? []).find(
      (category) => category.name.toLowerCase() === trimmed.toLowerCase(),
    );

    if (existing) {
      onChange(existing.id);
      cancel();
      return;
    }

    try {
      const created = await addCategory.mutateAsync(trimmed);
      onChange(created.id);
      cancel();
      toast.success(`${created.name} ditambahkan`);
    } catch (error) {
      // The text stays put so a failed save does not cost the user their typing.
      toast.error(error instanceof ApiError ? error.message : 'Gagal menambah kategori');
      inputRef.current?.focus();
    }
  };

  return (
    <Field label="Kategori" hint={hint}>
      {adding ? (
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            autoFocus
            value={name}
            maxLength={MAX_NAME_LENGTH}
            placeholder="Kategori baru"
            aria-label="Nama kategori baru"
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void submit();
              }
            }}
            onBlur={() => {
              if (name.trim() === '') cancel();
            }}
          />
          <Button
            type="button"
            className="shrink-0"
            // Pointer-down beats the input's blur, which would otherwise close the field
            // out from under the tap.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => void submit()}
            disabled={name.trim() === '' || addCategory.isPending}
          >
            {addCategory.isPending ? 'Menyimpan…' : 'Tambah'}
          </Button>
        </div>
      ) : (
        <ChipRow>
          {(categories.data ?? []).map((category) => (
            <Chip
              key={category.id}
              accent={category.color}
              selected={value === category.id}
              onClick={() => onChange(value === category.id ? null : category.id)}
            >
              {category.name}
            </Chip>
          ))}
          <Chip ghost onClick={() => setAdding(true)} aria-label="Tambah kategori baru">
            <Plus className="h-4 w-4" />
            Baru
          </Chip>
        </ChipRow>
      )}
    </Field>
  );
}
