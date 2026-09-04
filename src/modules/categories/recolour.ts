import {
  CATEGORY_PALETTE,
  LEGACY_CATEGORY_PALETTE,
  LEGACY_UNCATEGORISED_COLOR,
} from './default-categories';
import { UNCATEGORISED_COLOR } from '@/modules/reports/engine/aggregate';

export interface RecolourChange {
  id: number;
  name: string;
  from: string;
  to: string;
}

/**
 * Maps a pre-revamp colour onto its counterpart in the new palette.
 *
 * Only colours this app chose are recognised. A hex the user picked themselves in Settings
 * is not ours to change, so anything outside the legacy palette is left exactly as it is
 * and reported as skipped.
 *
 * Positional rather than perceptual: index i of the old palette becomes index i of the new
 * one, so a user's categories keep their relative order and two categories that were
 * different colours stay different colours.
 */
export function mapLegacyColor(color: string): string | null {
  const normalised = color.trim().toUpperCase();

  if (normalised === LEGACY_UNCATEGORISED_COLOR) return UNCATEGORISED_COLOR;

  const index = LEGACY_CATEGORY_PALETTE.findIndex((legacy) => legacy === normalised);
  if (index === -1) return null;

  const next = CATEGORY_PALETTE[index];

  // A no-op is not a change; reporting it would pad the summary with noise.
  return next === normalised ? null : next;
}

/** Everything the command would rewrite, without touching anything. */
export function planRecolour(
  categories: ReadonlyArray<{ id: number; name: string; color: string }>,
): RecolourChange[] {
  return categories.flatMap((category) => {
    const to = mapLegacyColor(category.color);
    return to === null ? [] : [{ id: category.id, name: category.name, from: category.color, to }];
  });
}
