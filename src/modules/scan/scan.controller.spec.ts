process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'mysql://datebud:datebud@localhost:3306/datebud';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'a'.repeat(64);
process.env.SCAN_MAX_UPLOAD_MB = '1';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AllExceptionsFilter } from '@/common/filters/all-exceptions.filter';
import { buildValidationPipe } from '@/common/pipes/validation.pipe';
import { ConfigModule } from '@/config/config.module';
import { OcrService } from './ocr.service';
import { ScanModule } from './scan.module';

/**
 * The HTTP layer on its own -- multipart parsing, the size limit, validation and the error
 * envelope -- with OCR stubbed out. No database is involved, because the endpoint never
 * touches one.
 */
describe('POST /api/transactions/scan', () => {
  let app: INestApplication;
  const recognize = jest.fn();

  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [ConfigModule, ScanModule] })
      .overrideProvider(OcrService)
      .useValue({ recognize })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(buildValidationPipe());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => recognize.mockReset());

  const post = () => request(app.getHttpServer()).post('/api/transactions/scan');

  it('returns the suggested fields for the chosen provider', async () => {
    recognize.mockResolvedValue('Rincian Transaksi\nGoogle One\n-Rp35.520\n11 September 2026');

    const response = await post()
      .field('provider', 'JAGO')
      .attach('file', PNG, 'a.png')
      .expect(200);

    expect(response.body).toMatchObject({
      provider: 'JAGO',
      amount: 35_520,
      occurredOn: '2026-09-11',
      merchant: 'Google One',
    });
  });

  it('rejects an unknown provider before reading the image', async () => {
    const response = await post().field('provider', 'OVO').attach('file', PNG, 'a.png').expect(422);

    expect(response.body.details).toEqual([{ field: 'provider', constraint: 'isIn' }]);
    expect(recognize).not.toHaveBeenCalled();
  });

  it('requires a file', async () => {
    await post().field('provider', 'BCA').expect(422);
  });

  it('rejects a disguised non-image with 415', async () => {
    await post()
      .field('provider', 'BCA')
      .attach('file', Buffer.from('%PDF-1.7'), { filename: 'a.jpg', contentType: 'image/jpeg' })
      .expect(415);
  });

  it('rejects a file over SCAN_MAX_UPLOAD_MB with 413', async () => {
    const response = await post()
      .field('provider', 'BCA')
      .attach('file', Buffer.alloc(1024 * 1024 + 1), 'big.png')
      .expect(413);

    expect(response.body.error).toBe('PAYLOAD_TOO_LARGE');
  });
});
