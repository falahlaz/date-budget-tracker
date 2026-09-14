import { createHarness, defaultWalletId, firstCategoryId, Harness } from './app-harness';

/** Pinned so Fixture B's September 2026 dates stay in the past (PRD 6.9). */
const FIXED_TODAY = '2026-12-01';

/** Fixture B's spending (PRD v1.1 5.2), which Fixture F builds on. */
const FIXTURE_B = [
  { occurredOn: '2026-09-02', amount: 150_000 },
  { occurredOn: '2026-09-05', amount: 250_000 },
  { occurredOn: '2026-09-08', amount: 150_000 },
  { occurredOn: '2026-09-12', amount: 250_000 },
  { occurredOn: '2026-09-15', amount: 200_000 },
  { occurredOn: '2026-09-19', amount: 400_000 },
  { occurredOn: '2026-09-22', amount: 100_000 },
  { occurredOn: '2026-09-26', amount: 500_000 },
  { occurredOn: '2026-09-29', amount: 120_000 },
];

describe('Transfers (PRD v2 6, 10.4)', () => {
  let harness: Harness;
  let dateWalletId: number;
  let savingsWalletId: number;
  let categoryId: number;

  beforeAll(async () => {
    harness = await createHarness({ today: FIXED_TODAY });
    dateWalletId = await defaultWalletId(harness);
    categoryId = await firstCategoryId(harness);
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.prisma.repaymentAllocation.deleteMany();
    await harness.prisma.transaction.deleteMany();
    await harness.prisma.savingsGoal.deleteMany();
    await harness.prisma.monthlyBudget.deleteMany();
    await harness.prisma.wallet.deleteMany({ where: { isDefault: false } });
    await harness.prisma.category.deleteMany({ where: { walletType: 'SAVINGS' } });

    const savings = await authed('post', '/api/wallets')
      .send({ name: 'Tabungan', type: 'SAVINGS' })
      .expect(201);
    savingsWalletId = savings.body.id;
  });

  const authed = (method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string) =>
    harness.http()[method](path).set('Authorization', harness.auth);

  const transfer = (body: Record<string, unknown>) =>
    authed('post', '/api/transfers').send({
      fromWalletId: dateWalletId,
      toWalletId: savingsWalletId,
      amount: 320_000,
      occurredOn: '2026-09-03',
      ...body,
    });

  const monthReport = (period = '2026-09') =>
    authed('get', `/api/wallets/${dateWalletId}/reports/month/${period}`);

  const seedFixtureB = async () => {
    await authed('put', `/api/wallets/${dateWalletId}/budgets/2026-09`)
      .send({ amount: 2_200_000 })
      .expect(200);

    for (const spend of FIXTURE_B) {
      await authed('post', '/api/transactions').send({ ...spend, categoryId }).expect(201);
    }
  };

  describe('creating', () => {
    it('writes both sides with one group id, pointing at each other (6.1)', async () => {
      const created = await transfer({}).expect(201);

      expect(created.body.transferGroupId).toMatch(/^[0-9a-f-]{36}$/);
      expect(created.body.out).toMatchObject({
        walletId: dateWalletId,
        kind: 'TRANSFER_OUT',
        direction: 'OUT',
        amount: 320_000,
        occurredOn: '2026-09-03',
      });
      expect(created.body.in).toMatchObject({
        walletId: savingsWalletId,
        kind: 'TRANSFER_IN',
        direction: 'IN',
        amount: 320_000,
        occurredOn: '2026-09-03',
      });

      const rows = await harness.prisma.transaction.findMany({
        where: { transferGroupId: created.body.transferGroupId },
      });
      expect(rows).toHaveLength(2);
      expect(rows.map((row) => row.counterpartWalletId).sort()).toEqual(
        [dateWalletId, savingsWalletId].sort(),
      );
      // Transfers carry no category and appear in no breakdown (6.1).
      expect(rows.every((row) => row.categoryId === null)).toBe(true);
    });

    // E22
    it('refuses a transfer to the same wallet (8.10)', async () => {
      await transfer({ toWalletId: dateWalletId }).expect(422);
    });

    it('404s on a wallet that is not yours', async () => {
      await transfer({ toWalletId: 999_999 }).expect(404);
    });

    it('refuses a transfer out of savings that would go below zero (5.5)', async () => {
      await transfer({
        fromWalletId: savingsWalletId,
        toWalletId: dateWalletId,
        amount: 1_000,
      }).expect(422);
    });

    /**
     * The date wallet may go negative -- a budget is a plan and overspending it is valid
     * data (5.5). Only the savings side has a floor.
     */
    it('allows a transfer out of the date wallet with no balance behind it', async () => {
      await transfer({ amount: 5_000_000 }).expect(201);
    });

    it('allows a transfer out of savings once it has the money', async () => {
      await authed('post', `/api/wallets/${savingsWalletId}/deposits`)
        .send({ amount: 500_000, occurredOn: '2026-09-01' })
        .expect(201);

      await transfer({
        fromWalletId: savingsWalletId,
        toWalletId: dateWalletId,
        amount: 500_000,
      }).expect(201);
    });
  });

  describe('Fixture F over HTTP (7.3)', () => {
    beforeEach(seedFixtureB);

    it('cuts the weekend budget of the week the transfer lands in', async () => {
      await transfer({ occurredOn: '2026-09-03' }).expect(201);
      await transfer({
        fromWalletId: savingsWalletId,
        toWalletId: dateWalletId,
        amount: 150_000,
        occurredOn: '2026-09-03',
      }).expect(201);

      const report = await monthReport().expect(200);

      expect(report.body.transferOut).toBe(320_000);
      expect(report.body.transferIn).toBe(150_000);
      expect(
        report.body.weeks.map((week: Record<string, number>) => ({
          weekIndex: week.weekIndex,
          transferOut: week.transferOut,
          transferIn: week.transferIn,
          weekendBudget: week.weekendBudget,
          weekRemaining: week.weekRemaining,
        })),
      ).toEqual([
        { weekIndex: 1, transferOut: 320_000, transferIn: 150_000, weekendBudget: 80_000, weekRemaining: -170_000 },
        { weekIndex: 2, transferOut: 0, transferIn: 0, weekendBudget: 180_000, weekRemaining: -70_000 },
        { weekIndex: 3, transferOut: 0, transferIn: 0, weekendBudget: 230_000, weekRemaining: -170_000 },
        { weekIndex: 4, transferOut: 0, transferIn: 0, weekendBudget: 230_000, weekRemaining: -270_000 },
        { weekIndex: 5, transferOut: 0, transferIn: 0, weekendBudget: -90_000, weekRemaining: -90_000 },
      ]);
      expect(report.body.carryOut).toBe(-90_000);
    });

    // S10, through the API
    it('leaves carryOut alone when the same transfers move to W3', async () => {
      await transfer({ occurredOn: '2026-09-16' }).expect(201);
      await transfer({
        fromWalletId: savingsWalletId,
        toWalletId: dateWalletId,
        amount: 150_000,
        occurredOn: '2026-09-16',
      }).expect(201);

      const report = await monthReport().expect(200);

      expect(report.body.weeks[0].weekRemaining).toBe(0);
      expect(report.body.weeks[2].transferOut).toBe(320_000);
      expect(report.body.carryOut).toBe(-90_000);
    });

    it('reports Fixture B untouched when there are no transfers (S11)', async () => {
      const report = await monthReport().expect(200);

      expect(report.body.carryOut).toBe(80_000);
      expect(report.body.transferOut).toBe(0);
      expect(report.body.transferIn).toBe(0);
    });

    /** Transfers are not spending, so they stay out of every breakdown (6.1). */
    it('keeps transfers out of the category and total figures', async () => {
      const before = await monthReport().expect(200);
      await transfer({}).expect(201);
      const after = await monthReport().expect(200);

      expect(after.body.totalSpent).toBe(before.body.totalSpent);
      expect(after.body.byCategory).toEqual(before.body.byCategory);
      expect(after.body.byPaymentMethod).toEqual(before.body.byPaymentMethod);
    });

    it('carries the cut into the next month through carryOut', async () => {
      await authed('put', `/api/wallets/${dateWalletId}/budgets/2026-10`)
        .send({ amount: 2_000_000 })
        .expect(200);

      const before = await authed('get', `/api/wallets/${dateWalletId}/reports/month/2026-10`).expect(200);
      await transfer({ amount: 500_000 }).expect(201);
      const after = await authed('get', `/api/wallets/${dateWalletId}/reports/month/2026-10`).expect(200);

      expect(after.body.carryIn).toBe(before.body.carryIn - 500_000);
    });
  });

  describe('editing and deleting', () => {
    it('moves both sides when the amount changes', async () => {
      const created = await transfer({}).expect(201);

      const updated = await authed('patch', `/api/transfers/${created.body.transferGroupId}`)
        .send({ amount: 400_000 })
        .expect(200);

      expect(updated.body.out.amount).toBe(400_000);
      expect(updated.body.in.amount).toBe(400_000);
    });

    it('moves both sides when the date changes', async () => {
      const created = await transfer({}).expect(201);

      const updated = await authed('patch', `/api/transfers/${created.body.transferGroupId}`)
        .send({ occurredOn: '2026-09-16' })
        .expect(200);

      expect(updated.body.out.occurredOn).toBe('2026-09-16');
      expect(updated.body.in.occurredOn).toBe('2026-09-16');
    });

    // E23
    it('soft deletes both sides together (8.9)', async () => {
      const created = await transfer({}).expect(201);
      const groupId = created.body.transferGroupId;

      await authed('delete', `/api/transfers/${groupId}`).expect(204);

      const rows = await harness.prisma.transaction.findMany({ where: { transferGroupId: groupId } });
      expect(rows).toHaveLength(2);
      expect(rows.every((row) => row.deletedAt !== null)).toBe(true);

      await authed('delete', `/api/transfers/${groupId}`).expect(404);
    });

    // E24 -- the rule that makes a half-deleted transfer impossible.
    it('refuses to delete one side through the transactions endpoint (8.9)', async () => {
      const created = await transfer({}).expect(201);

      const response = await authed('delete', `/api/transactions/${created.body.out.id}`).expect(409);
      expect(response.body.message).toMatch(/\/api\/transfers\//);

      await authed('delete', `/api/transactions/${created.body.in.id}`).expect(409);

      // Still both there, still both live.
      const rows = await harness.prisma.transaction.findMany({
        where: { transferGroupId: created.body.transferGroupId, deletedAt: null },
      });
      expect(rows).toHaveLength(2);
    });

    it('404s on a group id that does not exist', async () => {
      await authed('patch', '/api/transfers/not-a-real-group').send({ amount: 1 }).expect(404);
      await authed('delete', '/api/transfers/not-a-real-group').expect(404);
    });
  });

  describe('the savings side', () => {
    it('counts a transfer in as money towards the goal (5.2)', async () => {
      await authed('post', `/api/wallets/${savingsWalletId}/goal`)
        .send({
          name: 'Liburan',
          targetAmount: 10_000_000,
          startDate: '2026-09-01',
          deadline: '2027-08-31',
        })
        .expect(201);

      await transfer({ amount: 320_000 }).expect(201);

      const goal = await authed('get', `/api/wallets/${savingsWalletId}/goal`).expect(200);
      expect(goal.body.balance).toBe(320_000);
    });

    it('takes a transfer out back off the goal balance', async () => {
      await authed('post', `/api/wallets/${savingsWalletId}/goal`)
        .send({
          name: 'Liburan',
          targetAmount: 10_000_000,
          startDate: '2026-09-01',
          deadline: '2027-08-31',
        })
        .expect(201);

      await transfer({ amount: 500_000 }).expect(201);
      await transfer({
        fromWalletId: savingsWalletId,
        toWalletId: dateWalletId,
        amount: 200_000,
      }).expect(201);

      const goal = await authed('get', `/api/wallets/${savingsWalletId}/goal`).expect(200);
      expect(goal.body.balance).toBe(300_000);
    });
  });
});
