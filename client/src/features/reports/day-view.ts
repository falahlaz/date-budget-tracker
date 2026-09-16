import type { DayRow } from '@/types/api';

/**
 * Which figure the "Per hari" column carries.
 *
 * The column used to answer two different questions depending on whether the day had been
 * touched -- an untouched day showed its allowance, a day with an expense showed what went
 * out -- so the same position meant opposite things down one list. It now means one thing at
 * a time, and which thing is the user's choice.
 */
export type DayView = 'remaining' | 'spent';

export const DAY_VIEW_STORAGE_KEY = 'datebud.weekDayView';

/** What is still there to spend is the question the page is for, so it opens on that. */
const DEFAULT_VIEW: DayView = 'remaining';

function isDayView(value: unknown): value is DayView {
  return value === 'remaining' || value === 'spent';
}

export function readStoredDayView(): DayView {
  try {
    const raw = window.localStorage.getItem(DAY_VIEW_STORAGE_KEY);

    return isDayView(raw) ? raw : DEFAULT_VIEW;
  } catch {
    // Private mode, or storage disabled. The default answers the more common question.
    return DEFAULT_VIEW;
  }
}

export function writeStoredDayView(view: DayView): void {
  try {
    window.localStorage.setItem(DAY_VIEW_STORAGE_KEY, view);
  } catch {
    // Not being able to remember the choice is survivable; failing the toggle is not.
  }
}

/**
 * What the figure column of one day row shows.
 *
 * `muted` is not the same as `over` being false: it marks a day nothing has happened on yet,
 * whose figure is still the untouched allowance rather than a balance anything was taken out
 * of. Keeping the two apart is what stops the list reading as though every future day had
 * already been settled.
 */
export type DayFigure =
  | { kind: 'weekend' }
  | { kind: 'amount'; amount: number; over: boolean; muted: boolean };

/**
 * The rule behind the column, kept out of the markup because it is the rule and not the
 * spans that is worth testing.
 *
 * A weekend day has no daily allowance of its own: the engine sets `dayBudget` to 0 and the
 * weekend runs off one pot shared by Saturday and Sunday (PRD 4.3, see `buildDayReports` in
 * src/modules/reports/engine/compute-month.ts). So `remaining` on a weekend row is only
 * `-spent`, which is not a balance -- in the Sisa view the row says "weekend" instead of
 * inventing one.
 */
export function dayFigure(
  day: Pick<DayRow, 'dayType' | 'dayBudget' | 'spent' | 'remaining'>,
  view: DayView,
): DayFigure {
  if (day.dayType === 'WEEKEND') {
    if (view === 'remaining' || day.spent === 0) return { kind: 'weekend' };

    return { kind: 'amount', amount: day.spent, over: false, muted: false };
  }

  if (view === 'spent') {
    return { kind: 'amount', amount: day.spent, over: false, muted: day.spent === 0 };
  }

  return {
    kind: 'amount',
    amount: day.remaining,
    over: day.remaining < 0,
    muted: day.spent === 0,
  };
}
