import type { GoalWithReport } from '@/types/api';

const AVG_DAYS_PER_MONTH = 30.44;

/**
 * How late the projection lands, as words (PRD v2 11.2).
 *
 * Months once it is past a month, days before that, and nothing at all when the projection
 * lands on time -- "telat 0 hari" is noise dressed as information. The same shape as the
 * withdrawal delay label the server produces for the friction dialog, except this one is
 * about a date already on screen rather than a number the client must not invent.
 */
export function latenessLabel(daysLate: number | null): string | null {
  if (daysLate === null || daysLate <= 0) return null;

  if (daysLate < 31) {
    return `telat ${daysLate} hari`;
  }

  return `telat ${Math.round(daysLate / AVG_DAYS_PER_MONTH)} bulan`;
}

/**
 * The projection sentence, or the section 8.2 sentence in its place.
 *
 * A flat or falling three months has no honest projection, and the server says so by
 * returning `projectedDate: null` with a `projectionNote`. Printing "target kekejar
 * Invalid Date" instead is the failure this function exists to make impossible.
 */
export function projectionSentence(
  goal: Pick<GoalWithReport, 'projectedDate' | 'projectedDaysLate' | 'projectionNote'>,
  formatMonth: (period: string) => string,
): string {
  if (goal.projectedDate === null) {
    return goal.projectionNote ?? 'Belum ada proyeksi.';
  }

  const late = latenessLabel(goal.projectedDaysLate);
  const month = formatMonth(goal.projectedDate.slice(0, 7));

  return late === null
    ? `Dengan laju 3 bulan terakhir, target kekejar ${month} — masih on track.`
    : `Dengan laju 3 bulan terakhir, target kekejar ${month} — ${late} dari tenggat.`;
}
