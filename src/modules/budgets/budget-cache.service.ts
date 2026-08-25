import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';

type PrismaLike = PrismaService | Prisma.TransactionClient;

/**
 * Invalidation of the `carry_out_cached` column (PRD 4.7, Appendix A).
 *
 * carryOut is a chain: changing anything in month M changes M and every month after it.
 * So invalidation is always "this period and everything later", never a single row. The
 * cache is an optimisation only -- a NULL simply means "recompute", never "zero".
 */
@Injectable()
export class BudgetCacheService {
  constructor(private readonly prisma: PrismaService) {}

  /** Clears the cache for `period` and every later period. */
  async invalidateFrom(userId: number, period: string, client: PrismaLike = this.prisma): Promise<void> {
    await client.monthlyBudget.updateMany({
      where: { userId, period: { gte: period } },
      data: { carryOutCached: null },
    });
  }

  /**
   * Clears from the earliest of several periods.
   *
   * Used when an expense moves between months (PRD 6.6): both the old and the new period
   * are affected, and invalidating from the earlier of the two covers everything between.
   */
  async invalidateFromEarliest(
    userId: number,
    periods: readonly string[],
    client: PrismaLike = this.prisma,
  ): Promise<void> {
    const candidates = periods.filter((period): period is string => Boolean(period));
    if (candidates.length === 0) return;

    // 'YYYY-MM' sorts correctly as a plain string.
    await this.invalidateFrom(userId, [...candidates].sort()[0], client);
  }
}
