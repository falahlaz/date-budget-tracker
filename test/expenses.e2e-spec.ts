import {
  createHarness,
  defaultWalletId,
  firstCategoryId,
  Harness,
  tomorrowWib,
  yesterdayWib,
} from './app-harness';

describe('Expenses (PRD 8.4)', () => {
  let harness: Harness;
  let categoryId: number;
  const occurredOn = yesterdayWib();

  beforeAll(async () => {
    harness = await createHarness();
    categoryId = await firstCategoryId(harness);
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.prisma.receipt.deleteMany();
    await harness.prisma.transaction.deleteMany();
  });

  const post = (body: Record<string, unknown>) =>
    harness.http().post('/api/transactions').set('Authorization', harness.auth).send(body);

  /**
   * PRD v2 4.2 / 9.2. This endpoint never names a wallet, so the row has to land in the
   * default one with the kind and direction filled in by the server. Asserted against the
   * database rather than the response, because none of it is in the v1.1 API shape --
   * which is exactly how it could rot unnoticed until M12 goes looking for it.
   */
  it('files a new expense in the default wallet as an outgoing SPEND', async () => {
    const created = await post({ occurredOn, amount: 42_000, categoryId }).expect(201);

    const row = await harness.prisma.transaction.findUniqueOrThrow({
      where: { id: created.body.id },
    });

    expect(row.walletId).toBe(await defaultWalletId(harness));
    expect(row.kind).toBe('SPEND');
    expect(row.direction).toBe('OUT');
  });

  it('creates an expense and derives dayType, weekIndex and merchantKey', async () => {
    const response = await post({
      occurredOn,
      amount: 125_000,
      categoryId,
      merchant: 'Bakmi GM',
      paymentMethod: 'QRIS',
      note: 'makan malam',
    }).expect(201);

    expect(response.body).toMatchObject({
      occurredOn,
      amount: 125_000,
      merchant: 'Bakmi GM',
      merchantKey: 'bakmigm',
      paymentMethod: 'QRIS',
    });
    expect(['WEEKDAY', 'WEEKEND']).toContain(response.body.dayType);
    expect(response.body.weekIndex).toBeGreaterThanOrEqual(1);
    expect(response.body.category.id).toBe(categoryId);
  });

  // E8
  it('rejects a future occurredOn with 422', async () => {
    const response = await post({ occurredOn: tomorrowWib(), amount: 50_000 }).expect(422);

    expect(response.body).toMatchObject({ statusCode: 422, error: 'VALIDATION_ERROR' });
    expect(response.body.details).toContainEqual({
      field: 'occurredOn',
      constraint: 'notInFuture',
    });
  });

  // PRD 6.8
  it('rejects an amount below 1', async () => {
    await post({ occurredOn, amount: 0 }).expect(422);
    await post({ occurredOn, amount: -5_000 }).expect(422);
  });

  // E14
  it('rejects a merchant longer than 120 characters', async () => {
    const response = await post({ occurredOn, amount: 10_000, merchant: 'x'.repeat(121) }).expect(
      422,
    );
    expect(response.body.details).toContainEqual({ field: 'merchant', constraint: 'maxLength' });

    await post({ occurredOn, amount: 10_000, merchant: 'y'.repeat(120) }).expect(201);
  });

  // E15
  it('ignores a client-supplied merchantKey and derives its own', async () => {
    const response = await post({
      occurredOn,
      amount: 10_000,
      merchant: 'Bakmi GM',
      merchantKey: 'attacker-controlled',
    }).expect(201);

    expect(response.body.merchantKey).toBe('bakmigm');
  });

  // PRD 6.15
  it('stores NULL, never an empty string, for a merchant that normalises to nothing', async () => {
    for (const merchant of ['   ', '!!!', '🍜']) {
      const response = await post({ occurredOn, amount: 10_000, merchant }).expect(201);
      expect(response.body.merchant).toBeNull();
      expect(response.body.merchantKey).toBeNull();
    }
  });

  it('accepts an expense with no category (uncategorised is a valid state)', async () => {
    const response = await post({ occurredOn, amount: 10_000 }).expect(201);
    expect(response.body.category).toBeNull();
  });

  it('re-derives merchantKey when the merchant is edited', async () => {
    const created = await post({ occurredOn, amount: 10_000, merchant: 'Bakmi GM' }).expect(201);

    const updated = await harness
      .http()
      .patch(`/api/transactions/${created.body.id}`)
      .set('Authorization', harness.auth)
      .send({ merchant: 'Café Batavia' })
      .expect(200);

    expect(updated.body.merchantKey).toBe('cafebatavia');
  });

  // PRD 6.17
  it('renaming one expense leaves other expenses at the same place untouched', async () => {
    const first = await post({ occurredOn, amount: 10_000, merchant: 'Bakmi GM' }).expect(201);
    const second = await post({ occurredOn, amount: 20_000, merchant: 'Bakmi GM' }).expect(201);

    await harness
      .http()
      .patch(`/api/transactions/${first.body.id}`)
      .set('Authorization', harness.auth)
      .send({ merchant: 'Bakmi GM Senayan' })
      .expect(200);

    const untouched = await harness
      .http()
      .get(`/api/transactions/${second.body.id}`)
      .set('Authorization', harness.auth)
      .expect(200);

    expect(untouched.body.merchant).toBe('Bakmi GM');
  });

  // E10
  it('soft-deletes an expense so it leaves both the list and the totals', async () => {
    const created = await post({ occurredOn, amount: 75_000 }).expect(201);

    await harness
      .http()
      .delete(`/api/transactions/${created.body.id}`)
      .set('Authorization', harness.auth)
      .expect(204);

    const list = await harness
      .http()
      .get(`/api/transactions?period=${occurredOn.slice(0, 7)}`)
      .set('Authorization', harness.auth)
      .expect(200);

    expect(list.body.items.map((item: { id: number }) => item.id)).not.toContain(created.body.id);
    expect(list.body.sumAmount).toBe(0);

    // The row survives for audit, but with a deletion timestamp.
    const row = await harness.prisma.transaction.findUnique({ where: { id: created.body.id } });
    expect(row?.deletedAt).not.toBeNull();

    await harness
      .http()
      .get(`/api/transactions/${created.body.id}`)
      .set('Authorization', harness.auth)
      .expect(404);
  });

  it('filters by category, merchantKey and free text, and reports the filtered sum', async () => {
    await post({
      occurredOn,
      amount: 10_000,
      categoryId,
      merchant: 'Bakmi GM',
      note: 'siang',
    }).expect(201);
    await post({ occurredOn, amount: 20_000, merchant: 'Loewy', note: 'dinner' }).expect(201);

    const byMerchant = await harness
      .http()
      .get('/api/transactions?merchantKey=bakmigm')
      .set('Authorization', harness.auth)
      .expect(200);
    expect(byMerchant.body.total).toBe(1);
    expect(byMerchant.body.sumAmount).toBe(10_000);

    const byCategory = await harness
      .http()
      .get(`/api/transactions?categoryId=${categoryId}`)
      .set('Authorization', harness.auth)
      .expect(200);
    expect(byCategory.body.total).toBe(1);

    const bySearch = await harness
      .http()
      .get('/api/transactions?q=dinner')
      .set('Authorization', harness.auth)
      .expect(200);
    expect(bySearch.body.total).toBe(1);
    expect(bySearch.body.items[0].merchant).toBe('Loewy');
  });

  it('caps limit at 200', async () => {
    await harness
      .http()
      .get('/api/transactions?limit=500')
      .set('Authorization', harness.auth)
      .expect(422);
  });
});

