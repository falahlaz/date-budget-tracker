import { ScanLine } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Chip, ChipWrap } from '@/components/ui/chip';
import { Field } from '@/components/ui/input';
import { SCAN_PROVIDERS, SCAN_PROVIDER_LABELS, type ScanProvider, type ScanResult } from '@/types/api';
import { useScanReceipt } from './hooks';
import { scanErrorMessage } from './receipt-scan';

/**
 * "Isi dari bukti bayar": the upload half of quick add.
 *
 * The provider is picked before the file, never guessed -- each app lays its receipt out
 * differently and the server reads each with its own parser. The image goes to the server
 * once, is read in memory, and is not kept anywhere; the file input is cleared right away
 * so the page does not hold on to it either.
 */
export function ReceiptScanPanel({ onScanned }: { onScanned: (result: ScanResult) => void }) {
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState<ScanProvider | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scan = useScanReceipt();

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <ScanLine aria-hidden className="h-4 w-4" />
        Isi dari bukti bayar
      </Button>
    );
  }

  const onFile = async (file: File | undefined) => {
    if (inputRef.current) inputRef.current.value = '';
    if (!file || !provider) return;

    try {
      onScanned(await scan.mutateAsync({ provider, file }));
      setOpen(false);
    } catch (error) {
      toast.error(scanErrorMessage(error));
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-md border border-line bg-surface-2 p-3.5">
      <Field label="Bukti dari" required>
        <ChipWrap>
          {SCAN_PROVIDERS.map((option) => (
            <Chip
              key={option}
              selected={provider === option}
              onClick={() => setProvider(option)}
              disabled={scan.isPending}
            >
              {SCAN_PROVIDER_LABELS[option]}
            </Chip>
          ))}
        </ChipWrap>
      </Field>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        aria-label="Gambar bukti bayar"
        onChange={(event) => void onFile(event.target.files?.[0])}
      />

      <div className="flex gap-2">
        {/* Secondary on purpose: Simpan stays the one accent action of the sheet. */}
        <Button
          variant="secondary"
          className="flex-1"
          disabled={provider === null || scan.isPending}
          onClick={() => inputRef.current?.click()}
        >
          {scan.isPending ? 'Membaca bukti…' : provider === null ? 'Pilih bukti dulu' : 'Pilih gambar'}
        </Button>
        <Button variant="ghost" disabled={scan.isPending} onClick={() => setOpen(false)}>
          Isi manual
        </Button>
      </div>

      <p className="text-xs text-ink-3">
        Gambarnya cuma dibaca buat ngisi form, nggak disimpan. Hasilnya dicek dulu sebelum
        disimpan.
      </p>
    </div>
  );
}
