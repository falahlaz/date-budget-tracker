import { createHarness, defaultWalletId, Harness } from './app-harness';

const FIXED_TODAY = '2026-12-01';

/** Wallets (PRD v2 4, 8.14, 9.2, 10.2). */
describe('Wallets (PRD v2 4, 10.2)', () => {
  let harness: Harness;
  let walletId: number;

  beforeAll(async () => {
    harness = await createHarness({ today: FIXED_TODAY });
    walletId = await defaultWalletId(harness);
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.prisma.transaction.deleteMany();
    await harness.prisma.monthlyBudget.deleteMany();
    // Restore the original default BEFORE deleting the rest. One test below moves the
    // default flag onto another wallet, and deleting "whatever is not the default" after
    // that would take out the wallet the whole suite is holding an id for.
    await harness.prisma.wallet.update({
      where: { id: walletId },
      data: { isDefault: true, isArchived: false },
    });
    await harness.prisma.wallet.deleteMany({ where: { id: { not: walletId } } });
    // The savings categories outlive the wallet that seeded them, so they are cleared too
    // -- otherwise the seeding test could not tell "seeded now" from "left over".
    await harness.prisma.category.deleteMany({ where: { walletType: 'SAVINGS' } });
  });

  const authed = (method: 'get' | 'post' | 'patch' | 'delete', path: string) =>
    harness.http()[method](path).set('Authorization', harness.auth);

  const createSavingsWallet = (name = 'Tabungan') =>
    authed('post', '/api/wallets').send({ name, type: 'SAVINGS', color: '#3E8C74' });

  it('starts every account with one default date-budget wallet (4.2)', async () => {
    const response = await authed('get', '/api/wallets').expect(200);

    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({
      name: 'Kencan',
      type: 'DATE_BUDGET',
      isDefault: true,
      isArchived: false,
    });
  });

  it('gives a date-budget wallet the summary its type calls for (10.2)', async () => {
    const response = await authed('get', '/api/wallets').expect(200);

    expect(response.body[0].summary).toMatchObject({
      period: expect.any(String),
      dayRemaining: expect.any(Number),
      weekendBudgetProjected: expect.any(Number),
      monthRemaining: expect.any(Number),
    });
  });

  /**
   * A savings wallet exists before its goal does, and the switcher still has to draw a row
   * for it. Every goal-derived figure is null rather than zero -- zero would read as "no
   * progress" when the truth is "no target yet".
   */
  it('summarises a savings wallet that has no goal yet', async () => {
    await createSavingsWallet().expect(201);

    const response = await authed('get', '/api/wallets').expect(200);
    const savings = response.body.find((wallet: { type: string }) => wallet.type === 'SAVINGS');

    expect(savings.summary).toEqual({
      balance: 0,
      goalName: null,
      progress: null,
      paceDelta: null,
      outstandingAdvance: 0,
    });
  });

  it('seeds the withdrawal categories with the first savings wallet (9.4)', async () => {
    expect(await authed('get', '/api/categories?walletType=SAVINGS').expect(200)).toMatchObject({
      body: [],
    });

    await createSavingsWallet().expect(201);

    const savingsCategories = await authed('get', '/api/categories?walletType=SAVINGS').expect(200);
    expect(savingsCategories.body.map((c: { name: string }) => c.name)).toEqual([
      'Darurat', 'Kesehatan', 'Keluarga', 'Servis & perbaikan', 'Elektronik', 'Impulsif', 'Lain-lain',
    ]);

    // The spending list is untouched: the two vocabularies are separate (9.4).
    const spendCategories = await authed('get', '/api/categories').expect(200);
    expect(spendCategories.body).toHaveLength(7);
    expect(spendCategories.body.map((c: { name: string }) => c.name)).toContain('Makan');
  });

  it('lets the same name exist in both category vocabularies', async () => {
    await createSavingsWallet().expect(201);

    const both = await Promise.all([
      authed('get', '/api/categories').expect(200),
      authed('get', '/api/categories?walletType=SAVINGS').expect(200),
    ]);

    const names = both.map((r) => r.body.map((c: { name: string }) => c.name));
    expect(names[0]).toContain('Lain-lain');
    expect(names[1]).toContain('Lain-lain');
  });

  it('seeds the savings categories only once (9.4)', async () => {
    await createSavingsWallet('Tabungan').expect(201);
    await createSavingsWallet('Dana darurat').expect(201);

    const savingsCategories = await authed('get', '/api/categories?walletType=SAVINGS').expect(200);
    expect(savingsCategories.body).toHaveLength(7);
  });

  it('refuses two wallets with the same name', async () => {
    await createSavingsWallet('Tabungan').expect(201);
    await createSavingsWallet('Tabungan').expect(409);
  });

  it('moves the default flag atomically, leaving exactly one (4.2)', async () => {
    const created = await createSavingsWallet().expect(201);

    await authed('patch', `/api/wallets/${created.body.id}`).send({ isDefault: true }).expect(200);

    const wallets = await authed('get', '/api/wallets').expect(200);
    const defaults = wallets.body.filter((wallet: { isDefault: boolean }) => wallet.isDefault);

    expect(defaults).toHaveLength(1);
    expect(defaults[0].id).toBe(created.body.id);
  });

  // E28
  it('refuses to archive the default wallet (8.14)', async () => {
    await authed('delete', `/api/wallets/${walletId}`).expect(409);
    await authed('patch', `/api/wallets/${walletId}`).send({ isArchived: true }).expect(409);
  });

  it('archives a non-default wallet and drops it from the switcher (8.14)', async () => {
    const created = await createSavingsWallet().expect(201);

    await authed('delete', `/api/wallets/${created.body.id}`).expect(204);

    const visible = await authed('get', '/api/wallets').expect(200);
    expect(visible.body.map((w: { id: number }) => w.id)).not.toContain(created.body.id);

    const all = await authed('get', '/api/wallets?includeArchived=true').expect(200);
    expect(all.body.map((w: { id: number }) => w.id)).toContain(created.body.id);
  });

  it('404s on a wallet id that is not yours', async () => {
    await authed('patch', '/api/wallets/999999').send({ name: 'nope' }).expect(404);
    await authed('delete', '/api/wallets/999999').expect(404);
  });
});

