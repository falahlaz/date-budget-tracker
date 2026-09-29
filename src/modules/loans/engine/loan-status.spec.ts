import { LoanStatusInput, computeLoanStanding } from './loan-status';

const base: LoanStatusInput = {
  amount: 500_000,
  repayments: [],
  dueDate: null,
  today: '2026-09-29',
};

const standing = (overrides: Partial<LoanStatusInput>) =>
  computeLoanStanding({ ...base, ...overrides });

describe('computeLoanStanding', () => {
  it('is ACTIVE with the full amount owed before anything is paid back', () => {
    expect(standing({})).toEqual({
      repaidAmount: 0,
      remaining: 500_000,
      status: 'ACTIVE',
      daysOverdue: 0,
    });
  });

  it('adds up partial repayments', () => {
    const result = standing({ repayments: [100_000, 150_000] });
    expect(result.repaidAmount).toBe(250_000);
    expect(result.remaining).toBe(250_000);
    expect(result.status).toBe('ACTIVE');
  });

  it('is SETTLED once the last rupiah is back, even past the due date', () => {
    const result = standing({ repayments: [200_000, 300_000], dueDate: '2026-09-01' });
    expect(result.status).toBe('SETTLED');
    expect(result.remaining).toBe(0);
    expect(result.daysOverdue).toBe(0);
  });

  it('is not overdue on the due date itself', () => {
    expect(standing({ dueDate: '2026-09-29' }).status).toBe('ACTIVE');
  });

  it('is OVERDUE the day after the due date, counting the days', () => {
    const result = standing({ dueDate: '2026-09-26', repayments: [100_000] });
    expect(result.status).toBe('OVERDUE');
    expect(result.daysOverdue).toBe(3);
    expect(result.remaining).toBe(400_000);
  });

  it('never has a due date to miss when none was promised', () => {
    expect(standing({ today: '2030-01-01' }).status).toBe('ACTIVE');
  });
});
