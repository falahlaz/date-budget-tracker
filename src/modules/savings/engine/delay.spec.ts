import { NO_PROJECTION_MESSAGE, delayDays, delayLabel } from './delay';

/**
 * Fixture E (PRD v2 section 7.2), at the rate Fixture D produces.
 *
 * These two numbers are what the friction dialog says out loud before a withdrawal is
 * saved, so they are the product, not an implementation detail.
 */
const RATE = (1_200_000 + 2_000_000 + 300_000) / 3;

describe('delayDays / delayLabel - Fixture E (PRD v2 7.2)', () => {
  // S4
  it('matches the fixture table', () => {
    expect(delayDays(500_000, RATE)).toBe(13);
    expect(delayLabel(delayDays(500_000, RATE))).toBe('mundur sekitar 2 minggu');

    expect(delayDays(1_000_000, RATE)).toBe(26);
    expect(delayLabel(delayDays(1_000_000, RATE))).toBe('mundur sekitar 4 minggu');
  });

  it('speaks in days below a week and in weeks from a week up', () => {
    expect(delayLabel(3)).toBe('mundur sekitar 3 hari');
    expect(delayLabel(6)).toBe('mundur sekitar 6 hari');
    expect(delayLabel(7)).toBe('mundur sekitar 1 minggu');
  });

  /**
   * Ten days is nearer to one week than two by simple rounding, and saying "1 minggu" for
   * a week and a half understates it -- but consistency with the fixture matters more than
   * one borderline case, so the rule stays "round to the nearest week".
   */
  it('rounds to the nearest week rather than always down', () => {
    expect(delayLabel(10)).toBe('mundur sekitar 1 minggu');
    expect(delayLabel(11)).toBe('mundur sekitar 2 minggu');
  });

  it('never rounds a real delay down to zero', () => {
    expect(delayLabel(1)).toBe('mundur sekitar 1 hari');
    // 7 / 7 = 1 exactly; the floor exists for the rounding, not for this case.
    expect(delayLabel(7)).toBe('mundur sekitar 1 minggu');
  });

  // S3, at the formatting layer rather than the engine's.
  it('refuses to invent a number when the rate is flat or falling', () => {
    expect(delayDays(500_000, 0)).toBeNull();
    expect(delayDays(500_000, -100)).toBeNull();
    expect(delayLabel(null)).toBeNull();
    expect(NO_PROJECTION_MESSAGE).toMatch(/ga bisa diproyeksikan/);
  });
});
