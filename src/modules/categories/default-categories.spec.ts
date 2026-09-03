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

    expect(pickCategoryColor(seeded)).toBe('#F59E0B');
  });
});
