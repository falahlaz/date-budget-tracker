import { createHarness, Harness } from './app-harness';

/**
 * The savings API (PRD v2 10.3).
 *
 * Pinned to the Fixture D "today" so the derived figures in section 7.1 can be asserted
 * against the PRD line by line, and so the fixture's 2026 dates stay in the past under the
 * future-date rule.
 */
const FIXED_TODAY = '2026-09-14';

describe('Savings API (PRD v2 10.3)', () => {
  let harness: Harness;
  let walletId: number;
  let categoryId: number;
  let impulsifId: number;

  beforeAll(async () => {
    harness = await createHarness({ today: FIXED_TODAY });
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.prisma.repaymentAllocation.deleteMany();
    await harness.prisma.transaction.deleteMany();
    await harness.prisma.savingsGoal.deleteMany();
    await harness.prisma.wallet.deleteMany({ where: { isDefault: false } });
    await harness.prisma.category.deleteMany({ where: { walletType: 'SAVINGS' } });

    const wallet = await authed('post', '/api/wallets')
      .send({ name: 'Tabungan', type: 'SAVINGS' })
      .expect(201);
    walletId = wallet.body.id;

    const categories = await authed('get', '/api/categories?walletType=SAVINGS').expect(200);
    categoryId = categories.body.find((c: { name: string }) => c.name === 'Keluarga').id;
    impulsifId = categories.body.find((c: { name: string }) => c.name === 'Impulsif').id;
  });

  const authed = (method: 'get' | 'post' | 'patch' | 'delete', path: string) =>
    harness.http()[method](path).set('Authorization', harness.auth);

  const createGoal = (overrides: Record<string, unknown> = {}) =>
    authed('post', `/api/wallets/${walletId}/goal`).send({
      name: 'Liburan Jepang',
      targetAmount: 30_000_000,
      openingBalance: 0,
      startDate: '2026-05-01',
      deadline: '2027-08-31',
      ...overrides,
    });

  const deposit = (body: Record<string, unknown>) =>
    authed('post', `/api/wallets/${walletId}/deposits`).send(body);

  const withdraw = (body: Record<string, unknown>) =>
    authed('post', `/api/wallets/${walletId}/withdrawals`).send({
      reason: 'Kado nikahan sepupu',
      categoryId,
      ...body,
    });

  // ------------------------------------------------------------------ goal

  describe('goal', () => {
    it('locks plan_per_month when the goal is created (5.2)', async () => {
      const created = await createGoal().expect(201);

      expect(created.body).toMatchObject({
        name: 'Liburan Jepang',
        targetAmount: 30_000_000,
        planPerMonth: 1_875_000,
        status: 'ACTIVE',
        planRevisedAt: null,
      });
    });

    // E29
    it('refuses a second active goal (9.3)', async () => {
      await createGoal().expect(201);
      await createGoal({ name: 'Goal kedua' }).expect(409);
    });

    it('allows a new goal once the first is archived', async () => {
      await createGoal().expect(201);
      await authed('post', `/api/wallets/${walletId}/goal/archive`).expect(201);
      await createGoal({ name: 'Goal kedua' }).expect(201);
    });

    // 8.12
    it('refuses a deadline before the start date', async () => {
      await createGoal({ startDate: '2026-09-01', deadline: '2026-08-31' }).expect(422);
    });

    // 8.11
    it('accepts a goal that starts and ends in the same month', async () => {
      const created = await createGoal({
        targetAmount: 5_000_000,
        openingBalance: 1_000_000,
        startDate: '2026-09-01',
        deadline: '2026-09-30',
      }).expect(201);

      expect(created.body.planPerMonth).toBe(4_000_000);
    });

    // 8.6
    it('recomputes the plan from the original start date and stamps the revision', async () => {
      await createGoal().expect(201);

      const revised = await authed('patch', `/api/wallets/${walletId}/goal`)
        .send({ deadline: '2027-04-30' })
        .expect(200);

      // May 2026 to Apr 2027 inclusive is 12 months, from the ORIGINAL start.
      expect(revised.body.planPerMonth).toBe(2_500_000);
      expect(revised.body.planRevisedAt).not.toBeNull();
    });

    it('404s when the wallet has no goal yet', async () => {
      await authed('get', `/api/wallets/${walletId}/goal`).expect(404);
    });
  });

  // ------------------------------------------------------- Fixture D, over HTTP

  describe('Fixture D driven through the API (7.1)', () => {
    beforeEach(async () => {
      await createGoal().expect(201);

      await deposit({ amount: 2_000_000, occurredOn: '2026-05-12' }).expect(201);

      await deposit({ amount: 1_800_000, occurredOn: '2026-06-10' }).expect(201);
      await withdraw({
        amount: 600_000,
        occurredOn: '2026-06-18',
        reason: 'Pinjam dulu',
        expectedReturn: true,
      }).expect(201);

      // July's deposit settles June's advance -- the row that makes G6 true.
      await deposit({ amount: 2_000_000, occurredOn: '2026-07-09', applyToAdvances: true }).expect(201);

      await deposit({ amount: 1_500_000, occurredOn: '2026-08-05' }).expect(201);
      await withdraw({
        amount: 700_000,
        occurredOn: '2026-08-09',
        reason: 'Kado nikahan sepupu',
        expectedReturn: true,
      }).expect(201);
      await withdraw({
        amount: 500_000,
        occurredOn: '2026-08-22',
        reason: 'Beli headphone',
        categoryId: impulsifId,
      }).expect(201);

      await deposit({ amount: 1_000_000, occurredOn: '2026-09-03' }).expect(201);
    });

    it('matches every derived figure in the PRD table', async () => {
      const goal = await authed('get', `/api/wallets/${walletId}/goal`).expect(200);

      expect(goal.body).toMatchObject({
        balance: 6_500_000,
        remaining: 23_500_000,
        monthsLeft: 12,
        requiredPerMonth: 1_958_334,
        expectedBalance: 8_312_500,
        paceDelta: -1_812_500,
        rate: 1_166_667,
        rateBasis: 'LAST_3_MONTHS',
        outstandingAdvance: 700_000,
        projectedDate: '2028-05-18',
        achieved: false,
      });
    });

    it('settled June\'s advance with July\'s deposit, leaving only August\'s owed', async () => {
      const advances = await authed('get', `/api/wallets/${walletId}/advances`).expect(200);

      expect(advances.body.items).toHaveLength(1);
      expect(advances.body.items[0]).toMatchObject({
        amount: 700_000,
        returnedAmount: 0,
        outstanding: 700_000,
        reason: 'Kado nikahan sepupu',
      });
      expect(advances.body.outstanding).toBe(700_000);
    });

    // Fixture E
    it('prices a withdrawal in time, not just rupiah (7.2, G4)', async () => {
      const small = await authed('post', `/api/wallets/${walletId}/withdrawals/preview`)
        .send({ amount: 500_000 })
        .expect(200);

      expect(small.body).toMatchObject({
        amount: 500_000,
        balanceAfter: 6_000_000,
        delayDays: 13,
        delayLabel: 'mundur sekitar 2 minggu',
        wouldGoNegative: false,
      });

      const big = await authed('post', `/api/wallets/${walletId}/withdrawals/preview`)
        .send({ amount: 1_000_000 })
        .expect(200);

      expect(big.body).toMatchObject({ delayDays: 26, delayLabel: 'mundur sekitar 4 minggu' });
    });

    it('writes nothing when previewing', async () => {
      const before = await harness.prisma.transaction.count();

      await authed('post', `/api/wallets/${walletId}/withdrawals/preview`)
        .send({ amount: 500_000 })
        .expect(200);

      expect(await harness.prisma.transaction.count()).toBe(before);
    });
  });

  // ------------------------------------------------------------- withdrawals

  describe('withdrawals', () => {
    beforeEach(async () => {
      await createGoal().expect(201);
      await deposit({ amount: 2_000_000, occurredOn: '2026-06-10' }).expect(201);
    });

    // E20 -- the rule that IS goal G2.
    it('refuses a withdrawal with no reason (8.13)', async () => {
      await authed('post', `/api/wallets/${walletId}/withdrawals`)
        .send({ amount: 100_000, occurredOn: '2026-09-01', categoryId })
        .expect(422);

      await authed('post', `/api/wallets/${walletId}/withdrawals`)
        .send({ amount: 100_000, occurredOn: '2026-09-01', categoryId, reason: '   ' })
        .expect(422);
    });

    it('refuses a withdrawal with no category (8.13)', async () => {
      await authed('post', `/api/wallets/${walletId}/withdrawals`)
        .send({ amount: 100_000, occurredOn: '2026-09-01', reason: 'lupa kategori' })
        .expect(422);
    });

    it('refuses a spending category on a withdrawal (9.4)', async () => {
      const spendCategories = await authed('get', '/api/categories').expect(200);

      await withdraw({
        amount: 100_000,
        occurredOn: '2026-09-01',
        categoryId: spendCategories.body[0].id,
      }).expect(422);
    });

    // E21
    it('refuses a withdrawal that would take the balance below zero (8.1)', async () => {
      const response = await withdraw({ amount: 2_000_001, occurredOn: '2026-09-01' }).expect(422);

      expect(response.body.message).toMatch(/balance is 2000000/);
    });

    it('allows a withdrawal that empties the wallet exactly', async () => {
      await withdraw({ amount: 2_000_000, occurredOn: '2026-09-01' }).expect(201);

      const goal = await authed('get', `/api/wallets/${walletId}/goal`).expect(200);
      expect(goal.body.balance).toBe(0);
    });

    it('stores the reason and the flag verbatim (G2, G5)', async () => {
      const created = await withdraw({
        amount: 100_000,
        occurredOn: '2026-09-01',
        reason: 'Servis motor mendadak',
        expectedReturn: true,
      }).expect(201);

      const row = await harness.prisma.transaction.findUniqueOrThrow({
        where: { id: created.body.id },
      });

      expect(row.reason).toBe('Servis motor mendadak');
      expect(row.expectedReturn).toBe(true);
      expect(row.kind).toBe('WITHDRAW');
      expect(row.direction).toBe('OUT');
    });
  });

  // ---------------------------------------------------------------- deposits

  describe('deposits and repayment allocation (5.4)', () => {
    let firstAdvance: number;
    let secondAdvance: number;

    beforeEach(async () => {
      await createGoal().expect(201);
      await deposit({ amount: 3_000_000, occurredOn: '2026-05-10' }).expect(201);

      const first = await withdraw({
        amount: 400_000,
        occurredOn: '2026-06-01',
        reason: 'lebih dulu',
        expectedReturn: true,
      }).expect(201);
      firstAdvance = first.body.id;

      const second = await withdraw({
        amount: 300_000,
        occurredOn: '2026-07-01',
        reason: 'lebih baru',
        expectedReturn: true,
      }).expect(201);
      secondAdvance = second.body.id;
    });

    // S8, over HTTP
    it('applies FIFO oldest first and reports repaid versus fresh', async () => {
      const response = await deposit({
        amount: 500_000,
        occurredOn: '2026-08-01',
        applyToAdvances: true,
      }).expect(201);

      // 400.000 settles the older one; 100.000 goes at the newer; nothing is left over.
      expect(response.body).toMatchObject({ repaid: 500_000, fresh: 0 });

      const advances = await authed('get', `/api/wallets/${walletId}/advances`).expect(200);
      expect(advances.body.items).toHaveLength(1);
      expect(advances.body.items[0]).toMatchObject({ id: secondAdvance, outstanding: 200_000 });
    });

    /** The two numbers the deposit toast names (11.3). The second is the one that matters. */
    it('splits a larger deposit into repayment and real progress', async () => {
      const response = await deposit({
        amount: 2_000_000,
        occurredOn: '2026-08-01',
        applyToAdvances: true,
      }).expect(201);

      expect(response.body).toMatchObject({ repaid: 700_000, fresh: 1_300_000 });
    });

    it('leaves advances alone unless asked', async () => {
      const response = await deposit({ amount: 900_000, occurredOn: '2026-08-01' }).expect(201);

      expect(response.body).toMatchObject({ repaid: 0, fresh: 900_000 });

      const advances = await authed('get', `/api/wallets/${walletId}/advances`).expect(200);
      expect(advances.body.outstanding).toBe(700_000);
    });

    it('lets a manual split override FIFO', async () => {
      const response = await deposit({
        amount: 500_000,
        occurredOn: '2026-08-01',
        allocations: [{ transactionId: secondAdvance, amount: 300_000 }],
      }).expect(201);

      expect(response.body).toMatchObject({ repaid: 300_000, fresh: 200_000 });

      // FIFO would have taken the older one; the manual split settled the newer instead.
      const advances = await authed('get', `/api/wallets/${walletId}/advances`).expect(200);
      expect(advances.body.items.map((a: { id: number }) => a.id)).toEqual([firstAdvance]);
    });

    // E26 / 8.16 -- nothing may be written when the allocation is rejected.
    it('writes nothing when the allocation exceeds the deposit', async () => {
      const before = await harness.prisma.transaction.count();

      await deposit({
        amount: 100_000,
        occurredOn: '2026-08-01',
        allocations: [{ transactionId: firstAdvance, amount: 400_000 }],
      }).expect(422);

      expect(await harness.prisma.transaction.count()).toBe(before);
      expect(await harness.prisma.repaymentAllocation.count()).toBe(0);
    });

    it('writes nothing when the allocation exceeds what is still owed', async () => {
      const before = await harness.prisma.transaction.count();

      await deposit({
        amount: 5_000_000,
        occurredOn: '2026-08-01',
        allocations: [{ transactionId: firstAdvance, amount: 900_000 }],
      }).expect(422);

      expect(await harness.prisma.transaction.count()).toBe(before);
      expect(await harness.prisma.repaymentAllocation.count()).toBe(0);
    });

    it('refuses an allocation against something that is not an open advance', async () => {
      const plain = await withdraw({
        amount: 50_000,
        occurredOn: '2026-07-15',
        reason: 'bukan utang',
      }).expect(201);

      await deposit({
        amount: 500_000,
        occurredOn: '2026-08-01',
        allocations: [{ transactionId: plain.body.id, amount: 50_000 }],
      }).expect(422);
    });

    // E26
    it('reverses the repayment when the deposit is deleted (8.7)', async () => {
      const created = await deposit({
        amount: 500_000,
        occurredOn: '2026-08-01',
        applyToAdvances: true,
      }).expect(201);

      const settled = await harness.prisma.transaction.findUniqueOrThrow({
        where: { id: firstAdvance },
      });
      expect(settled.returnedAmount).toBe(400_000);
      expect(settled.settledAt).not.toBeNull();

      await authed(
        'delete',
        `/api/wallets/${walletId}/transactions/${created.body.transaction.id}`,
      ).expect(204);

      const owedAgain = await harness.prisma.transaction.findUniqueOrThrow({
        where: { id: firstAdvance },
      });
      expect(owedAgain.returnedAmount).toBe(0);
      expect(owedAgain.settledAt).toBeNull();

      const advances = await authed('get', `/api/wallets/${walletId}/advances`).expect(200);
      expect(advances.body.outstanding).toBe(700_000);
    });

    // E25
    it('refuses to delete an advance that has been part repaid (8.8)', async () => {
      await deposit({
        amount: 200_000,
        occurredOn: '2026-08-01',
        allocations: [{ transactionId: firstAdvance, amount: 200_000 }],
      }).expect(201);

      await authed('delete', `/api/wallets/${walletId}/transactions/${firstAdvance}`).expect(409);
    });

    it('allows deleting an advance nobody has repaid', async () => {
      await authed('delete', `/api/wallets/${walletId}/transactions/${firstAdvance}`).expect(204);

      const advances = await authed('get', `/api/wallets/${walletId}/advances`).expect(200);
      expect(advances.body.items.map((a: { id: number }) => a.id)).toEqual([secondAdvance]);
    });
  });

  // ------------------------------------------------------------ goal status

  describe('goal status (8.4)', () => {
    beforeEach(async () => {
      await createGoal({ targetAmount: 1_000_000 }).expect(201);
    });

    it('marks the goal achieved once the balance reaches the target', async () => {
      await deposit({ amount: 1_250_000, occurredOn: '2026-06-01' }).expect(201);

      const goal = await authed('get', `/api/wallets/${walletId}/goal`).expect(200);

      expect(goal.body).toMatchObject({
        status: 'ACHIEVED',
        achieved: true,
        remaining: 0,
        surplus: 250_000,
        progress: 1,
      });
      expect(goal.body.achievedAt).not.toBeNull();
    });

    /**
     * Falling back below the target makes the goal active again -- there is something to
     * chase. `achievedAt` stays: it records when the target was first reached, and a later
     * withdrawal does not un-happen that.
     */
    it('goes back to active but remembers when it was first reached', async () => {
      await deposit({ amount: 1_250_000, occurredOn: '2026-06-01' }).expect(201);
      const achieved = await authed('get', `/api/wallets/${walletId}/goal`).expect(200);

      await withdraw({ amount: 500_000, occurredOn: '2026-07-01' }).expect(201);
      const after = await authed('get', `/api/wallets/${walletId}/goal`).expect(200);

      expect(after.body.status).toBe('ACTIVE');
      expect(after.body.achieved).toBe(false);
      expect(after.body.achievedAt).toBe(achieved.body.achievedAt);
    });
  });
});
