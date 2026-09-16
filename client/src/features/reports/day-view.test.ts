import { afterEach, describe, expect, it, vi } from 'vitest';
import { DAY_VIEW_STORAGE_KEY, dayFigure, readStoredDayView, writeStoredDayView } from './day-view';
import type { DayRow } from '@/types/api';

/** A weekday at the September 2026 rate the screenshots were taken at. */
function weekday(
  spent: number,
  dayBudget = 62_037,
): Pick<DayRow, 'dayType' | 'dayBudget' | 'spent' | 'remaining'> {
  return { dayType: 'WEEKDAY', dayBudget, spent, remaining: dayBudget - spent };
}

/** A weekend day: no allowance of its own, so `remaining` is only the negated spend. */
function weekend(spent: number): Pick<DayRow, 'dayType' | 'dayBudget' | 'spent' | 'remaining'> {
  return { dayType: 'WEEKEND', dayBudget: 0, spent, remaining: -spent };
}

/**
 * The rule behind the "Per hari" figure.
 *
 * The bug this replaces was not a wrong number, it was two right numbers in one column: the
 * allowance on days nothing had happened, the spend on days something had. Every case below
 * is really the same assertion -- that the view, and nothing about the day itself, decides
 * which of the two the column carries.
 */
describe('dayFigure', () => {
  it('shows the full allowance on an untouched weekday, marked as untouched', () => {
    expect(dayFigure(weekday(0), 'remaining')).toEqual({
      kind: 'amount',
      amount: 62_037,
      over: false,
      muted: true,
    });
  });

  it('subtracts what was spent from the day it was spent on', () => {
    expect(dayFigure(weekday(21_000), 'remaining')).toEqual({
      kind: 'amount',
      amount: 41_037,
      over: false,
      muted: false,
    });
  });

  it('goes negative, and says so, once the day is overspent', () => {
    expect(dayFigure(weekday(70_000), 'remaining')).toEqual({
      kind: 'amount',
      amount: -7_963,
      over: true,
      muted: false,
    });
  });

  it('never marks the spend view as over, however deep the day went', () => {
    // Over belongs to a balance. "Terpakai Rp 70.000" is not an overrun, it is a total --
    // the bar and the Sisa view are where the day being over shows up.
    expect(dayFigure(weekday(70_000), 'spent')).toEqual({
      kind: 'amount',
      amount: 70_000,
      over: false,
      muted: false,
    });
  });

  it('shows a real zero in the spend view rather than falling back to the allowance', () => {
    // This is the old behaviour stated as a test: an untouched weekday used to print its
    // allowance in the one column that was otherwise reporting spend.
    expect(dayFigure(weekday(0), 'spent')).toEqual({
      kind: 'amount',
      amount: 0,
      over: false,
      muted: true,
    });
  });

  it('refuses to invent a daily balance for a weekend day', () => {
    // dayBudget is 0 on a weekend and the pot is shared across Saturday and Sunday, so
    // `remaining` there is just -spent. Printing it would read as an overrun of a daily
    // allowance that does not exist.
    expect(dayFigure(weekend(0), 'remaining')).toEqual({ kind: 'weekend' });
    expect(dayFigure(weekend(150_000), 'remaining')).toEqual({ kind: 'weekend' });
  });

  it('still reports what a weekend day cost in the spend view', () => {
    expect(dayFigure(weekend(150_000), 'spent')).toEqual({
      kind: 'amount',
      amount: 150_000,
      over: false,
      muted: false,
    });
    expect(dayFigure(weekend(0), 'spent')).toEqual({ kind: 'weekend' });
  });
});

describe('the stored view', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('opens on the remaining view when nothing has been stored', () => {
    expect(readStoredDayView()).toBe('remaining');
  });

  it('remembers a choice across a reload', () => {
    writeStoredDayView('spent');
    expect(readStoredDayView()).toBe('spent');

    writeStoredDayView('remaining');
    expect(readStoredDayView()).toBe('remaining');
  });

  it('falls back rather than trusting a value it did not write', () => {
    window.localStorage.setItem(DAY_VIEW_STORAGE_KEY, 'jatah');
    expect(readStoredDayView()).toBe('remaining');
  });

  it('survives storage being denied, in both directions', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });

    expect(readStoredDayView()).toBe('remaining');
    expect(() => writeStoredDayView('spent')).not.toThrow();
  });
});
