import { assertMoney, floorDivide, isMoney, MONEY_MAX, MONEY_MIN, sumMoney } from './money';

describe('money helpers', () => {
  it('accepts whole rupiah inside INT range', () => {
    expect(isMoney(0)).toBe(true);
    expect(isMoney(2_000_000)).toBe(true);
    expect(isMoney(-100_000)).toBe(true);
    expect(isMoney(MONEY_MAX)).toBe(true);
    expect(isMoney(MONEY_MIN)).toBe(true);
  });

  it('rejects fractions, out-of-range values and non-numbers', () => {
    expect(isMoney(100.5)).toBe(false);
    expect(isMoney(MONEY_MAX + 1)).toBe(false);
    expect(isMoney(Number.NaN)).toBe(false);
    expect(isMoney('100000')).toBe(false);
  });

  it('assertMoney returns the value or throws', () => {
    expect(assertMoney(1)).toBe(1);
    expect(() => assertMoney(1.5, 'amount')).toThrow(/amount/);
  });

  it('floorDivide keeps the remainder instead of losing it', () => {
    expect(floorDivide(2_000_000, 20)).toEqual({ quotient: 100_000, remainder: 0 });
    // PRD 5.3 Fixture C
    expect(floorDivide(2_000_000, 21)).toEqual({ quotient: 95_238, remainder: 2 });
  });

  it('floorDivide floors towards negative infinity for negative totals', () => {
    expect(floorDivide(-7, 2)).toEqual({ quotient: -4, remainder: 1 });
  });

  it('floorDivide refuses a zero divisor', () => {
    expect(() => floorDivide(100, 0)).toThrow();
  });

  it('quotient * divisor + remainder always reconstructs the total', () => {
    for (let total = 0; total < 5000; total += 37) {
      for (const divisor of [1, 3, 7, 20, 21, 22, 23]) {
        const { quotient, remainder } = floorDivide(total, divisor);
        expect(quotient * divisor + remainder).toBe(total);
      }
    }
  });

  it('sums to an integer', () => {
    expect(sumMoney([100_000, 250_000, -50_000])).toBe(300_000);
    expect(sumMoney([])).toBe(0);
  });
});
