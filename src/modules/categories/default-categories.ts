/**
 * Default categories seeded for every new user (PRD 7.4).
 *
 * These are per-user rows, so they are created when a user is created rather than in a
 * migration -- a migration has no user to attach them to.
 */
export const DEFAULT_CATEGORIES: ReadonlyArray<{ name: string; color: string; icon: string }> = [
  { name: 'Makan', color: '#EF4444', icon: 'utensils' },
  { name: 'Nonton', color: '#8B5CF6', icon: 'clapperboard' },
  { name: 'Transport', color: '#3B82F6', icon: 'car' },
  { name: 'Ngopi', color: '#A16207', icon: 'coffee' },
  { name: 'Aktivitas', color: '#10B981', icon: 'ticket' },
  { name: 'Gift', color: '#EC4899', icon: 'gift' },
  { name: 'Lain-lain', color: '#64748B', icon: 'ellipsis' },
];

/**
 * Colours offered to a category created without one.
 *
 * The six distinct seed colours come first so a fresh user's additions extend the palette
 * they already see, then six more. Slate #64748B is deliberately absent: it is the colour
 * of "Tanpa kategori" in the reports (UNCATEGORISED_COLOR), and a real category wearing it
 * would be indistinguishable from uncategorised spend in the donut.
 */
export const CATEGORY_PALETTE: readonly string[] = [
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