describe('Merchant suggestions (PRD 8.4)', () => {
  let harness: Harness;
  let categoryId: number;

  beforeAll(async () => {
    harness = await createHarness();
    categoryId = await firstCategoryId(harness);
  });

  afterAll(async () => {
    await harness.close();
  });

  // E13
  it('returns the most recent spelling with the last category and payment method', async () => {
    const older = yesterdayWib();
    const [year, month, day] = older.split('-').map(Number);
    const evenOlder = new Date(Date.UTC(year, month - 1, day - 3)).toISOString().slice(0, 10);

    await harness
      .http()
      .post('/api/transactions')
      .set('Authorization', harness.auth)
      .send({ occurredOn: evenOlder, amount: 50_000, merchant: 'bakmi gm', paymentMethod: 'CASH' })
      .expect(201);

    await harness
      .http()
      .post('/api/transactions')
      .set('Authorization', harness.auth)
      .send({
        occurredOn: older,
        amount: 60_000,
        merchant: 'Bakmi GM',
        categoryId,
        paymentMethod: 'QRIS',
      })
      .expect(201);

    const response = await harness
      .http()
      .get('/api/transactions/merchants?q=bak')
      .set('Authorization', harness.auth)
      .expect(200);

    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0]).toMatchObject({
      merchantKey: 'bakmigm',
      displayName: 'Bakmi GM',
      lastCategoryId: categoryId,
      lastPaymentMethod: 'QRIS',
      usageCount: 2,
      lastOccurredOn: older,
    });
  });

  it('normalises the query, so punctuation in the search still matches', async () => {
    const response = await harness
      .http()
      .get('/api/transactions/merchants?q=B.A.K.')
      .set('Authorization', harness.auth)
      .expect(200);

    expect(response.body.items[0]?.merchantKey).toBe('bakmigm');
  });
});
