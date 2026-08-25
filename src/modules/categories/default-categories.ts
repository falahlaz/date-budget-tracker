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
