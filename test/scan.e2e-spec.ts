import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { createHarness, Harness } from './app-harness';

const FIXTURES = join(__dirname, 'fixtures', 'scan');

/** Every file under a directory, or none when it does not exist yet. */
async function listFiles(root: string): Promise<string[]> {
  try {
    const entries = await readdir(root, { recursive: true, withFileTypes: true });
    return entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
  } catch {
    return [];
  }
}

describe('Receipt scan (POST /api/transactions/scan)', () => {
  let harness: Harness;
  let storageRoot: string;

  beforeAll(async () => {
    harness = await createHarness();
    storageRoot = resolve(harness.app.get(ConfigService).get<string>('STORAGE_ROOT')!);
  });

  afterAll(async () => {
    await harness.close();
  });

  it('requires a token', async () => {
    await harness.http().post('/api/transactions/scan').field('provider', 'BCA').expect(401);
  });

  it('requires a known provider and a file', async () => {
    const bca = await readFile(join(FIXTURES, 'bca.jpg'));

    await harness
      .http()
      .post('/api/transactions/scan')
      .set('Authorization', harness.auth)
      .field('provider', 'OVO')
      .attach('file', bca, 'bca.jpg')
      .expect(422);

    await harness
      .http()
      .post('/api/transactions/scan')
      .set('Authorization', harness.auth)
      .field('provider', 'BCA')
      .expect(422);
  });

  it('rejects a file that is not an image, whatever it is named', async () => {
    await harness
      .http()
      .post('/api/transactions/scan')
      .set('Authorization', harness.auth)
      .field('provider', 'BCA')
      .attach('file', Buffer.from('%PDF-1.7 not an image'), {
        filename: 'struk.jpg',
        contentType: 'image/jpeg',
      })
      .expect(415);
  });

  it('rejects an oversized upload before reading it', async () => {
    const tooBig = Buffer.alloc(6 * 1024 * 1024, 0xff);

    await harness
      .http()
      .post('/api/transactions/scan')
      .set('Authorization', harness.auth)
      .field('provider', 'BCA')
      .attach('file', tooBig, 'big.jpg')
      .expect(413);
  });

  it('reads a receipt without storing the image or recording anything', async () => {
    const filesBefore = await listFiles(storageRoot);

    const response = await harness
      .http()
      .post('/api/transactions/scan')
      .set('Authorization', harness.auth)
      .field('provider', 'BCA')
      .attach('file', await readFile(join(FIXTURES, 'bca.jpg')), 'bca.jpg')
      .expect(200);

    expect(response.body).toMatchObject({
      provider: 'BCA',
      amount: 25_000,
      occurredOn: '2026-09-15',
      merchant: 'EVIRA FEBRIANI',
      paymentMethod: 'TRANSFER',
      reference: '198035216',
    });

    // The whole point of the design: the scan is a suggestion, not a record.
    expect(await listFiles(storageRoot)).toEqual(filesBefore);
    expect(await harness.prisma.receipt.count()).toBe(0);
    expect(await harness.prisma.transaction.count()).toBe(0);
  }, 60_000);
});
