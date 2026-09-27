import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AppException } from '@/common/errors';
import { OcrService, OcrTimeoutError } from './ocr.service';
import { isFailedTransaction, ScanService } from './scan.service';

const FIXTURES = join(__dirname, '..', '..', '..', 'test', 'fixtures', 'scan');
const fixture = (name: string) => readFileSync(join(FIXTURES, name));

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

function withOcr(...texts: (string | Error)[]) {
  const recognize = jest.fn();
  for (const text of texts) {
    if (text instanceof Error) recognize.mockRejectedValueOnce(text);
    else recognize.mockResolvedValueOnce(text);
  }
  return { service: new ScanService({ recognize } as unknown as OcrService), recognize };
}

async function statusOf(promise: Promise<unknown>): Promise<number> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AppException) return error.getStatus();
    throw error;
  }
  throw new Error('expected a rejection');
}

describe('ScanService', () => {
  it('returns suggested fields and stops after one pass when nothing is missing', async () => {
    const { service, recognize } = withOcr(
      'm-Transfer:\nBERHASIL\n15/09/2026 17:56:04\nKe 123\nBUDI\nRp 25.000,00\nRef 198035216',
    );

    await expect(service.scan('BCA', PNG)).resolves.toMatchObject({
      provider: 'BCA',
      amount: 25_000,
      occurredOn: '2026-09-15',
      merchant: 'BUDI',
      paymentMethod: 'TRANSFER',
      reference: '198035216',
    });
    expect(recognize).toHaveBeenCalledTimes(1);
  });

  it('fills gaps from a second pass without overriding what the first pass read', async () => {
    const { service, recognize } = withOcr(
      'Tanggal 26 Sep 2026\nMerchant Name Warung A',
      'Rp99.000\nWarung B\nTanggal 1 Okt 2026',
    );

    await expect(service.scan('GOPAY', PNG)).resolves.toMatchObject({
      amount: 99_000,
      occurredOn: '2026-09-26',
      merchant: 'Warung A',
    });
    expect(recognize).toHaveBeenNthCalledWith(2, PNG, 'threshold');
  });

  it('rejects a missing file, a non-image and an unreadable amount with clear statuses', async () => {
    expect(await statusOf(withOcr().service.scan('BCA', undefined))).toBe(422);
    expect(await statusOf(withOcr().service.scan('BCA', Buffer.from('%PDF-1.7')))).toBe(415);
    expect(await statusOf(withOcr('nothing', 'still nothing').service.scan('BCA', PNG))).toBe(422);
  });

  it('refuses a receipt for a failed transfer', async () => {
    const { service } = withOcr('m-Transfer:\nGAGAL\n15/09/2026\nKe 1\nBUDI\nRp 25.000,00');
    expect(await statusOf(service.scan('BCA', PNG))).toBe(422);
  });

  it('turns an OCR timeout into a 422 the user can act on', async () => {
    const { service } = withOcr(new OcrTimeoutError());
    expect(await statusOf(service.scan('JAGO', PNG))).toBe(422);
  });
});

describe('isFailedTransaction', () => {
  it('only flags receipts that say GAGAL without a success word', () => {
    expect(isFailedTransaction('Transaksi Gagal')).toBe(true);
    expect(isFailedTransaction('BERHASIL\nGagal? hubungi kami')).toBe(false);
    expect(isFailedTransaction('Selesai')).toBe(false);
  });
});

/**
 * End to end through real sharp and Tesseract on the sample screenshots, so a dependency
 * upgrade that changes what OCR produces is caught here rather than by a user.
 */
describe('ScanService with real OCR', () => {
  const ocr = new OcrService();
  const service = new ScanService(ocr);

  afterAll(async () => {
    await ocr.onModuleDestroy();
  });

  it('reads the GoPay sample (dark mode)', async () => {
    await expect(service.scan('GOPAY', fixture('gopay.jpg'))).resolves.toMatchObject({
      amount: 123_000,
      occurredOn: '2026-09-26',
      merchant: 'Semangkuk Asap Duren Sawi',
      paymentMethod: 'QRIS',
    });
  }, 60_000);

  it('reads the BCA sample', async () => {
    await expect(service.scan('BCA', fixture('bca.jpg'))).resolves.toMatchObject({
      amount: 25_000,
      occurredOn: '2026-09-15',
      merchant: 'EVIRA FEBRIANI',
      paymentMethod: 'TRANSFER',
      reference: '198035216',
    });
  }, 60_000);

  it('reads the Jago sample', async () => {
    await expect(service.scan('JAGO', fixture('jago.jpg'))).resolves.toMatchObject({
      amount: 35_520,
      occurredOn: '2026-09-11',
      merchant: 'Google One',
      reference: '625403677390',
    });
  }, 60_000);
});
