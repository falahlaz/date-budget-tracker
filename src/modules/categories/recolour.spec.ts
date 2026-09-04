import { CATEGORY_PALETTE, LEGACY_CATEGORY_PALETTE } from './default-categories';
import { mapLegacyColor, planRecolour } from './recolour';
import { UNCATEGORISED_COLOR } from '@/modules/reports/engine/aggregate';

describe('mapLegacyColor', () => {
  it('maps every legacy palette entry onto the new one at the same index', () => {
    LEGACY_CATEGORY_PALETTE.forEach((legacy, index) => {
      expect(mapLegacyColor(legacy)).toBe(CATEGORY_PALETTE[index]);
    });
  });

  it('maps the old slate onto the new uncategorised neutral', () => {
    expect(mapLegacyColor('#64748B')).toBe(UNCATEGORISED_COLOR);
  });

  it('is case-insensitive about the stored hex', () => {
    expect(mapLegacyColor('#ef4444')).toBe(CATEGORY_PALETTE[0]);
  });

  it('leaves a colour the user picked by hand alone', () => {
    expect(mapLegacyColor('#123456')).toBeNull();
  });

  it('is idempotent: a colour already in the new palette is not a change', () => {
    CATEGORY_PALETTE.forEach((color) => {
      const mapped = mapLegacyColor(color);
      expect(mapped === null || mapped === color).toBe(true);
    });
  });
});

describe('planRecolour', () => {
  it('reports only the rows that would actually change', () => {
    const plan = planRecolour([
      { id: 1, name: 'Makan', color: '#EF4444' },
      { id: 2, name: 'Sendiri', color: '#123456' },
      { id: 3, name: 'Sudah baru', color: CATEGORY_PALETTE[1] },
    ]);

    expect(plan).toEqual([{ id: 1, name: 'Makan', from: '#EF4444', to: CATEGORY_PALETTE[0] }]);
  });
});
