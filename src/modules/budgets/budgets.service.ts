import { Injectable } from '@nestjs/common';
import { MonthlyBudget } from '@prisma/client';
import { AppException } from '@/common/errors';
import { PrismaService } from '@/prisma/prisma.service';
import { BudgetCacheService } from './budget-cache.service';
import { UpsertBudgetDto } from './dto/upsert-budget.dto';

@Injectable()
export class BudgetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: BudgetCacheService,
  ) {}

  /**
   * Creates or replaces the budget for a month (PRD 8.3).
   *
   * Setting a budget mid-month is allowed and applies to the whole month, including
   * expenses already recorded (PRD 6.4), and changing it after the fact is allowed too
   * (PRD 6.7) -- both simply invalidate the carry-over chain from here on.
   */
  async upsert(
    userId: number,
    walletId: number,
    period: string,
    dto: UpsertBudgetDto,
  ): Promise<MonthlyBudget> {
    return this.prisma.$transaction(async (tx) => {
      const budget = await tx.monthlyBudget.upsert({
        where: { walletId_period: { walletId, period } },
        create: { userId, walletId, period, amount: dto.amount, note: dto.note ?? null },
        update: {
          amount: dto.amount,
          ...(dto.note !== undefined ? { note: dto.note } : {}),
          carryOutCached: null,
        },
      });

      await this.cache.invalidateFrom(walletId, period, tx);
      return budget;
    });
  }

  async findOne(walletId: number, period: string): Promise<MonthlyBudget> {
    const budget = await this.prisma.monthlyBudget.findUnique({
      where: { walletId_period: { walletId, period } },
    });

    if (!budget) {
      throw AppException.notFound(`no budget set for ${period}`);
    }

    return budget;
  }

  findOptional(walletId: number, period: string): Promise<MonthlyBudget | null> {
    return this.prisma.monthlyBudget.findUnique({
      where: { walletId_period: { walletId, period } },
    });
  }

  async list(walletId: number, limit: number, offset: number): Promise<{ items: MonthlyBudget[]; total: number }> {
    const [items, total] = await Promise.all([
      this.prisma.monthlyBudget.findMany({
        where: { walletId },
        orderBy: { period: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.monthlyBudget.count({ where: { walletId } }),
    ]);

    return { items, total };
  }

  /** Removes the budget for a month. Expenses in that month are untouched (PRD 8.3). */
  async remove(walletId: number, period: string): Promise<void> {
    await this.findOne(walletId, period);

    await this.prisma.$transaction(async (tx) => {
      await tx.monthlyBudget.delete({ where: { walletId_period: { walletId, period } } });
      // The month drops out of the carry-over chain entirely (PRD 4.5), so everything
      // from here on has to be recomputed.
      await this.cache.invalidateFrom(walletId, period, tx);
    });
  }

  /**
   * The latest period that has a budget and falls before `period`.
   *
   * Months with no budget are skipped rather than treated as zero, so a gap month passes
   * the carry-over through untouched (PRD 4.5).
   */
  findPreviousBudgetPeriod(walletId: number, period: string): Promise<MonthlyBudget | null> {
    return this.prisma.monthlyBudget.findFirst({
      where: { walletId, period: { lt: period } },
      orderBy: { period: 'desc' },
    });
  }

  async cacheCarryOut(budgetId: number, carryOut: number): Promise<void> {
    await this.prisma.monthlyBudget.update({
      where: { id: budgetId },
      data: { carryOutCached: carryOut },
    });
  }
}
