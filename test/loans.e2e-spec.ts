import { createHarness, defaultWalletId, Harness } from './app-harness';

/** Pinned so every due date below sits at a known distance from "today". */
const FIXED_TODAY = '2026-09-29';

describe('Loans API', () => {
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
    await harness.prisma.loanRepayment.deleteMany();
    await harness.prisma.loan.deleteMany();
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

  const lend = (body: Record<string, unknown> = {}) =>
    authed('post', '/api/loans').send({
      borrowerName: 'Budi',
      amount: 500_000,
      walletId: dateWalletId,
      lentOn: '2026-09-02',
      ...body,
    });

  const repay = (loanId: number, body: Record<string, unknown> = {}) =>
    authed('post', `/api/loans/${loanId}/repay`).send(body);

  const monthReport = () =>
    authed('get', `/api/wallets/${dateWalletId}/reports/month/2026-09`).expect(200);

  const savingsBalance = async () => {
    const wallets = await authed('get', '/api/wallets').expect(200);
    const list = Array.isArray(wallets.body) ? wallets.body : wallets.body.items;
    return list.find((wallet: { id: number }) => wallet.id === savingsWalletId).summary.balance;
  };

  const deposit = (amount: number) =>
    authed('post', `/api/wallets/${savingsWalletId}/deposits`)
      .send({ amount, occurredOn: '2026-09-01' })
      .expect(201);

  describe('lending', () => {
    it('writes a LOAN_OUT in the wallet and reports the full amount as owed', async () => {
      const response = await lend({ dueDate: '2026-10-25', note: 'buat servis motor' }).expect(201);

      expect(response.body).toMatchObject({
        borrowerName: 'Budi',
        amount: 500_000,
        lentOn: '2026-09-02',
        dueDate: '2026-10-25',
        note: 'buat servis motor',
        walletId: dateWalletId,
        repaidAmount: 0,
        remaining: 500_000,
        status: 'ACTIVE',
        repayments: [],
      });

      const txn = await authed('get', `/api/transactions/${response.body.transactionId}`).expect(
        200,
      );
      expect(txn.body).toMatchObject({
        kind: 'LOAN_OUT',
        direction: 'OUT',
        amount: 500_000,
        walletId: dateWalletId,
        loan: { id: response.body.id, borrowerName: 'Budi', role: 'LENT' },
      });
    });

    it('makes the week it lands in poorer, like a transfer out', async () => {
      await authed('put', `/api/wallets/${dateWalletId}/budgets/2026-09`)
        .send({ amount: 2_200_000 })
        .expect(200);

      const before = await monthReport();
      await lend().expect(201);
      const after = await monthReport();

      expect(after.body.transferOut).toBe(500_000);
      expect(after.body.totalSpent).toBe(before.body.totalSpent);
      expect(after.body.weeks[0].weekRemaining).toBe(before.body.weeks[0].weekRemaining - 500_000);
      expect(after.body.carryOut).toBe(before.body.carryOut - 500_000);
    });

    it('refuses to lend a savings wallet below zero', async () => {
      const short = await lend({ walletId: savingsWalletId }).expect(422);
      expect(short.body.details).toEqual([
        expect.objectContaining({ field: 'amount', constraint: 'insufficientBalance' }),
      ]);

      await deposit(800_000);
      await lend({ walletId: savingsWalletId }).expect(201);
      expect(await savingsBalance()).toBe(300_000);
    });

    it('rejects a future date and a due date before the loan', async () => {
      await lend({ lentOn: '2026-09-30' }).expect(422);
      await lend({ dueDate: '2026-09-01' }).expect(422);
      await lend({ borrowerName: '  ' }).expect(422);
    });
  });

  describe('repaying', () => {
    it('takes partial repayments until the loan is settled', async () => {
      const loan = await lend().expect(201);

      const first = await repay(loan.body.id, { amount: 200_000, occurredOn: '2026-09-10' }).expect(
        201,
      );
      expect(first.body.loan).toMatchObject({
        repaidAmount: 200_000,
        remaining: 300_000,
        status: 'ACTIVE',
        settledAt: null,
      });

      const rest = await repay(loan.body.id, { occurredOn: '2026-09-20' }).expect(201);
      expect(rest.body.amount).toBe(300_000);
      expect(rest.body.loan).toMatchObject({ remaining: 0, status: 'SETTLED' });
      expect(rest.body.loan.settledAt).not.toBeNull();
      expect(rest.body.loan.repayments).toEqual([
        expect.objectContaining({ amount: 200_000, occurredOn: '2026-09-10' }),
        expect.objectContaining({ amount: 300_000, occurredOn: '2026-09-20' }),
      ]);

      await repay(loan.body.id).expect(409);
    });

    it('puts the money back into the date-budget wallet', async () => {
      await authed('put', `/api/wallets/${dateWalletId}/budgets/2026-09`)
        .send({ amount: 2_200_000 })
        .expect(200);
      const before = await monthReport();

      const loan = await lend().expect(201);
      await repay(loan.body.id, { occurredOn: '2026-09-03' }).expect(201);

      const after = await monthReport();
      expect(after.body.transferIn).toBe(500_000);
      expect(after.body.carryOut).toBe(before.body.carryOut);
    });

    it('refuses to take back more than is owed', async () => {
      const loan = await lend().expect(201);
      const over = await repay(loan.body.id, { amount: 500_001 }).expect(422);
      expect(over.body.details).toEqual([
        expect.objectContaining({ field: 'amount', constraint: 'overpay' }),
      ]);
    });

    it('refuses a repayment dated before the loan', async () => {
      const loan = await lend().expect(201);
      await repay(loan.body.id, { occurredOn: '2026-09-01' }).expect(422);
    });

    it('can send the money back into another wallet', async () => {
      const loan = await lend().expect(201);

      const response = await repay(loan.body.id, { walletId: savingsWalletId }).expect(201);
      expect(response.body.loan.repayments[0].walletId).toBe(savingsWalletId);
      expect(await savingsBalance()).toBe(500_000);

      const txn = await authed('get', `/api/transactions/${response.body.transactionId}`).expect(
        200,
      );
      expect(txn.body).toMatchObject({
        kind: 'LOAN_IN',
        direction: 'IN',
        walletId: savingsWalletId,
        loan: { id: loan.body.id, role: 'REPAYMENT' },
      });
    });

    it('owes it again when a repayment is removed', async () => {
      const loan = await lend().expect(201);
      const paid = await repay(loan.body.id).expect(201);
      const repaymentId = paid.body.loan.repayments[0].id;

      const response = await authed(
        'delete',
        `/api/loans/${loan.body.id}/repayments/${repaymentId}`,
      ).expect(200);
      expect(response.body).toMatchObject({
        repaidAmount: 0,
        remaining: 500_000,
        status: 'ACTIVE',
        settledAt: null,
      });

      await authed('get', `/api/transactions/${paid.body.transactionId}`).expect(404);
    });
  });

  describe('listing', () => {
    it('puts overdue loans first and totals who owes what', async () => {
      await lend({ borrowerName: 'Budi', amount: 100_000 }).expect(201);
      const late = await lend({
        borrowerName: 'Sari',
        amount: 300_000,
        dueDate: '2026-09-20',
      }).expect(201);
      await lend({ borrowerName: 'budi ', amount: 50_000 }).expect(201);
      const settled = await lend({ borrowerName: 'Andi', amount: 70_000 }).expect(201);
      await repay(settled.body.id).expect(201);

      const response = await authed('get', '/api/loans').expect(200);

      expect(response.body.items[0]).toMatchObject({
        id: late.body.id,
        status: 'OVERDUE',
        daysOverdue: 9,
      });
      expect(response.body.items.at(-1)).toMatchObject({ id: settled.body.id, status: 'SETTLED' });
      expect(response.body.summary).toEqual({
        outstandingTotal: 450_000,
        outstandingCount: 3,
        overdueCount: 1,
        borrowers: [
          { name: 'Sari', outstanding: 300_000, loanCount: 1 },
          { name: 'Budi', outstanding: 150_000, loanCount: 2 },
        ],
      });
    });
  });

  describe('editing and deleting', () => {
    it('edits the loan and its transaction together', async () => {
      const loan = await lend().expect(201);

      const response = await authed('patch', `/api/loans/${loan.body.id}`)
        .send({ borrowerName: 'Budi S', amount: 600_000, lentOn: '2026-09-05', dueDate: null })
        .expect(200);

      expect(response.body).toMatchObject({
        borrowerName: 'Budi S',
        amount: 600_000,
        lentOn: '2026-09-05',
        dueDate: null,
        remaining: 600_000,
      });
    });

    it('refuses to lower the amount below what came back', async () => {
      const loan = await lend().expect(201);
      await repay(loan.body.id, { amount: 300_000 }).expect(201);

      await authed('patch', `/api/loans/${loan.body.id}`).send({ amount: 299_999 }).expect(422);

      const exact = await authed('patch', `/api/loans/${loan.body.id}`)
        .send({ amount: 300_000 })
        .expect(200);
      expect(exact.body.status).toBe('SETTLED');
    });

    it('deletes a loan with nothing paid back, and refuses one with repayments', async () => {
      const paid = await lend().expect(201);
      await repay(paid.body.id, { amount: 1_000 }).expect(201);
      await authed('delete', `/api/loans/${paid.body.id}`).expect(409);

      const fresh = await lend().expect(201);
      await authed('delete', `/api/loans/${fresh.body.id}`).expect(204);
      await authed('get', `/api/loans/${fresh.body.id}`).expect(404);
      await authed('get', `/api/transactions/${fresh.body.transactionId}`).expect(404);
    });

    it('lists loan rows in the wallet history without counting them as spending', async () => {
      const loan = await lend().expect(201);
      await repay(loan.body.id, { amount: 100_000 }).expect(201);
      await authed('post', '/api/transactions')
        .send({ amount: 25_000, occurredOn: '2026-09-03' })
        .expect(201);

      const list = await authed(
        'get',
        `/api/transactions?walletId=${dateWalletId}&period=2026-09`,
      ).expect(200);

      expect(list.body.total).toBe(3);
      expect(list.body.sumAmount).toBe(25_000);
      expect(
        list.body.items.find((item: { kind: string }) => item.kind === 'LOAN_OUT').loan,
      ).toMatchObject({ id: loan.body.id, borrowerName: 'Budi', role: 'LENT' });
    });

    it('keeps the generic endpoints away from loan rows', async () => {
      const loan = await lend().expect(201);
      const id = loan.body.transactionId;

      await authed('patch', `/api/transactions/${id}`).send({ amount: 1 }).expect(422);
      await authed('delete', `/api/transactions/${id}`).expect(422);
      await authed('post', '/api/transactions')
        .send({ kind: 'LOAN_OUT', amount: 1, occurredOn: '2026-09-02' })
        .expect(422);

      await deposit(800_000);
      const fromSavings = await lend({ walletId: savingsWalletId }).expect(201);
      await authed(
        'delete',
        `/api/wallets/${savingsWalletId}/transactions/${fromSavings.body.transactionId}`,
      ).expect(409);
    });

    it('404s on another loan id', async () => {
      await authed('get', '/api/loans/999999').expect(404);
      await repay(999999).expect(404);
    });
  });
});
