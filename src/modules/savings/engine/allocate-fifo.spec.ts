import { AllocatableAdvance, allocateFifo } from './allocate-fifo';

const advance = (
  id: number,
  occurredOn: string,
  amount: number,
  returnedAmount = 0,
): AllocatableAdvance => ({ id, occurredOn, amount, returnedAmount });

describe('allocateFifo (PRD v2 5.4)', () => {
  // S8
  it('fills the oldest debts first and part-fills the last one', () => {
    const result = allocateFifo(1_000_000, [
      advance(1, '2026-06-01', 400_000),
      advance(2, '2026-07-01', 300_000),
      advance(3, '2026-08-01', 500_000),
    ]);

    expect(result.allocations).toEqual([
      { withdrawalId: 1, amount: 400_000 },
      { withdrawalId: 2, amount: 300_000 },
      { withdrawalId: 3, amount: 300_000 },
    ]);
    expect(result.repaid).toBe(1_000_000);
    expect(result.fresh).toBe(0);
  });

  it('hands back the leftover as fresh contribution', () => {
    const result = allocateFifo(2_000_000, [advance(1, '2026-06-01', 600_000)]);

    expect(result.allocations).toEqual([{ withdrawalId: 1, amount: 600_000 }]);
    expect(result.repaid).toBe(600_000);
    // The number the deposit toast leads with (section 11.3).
    expect(result.fresh).toBe(1_400_000);
  });

  it('counts a deposit with nothing to repay as entirely fresh', () => {
    const result = allocateFifo(750_000, []);

    expect(result.allocations).toEqual([]);
    expect(result.repaid).toBe(0);
    expect(result.fresh).toBe(750_000);
  });

  it('only allocates what is still owed on a part-repaid advance', () => {
    const result = allocateFifo(1_000_000, [advance(1, '2026-06-01', 800_000, 500_000)]);

    expect(result.allocations).toEqual([{ withdrawalId: 1, amount: 300_000 }]);
    expect(result.fresh).toBe(700_000);
  });

  it('skips advances that are already settled', () => {
    const result = allocateFifo(500_000, [
      advance(1, '2026-06-01', 400_000, 400_000),
      advance(2, '2026-07-01', 200_000),
    ]);

    expect(result.allocations).toEqual([{ withdrawalId: 2, amount: 200_000 }]);
  });

  it('works oldest first regardless of the order it is handed', () => {
    const shuffled = [
      advance(3, '2026-08-01', 500_000),
      advance(1, '2026-06-01', 400_000),
      advance(2, '2026-07-01', 300_000),
    ];

    expect(allocateFifo(500_000, shuffled).allocations).toEqual([
      { withdrawalId: 1, amount: 400_000 },
      { withdrawalId: 2, amount: 100_000 },
    ]);
  });

  /** Same day, same amounts: the result still has to be one fixed answer. */
  it('breaks a same-day tie by id so the allocation is deterministic', () => {
    const sameDay = [advance(9, '2026-06-01', 100_000), advance(4, '2026-06-01', 100_000)];

    expect(allocateFifo(100_000, sameDay).allocations).toEqual([
      { withdrawalId: 4, amount: 100_000 },
    ]);
  });
});
