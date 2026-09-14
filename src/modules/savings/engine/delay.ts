import { AVG_DAYS_PER_MONTH } from './month-span';

/**
 * What a withdrawal costs in time (PRD v2 section 7.2, goal G4).
 *
 * This is the number behind the friction dialog. It is computed on the server and handed
 * to the client whole, so the sentence the user reads before tapping "Lanjut tarik" cannot
 * disagree with the projection on the savings home screen.
 */

/**
 * How many days this withdrawal pushes the target back, at the current rate.
 *
 * `null` when the rate is zero or negative (section 8.2): there is no honest number to
 * give, and dividing anyway would produce Infinity and render as garbage.
 */
export function delayDays(amount: number, rate: number): number | null {
  if (rate <= 0) return null;

  return Math.round((amount / rate) * AVG_DAYS_PER_MONTH);
}

/**
 * The delay as the UI says it (section 7.2).
 *
 * A week or more is rounded to whole weeks, because "mundur sekitar 2 minggu" is a cost
 * someone can feel, and "mundur 13 hari" is a number they have to do arithmetic on. Under
 * a week stays in days, where weeks would round away the whole effect.
 */
export function delayLabel(days: number | null): string | null {
  if (days === null) return null;

  if (days < 7) {
    const whole = Math.max(1, Math.round(days));
    return `mundur sekitar ${whole} hari`;
  }

  // At least one: 7 days must never round down to "0 minggu".
  const weeks = Math.max(1, Math.round(days / 7));
  return `mundur sekitar ${weeks} minggu`;
}

/** The sentence shown instead of a number when the rate is flat or falling (section 8.2). */
export const NO_PROJECTION_MESSAGE =
  '3 bulan terakhir saldo lo ga naik, jadi ini ga bisa diproyeksikan';
