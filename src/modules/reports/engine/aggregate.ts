import { sumMoney } from '@/common/utils/money';

/**
 * Report aggregations (PRD section 8.6).
 *
 * Kept as pure functions next to the engine so the "where does the money actually go"
 * numbers -- goal G1 -- are unit-testable without a database.
 */

export interface AggregatableCategory {
  id: number;
  name: string;
  color: string;
}

export interface AggregatableExpense {
  id: number;
  spentOn: string;
  amount: number;
  /** Verbatim as typed; this is what gets displayed. */
  merchant: string | null;
  /** normalizeMerchant(merchant); the only key used for grouping. */
  merchantKey: string | null;
  paymentMethod: string;
  note: string | null;
  category: AggregatableCategory | null;
}

export interface CategoryBreakdown {
  categoryId: number | null;
  name: string;
  color: string;
  amount: number;
  share: number;
  count: number;
}

export interface PaymentMethodBreakdown {
  paymentMethod: string;
  amount: number;
  count: number;
}

export interface MerchantBreakdown {
  merchantKey: string | null;
  displayName: string;
  amount: number;
  count: number;
  /** FLOOR(amount / count) -- the column that answers "is this place expensive?". */
  avgAmount: number;
  share: number;
  categoryName: string | null;
}

export interface TopExpense {
  id: number;
  spentOn: string;
  amount: number;
  merchant: string | null;
  categoryName: string | null;
  note: string | null;
}

/** Label for expenses with no category, mirroring the "Tanpa tempat" rule in 6.18. */
export const UNCATEGORISED_LABEL = 'Tanpa kategori';
export const UNCATEGORISED_COLOR = '#858499';
export const NO_MERCHANT_LABEL = 'Tanpa tempat';

/** Max entries in byMerchant (PRD 8.6). */
export const MERCHANT_LIMIT = 10;
/** Number of biggest expenses returned (PRD 8.6). */
export const TOP_EXPENSE_LIMIT = 5;

/** A ratio, not money, so a float is fine here; rounded to 4dp like the PRD's samples. */
function shareOf(amount: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((amount / total) * 10_000) / 10_000;
}

function groupBy<T, K>(items: readonly T[], keyOf: (item: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const bucket = groups.get(key);
    if (bucket) bucket.push(item);
    else groups.set(key, [item]);
  }
  return groups;
}

/**
 * Spend per category, biggest first. Uncategorised expenses collapse into a single
 * `categoryId: null` entry that always sorts last, the same way "Tanpa tempat" does.
 */
export function aggregateByCategory(expenses: readonly AggregatableExpense[]): CategoryBreakdown[] {
  const total = sumMoney(expenses.map((expense) => expense.amount));
  const groups = groupBy(expenses, (expense) => expense.category?.id ?? null);

  const rows: CategoryBreakdown[] = [...groups.entries()].map(([categoryId, group]) => {
    const amount = sumMoney(group.map((expense) => expense.amount));
    const category = group.find((expense) => expense.category)?.category ?? null;

    return {
      categoryId,
      name: category?.name ?? UNCATEGORISED_LABEL,
      color: category?.color ?? UNCATEGORISED_COLOR,
      amount,
      share: shareOf(amount, total),
      count: group.length,
    };
  });

  return sortWithNullLast(rows, (row) => row.categoryId, (row) => row.amount, (row) => row.name);
}

/** Spend per payment method, biggest first. */
export function aggregateByPaymentMethod(
  expenses: readonly AggregatableExpense[],
): PaymentMethodBreakdown[] {
  const groups = groupBy(expenses, (expense) => expense.paymentMethod);

  return [...groups.entries()]
    .map(([paymentMethod, group]) => ({
      paymentMethod,
      amount: sumMoney(group.map((expense) => expense.amount)),
      count: group.length,
    }))
    .sort((a, b) => b.amount - a.amount || a.paymentMethod.localeCompare(b.paymentMethod));
}

/**
 * The "tempat paling nguras" ranking (PRD 8.6, 6.16, 6.18).
 *
 * Grouping is by `merchantKey` only, so "Bakmi GM", "bakmi gm" and "Bakmi-GM" are one
 * place. The displayed name is the spelling from the most recent expense -- the last one
 * the user typed wins. Expenses with no place collapse into one entry that always sits
 * at the bottom regardless of amount, and when the list is full that entry keeps its slot
 * rather than being truncated away.
 */
export function aggregateByMerchant(
  expenses: readonly AggregatableExpense[],
  limit = MERCHANT_LIMIT,
): MerchantBreakdown[] {
  const total = sumMoney(expenses.map((expense) => expense.amount));
  const groups = groupBy(expenses, (expense) => expense.merchantKey ?? null);

  const rows: MerchantBreakdown[] = [...groups.entries()].map(([merchantKey, group]) => {
    const amount = sumMoney(group.map((expense) => expense.amount));
    const count = group.length;

    return {
      merchantKey,
      displayName: merchantKey === null ? NO_MERCHANT_LABEL : latestSpelling(group),
      amount,
      count,
      avgAmount: Math.floor(amount / count),
      share: shareOf(amount, total),
      categoryName: modalCategoryName(group),
    };
  });

  const named = rows
    .filter((row) => row.merchantKey !== null)
    .sort((a, b) => b.amount - a.amount || b.count - a.count || a.displayName.localeCompare(b.displayName));
  const unnamed = rows.filter((row) => row.merchantKey === null);

  // The "no place" row keeps its slot, so a full list shows 9 places plus that row.
  const namedSlots = Math.max(0, limit - unnamed.length);
  return [...named.slice(0, namedSlots), ...unnamed];
}

/** The n largest expenses of the period. */
export function topExpenses(
  expenses: readonly AggregatableExpense[],
  limit = TOP_EXPENSE_LIMIT,
): TopExpense[] {
  return [...expenses]
    .sort((a, b) => b.amount - a.amount || b.spentOn.localeCompare(a.spentOn) || b.id - a.id)
    .slice(0, limit)
    .map((expense) => ({
      id: expense.id,
      spentOn: expense.spentOn,
      amount: expense.amount,
      merchant: expense.merchant,
      categoryName: expense.category?.name ?? null,
      note: expense.note,
    }));
}

/** The spelling from the most recent expense in the group (PRD 6.16). */
function latestSpelling(group: readonly AggregatableExpense[]): string {
  const latest = [...group].sort(
    (a, b) => b.spentOn.localeCompare(a.spentOn) || b.id - a.id,
  )[0];
  return latest.merchant ?? NO_MERCHANT_LABEL;
}

/** The most frequently used category for a place; null when there is a tie or none. */
function modalCategoryName(group: readonly AggregatableExpense[]): string | null {
  const counts = new Map<string, number>();
  for (const expense of group) {
    if (!expense.category) continue;
    counts.set(expense.category.name, (counts.get(expense.category.name) ?? 0) + 1);
  }

  if (counts.size === 0) return null;

  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  if (ranked.length > 1 && ranked[0][1] === ranked[1][1]) return null;
  return ranked[0][0];
}

/** Sorts by amount descending while pinning the `null`-keyed row to the bottom. */
function sortWithNullLast<T>(
  rows: T[],
  keyOf: (row: T) => unknown,
  amountOf: (row: T) => number,
  nameOf: (row: T) => string,
): T[] {
  return rows.sort((a, b) => {
    const aNull = keyOf(a) === null;
    const bNull = keyOf(b) === null;
    if (aNull !== bNull) return aNull ? 1 : -1;
    return amountOf(b) - amountOf(a) || nameOf(a).localeCompare(nameOf(b));
  });
}
