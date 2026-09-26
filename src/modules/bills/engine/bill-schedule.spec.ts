import { BillKind } from '@prisma/client';
import { BillScheduleInput, computeBillSchedule, dueDateIn } from './bill-schedule';

const base: BillScheduleInput = {
  kind: BillKind.RECURRING,
  dueDay: 25,
  startPeriod: '2026-09',
  endPeriod: null,
  paidPeriods: new Set(),
  today: '2026-09-10',
};

const schedule = (overrides: Partial<BillScheduleInput>) =>
  computeBillSchedule({ ...base, ...overrides });

describe('dueDateIn', () => {
  it('clamps the due day to the end of a short month', () => {
    expect(dueDateIn('2027-02', 31)).toBe('2027-02-28');
    expect(dueDateIn('2028-02', 31)).toBe('2028-02-29');
    expect(dueDateIn('2026-09', 31)).toBe('2026-09-30');
    expect(dueDateIn('2026-10', 5)).toBe('2026-10-05');
  });
});

describe('computeBillSchedule', () => {
  it('is UPCOMING while the due date is still more than a few days out', () => {
    const result = schedule({});
    expect(result.status).toBe('UPCOMING');
    expect(result.nextPeriod).toBe('2026-09');
    expect(result.nextDueDate).toBe('2026-09-25');
    expect(result.daysUntilDue).toBe(15);
    expect(result.unpaidDueCount).toBe(1);
    expect(result.totalCount).toBeNull();
  });

  it('is DUE_SOON within three days, including the due date itself', () => {
    expect(schedule({ today: '2026-09-22' }).status).toBe('DUE_SOON');
    expect(schedule({ today: '2026-09-25' }).status).toBe('DUE_SOON');
    expect(schedule({ today: '2026-09-21' }).status).toBe('UPCOMING');
  });

  it('is OVERDUE the day after the due date', () => {
    const result = schedule({ today: '2026-09-26' });
    expect(result.status).toBe('OVERDUE');
    expect(result.daysUntilDue).toBe(-1);
    expect(result.overdueCount).toBe(1);
  });

  it('points at the oldest unpaid period, not the current one', () => {
    const result = schedule({ today: '2026-11-02', paidPeriods: new Set(['2026-10']) });
    expect(result.nextPeriod).toBe('2026-09');
    expect(result.status).toBe('OVERDUE');
    expect(result.unpaidDueCount).toBe(2); // Sep and Nov
    expect(result.overdueCount).toBe(1); // Nov is not due until the 25th
  });

  it('is PAID once this month is settled, and looks ahead to next month', () => {
    const result = schedule({ today: '2026-09-26', paidPeriods: new Set(['2026-09']) });
    expect(result.status).toBe('PAID');
    expect(result.nextPeriod).toBe('2026-10');
    expect(result.nextDueDate).toBe('2026-10-25');
    expect(result.unpaidDueCount).toBe(0);
  });

  it('counts down an installment and finishes it', () => {
    const input = {
      kind: BillKind.INSTALLMENT,
      startPeriod: '2026-07',
      endPeriod: '2026-10',
      today: '2026-09-10',
    };

    const midway = schedule({ ...input, paidPeriods: new Set(['2026-07', '2026-08']) });
    expect(midway.totalCount).toBe(4);
    expect(midway.paidCount).toBe(2);
    expect(midway.remainingCount).toBe(2);
    expect(midway.nextPeriod).toBe('2026-09');

    const done = schedule({
      ...input,
      paidPeriods: new Set(['2026-07', '2026-08', '2026-09', '2026-10']),
    });
    expect(done.status).toBe('DONE');
    expect(done.nextPeriod).toBeNull();
    expect(done.remainingCount).toBe(0);
  });

  it('lets an installment be paid ahead of time', () => {
    const result = schedule({
      kind: BillKind.INSTALLMENT,
      startPeriod: '2026-09',
      endPeriod: '2026-11',
      paidPeriods: new Set(['2026-09', '2026-10']),
    });
    expect(result.status).toBe('PAID');
    expect(result.nextPeriod).toBe('2026-11');
    expect(result.remainingCount).toBe(1);
  });

  it('keeps an unpaid installment overdue after its last month has passed', () => {
    const result = schedule({
      kind: BillKind.INSTALLMENT,
      startPeriod: '2026-07',
      endPeriod: '2026-08',
      today: '2026-10-01',
      paidPeriods: new Set(['2026-07']),
    });
    expect(result.status).toBe('OVERDUE');
    expect(result.nextPeriod).toBe('2026-08');
    expect(result.unpaidDueCount).toBe(1);
  });

  it('owes a one-time bill once, in its own month', () => {
    const input = { kind: BillKind.ONE_TIME, startPeriod: '2026-12', dueDay: 15 };

    const ahead = schedule(input);
    expect(ahead.status).toBe('UPCOMING');
    expect(ahead.nextDueDate).toBe('2026-12-15');
    expect(ahead.unpaidDueCount).toBe(0);
    expect(ahead.totalCount).toBe(1);

    expect(schedule({ ...input, paidPeriods: new Set(['2026-12']) }).status).toBe('DONE');
  });

  it('ignores payments recorded for periods outside the schedule', () => {
    const result = schedule({ paidPeriods: new Set(['2026-08']) });
    expect(result.paidCount).toBe(0);
    expect(result.nextPeriod).toBe('2026-09');
  });

  it('treats a bill starting in a later month as upcoming, not paid', () => {
    const result = schedule({ startPeriod: '2026-10', today: '2026-09-30', dueDay: 1 });
    expect(result.status).toBe('DUE_SOON');
    expect(result.nextPeriod).toBe('2026-10');
    expect(result.unpaidDueCount).toBe(0);
  });
});
