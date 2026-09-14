import { normalizeMerchant } from '@/common/utils/merchant';
import {
  AggregatableExpense,
  MERCHANT_LIMIT,
  NO_MERCHANT_LABEL,
  UNCATEGORISED_LABEL,
  aggregateByCategory,
  aggregateByMerchant,
  aggregateByPaymentMethod,
  topExpenses,
} from './aggregate';

const MAKAN = { id: 1, name: 'Makan', color: '#9D6DE4' };
const NGOPI = { id: 4, name: 'Ngopi', color: '#B17C00' };

let nextId = 1;

function expense(partial: Partial<AggregatableExpense> & { amount: number }): AggregatableExpense {
  const merchant = partial.merchant ?? null;
  return {
    id: partial.id ?? nextId++,
    occurredOn: partial.occurredOn ?? '2026-09-05',
    amount: partial.amount,
    merchant,
    merchantKey: partial.merchantKey !== undefined ? partial.merchantKey : normalizeMerchant(merchant),
    paymentMethod: partial.paymentMethod ?? 'CASH',
    note: partial.note ?? null,
    category: partial.category ?? null,
  };
}

beforeEach(() => {
  nextId = 1;
});

describe('aggregateByCategory', () => {
  it('ranks categories by amount and computes the share of total spend', () => {
    const rows = aggregateByCategory([
      expense({ amount: 300_000, category: MAKAN }),
      expense({ amount: 100_000, category: MAKAN }),
      expense({ amount: 100_000, category: NGOPI }),
    ]);

    expect(rows[0]).toEqual({
      categoryId: 1,
      name: 'Makan',
      color: '#9D6DE4',
      amount: 400_000,
      share: 0.8,
      count: 2,
    });
    expect(rows[1].categoryId).toBe(4);
    expect(rows[1].share).toBe(0.2);
  });

  it('collects uncategorised spend into one entry pinned to the bottom', () => {
    const rows = aggregateByCategory([
      expense({ amount: 900_000 }), // no category, but the biggest amount
      expense({ amount: 100_000, category: MAKAN }),
    ]);

    expect(rows[rows.length - 1]).toMatchObject({
      categoryId: null,
      name: UNCATEGORISED_LABEL,
      amount: 900_000,
      count: 1,
    });
  });

  it('returns no rows for no expenses', () => {
    expect(aggregateByCategory([])).toEqual([]);
  });
});

describe('aggregateByPaymentMethod', () => {
  it('ranks payment methods by amount', () => {
    const rows = aggregateByPaymentMethod([
      expense({ amount: 500_000, paymentMethod: 'QRIS' }),
      expense({ amount: 100_000, paymentMethod: 'CASH' }),
      expense({ amount: 100_000, paymentMethod: 'QRIS' }),
    ]);

    expect(rows).toEqual([
      { paymentMethod: 'QRIS', amount: 600_000, count: 2 },
      { paymentMethod: 'CASH', amount: 100_000, count: 1 },
    ]);
  });
});

