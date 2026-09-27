import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api';
import type { ScanResult } from '@/types/api';
import { prefillFromScan, scanErrorMessage } from './receipt-scan';

const result = (overrides: Partial<ScanResult> = {}): ScanResult => ({
  provider: 'BCA',
  amount: 25_000,
  occurredOn: '2026-09-15',
  merchant: 'EVIRA FEBRIANI',
  paymentMethod: 'TRANSFER',
  reference: '198035216',
  rawText: '',
  ...overrides,
});

describe('prefillFromScan', () => {
  it('fills every field the scan read', () => {
    expect(prefillFromScan(result(), { today: '2026-09-27', note: '' })).toEqual({
      amountText: '25.000',
      merchant: 'EVIRA FEBRIANI',
      spentOn: '2026-09-15',
      paymentMethod: 'TRANSFER',
      note: 'Ref 198035216',
      filled: ['nominal', 'tempat', 'tanggal', 'metode bayar', 'catatan'],
    });
  });

  it('leaves fields the scan missed untouched', () => {
    const prefill = prefillFromScan(
      result({ merchant: null, paymentMethod: null, reference: null, occurredOn: null }),
      { today: '2026-09-27', note: '' },
    );

    expect(prefill).toEqual({ amountText: '25.000', filled: ['nominal'] });
  });

  it('drops a date in the future, which is most likely a misread', () => {
    const prefill = prefillFromScan(result({ occurredOn: '2027-09-15' }), {
      today: '2026-09-27',
      note: '',
    });

    expect(prefill.spentOn).toBeUndefined();
    expect(prefill.filled).not.toContain('tanggal');
  });

  it("never overwrites a note the user already typed", () => {
    const prefill = prefillFromScan(result(), { today: '2026-09-27', note: 'patungan' });
    expect(prefill.note).toBeUndefined();
  });
});

describe('scanErrorMessage', () => {
  it('explains each failure in terms the user can act on', () => {
    expect(scanErrorMessage(new ApiError(413, 'PAYLOAD_TOO_LARGE', 'x'))).toMatch(/5 MB/);
    expect(scanErrorMessage(new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'x'))).toMatch(/JPG/);
    expect(
      scanErrorMessage(
        new ApiError(422, 'VALIDATION_ERROR', 'x', [{ field: 'file', constraint: 'unreadable' }]),
      ),
    ).toMatch(/isi manual/);
    expect(
      scanErrorMessage(
        new ApiError(422, 'VALIDATION_ERROR', 'x', [
          { field: 'file', constraint: 'failedTransaction' },
        ]),
      ),
    ).toMatch(/gagal/);
    expect(scanErrorMessage(new Error('network'))).toMatch(/Gagal membaca/);
  });
});
