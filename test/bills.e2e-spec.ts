import { createHarness, defaultWalletId, Harness } from './app-harness';

/** Pinned so every due date below sits at a known distance from "today". */
const FIXED_TODAY = '2026-09-26';

describe('Bills API', () => {
  let harness: Harness;
  let dateWalletId: number;
  let savingsWalletId: number;

  beforeAll(async () => {
    harness = await createHarness({ today: FIXED_TODAY });
    dateWalletId = await defaultWalletId(harness);
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.prisma.billPayment.deleteMany();
    await harness.prisma.bill.deleteMany();
    await harness.prisma.repaymentAllocation.deleteMany();
    await harness.prisma.transaction.deleteMany();
    await harness.prisma.savingsGoal.deleteMany();
    await harness.prisma.wallet.deleteMany({ where: { isDefault: false } });
    await harness.prisma.category.deleteMany({ where: { name: 'Tagihan' } });
    await harness.prisma.category.deleteMany({ where: { walletType: 'SAVINGS' } });

    const savings = await authed('post', '/api/wallets')
      .send({ name: 'Tabungan', type: 'SAVINGS' })
      .expect(201);
    savingsWalletId = savings.body.id;
  });

  const authed = (method: 'get' | 'post' | 'patch' | 'delete', path: string) =>
    harness.http()[method](path).set('Authorization', harness.auth);

  const createBill = (body: Record<string, unknown> = {}) =>
    authed('post', '/api/bills').send({
      name: 'Cicilan HP',
      platform: 'Shopee PayLater',
      amount: 450_000,
      kind: 'INSTALLMENT',
      category: 'CICILAN',
      dueDay: 25,
      startPeriod: '2026-09',
      endPeriod: '2026-11',
      ...body,
    });

  const pay = (billId: number, body: Record<string, unknown>) =>
    authed('post', `/api/bills/${billId}/pay`).send(body);

  describe('creating', () => {
    it('creates an installment and reports where it stands', async () => {
      const response = await createBill().expect(201);

      expect(response.body).toMatchObject({
        name: 'Cicilan HP',
        kind: 'INSTALLMENT',
        endPeriod: '2026-11',
        schedule: {
          status: 'OVERDUE',
          nextPeriod: '2026-09',
          nextDueDate: '2026-09-25',
          daysUntilDue: -1,
          totalCount: 3,
          remainingCount: 3,
        },
        payments: [],
      });
    });

    it('needs an end month for an installment', async () => {
      await createBill({ endPeriod: undefined }).expect(422);
      await createBill({ endPeriod: '2026-08' }).expect(422);
    });

    it('pins a one-time bill to its own month and never ends a recurring one', async () => {
      const once = await createBill({ kind: 'ONE_TIME', endPeriod: '2027-05' }).expect(201);
      expect(once.body.endPeriod).toBe('2026-09');

      const monthly = await createBill({ kind: 'RECURRING', endPeriod: '2027-05' }).expect(201);
      expect(monthly.body.endPeriod).toBeNull();
      expect(monthly.body.schedule.totalCount).toBeNull();
    });

    it('rejects a due day outside 1..31', async () => {
      await createBill({ dueDay: 0 }).expect(422);
      await createBill({ dueDay: 32 }).expect(422);
    });
  });

  describe('paying', () => {
    it('writes a SPEND in a date-budget wallet under a "Tagihan" category', async () => {
      const bill = await createBill().expect(201);

      const response = await pay(bill.body.id, { walletId: dateWalletId }).expect(201);

      expect(response.body.period).toBe('2026-09');
      expect(response.body.transaction).toMatchObject({
        walletId: dateWalletId,
        kind: 'SPEND',
        direction: 'OUT',
        amount: 450_000,
        occurredOn: FIXED_TODAY,
        merchant: 'Shopee PayLater',
        paymentMethod: 'TRANSFER',
      });
      expect(response.body.bill.schedule).toMatchObject({
        status: 'PAID',
        nextPeriod: '2026-10',
        remainingCount: 2,
      });
      expect(response.body.bill.payments).toEqual([
        expect.objectContaining({ period: '2026-09', walletId: dateWalletId, amount: 450_000 }),
      ]);

      const detail = await authed(
        'get',
        `/api/transactions/${response.body.transaction.id}`,
      ).expect(200);
      expect(detail.body.category.name).toBe('Tagihan');
      expect(detail.body.bill).toEqual({ id: bill.body.id, name: 'Cicilan HP', period: '2026-09' });
    });

    it('writes a WITHDRAW with a reason in a savings wallet, and respects its balance', async () => {
      const bill = await createBill().expect(201);

      const short = await pay(bill.body.id, { walletId: savingsWalletId }).expect(422);
      expect(short.body.details).toEqual([
        expect.objectContaining({ field: 'amount', constraint: 'insufficientBalance' }),
      ]);
      expect(await harness.prisma.billPayment.count()).toBe(0);

      await authed('post', `/api/wallets/${savingsWalletId}/deposits`)
        .send({ amount: 1_000_000, occurredOn: '2026-09-01' })
        .expect(201);

      const response = await pay(bill.body.id, {
        walletId: savingsWalletId,
        amount: 400_000,
      }).expect(201);

      expect(response.body.transaction).toMatchObject({
        walletId: savingsWalletId,
        kind: 'WITHDRAW',
        amount: 400_000,
        reason: 'Bayar tagihan Cicilan HP (2026-09)',
      });
    });

    it('pays the oldest unpaid month first, and can pay ahead', async () => {
      const bill = await createBill().expect(201);

      await pay(bill.body.id, { walletId: dateWalletId }).expect(201);
      const second = await pay(bill.body.id, { walletId: dateWalletId }).expect(201);
      expect(second.body.period).toBe('2026-10');

      const third = await pay(bill.body.id, { walletId: dateWalletId }).expect(201);
      expect(third.body.bill.schedule.status).toBe('DONE');

      await pay(bill.body.id, { walletId: dateWalletId }).expect(409);
    });

    it('refuses to pay the same month twice, and leaves no stray transaction', async () => {
      const bill = await createBill().expect(201);
      await pay(bill.body.id, { walletId: dateWalletId, period: '2026-09' }).expect(201);

      await pay(bill.body.id, { walletId: dateWalletId, period: '2026-09' }).expect(409);
      expect(await harness.prisma.transaction.count({ where: { deletedAt: null } })).toBe(1);
    });

    it('refuses a month outside the schedule', async () => {
      const bill = await createBill().expect(201);
      await pay(bill.body.id, { walletId: dateWalletId, period: '2026-12' }).expect(422);
    });

    it("refuses someone else's wallet the same way as a missing one", async () => {
      const bill = await createBill().expect(201);
      await pay(bill.body.id, { walletId: 999_999 }).expect(404);
    });

    it('un-pays a month when its transaction is deleted, and lets it be paid again', async () => {
      const bill = await createBill().expect(201);
      const paid = await pay(bill.body.id, { walletId: dateWalletId }).expect(201);

      await authed('delete', `/api/transactions/${paid.body.transaction.id}`).expect(204);

      const after = await authed('get', `/api/bills/${bill.body.id}`).expect(200);
      expect(after.body.schedule.nextPeriod).toBe('2026-09');
      expect(after.body.payments).toEqual([]);

      const again = await pay(bill.body.id, { walletId: dateWalletId }).expect(201);
      expect(again.body.period).toBe('2026-09');
    });
  });

  describe('listing', () => {
    it('sorts the most urgent first and sums what is still owed', async () => {
      await createBill({
        name: 'Netflix',
        kind: 'RECURRING',
        category: 'LANGGANAN',
        amount: 65_000,
        dueDay: 28,
      });
      await createBill({ name: 'Cicilan HP' });
      const paid = await createBill({
        name: 'Internet',
        kind: 'RECURRING',
        category: 'UTILITAS',
        amount: 300_000,
      });
      await pay(paid.body.id, { walletId: dateWalletId }).expect(201);
      // Starts next month, so it is not part of this month's total.
      await createBill({ name: 'Pajak motor', kind: 'ONE_TIME', startPeriod: '2026-10' });

      const response = await authed('get', '/api/bills').expect(200);

      expect(response.body.items.map((bill: { name: string }) => bill.name)).toEqual([
        'Cicilan HP', // overdue since the 25th
        'Netflix', // due in two days
        'Pajak motor', // next month
        'Internet', // paid this month
      ]);
      expect(response.body.summary).toEqual({
        unpaidDueTotal: 515_000,
        unpaidDueCount: 2,
        overdueCount: 1,
        paidThisMonthTotal: 300_000,
        monthlyTotal: 815_000,
        monthlyCount: 3,
        monthlyByCategory: [
          { category: 'CICILAN', total: 450_000, count: 1 },
          { category: 'UTILITAS', total: 300_000, count: 1 },
          { category: 'LANGGANAN', total: 65_000, count: 1 },
        ],
      });
    });
  });

  describe('deleting', () => {
    it('deletes an unpaid bill outright but archives a paid one', async () => {
      const unpaid = await createBill().expect(201);
      const removed = await authed('delete', `/api/bills/${unpaid.body.id}`).expect(200);
      expect(removed.body).toEqual({ archived: false });
      await authed('get', `/api/bills/${unpaid.body.id}`).expect(404);

      const bill = await createBill().expect(201);
      await pay(bill.body.id, { walletId: dateWalletId }).expect(201);
      const archived = await authed('delete', `/api/bills/${bill.body.id}`).expect(200);
      expect(archived.body).toEqual({ archived: true });

      const list = await authed('get', '/api/bills').expect(200);
      expect(list.body.items).toEqual([]);
      const all = await authed('get', '/api/bills?includeArchived=true').expect(200);
      expect(all.body.items).toHaveLength(1);

      await pay(bill.body.id, { walletId: dateWalletId }).expect(409);
    });
  });
});
