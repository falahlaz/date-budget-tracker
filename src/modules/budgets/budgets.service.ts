import { Injectable } from '@nestjs/common';
import { MonthlyBudget } from '@prisma/client';
import { AppException } from '@/common/errors';
import { PrismaService } from '@/prisma/prisma.service';
import { WalletsService } from '@/modules/wallets/wallets.service';
import { BudgetCacheService } from './budget-cache.service';
import { UpsertBudgetDto } from './dto/upsert-budget.dto';

@Injectable()
export class BudgetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: BudgetCacheService,
    private readonly wallets: WalletsService,
  ) {}

  /**
   * Budgets are keyed on a wallet from v2 on (section 9.1), but these endpoints do not
   * name one until M12 moves them under /api/wallets/:walletId. Until then every budget
   * belongs to the default wallet, which is the one the migration created.
   */
  private walletIdFor(userId: number): Promise<number> {
    return this.wallets.findDefaultId(userId);
  }

  /**
   * Creates or replaces the budget for a month (PRD 8.3).
   *
   * Setting a budget mid-month is allowed and applies to the whole month, including
   * expenses already recorded (PRD 6.4), and changing it after the fact is allowed too
   * (PRD 6.7) -- both simply invalidate the carry-over chain from here on.
   */
  async upsert(userId: number, period: string, dto: UpsertBudgetDto): Promise<MonthlyBudget> {
    const walletId = await this.walletIdFor(userId);

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

      await this.cache.invalidateFrom(userId, period, tx);
      return budget;
    });
  }

  async findOne(userId: number, period: string): Promise<MonthlyBudget> {
    const budget = await this.prisma.monthlyBudget.findUnique({
      where: { walletId_period: { walletId: await this.walletIdFor(userId), period } },
    });

    if (!budget) {
      throw AppException.notFound(`no budget set for ${period}`);
    }

    return budget;
  }

  async findOptional(userId: number, period: string): Promise<MonthlyBudget | null> {
    return this.prisma.monthlyBudget.findUnique({
      where: { walletId_period: { walletId: await this.walletIdFor(userId), period } },
    });
  }

  async list(userId: number, limit: number, offset: number): Promise<{ items: MonthlyBudget[]; total: number }> {
    const [items, total] = await Promise.all([
      this.prisma.monthlyBudget.findMany({
        where: { userId },
        orderBy: { period: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.monthlyBudget.count({ where: { userId } }),
    ]);

    return { items, total };
  }

  /** Removes the budget for a month. Expenses in that month are untouched (PRD 8.3). */
  async remove(userId: number, period: string): Promise<void> {
    await this.findOne(userId, period);
    // Resolved before the transaction opens: a query issued inside the callback but off
    // `this.prisma` runs on a second connection while the first one is held open.
    const walletId = await this.walletIdFor(userId);

    await this.prisma.$transaction(async (tx) => {
      await tx.monthlyBudget.delete({
        where: { walletId_period: { walletId, period } },
      });
      // The month drops out of the carry-over chain entirely (PRD 4.5), so everything
      // from here on has to be recomputed.
      await this.cache.invalidateFrom(userId, period, tx);
    });
  }

  /**
   * The latest period that has a budget and falls before `period`.
   *
   * Months with no budget are skipped rather than treated as zero, so a gap month passes
   * the carry-over through untouched (PRD 4.5).
   */
  findPreviousBudgetPeriod(userId: number, period: string): Promise<MonthlyBudget | null> {
    return this.prisma.monthlyBudget.findFirst({
      where: { userId, period: { lt: period } },
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