describe('Transaction scoping (PRD v2 4.1, 9.2)', () => {
  let harness: Harness;
  let walletId: number;
  let savingsWalletId: number;
  let categoryId: number;

  beforeAll(async () => {
    harness = await createHarness({ today: FIXED_TODAY });
    walletId = await defaultWalletId(harness);

    const savings = await harness
      .http()
      .post('/api/wallets')
      .set('Authorization', harness.auth)
      .send({ name: 'Tabungan', type: 'SAVINGS' })
      .expect(201);
    savingsWalletId = savings.body.id;

    const categories = await harness
      .http()
      .get('/api/categories')
      .set('Authorization', harness.auth)
      .expect(200);
    categoryId = categories.body[0].id;
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.prisma.transaction.deleteMany();
  });

  const post = (body: Record<string, unknown>) =>
    harness.http().post('/api/transactions').set('Authorization', harness.auth).send(body);

  // E30
  it('files a transaction with no walletId in the default wallet (4.2)', async () => {
    const created = await post({ occurredOn: '2026-09-14', amount: 25_000, categoryId }).expect(201);

    expect(created.body.walletId).toBe(walletId);
    expect(created.body.kind).toBe('SPEND');
    expect(created.body.direction).toBe('OUT');
  });

  // E27
  it('refuses a DEPOSIT into a date-budget wallet (9.2)', async () => {
    const response = await post({
      walletId,
      kind: 'DEPOSIT',
      occurredOn: '2026-09-14',
      amount: 25_000,
    }).expect(422);

    expect(response.body.message).toMatch(/DATE_BUDGET wallet cannot hold a DEPOSIT/);
  });

  it('refuses a SPEND in a savings wallet (9.2)', async () => {
    await post({
      walletId: savingsWalletId,
      kind: 'SPEND',
      occurredOn: '2026-09-14',
      amount: 25_000,
    }).expect(422);
  });

  it('defaults a savings wallet transaction to a DEPOSIT, flowing in', async () => {
    const created = await post({
      walletId: savingsWalletId,
      occurredOn: '2026-09-14',
      amount: 500_000,
    }).expect(201);

    expect(created.body).toMatchObject({
      walletId: savingsWalletId,
      kind: 'DEPOSIT',
      direction: 'IN',
    });
  });

  /**
   * The sign of money is not something a caller gets a say in (9.2). A client that sends
   * the wrong direction gets the right one anyway rather than a validation error, because
   * `direction` is not an input at all -- it is derived.
   */
  it('ignores a client-supplied direction', async () => {
    const created = await post({
      walletId: savingsWalletId,
      kind: 'WITHDRAW',
      direction: 'IN',
      occurredOn: '2026-09-14',
      amount: 100_000,
    }).expect(201);

    expect(created.body.direction).toBe('OUT');
  });

  it('keeps each wallet\'s list to its own rows (4.1)', async () => {
    await post({ walletId, occurredOn: '2026-09-14', amount: 11_000, categoryId }).expect(201);
    await post({ walletId: savingsWalletId, occurredOn: '2026-09-14', amount: 22_000 }).expect(201);

    const dateWallet = await harness
      .http()
      .get(`/api/transactions?walletId=${walletId}`)
      .set('Authorization', harness.auth)
      .expect(200);

    expect(dateWallet.body.items).toHaveLength(1);
    expect(dateWallet.body.items[0].amount).toBe(11_000);

    const savings = await harness
      .http()
      .get(`/api/transactions?walletId=${savingsWalletId}`)
      .set('Authorization', harness.auth)
      .expect(200);

    expect(savings.body.items).toHaveLength(1);
    expect(savings.body.items[0].amount).toBe(22_000);
  });

  it('filters by kind', async () => {
    await post({ walletId: savingsWalletId, kind: 'DEPOSIT', occurredOn: '2026-09-14', amount: 50_000 }).expect(201);
    await post({ walletId: savingsWalletId, kind: 'WITHDRAW', occurredOn: '2026-09-14', amount: 20_000 }).expect(201);

    const withdrawals = await harness
      .http()
      .get(`/api/transactions?walletId=${savingsWalletId}&kind=WITHDRAW`)
      .set('Authorization', harness.auth)
      .expect(200);

    expect(withdrawals.body.items).toHaveLength(1);
    expect(withdrawals.body.items[0].amount).toBe(20_000);
  });

  it('refuses a budget on a savings wallet (10.1)', async () => {
    await harness
      .http()
      .put(`/api/wallets/${savingsWalletId}/budgets/2026-09`)
      .set('Authorization', harness.auth)
      .send({ amount: 2_000_000 })
      .expect(422);
  });

  it('refuses a date-budget report on a savings wallet (10.1)', async () => {
    await harness
      .http()
      .get(`/api/wallets/${savingsWalletId}/reports/month/2026-09`)
      .set('Authorization', harness.auth)
      .expect(422);
  });
});
