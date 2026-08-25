/**
 * Integer rupiah helpers (PRD sections 0, 7.1, 11).
 *
 * Every amount in this application is a whole-rupiah signed 32-bit integer. There is no
 * floating point anywhere on a money path: a budget split that does not divide evenly
 * keeps its remainder as an explicit integer instead of losing it to rounding.
 */

/** MySQL signed INT bounds -- the storage limit for every money column. */
export const MONEY_MIN = -2147483648;
export const MONEY_MAX = 2147483647;

export function isMoney(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= MONEY_MIN &&
    value <= MONEY_MAX
  );
}

/** Throws when a value is not a storable whole-rupiah integer. */
export function assertMoney(value: unknown, label = 'amount'): number {
  if (!isMoney(value)) {
    throw new TypeError(`${label} must be a whole-rupiah integer within INT range, got ${String(value)}`);
  }
  return value;
}

/**
 * Floor division that keeps the remainder visible.
 *
 * `Math.floor` (not truncation) is required by PRD 4.3 so the behaviour stays consistent
 * for negative numerators, and `remainder` is what section 4.3 calls
 * `rounding_remainder` -- money that must be carried, never dropped.
 */
export function floorDivide(total: number, divisor: number): { quotient: number; remainder: number } {
  if (!Number.isInteger(divisor) || divisor === 0) {
    throw new TypeError(`divisor must be a non-zero integer, got ${String(divisor)}`);
  }
  const quotient = Math.floor(total / divisor);
  return { quotient, remainder: total - quotient * divisor };
}

/** Sums whole-rupiah amounts, staying in integer space throughout. */
export function sumMoney(amounts: readonly number[]): number {
  return amounts.reduce((total, amount) => total + amount, 0);
}