describe('aggregateByMerchant (PRD 8.6, T13)', () => {
  it('merges different spellings of the same place into one row (6.16, E12)', () => {
    const rows = aggregateByMerchant([
      expense({ amount: 100_000, merchant: 'Bakmi GM', occurredOn: '2026-09-01' }),
      expense({ amount: 120_000, merchant: 'bakmi gm', occurredOn: '2026-09-08' }),
      expense({ amount: 200_000, merchant: 'Bakmi-GM', occurredOn: '2026-09-15' }),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ merchantKey: 'bakmigm', amount: 420_000, count: 3 });
  });

  it('displays the spelling from the most recent expense (6.16)', () => {
    const rows = aggregateByMerchant([
      expense({ amount: 100_000, merchant: 'bakmi gm', occurredOn: '2026-09-01' }),
      expense({ amount: 100_000, merchant: 'Bakmi GM', occurredOn: '2026-09-19' }),
      expense({ amount: 100_000, merchant: 'BAKMI-GM', occurredOn: '2026-09-10' }),
    ]);

    expect(rows[0].displayName).toBe('Bakmi GM');
  });

  it('computes avgAmount as FLOOR(amount / count)', () => {
    const rows = aggregateByMerchant([
      expense({ amount: 100_001, merchant: 'Loewy' }),
      expense({ amount: 100_000, merchant: 'Loewy' }),
    ]);

    expect(rows[0].amount).toBe(200_001);
    expect(rows[0].avgAmount).toBe(100_000);
  });

  it('separates a frequent cheap place from a one-off expensive one', () => {
    const rows = aggregateByMerchant([
      ...Array.from({ length: 10 }, () => expense({ amount: 40_000, merchant: 'Warung Tegal' })),
      expense({ amount: 350_000, merchant: 'Loewy' }),
    ]);

    const warteg = rows.find((row) => row.merchantKey === 'warungtegal');
    const loewy = rows.find((row) => row.merchantKey === 'loewy');

    // Warteg costs more in total, but Loewy is the place that is actually expensive.
    expect(warteg?.amount).toBe(400_000);
    expect(warteg?.avgAmount).toBe(40_000);
    expect(loewy?.avgAmount).toBe(350_000);
    expect(rows[0].merchantKey).toBe('warungtegal');
  });

  it('reports the modal category, or null when tied', () => {
    const tied = aggregateByMerchant([
      expense({ amount: 50_000, merchant: 'Bakmi GM', category: MAKAN }),
      expense({ amount: 50_000, merchant: 'Bakmi GM', category: NGOPI }),
    ]);
    expect(tied[0].categoryName).toBeNull();

    const clear = aggregateByMerchant([
      expense({ amount: 50_000, merchant: 'Bakmi GM', category: MAKAN }),
      expense({ amount: 50_000, merchant: 'Bakmi GM', category: MAKAN }),
      expense({ amount: 50_000, merchant: 'Bakmi GM', category: NGOPI }),
    ]);
    expect(clear[0].categoryName).toBe('Makan');
  });

  it('pins expenses without a place to the bottom whatever the amount (6.18)', () => {
    const rows = aggregateByMerchant([
      expense({ amount: 5_000_000 }), // no merchant, by far the largest
      expense({ amount: 10_000, merchant: 'Bakmi GM' }),
    ]);

    expect(rows[rows.length - 1]).toMatchObject({
      merchantKey: null,
      displayName: NO_MERCHANT_LABEL,
      amount: 5_000_000,
    });
    expect(rows[0].merchantKey).toBe('bakmigm');
  });

  it('caps the list at 10 entries, keeping the highest spenders', () => {
    const rows = aggregateByMerchant(
      Array.from({ length: 15 }, (_, index) =>
        expense({ amount: (index + 1) * 10_000, merchant: `Tempat ${index + 1}` }),
      ),
    );

    expect(rows).toHaveLength(MERCHANT_LIMIT);
    expect(rows[0].displayName).toBe('Tempat 15');
    expect(rows[rows.length - 1].displayName).toBe('Tempat 6');
  });

  it('keeps the no-place row when the list is full', () => {
    const rows = aggregateByMerchant([
      ...Array.from({ length: 15 }, (_, index) =>
        expense({ amount: (index + 1) * 10_000, merchant: `Tempat ${index + 1}` }),
      ),
      expense({ amount: 1_000 }),
    ]);

    expect(rows).toHaveLength(MERCHANT_LIMIT);
    expect(rows.filter((row) => row.merchantKey !== null)).toHaveLength(MERCHANT_LIMIT - 1);
    expect(rows[rows.length - 1].merchantKey).toBeNull();
  });

  it('shares always sum to 1 when every expense is counted', () => {
    const rows = aggregateByMerchant([
      expense({ amount: 250_000, merchant: 'Bakmi GM' }),
      expense({ amount: 250_000, merchant: 'Loewy' }),
      expense({ amount: 500_000, merchant: 'Kopi Kenangan' }),
    ]);

    expect(rows.reduce((sum, row) => sum + row.share, 0)).toBeCloseTo(1, 4);
  });
});

describe('topExpenses', () => {
  it('returns the five biggest expenses, largest first', () => {
    const rows = topExpenses(
      Array.from({ length: 8 }, (_, index) =>
        expense({ amount: (index + 1) * 10_000, merchant: `Tempat ${index + 1}`, category: MAKAN }),
      ),
    );

    expect(rows).toHaveLength(5);
    expect(rows.map((row) => row.amount)).toEqual([80_000, 70_000, 60_000, 50_000, 40_000]);
    expect(rows[0].categoryName).toBe('Makan');
  });

  it('handles fewer expenses than the limit', () => {
    expect(topExpenses([expense({ amount: 1_000 })])).toHaveLength(1);
    expect(topExpenses([])).toEqual([]);
  });
});
