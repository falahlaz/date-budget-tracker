import sharp from 'sharp';
import { createHarness, Harness, yesterdayWib } from './app-harness';
import { UsersService } from '@/modules/users/users.service';

async function pngFixture(size = 64): Promise<Buffer> {
  return sharp({
    create: { width: size, height: size, channels: 3, background: { r: 220, g: 40, b: 40 } },
  })
    .png()
    .toBuffer();
}

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

  const upload = () =>
    harness
      .http()
      .post(`/api/transactions/${expenseId}/receipts`)
      .set('Authorization', harness.auth);

  // E3
  it('stores a PNG upload as WebP with a thumbnail', async () => {
    const response = await upload()
      .attach('files', await pngFixture(), 'struk.png')
      .expect(201);

    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0]).toMatchObject({ mimeType: 'image/webp' });
    expect(response.body.items[0].url).toBe(`/api/receipts/${response.body.items[0].id}/file`);
    expect(response.body.items[0].thumbUrl).toContain('variant=thumb');

    const row = await harness.prisma.receipt.findUnique({
      where: { id: response.body.items[0].id },
    });
    expect(row?.storageKey).toMatch(/^receipts\/\d{4}\/\d{2}\/[0-9a-f-]+\.webp$/);
    expect(row?.thumbKey).toContain('_thumb.webp');
    // The original filename is never used as a path component.
    expect(row?.storageKey).not.toContain('struk');

    const file = await harness
      .http()
      .get(`/api/receipts/${response.body.items[0].id}/file`)
      .set('Authorization', harness.auth)
      .expect(200);
    expect(file.headers['content-type']).toContain('image/webp');
  });

  // E4
  it('rejects a PDF with 415 even when it claims to be an image', async () => {
    const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(64)]);

    const response = await upload()
      .attach('files', pdf, { filename: 'struk.pdf', contentType: 'image/jpeg' })
      .expect(415);

    expect(response.body).toMatchObject({ statusCode: 415, error: 'UNSUPPORTED_MEDIA_TYPE' });
  });

  // E5
  it('rejects a file over the size limit with 413', async () => {
    const oversized = Buffer.alloc(12 * 1024 * 1024, 1);
    // Give it a real PNG header so the rejection can only come from the size limit.
    (await pngFixture()).copy(oversized, 0, 0, 8);

    const response = await upload().attach('files', oversized, 'huge.png').expect(413);
    expect(response.body).toMatchObject({ statusCode: 413, error: 'PAYLOAD_TOO_LARGE' });
  });

  // E6
  it('rejects the sixth receipt on one expense with 409', async () => {
    const png = await pngFixture();

    for (let index = 0; index < 5; index += 1) {
      await upload().attach('files', png, `struk-${index}.png`).expect(201);
    }

    const response = await upload().attach('files', png, 'struk-6.png').expect(409);
    expect(response.body).toMatchObject({ statusCode: 409, error: 'CONFLICT' });
  });

  it('deletes a receipt and removes its files', async () => {
    const created = await upload()
      .attach('files', await pngFixture(), 'struk.png')
      .expect(201);
    const receiptId = created.body.items[0].id;

    await harness
      .http()
      .delete(`/api/receipts/${receiptId}`)
      .set('Authorization', harness.auth)
      .expect(204);

    await harness
      .http()
      .get(`/api/receipts/${receiptId}/file`)
      .set('Authorization', harness.auth)
      .expect(404);
  });

  // E7
  it("never streams another user's receipt", async () => {
    const created = await upload()
      .attach('files', await pngFixture(), 'struk.png')
      .expect(201);
    const receiptId = created.body.items[0].id;

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
    const created = await upload()
      .attach('files', await pngFixture(), 'struk.png')
      .expect(201);

    await harness.http().get(`/api/receipts/${created.body.items[0].id}/file`).expect(401);
  });
});
