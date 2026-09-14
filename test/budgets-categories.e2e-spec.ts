import {
  createHarness,
  defaultWalletId,
  firstCategoryId,
  Harness,
  yesterdayWib,
} from './app-harness';

// Pinned so the 2026-09/2026-10 periods below stay in the past (PRD 6.9).
const FIXED_TODAY = '2026-12-01';

describe('Budgets and categories (PRD 8.3, 8.7)', () => {
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
  });

  const authed = (method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string) =>
    harness.http()[method](path).set('Authorization', harness.auth);

  it('seeds the seven default categories for a new user (PRD 7.4)', async () => {
    const response = await authed('get', '/api/categories').expect(200);

    expect(response.body).toHaveLength(7);
    expect(response.body.map((category: { name: string }) => category.name)).toEqual([
      'Makan', 'Nonton', 'Transport', 'Ngopi', 'Aktivitas', 'Gift', 'Lain-lain',
    ]);
    expect(response.body[0]).toMatchObject({ color: '#9D6DE4', icon: 'utensils' });
  });

  // PRD 6.12
  it('archives a category instead of deleting it, keeping old expenses intact', async () => {
    const categoryId = await firstCategoryId(harness);

    const expense = await authed('post', '/api/transactions')
      .send({ occurredOn: yesterdayWib(), amount: 10_000, categoryId })
      .expect(201);

    await authed('delete', `/api/categories/${categoryId}`).expect(204);

    const visible = await authed('get', '/api/categories').expect(200);
    expect(visible.body.map((c: { id: number }) => c.id)).not.toContain(categoryId);

    const all = await authed('get', '/api/categories?includeArchived=true').expect(200);
    expect(all.body.find((c: { id: number }) => c.id === categoryId)?.isArchived).toBe(true);

    // The expense still points at it, so history stays readable.
    const stillThere = await authed('get', `/api/transactions/${expense.body.id}`).expect(200);
    expect(stillThere.body.category.id).toBe(categoryId);
  });

  it('rejects a duplicate category name with 409', async () => {
    const response = await authed('post', '/api/categories').send({ name: 'Makan' }).expect(409);
    expect(response.body).toMatchObject({ statusCode: 409, error: 'CONFLICT' });
  });

  // PRD 6.10
  it('rejects a budget below 1', async () => {
    await authed('put', `/api/wallets/${walletId}/budgets/2026-09`).send({ amount: 0 }).expect(422);
    await authed('put', `/api/wallets/${walletId}/budgets/2026-09`).send({ amount: -100 }).expect(422);
  });

  // PRD 6.3
  it('404s for a month with no budget, but still accepts expenses in it', async () => {
    await authed('get', `/api/wallets/${walletId}/budgets/2026-09`).expect(404);

    await authed('post', '/api/transactions')
      .send({ occurredOn: '2026-09-05', amount: 100_000 })
      .expect(201);

    const report = await authed('get', `/api/wallets/${walletId}/reports/month/2026-09`).expect(200);
    expect(report.body.hasBudget).toBe(false);
    expect(report.body.totalSpent).toBe(100_000);
  });

  it('lists budget history newest first with spend and carry-out', async () => {
    await authed('put', `/api/wallets/${walletId}/budgets/2026-09`).send({ amount: 2_200_000 }).expect(200);
    await authed('put', `/api/wallets/${walletId}/budgets/2026-10`).send({ amount: 2_000_000 }).expect(200);
    await authed('post', '/api/transactions').send({ occurredOn: '2026-09-02', amount: 200_000 }).expect(201);

    const response = await authed('get', `/api/wallets/${walletId}/budgets`).expect(200);

    expect(response.body.items[0].period).toBe('2026-10');
    expect(response.body.items[1]).toMatchObject({
      period: '2026-09',
      amount: 2_200_000,
      totalSpent: 200_000,
      carryOut: 2_000_000,
    });
  });

  it('removes a budget without touching its expenses', async () => {
    await authed('put', `/api/wallets/${walletId}/budgets/2026-09`).send({ amount: 2_200_000 }).expect(200);
    await authed('post', '/api/transactions').send({ occurredOn: '2026-09-02', amount: 200_000 }).expect(201);

    await authed('delete', `/api/wallets/${walletId}/budgets/2026-09`).expect(204);
    await authed('get', `/api/wallets/${walletId}/budgets/2026-09`).expect(404);

    const report = await authed('get', `/api/wallets/${walletId}/reports/month/2026-09`).expect(200);
    expect(report.body.totalSpent).toBe(200_000);
    expect(report.body.hasBudget).toBe(false);
  });
});
