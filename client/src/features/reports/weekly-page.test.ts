import { describe, expect, it } from 'vitest';
import { transferRows, weekStatus } from './weekly-page';

/** W3 of September 2026: Mon 14 -- Sun 20, rolling over into W4 of the same month. */
const w3 = {
  startDate: '2026-09-14',
  endDate: '2026-09-20',
  period: '2026-09',
  weekRemaining: 163_131,
  nextWeek: { period: '2026-09', weekIndex: 4 },
};

/** The last segment of a month: its remainder leaves for next month rather than a W6. */
const lastWeek = {
  ...w3,
  startDate: '2026-09-28',
  endDate: '2026-09-30',
  nextWeek: { period: '2026-10', weekIndex: 1 },
};

describe('weekStatus', () => {
  it('marks a week that has not started yet as upcoming, in the future tense', () => {
    expect(weekStatus(w3, '2026-09-11')).toEqual({
      tone: 'idle',
      label: 'Akan datang',
      rollover: 'nanti jadi rollover W4',
    });
  });

  it('marks the week containing today as running, boundaries included', () => {
    for (const today of ['2026-09-14', '2026-09-17', '2026-09-20']) {
      expect(weekStatus(w3, today)).toEqual({
        tone: 'run',
        label: 'Berjalan',
        rollover: 'jadi rollover W4',
      });
    }
  });

  it('marks a week that has ended as settled', () => {
    expect(weekStatus(w3, '2026-09-21')).toEqual({
      tone: 'ok',
      label: 'Selesai',
      rollover: 'jadi rollover W4',
    });
  });

  it('reports a negative remainder as over in every time state', () => {
    const broke = { ...w3, weekRemaining: -1 };

    expect(weekStatus(broke, '2026-09-11').label).toBe('Over');
    expect(weekStatus(broke, '2026-09-17').label).toBe('Over');
    expect(weekStatus(broke, '2026-09-21').label).toBe('Over');
    expect(weekStatus(broke, '2026-09-11').tone).toBe('over');
  });

  it('keeps the future tense on the badge it loses', () => {
    // Over replaces the label but not the rollover line, which still has to be honest
    // about a week that has not happened yet.
    expect(weekStatus({ ...w3, weekRemaining: -1 }, '2026-09-11').rollover).toBe(
      'nanti jadi rollover W4',
    );
  });

  it('names the month carry-over when the next week belongs to the next month', () => {
    expect(weekStatus(lastWeek, '2026-10-05').rollover).toBe('jadi carry-over ke bulan depan');
    expect(weekStatus(lastWeek, '2026-09-11').rollover).toBe(
      'nanti jadi carry-over ke bulan depan',
    );
  });
});

/**
 * The transfer rows (PRD v2 11.6).
 *
 * The receipt is a running total, and a transfer is the one operand that is neither a
 * budget nor a spend. Showing it as its own line is what keeps `weekendBudget` on the card
 * arithmetically reachable from the lines above it -- and hiding it when it is zero is
 * what keeps the card short on the weeks nothing moved.
 */
describe('transferRows', () => {
  it('shows nothing on a week with no transfers', () => {
    expect(transferRows({ transferOut: 0, transferIn: 0 })).toEqual([]);
  });

  it('renders money leaving as a subtraction', () => {
    expect(transferRows({ transferOut: 320_000, transferIn: 0 })).toEqual([
      { label: 'Dipindah ke dompet lain', amount: 320_000, tone: 'neg', signed: 'minus' },
    ]);
  });

  it('renders money arriving as an addition', () => {
    expect(transferRows({ transferOut: 0, transferIn: 150_000 })).toEqual([
      { label: 'Masuk dari dompet lain', amount: 150_000, tone: 'pos', signed: true },
    ]);
  });

  it('puts the outgoing row first when a week has both, as the PRD prints it', () => {
    expect(transferRows({ transferOut: 320_000, transferIn: 150_000 }).map((row) => row.label)).toEqual([
      'Dipindah ke dompet lain',
      'Masuk dari dompet lain',
    ]);
  });
});
