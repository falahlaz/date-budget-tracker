import { describe, expect, it } from 'vitest';
import { loanStatusLine, repaidShare } from './loan-labels';

const base = {
  status: 'ACTIVE' as const,
  daysOverdue: 0,
  dueDate: null,
  repaidAmount: 0,
  remaining: 500_000,
};

describe('loanStatusLine', () => {
  it('says nothing has come back yet', () => {
    expect(loanStatusLine(base)).toEqual({ text: 'Belum dibalikin', tone: 'idle' });
  });

  it('shows what is left once part is back', () => {
    const line = loanStatusLine({ ...base, repaidAmount: 200_000, remaining: 300_000 });
    expect(line.tone).toBe('warn');
    expect(line.text).toContain('Sisa');
  });

  it('counts the days an overdue loan is late', () => {
    const line = loanStatusLine({ ...base, status: 'OVERDUE', daysOverdue: 4, dueDate: '2026-09-25' });
    expect(line.tone).toBe('over');
    expect(line.text).toMatch(/^Telat 4 hari/);
  });

  it('marks a settled loan', () => {
    expect(loanStatusLine({ ...base, status: 'SETTLED', remaining: 0 }).tone).toBe('ok');
  });
});

describe('repaidShare', () => {
  it('is the repaid fraction, capped at 1', () => {
    expect(repaidShare({ amount: 400, repaidAmount: 100 })).toBe(0.25);
    expect(repaidShare({ amount: 400, repaidAmount: 500 })).toBe(1);
  });
});
