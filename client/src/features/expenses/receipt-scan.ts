import { ApiError } from '@/lib/api';
import { formatAmountInput } from '@/lib/format';
import type { PaymentMethod, ScanResult } from '@/types/api';

/** The quick-add fields a scan can fill, plus the labels of the ones it did. */
export interface ScanPrefill {
  amountText?: string;
  merchant?: string;
  spentOn?: string;
  paymentMethod?: PaymentMethod;
  note?: string;
  filled: string[];
}

/**
 * Maps a scan result onto the quick-add form.
 *
 * Only fields the scan actually read are touched, so anything it missed keeps whatever the
 * user already had. A future date is dropped rather than filled in: the server rejects
 * those, and a misread year is the likeliest way to get one.
 */
export function prefillFromScan(
  result: ScanResult,
  current: { today: string; note: string },
): ScanPrefill {
  const prefill: ScanPrefill = { filled: [] };

  if (result.amount !== null) {
    prefill.amountText = formatAmountInput(String(result.amount));
    prefill.filled.push('nominal');
  }

  if (result.merchant !== null) {
    prefill.merchant = result.merchant;
    prefill.filled.push('tempat');
  }

  if (result.occurredOn !== null && result.occurredOn <= current.today) {
    prefill.spentOn = result.occurredOn;
    prefill.filled.push('tanggal');
  }

  if (result.paymentMethod !== null) {
    prefill.paymentMethod = result.paymentMethod;
    prefill.filled.push('metode bayar');
  }

  // The reference is handy for matching against a bank statement later, but a note the
  // user already typed is theirs and is never overwritten.
  if (result.reference !== null && current.note.trim() === '') {
    prefill.note = `Ref ${result.reference}`;
    prefill.filled.push('catatan');
  }

  return prefill;
}

/** A scan failure, phrased as what the user can do about it. */
export function scanErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Gagal membaca bukti bayar. Coba lagi ya.';

  const constraint = error.details?.[0]?.constraint;

  if (error.status === 413) return 'Gambarnya kegedean. Maksimal 5 MB.';
  if (error.status === 415) return 'File-nya harus gambar JPG, PNG, atau WebP.';
  if (constraint === 'failedTransaction') return 'Bukti ini transaksi yang gagal, jadi nggak dicatat.';
  if (constraint === 'timeout') return 'Kelamaan bacanya. Coba screenshot yang lebih kecil.';
  if (constraint === 'unreadable') {
    return 'Nominalnya nggak kebaca. Cek lagi pilihan bukti-nya, atau isi manual aja.';
  }

  return error.message || 'Gagal membaca bukti bayar. Coba lagi ya.';
}
