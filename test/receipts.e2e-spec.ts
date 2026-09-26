import { randomUUID } from 'node:crypto';
import { createHarness, Harness, yesterdayWib } from './app-harness';
import { UsersService } from '@/modules/users/users.service';
import { STORAGE_SERVICE, StorageService } from '@/modules/receipts/storage/storage.service';

// Any bytes will do: the server no longer decodes images, it only streams what is stored.
const WEBP_BYTES = Buffer.concat([Buffer.from('RIFF\0\0\0\0WEBPVP8 '), Buffer.alloc(32)]);

describe('Receipts (PRD 8.5)', () => {
  let harness: Harness;
  let expenseId: number;

  beforeAll(async () => {
    harness = await createHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.prisma.receipt.deleteMany();
    await harness.prisma.transaction.deleteMany();

    const created = await harness
      .http()
      .post('/api/transactions')
      .set('Authorization', harness.auth)
      .send({ occurredOn: yesterdayWib(), amount: 50_000 })
      .expect(201);

    expenseId = created.body.id;
  });

  /**
   * Uploading was removed, so receipts that predate that change are seeded straight into
   * the database and storage, the same shape the old upload endpoint wrote.
   */
  const seedReceipt = async (): Promise<number> => {
    const storage = harness.app.get<StorageService>(STORAGE_SERVICE);
    const id = randomUUID();
    const storageKey = `receipts/2026/09/${id}.webp`;
    const thumbKey = `receipts/2026/09/${id}_thumb.webp`;

    await storage.save(storageKey, WEBP_BYTES, 'image/webp');
    await storage.save(thumbKey, WEBP_BYTES, 'image/webp');

    const receipt = await harness.prisma.receipt.create({
      data: {
        transactionId: expenseId,
        userId: harness.userId,
        storageKey,
        thumbKey,
        mimeType: 'image/webp',
        sizeBytes: WEBP_BYTES.byteLength,
      },
    });

    return receipt.id;
  };

  it('no longer accepts uploads', async () => {
    await harness
      .http()
      .post(`/api/transactions/${expenseId}/receipts`)
      .set('Authorization', harness.auth)
      .attach('files', WEBP_BYTES, 'struk.webp')
      .expect(404);

    expect(await harness.prisma.receipt.count()).toBe(0);
  });

  it('still streams an existing receipt and its thumbnail', async () => {
    const receiptId = await seedReceipt();

    const expense = await harness
      .http()
      .get(`/api/transactions/${expenseId}`)
      .set('Authorization', harness.auth)
      .expect(200);
    expect(expense.body.receipts).toHaveLength(1);
    expect(expense.body.receipts[0].url).toBe(`/api/receipts/${receiptId}/file`);

    for (const suffix of ['', '?variant=thumb']) {
      const file = await harness
        .http()
        .get(`/api/receipts/${receiptId}/file${suffix}`)
        .set('Authorization', harness.auth)
        .expect(200);
      expect(file.headers['content-type']).toContain('image/webp');
    }
  });

  it('deletes a receipt and removes its files', async () => {
    const receiptId = await seedReceipt();

    await harness
      .http()
      .delete(`/api/receipts/${receiptId}`)
      .set('Authorization', harness.auth)
      .expect(204);

    const row = await harness.prisma.receipt.findUniqueOrThrow({ where: { id: receiptId } });
    const storage = harness.app.get<StorageService>(STORAGE_SERVICE);
    expect(await storage.exists(row.storageKey)).toBe(false);
    expect(await storage.exists(row.thumbKey!)).toBe(false);

    await harness
      .http()
      .get(`/api/receipts/${receiptId}/file`)
      .set('Authorization', harness.auth)
      .expect(404);
  });

  // E7
  it("never streams another user's receipt", async () => {
    const receiptId = await seedReceipt();

    const users = harness.app.get(UsersService);
    await users.createUser({
      email: 'intruder@budget-tracker.test',
      password: 'intruder-password-123',
      displayName: 'Intruder',
    });

    const intruderLogin = await harness
      .http()
      .post('/api/auth/login')
      .send({ email: 'intruder@budget-tracker.test', password: 'intruder-password-123' })
      .expect(200);

    // 404 rather than 403: another user's receipt must not even be confirmed to exist.
    await harness
      .http()
      .get(`/api/receipts/${receiptId}/file`)
      .set('Authorization', `Bearer ${intruderLogin.body.accessToken}`)
      .expect(404);

    await harness
      .http()
      .delete(`/api/receipts/${receiptId}`)
      .set('Authorization', `Bearer ${intruderLogin.body.accessToken}`)
      .expect(404);
  });

  it('requires authentication to stream a file (never static middleware)', async () => {
    const receiptId = await seedReceipt();

    await harness.http().get(`/api/receipts/${receiptId}/file`).expect(401);
  });
});
