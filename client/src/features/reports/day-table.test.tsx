import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DAY_VIEW_STORAGE_KEY } from './day-view';
import { DayTable } from './weekly-page';
import type { DayRow } from '@/types/api';

const RATE = 62_037;

function weekday(date: string, spent: number): DayRow {
  return {
    date,
    dayType: 'WEEKDAY',
    dayBudget: RATE,
    spent,
    remaining: RATE - spent,
    isToday: date === '2026-09-16',
    expenseCount: spent > 0 ? 1 : 0,
  };
}

function weekend(date: string, spent: number): DayRow {
  return {
    date,
    dayType: 'WEEKEND',
    dayBudget: 0,
    spent,
    remaining: -spent,
    isToday: false,
    expenseCount: spent > 0 ? 1 : 0,
  };
}

/** W3 of September 2026 as the screenshot caught it, plus an overspent Friday. */
const days: DayRow[] = [
  weekday('2026-09-14', 12_000),
  weekday('2026-09-15', 18_000),
  weekday('2026-09-16', 21_000),
  weekday('2026-09-17', 0),
  weekday('2026-09-18', 70_000),
  weekend('2026-09-19', 150_000),
  weekend('2026-09-20', 0),
];

/**
 * The figure at the end of a row. Same shape as receipt.test.tsx: the tone lives on the
 * innermost span, and the meter contributes no span of its own without a marker.
 */
function figureOf(row: Element): HTMLElement {
  const spans = row.querySelectorAll('span');
  return spans[spans.length - 1] as HTMLElement;
}

function column(container: HTMLElement): string[] {
  return [...container.querySelectorAll('li')].map(
    (row) => figureOf(row).textContent?.trim() ?? '',
  );
}

afterEach(() => window.localStorage.clear());

describe('the Per hari column', () => {
  it('opens on what is left, not on what was spent', () => {
    // The whole point of the change: an untouched Thursday and a spent Wednesday used to
    // print answers to different questions in the same column.
    const { container } = render(<DayTable days={days} />);

    expect(column(container)).toEqual([
      'Rp 50.037',
      'Rp 44.037',
      'Rp 41.037',
      'Rp 62.037',
      '-Rp 7.963',
      'weekend',
      'weekend',
    ]);
  });

  it('switches the whole column at once, and remembers the choice', () => {
    const { container } = render(<DayTable days={days} />);

    fireEvent.click(screen.getByRole('button', { name: 'Terpakai' }));

    expect(column(container)).toEqual([
      'Rp 12.000',
      'Rp 18.000',
      'Rp 21.000',
      'Rp 0',
      'Rp 70.000',
      'Rp 150.000',
      'weekend',
    ]);
    expect(window.localStorage.getItem(DAY_VIEW_STORAGE_KEY)).toBe('spent');
  });

  it('comes back on the view it was left on', () => {
    window.localStorage.setItem(DAY_VIEW_STORAGE_KEY, 'spent');

    expect(column(render(<DayTable days={days} />).container)[0]).toBe('Rp 12.000');
  });

  it('carries an overspent day by its minus sign, not by its colour alone', () => {
    // PRD 9.1/11: red is never the only signal. The figure keeps its minus, and the legend
    // under the list names the state in words.
    const { container } = render(<DayTable days={days} />);
    const over = figureOf([...container.querySelectorAll('li')][4]);

    expect(over.textContent).toContain('-');
    expect(over.className).toContain('text-neg');
    expect(screen.getByText(/hari yang lewat dari jatah harian/)).toBeTruthy();
  });

  it('greys a day nothing has happened on yet', () => {
    const rows = [...render(<DayTable days={days} />).container.querySelectorAll('li')];

    expect(figureOf(rows[3]).className).toContain('text-ink-3');
    expect(figureOf(rows[2]).className).toBe('text-ink');
  });
});
