/**
 * The datebud category palette.
 *
 * Every colour here is stored as a hex on a per-user row (PRD 7.4), which means one value
 * has to work on *both* themes -- a stored hex cannot shift the way a CSS token does. So
 * each was chosen to clear a 3:1 contrast ratio against the lightest surface (#FFFFFF) and
 * the darkest one (#2C2F39) at the same time, which pins them all into a narrow luminance
 * band, and then spread as far apart as that band allows: the closest pair sits at ΔE 19.8
 * in CIE Lab, comfortably past the threshold where two slices of a donut stop being
 * separable for a colourblind reader.
 *
 * Even so, colour is never the only signal -- the donut legend names every slice with its
 * amount and share (PRD 11).
 */

/**
 * Default categories seeded for every new user (PRD 7.4).
 *
 * These are per-user rows, so they are created when a user is created rather than in a
 * migration -- a migration has no user to attach them to.
 *
 * DATE_BUDGET only: these are the things a date costs. Withdrawal categories are a
 * separate vocabulary, below.
 */
export const DEFAULT_CATEGORIES: ReadonlyArray<{ name: string; color: string; icon: string }> = [
  { name: 'Makan', color: '#9D6DE4', icon: 'utensils' },
  { name: 'Nonton', color: '#5B9432', icon: 'clapperboard' },
  { name: 'Transport', color: '#C557D9', icon: 'car' },
  { name: 'Ngopi', color: '#B17C00', icon: 'coffee' },
  { name: 'Aktivitas', color: '#E24D98', icon: 'ticket' },
  { name: 'Gift', color: '#E25662', icon: 'gift' },
  { name: 'Lain-lain', color: '#858499', icon: 'ellipsis' },
];

/**
 * Withdrawal categories for a savings wallet (PRD v2 9.4).
 *
 * Seeded the first time a user creates a SAVINGS wallet, for the same reason as above.
 * They can share a name with a spending category -- "Lain-lain" exists in both -- which is
 * exactly why the unique key moved to (user_id, wallet_type, name) in v2.
 *
 * "Impulsif" is deliberate, and deliberately named that. If it turns out to be the largest
 * slice after three months, that is the most useful thing this feature will have told
 * Falah, and a politer label would have buried it.
 */
export const SAVINGS_CATEGORIES: ReadonlyArray<{ name: string; color: string; icon: string }> = [
  { name: 'Darurat', color: '#C2536A', icon: 'siren' },
  { name: 'Kesehatan', color: '#3E8C74', icon: 'heart-pulse' },
  { name: 'Keluarga', color: '#8E479D', icon: 'users' },
  { name: 'Servis & perbaikan', color: '#C88B00', icon: 'wrench' },
  { name: 'Elektronik', color: '#6B6CD0', icon: 'smartphone' },
  { name: 'Impulsif', color: '#B14576', icon: 'zap' },
  { name: 'Lain-lain', color: '#8A8DA6', icon: 'ellipsis' },
];

/**
 * Colours offered to a category created without one.
 *
 * The six distinct seed colours come first so a fresh user's additions extend the palette
 * they already see, then six more. The neutral #858499 is deliberately absent: it is the
 * colour of "Tanpa kategori" in the reports (UNCATEGORISED_COLOR), and a real category
 * wearing it would be indistinguishable from uncategorised spend in the donut.
 */
export const CATEGORY_PALETTE: readonly string[] = [
  '#9D6DE4',
  '#5B9432',
  '#C557D9',
  '#B17C00',
  '#E24D98',
  '#E25662',
  '#329DB8',
  '#947662',
  '#4D94EB',
  '#31A381',
  '#9E6893',
  '#D17E52',
];

/**
 * The pre-revamp palette, kept only so `categories:recolour` can recognise a colour this
 * app chose from one the user picked by hand.
 *
 * Positionally aligned with CATEGORY_PALETTE above: index i maps to index i.
 */
export const LEGACY_CATEGORY_PALETTE: readonly string[] = [
  '#EF4444',
  '#8B5CF6',
  '#3B82F6',
  '#A16207',
  '#10B981',
  '#EC4899',
  '#F59E0B',
  '#14B8A6',
  '#6366F1',
  '#F43F5E',
  '#84CC16',
  '#0EA5E9',
];

/** The slate that used to be both "Lain-lain" and the uncategorised colour. */
export const LEGACY_UNCATEGORISED_COLOR = '#64748B';

/**
 * Picks a chart colour for a new category, preferring one the user is not already using.
 *
 * Once every palette colour is taken, repeats become unavoidable, so it cycles rather than
 * failing -- a duplicate colour is a cosmetic problem, a rejected category is not.
 */
export function pickCategoryColor(usedColors: string[]): string {
  const used = new Set(usedColors.map((color) => color.toUpperCase()));
  const unused = CATEGORY_PALETTE.find((color) => !used.has(color.toUpperCase()));

  return unused ?? CATEGORY_PALETTE[usedColors.length % CATEGORY_PALETTE.length];
}
