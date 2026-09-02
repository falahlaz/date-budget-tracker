import { createHarness, firstCategoryId, Harness } from './app-harness';

/**
 * Fixture B from PRD 5.2, driven end to end through the HTTP API.
 *
 * The clock is pinned to FIXED_TODAY so September 2026 always reads as a completed month:
 * the dates stay accepted under the future-date rule (PRD 6.9) and the numbers stay stable
 * forever, so the expected table can be compared against the PRD line by line.
 */
const FIXED_TODAY = '2026-12-01';

const FIXTURE_B_EXPENSES = [
  { spentOn: '2026-09-02', amount: 150_000 },
  { spentOn: '2026-09-05', amount: 250_000 },
  { spentOn: '2026-09-08', amount: 150_000 },
  { spentOn: '2026-09-12', amount: 250_000 },
  { spentOn: '2026-09-15', amount: 200_000 },
  { spentOn: '2026-09-19', amount: 400_000 },
  { spentOn: '2026-09-22', amount: 100_000 },
  { spentOn: '2026-09-26', amount: 500_000 },
  { spentOn: '2026-09-29', amount: 120_000 },
];

describe('Reports (PRD 8.6)', () => {
  let harness: Harness;
  let categoryId: number;

  beforeAll(async () => {
    harness = await createHarness({ today: FIXED_TODAY });
    categoryId = await firstCategoryId(harness);
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.prisma.expense.deleteMany();
    await harness.prisma.monthlyBudget.deleteMany();
  });

  const auth = () => harness.auth;

  const setBudget = (period: string, amount: number) =>
    harness.http().put(`/api/budgets/${period}`).set('Authorization', auth()).send({ amount });

  const addExpense = (body: Record<string, unknown>) =>
    harness.http().post('/api/expenses').set('Authorization', auth()).send(body);

  const monthReport = (period: string) =>
    harness.http().get(`/api/reports/month/${period}`).set('Authorization', auth());

  const weekReport = (period: string, weekIndex: number) =>
    harness.http().get(`/api/reports/week/${period}/${weekIndex}`).set('Authorization', auth());

  // E1
  it('reports correct numbers after a budget and three expenses', async () => {
    await setBudget('2026-09', 2_200_000).expect(200);

    await addExpense({ spentOn: '2026-09-02', amount: 150_000, categoryId }).expect(201);
    await addExpense({ spentOn: '2026-09-05', amount: 250_000 }).expect(201);
    await addExpense({ spentOn: '2026-09-08', amount: 100_000 }).expect(201);

    const response = await monthReport('2026-09').expect(200);

    expect(response.body).toMatchObject({
      period: '2026-09',
      hasBudget: true,
      monthlyBudget: 2_200_000,
      carryIn: 0,
      weekdayCount: 22,
      dailyWeekdayRate: 100_000,
      totalSpent: 500_000,
      carryOut: 1_700_000,
      isOverspent: false,
    });
    expect(response.body.spendableRemaining).toBe(response.body.carryOut);
  });

  it('reproduces the whole of Fixture B, including the W4 overspend', async () => {
    await setBudget('2026-09', 2_200_000).expect(200);

    for (const expense of FIXTURE_B_EXPENSES) {
      await addExpense(expense).expect(201);
    }

    const { body } = await monthReport('2026-09').expect(200);

    expect(body.weeks.map((week: Record<string, number>) => ({
      weekIndex: week.weekIndex,
      weekBudget: week.weekBudget,
      weekdaySpent: week.weekdaySpent,
      rolloverIn: week.rolloverIn,
      weekendBudget: week.weekendBudget,
      weekendSpent: week.weekendSpent,
      weekRemaining: week.weekRemaining,
    }))).toEqual([
      { weekIndex: 1, weekBudget: 400_000, weekdaySpent: 150_000, rolloverIn: 0, weekendBudget: 250_000, weekendSpent: 250_000, weekRemaining: 0 },
      { weekIndex: 2, weekBudget: 500_000, weekdaySpent: 150_000, rolloverIn: 0, weekendBudget: 350_000, weekendSpent: 250_000, weekRemaining: 100_000 },
      { weekIndex: 3, weekBudget: 500_000, weekdaySpent: 200_000, rolloverIn: 100_000, weekendBudget: 400_000, weekendSpent: 400_000, weekRemaining: 0 },
      { weekIndex: 4, weekBudget: 500_000, weekdaySpent: 100_000, rolloverIn: 0, weekendBudget: 400_000, weekendSpent: 500_000, weekRemaining: -100_000 },
      { weekIndex: 5, weekBudget: 300_000, weekdaySpent: 120_000, rolloverIn: -100_000, weekendBudget: 80_000, weekendSpent: 0, weekRemaining: 80_000 },
    ]);

    expect(body.totalSpent).toBe(2_120_000);
    expect(body.carryOut).toBe(80_000);
  });

  it('carries the surplus into the next month without changing its daily rate (PRD 4.5)', async () => {
    await setBudget('2026-09', 2_200_000).expect(200);
    for (const expense of FIXTURE_B_EXPENSES) {
      await addExpense(expense).expect(201);
    }

    await setBudget('2026-10', 2_200_000).expect(200);
    const october = await monthReport('2026-10').expect(200);

    expect(october.body.carryIn).toBe(80_000);
    // Carry-in reaches W1 as rollover, and leaves the memorable daily number alone.
    expect(october.body.weeks[0].rolloverIn).toBe(80_000 + october.body.roundingRemainder);
    expect(october.body.dailyWeekdayRate).toBe(Math.floor(2_200_000 / october.body.weekdayCount));
  });

  it('skips a month with no budget in the carry-over chain (PRD 4.5, 6.5)', async () => {
    await setBudget('2026-09', 2_200_000).expect(200);
    await addExpense({ spentOn: '2026-09-02', amount: 200_000 }).expect(201);

    // October gets no budget at all, but does get spending.
    await addExpense({ spentOn: '2026-10-05', amount: 300_000 }).expect(201);
    await setBudget('2026-11', 1_000_000).expect(200);

    const october = await monthReport('2026-10').expect(200);
    expect(october.body.hasBudget).toBe(false);
    expect(october.body.monthlyBudget).toBe(0);
    expect(october.body.carryIn).toBe(0);
    expect(october.body.carryOut).toBe(-300_000);

    // November inherits September's carry-out, untouched by the gap month.
    const november = await monthReport('2026-11').expect(200);
    expect(november.body.carryIn).toBe(2_200_000 - 200_000);
  });

  // E9
  it('recomputes both months and invalidates the cache when an expense moves month', async () => {
    await setBudget('2026-09', 2_200_000).expect(200);
    await setBudget('2026-10', 2_200_000).expect(200);

    const created = await addExpense({ spentOn: '2026-10-05', amount: 500_000 }).expect(201);

    // Prime the cache for both months.
    await monthReport('2026-09').expect(200);
    await monthReport('2026-10').expect(200);
    expect(
      (await harness.prisma.monthlyBudget.findFirst({ where: { period: '2026-09' } }))?.carryOutCached,
    ).toBe(2_200_000);

    await harness
      .http()
      .patch(`/api/expenses/${created.body.id}`)
      .set('Authorization', auth())
      .send({ spentOn: '2026-09-05' })
      .expect(200);

    // Moving it back invalidates September and everything after it.
    const cached = await harness.prisma.monthlyBudget.findMany({ orderBy: { period: 'asc' } });
    expect(cached.every((row) => row.carryOutCached === null)).toBe(true);

    const september = await monthReport('2026-09').expect(200);
    const october = await monthReport('2026-10').expect(200);

    expect(september.body.totalSpent).toBe(500_000);
    expect(september.body.carryOut).toBe(1_700_000);
    expect(october.body.totalSpent).toBe(0);
    expect(october.body.carryIn).toBe(1_700_000);
  });

  it('recomputes when the budget itself changes (PRD 6.7)', async () => {
    await setBudget('2026-09', 2_200_000).expect(200);
    await addExpense({ spentOn: '2026-09-02', amount: 200_000 }).expect(201);

    expect((await monthReport('2026-09').expect(200)).body.carryOut).toBe(2_000_000);

    await setBudget('2026-09', 1_000_000).expect(200);
    expect((await monthReport('2026-09').expect(200)).body.carryOut).toBe(800_000);
  });

  // E12
  it('merges different spellings of a place into one byMerchant entry', async () => {
    await setBudget('2026-09', 2_200_000).expect(200);

    await addExpense({ spentOn: '2026-09-02', amount: 100_000, merchant: 'Bakmi GM' }).expect(201);
    await addExpense({ spentOn: '2026-09-03', amount: 120_000, merchant: 'bakmi gm ' }).expect(201);
    await addExpense({ spentOn: '2026-09-04', amount: 200_000, merchant: 'Bakmi-GM' }).expect(201);

    const { body } = await monthReport('2026-09').expect(200);
    const bakmi = body.byMerchant.filter((row: { merchantKey: string }) => row.merchantKey === 'bakmigm');

    expect(bakmi).toHaveLength(1);
    expect(bakmi[0]).toMatchObject({ count: 3, amount: 420_000, avgAmount: 140_000 });
    expect(bakmi[0].displayName).toBe('Bakmi-GM');
  });

  it('keeps expenses with no place in a bottom-pinned entry (PRD 6.18)', async () => {
    await setBudget('2026-09', 2_200_000).expect(200);
    await addExpense({ spentOn: '2026-09-02', amount: 5_000_000 }).expect(201);
    await addExpense({ spentOn: '2026-09-03', amount: 10_000, merchant: 'Bakmi GM' }).expect(201);

    const { body } = await monthReport('2026-09').expect(200);
    const last = body.byMerchant[body.byMerchant.length - 1];

    expect(last.merchantKey).toBeNull();
    expect(last.displayName).toBe('Tanpa tempat');
    expect(body.byMerchant[0].merchantKey).toBe('bakmigm');
  });

  it('serves the today and current-week widgets', async () => {
    const today = await harness.http().get('/api/reports/today').set('Authorization', auth()).expect(200);
    expect(today.body).toMatchObject({ dayType: expect.stringMatching(/WEEKDAY|WEEKEND/) });
    expect(typeof today.body.monthRemaining).toBe('number');

    const week = await harness
      .http()
      .get('/api/reports/week/current')
      .set('Authorization', auth())
      .expect(200);

    expect(week.body.days).toHaveLength(week.body.weekdayDays + week.body.weekendDays);
    // The projection is the weekend budget as it stands, given what has been spent so far.
    expect(week.body.projection.weekendBudgetIfNoMoreWeekdaySpend).toBe(week.body.weekendBudget);
  });

  /**
   * Week navigation used to hardcode "previous month, W6" on the client, which 404s for every
   * month that has fewer segments -- September 2026 has five, so stepping back from October W1
   * died. The neighbours are resolved by the engine now, so they always name a real week.
   */
  it('names the neighbouring weeks, crossing month and year boundaries', async () => {
    await setBudget('2026-09', 2_200_000).expect(200);

    const october = await weekReport('2026-10', 1).expect(200);
    expect(october.body.prevWeek).toEqual({ period: '2026-09', weekIndex: 5 });
    expect(october.body.nextWeek).toEqual({ period: '2026-10', weekIndex: 2 });

    // Walking back must land on a week the API actually serves.
    await weekReport(october.body.prevWeek.period, october.body.prevWeek.weekIndex).expect(200);

    const september = await weekReport('2026-09', 5).expect(200);
    expect(september.body.nextWeek).toEqual({ period: '2026-10', weekIndex: 1 });
    expect(september.body.prevWeek).toEqual({ period: '2026-09', weekIndex: 4 });

    // August 2026 is one of the rare months that does hold six segments.
    const septemberW1 = await weekReport('2026-09', 1).expect(200);
    expect(septemberW1.body.prevWeek).toEqual({ period: '2026-08', weekIndex: 6 });

    // December 2026 also holds five segments, so the year rollover is not special-cased.
    const january = await weekReport('2027-01', 1).expect(200);
    expect(january.body.prevWeek).toEqual({ period: '2026-12', weekIndex: 5 });

    // A month with no budget is still navigable (monthlyBudget = 0).
    await weekReport('2026-12', 5).expect(200);
  });

  it('rejects a malformed period', async () => {
    await harness.http().get('/api/reports/month/2026-9').set('Authorization', auth()).expect(422);
    await harness.http().get('/api/reports/month/not-a-period').set('Authorization', auth()).expect(422);
  });
});
