import { UNCATEGORISED_COLOR } from '@/modules/reports/engine/aggregate';
import { CATEGORY_PALETTE, DEFAULT_CATEGORIES, pickCategoryColor } from './default-categories';

describe('pickCategoryColor', () => {
  it('gives the first palette colour to a user with none', () => {
    expect(pickCategoryColor([])).toBe(CATEGORY_PALETTE[0]);
  });

  it('skips colours already in use', () => {
    const used = CATEGORY_PALETTE.slice(0, 3);

    expect(pickCategoryColor([...used])).toBe(CATEGORY_PALETTE[3]);
  });

  it('ignores colours outside the palette when looking for a free one', () => {
    expect(pickCategoryColor(['#123456', '#ABCDEF'])).toBe(CATEGORY_PALETTE[0]);
  });

  it('matches used colours case-insensitively', () => {
    const used = CATEGORY_PALETTE.slice(0, 2).map((color) => color.toLowerCase());

    expect(pickCategoryColor(used)).toBe(CATEGORY_PALETTE[2]);
  });

  it('cycles once every palette colour is taken', () => {
    const all = [...CATEGORY_PALETTE];

    expect(pickCategoryColor(all)).toBe(CATEGORY_PALETTE[0]);
    expect(pickCategoryColor([...all, '#000000'])).toBe(CATEGORY_PALETTE[1]);
  });

  it('never hands out the uncategorised grey, which would hide a real category in the donut', () => {
    expect(CATEGORY_PALETTE).not.toContain(UNCATEGORISED_COLOR);
  });

  it('leaves a freshly seeded user six unused colours', () => {
    const seeded = DEFAULT_CATEGORIES.map((category) => category.color);

    expect(pickCategoryColor(seeded)).toBe(CATEGORY_PALETTE[6]);
  });

  it('seeds the six real categories from the front of the palette, in order', () => {
    const seeded = DEFAULT_CATEGORIES.filter((category) => category.color !== UNCATEGORISED_COLOR);

    expect(seeded.map((category) => category.color)).toEqual([...CATEGORY_PALETTE.slice(0, 6)]);
  });
});

/**
 * A category colour is stored as a single hex and rendered on both themes, so it cannot
 * shift the way a CSS token does. These two properties are what makes the palette usable
 * at all, and they were expensive enough to solve for that they are worth pinning.
 */
describe('palette legibility', () => {
  const LIGHTEST_SURFACE = '#FFFFFF';
  const DARKEST_SURFACE = '#2C2F39';

  function channel(value: number): number {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }

  function luminance(hex: string): number {
    const [r, g, b] = [1, 3, 5].map((offset) =>
      channel(parseInt(hex.slice(offset, offset + 2), 16)),
    );
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  function contrast(a: string, b: string): number {
    const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (high + 0.05) / (low + 0.05);
  }

  function lab(hex: string): [number, number, number] {
    const [r, g, b] = [1, 3, 5].map((offset) =>
      channel(parseInt(hex.slice(offset, offset + 2), 16)),
    );
    const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
    const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
    const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
    const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);

    return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
  }

  it.each([...CATEGORY_PALETTE, UNCATEGORISED_COLOR])(
    '%s clears 3:1 on the lightest and the darkest surface',
    (color) => {
      expect(contrast(color, LIGHTEST_SURFACE)).toBeGreaterThanOrEqual(3);
      expect(contrast(color, DARKEST_SURFACE)).toBeGreaterThanOrEqual(3);
    },
  );

  it('keeps every pair of colours at least 19 ΔE apart', () => {
    const all = [...CATEGORY_PALETTE, UNCATEGORISED_COLOR];

    for (let i = 0; i < all.length; i += 1) {
      for (let j = i + 1; j < all.length; j += 1) {
        const [a, b] = [lab(all[i]), lab(all[j])];
        const distance = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

        expect({ pair: `${all[i]} vs ${all[j]}`, distance: distance >= 19 }).toEqual({
          pair: `${all[i]} vs ${all[j]}`,
          distance: true,
        });
      }
    }
  });
});
