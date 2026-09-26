import { describe, expect, it } from 'vitest';
import type { Bill, BillSchedule } from '@/types/api';
import { billStatusLine, installmentLine, monthSpan } from './bill-labels';

const schedule: BillSchedule = {
  status: 'UPCOMING',
  nextPeriod: '2026-10',
  nextDueDate: '2026-10-25',
  daysUntilDue: 29,
  unpaidDueCount: 0,
  overdueCount: 0,
  totalCount: 6,
  paidCount: 2,
  remainingCount: 4,
};

const bill = (overrides: Partial<BillSchedule> = {}, kind: Bill['kind'] = 'INSTALLMENT'): Bill => ({
  id: 1,
  name: 'Cicilan HP',
  platform: null,
  amount: 450_000,
  kind,
  category: 'CICILAN',
  dueDay: 25,
  startPeriod: '2026-07',
  endPeriod: '2026-12',
  note: null,
  isArchived: false,
  schedule: { ...schedule, ...overrides },
  payments: [],
  createdAt: '',
  updatedAt: '',
});

describe('billStatusLine', () => {
  it('says how late a bill is, in days or in months', () => {
    expect(billStatusLine(bill({ status: 'OVERDUE', daysUntilDue: -3, overdueCount: 1 }))).toEqual({
      text: 'Telat 3 hari · 25 Okt',
      tone: 'over',
    });
    expect(billStatusLine(bill({ status: 'OVERDUE', daysUntilDue: -40, overdueCount: 2 })).text).toBe(
      'Telat 2 bulan · sejak 25 Okt',
    );
  });

  it('counts down the last few days', () => {
    expect(billStatusLine(bill({ status: 'DUE_SOON', daysUntilDue: 0 })).text).toBe(
      'Jatuh tempo hari ini',
    );
    expect(billStatusLine(bill({ status: 'DUE_SOON', daysUntilDue: 2 })).tone).toBe('warn');
  });

  it('distinguishes a finished installment from a paid one-time bill', () => {
    expect(billStatusLine(bill({ status: 'DONE' })).text).toBe('Lunas semua');
    expect(billStatusLine(bill({ status: 'DONE' }, 'ONE_TIME')).text).toBe('Udah dibayar');
  });
});

describe('installmentLine', () => {
  it('only describes installments', () => {
    expect(installmentLine(bill())).toBe('Sisa 4x dari 6');
    expect(installmentLine(bill({ totalCount: null, remainingCount: null }, 'RECURRING'))).toBeNull();
  });
});

describe('monthSpan', () => {
  it('counts both ends, across a year boundary', () => {
    expect(monthSpan('2026-09', '2026-09')).toBe(1);
    expect(monthSpan('2026-11', '2027-02')).toBe(4);
  });
});
