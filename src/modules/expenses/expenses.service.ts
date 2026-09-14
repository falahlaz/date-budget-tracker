import { Injectable } from '@nestjs/common';
import { Direction, PaymentMethod, Prisma, Transaction, TransactionKind } from '@prisma/client';
import { ClockService } from '@/common/clock/clock.service';
import { AppException } from '@/common/errors';
import { fromDateOnly, toDateOnly } from '@/common/utils/date-only';
import { normalizeMerchant } from '@/common/utils/merchant';
import { PrismaService } from '@/prisma/prisma.service';
import { BudgetCacheService } from '@/modules/budgets/budget-cache.service';
import { WalletsService } from '@/modules/wallets/wallets.service';
import {
  buildWeekSegments,
  dayTypeOf,
  eachDateInRange,
  firstDayOfPeriod,
  isDateString,
  lastDayOfPeriod,
  periodOf,
} from '@/modules/reports/engine/calendar';
import { CreateExpenseDto } from './dto/create-expense.dto';
import {
  DEFAULT_EXPENSE_LIMIT,
  DEFAULT_EXPENSE_SORT,
  MAX_EXPENSE_LIMIT,
  QueryExpensesDto,
  QueryMerchantsDto,
} from './dto/query-expenses.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { ExpenseWithRelations } from './expense.mapper';

export interface MerchantSuggestion {
  merchantKey: string;
  displayName: string;
  lastCategoryId: number | null;
  lastPaymentMethod: PaymentMethod;
  usageCount: number;
  lastSpentOn: string;
}

/**
 * Sort keys a client may ask for, mapped to the column that answers them.
 *
 * v2 renamed `spent_on` to `occurred_on`, but the query parameter is part of the API and
 * does not move until M12. The two names being different is exactly why this is a map and
 * not a set -- passing the client's spelling straight to Prisma would look fine and throw
 * at runtime.
 */
const SORTABLE_FIELDS = new Map<string, string>([
  ['spentOn', 'occurredOn'],
  ['occurredOn', 'occurredOn'],
  ['amount', 'amount'],
  ['createdAt', 'createdAt'],
  ['id', 'id'],
]);
/** A dayType filter is resolved to an explicit date list, so the range must stay bounded. */
const MAX_DAY_TYPE_RANGE_DAYS = 400;

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
    private readonly cache: BudgetCacheService,
    private readonly wallets: WalletsService,
  ) {}

  async create(userId: number, dto: CreateExpenseDto): Promise<ExpenseWithRelations> {
    const spentOn = this.assertUsableDate(dto.spentOn);
    await this.assertCategoryOwned(userId, dto.categoryId ?? null);

    const merchant = this.cleanMerchant(dto.merchant);
    // This endpoint never names a wallet, so it means the default one (PRD v2 section 4.2).
    // Choosing the wallet here rather than in the controller keeps the API unchanged in
    // M10; taking `walletId` from the request is M12.
    const walletId = await this.wallets.findDefaultId(userId);

    return this.prisma.$transaction(async (tx) => {
      const expense = await tx.transaction.create({
        data: {
          userId,
          walletId,
          kind: TransactionKind.SPEND,
          direction: Direction.OUT,
          categoryId: dto.categoryId ?? null,
          occurredOn: toDateOnly(spentOn),
          amount: dto.amount,
          merchant: merchant.value,
          // Always derived here; a client-supplied merchantKey never reaches this point.
          merchantKey: merchant.key,
          paymentMethod: dto.paymentMethod ?? PaymentMethod.CASH,
          note: dto.note ?? null,
        },
        include: { category: true, receipts: true },
      });

      await this.cache.invalidateFrom(userId, periodOf(spentOn), tx);
      return expense;
    });
  }

  async findOne(userId: number, id: number): Promise<ExpenseWithRelations> {
    const expense = await this.prisma.transaction.findFirst({
      where: { id, userId, deletedAt: null },
      include: { category: true, receipts: { where: { deletedAt: null } } },
    });

    if (!expense) {
      throw AppException.notFound(`expense ${id} not found`);
    }

    return expense;
  }

  /**
   * Partial update (PRD 8.4).
   *
   * Moving an expense to another month makes both months and everything after the earlier
   * of them stale, so the carry-over cache is invalidated from the earlier period (PRD 6.6).
   */
  async update(userId: number, id: number, dto: UpdateExpenseDto): Promise<ExpenseWithRelations> {
    const existing = await this.findOne(userId, id);
    const previousPeriod = periodOf(fromDateOnly(existing.occurredOn));

    const data: Prisma.TransactionUpdateInput = {};
    let nextPeriod = previousPeriod;

    if (dto.spentOn !== undefined) {
      const spentOn = this.assertUsableDate(dto.spentOn);
      data.occurredOn = toDateOnly(spentOn);
      nextPeriod = periodOf(spentOn);
    }

    if (dto.amount !== undefined) data.amount = dto.amount;
    if (dto.paymentMethod !== undefined) data.paymentMethod = dto.paymentMethod;
    if (dto.note !== undefined) data.note = dto.note;

    if (dto.categoryId !== undefined) {
      await this.assertCategoryOwned(userId, dto.categoryId);
      data.category = dto.categoryId === null ? { disconnect: true } : { connect: { id: dto.categoryId } };
    }

    if (dto.merchant !== undefined) {
      // Re-deriving the key is mandatory whenever the name changes (PRD 7.3). Only this
      // row changes: renaming one expense never rewrites others sharing the key (PRD 6.17).
      const merchant = this.cleanMerchant(dto.merchant);
      data.merchant = merchant.value;
      data.merchantKey = merchant.key;
    }

    return this.prisma.$transaction(async (tx) => {
      const expense = await tx.transaction.update({
        where: { id },
        data,
        include: { category: true, receipts: { where: { deletedAt: null } } },
      });

      await this.cache.invalidateFromEarliest(userId, [previousPeriod, nextPeriod], tx);
      return expense;
    });
  }

  /** Soft delete: the row stays for audit but leaves every list and every calculation. */
  async remove(userId: number, id: number): Promise<void> {
    const existing = await this.findOne(userId, id);
    const period = periodOf(fromDateOnly(existing.occurredOn));

    await this.prisma.$transaction(async (tx) => {
      await tx.transaction.update({ where: { id }, data: { deletedAt: new Date() } });
      await this.cache.invalidateFrom(userId, period, tx);
    });
  }

  async list(
    userId: number,
    query: QueryExpensesDto,
  ): Promise<{ items: ExpenseWithRelations[]; total: number; sumAmount: number }> {
    const where = this.buildWhere(userId, query);
    const take = Math.min(query.limit ?? DEFAULT_EXPENSE_LIMIT, MAX_EXPENSE_LIMIT);
    const skip = query.offset ?? 0;

    const [items, total, sum] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        include: { category: true, receipts: { where: { deletedAt: null } } },
        orderBy: this.buildOrderBy(query.sort),
        take,
        skip,
      }),
      this.prisma.transaction.count({ where }),
      this.prisma.transaction.aggregate({ where, _sum: { amount: true } }),
    ]);

    return { items, total, sumAmount: sum._sum.amount ?? 0 };
  }

  /**
   * Autocomplete for the place field (PRD 8.4).
   *
   * The query is normalised with the same function that produced the stored keys, so
   * typing "bakmi g" matches a row saved as "Bakmi G.M.". Results carry the last category
   * and payment method used at that place, which is what lets the client pre-fill the rest
   * of the form -- adding this field makes the form faster, not slower.
   */
  async suggestMerchants(userId: number, query: QueryMerchantsDto): Promise<MerchantSuggestion[]> {
    const limit = query.limit ?? 10;
    const key = normalizeMerchant(query.q);

    const where: Prisma.TransactionWhereInput = {
      userId,
      deletedAt: null,
      merchantKey: key ? { contains: key } : { not: null },
    };

    const groups = await this.prisma.transaction.groupBy({
      by: ['merchantKey'],
      where,
      _count: { _all: true },
      _max: { occurredOn: true },
      orderBy: [{ _count: { merchantKey: 'desc' } }, { _max: { occurredOn: 'desc' } }],
      take: limit,
    });

    const keys = groups
      .map((group) => group.merchantKey)
      .filter((value): value is string => value !== null);

    if (keys.length === 0) return [];

    // One extra query for the newest row per key; the spelling last typed wins (PRD 6.16).
    const recent = await this.prisma.transaction.findMany({
      where: { userId, deletedAt: null, merchantKey: { in: keys } },
      orderBy: [{ occurredOn: 'desc' }, { id: 'desc' }],
      select: {
        merchantKey: true,
        merchant: true,
        categoryId: true,
        paymentMethod: true,
        occurredOn: true,
      },
    });

    const latestByKey = new Map<string, (typeof recent)[number]>();
    for (const row of recent) {
      if (row.merchantKey && !latestByKey.has(row.merchantKey)) {
        latestByKey.set(row.merchantKey, row);
      }
    }

    return groups.flatMap((group) => {
      const merchantKey = group.merchantKey;
      if (!merchantKey) return [];
      const latest = latestByKey.get(merchantKey);
      if (!latest) return [];

      return [
        {
          merchantKey,
          displayName: latest.merchant ?? merchantKey,
          lastCategoryId: latest.categoryId,
          lastPaymentMethod: latest.paymentMethod,
          usageCount: group._count._all,
          lastSpentOn: fromDateOnly(group._max.occurredOn ?? latest.occurredOn),
        },
      ];
    });
  }

  /** Loads full rows for a period, for the report aggregations. */
  loadForPeriod(userId: number, period: string): Promise<ExpenseWithRelations[]> {
    return this.prisma.transaction.findMany({
      where: {
        userId,
        deletedAt: null,
        occurredOn: {
          gte: toDateOnly(firstDayOfPeriod(period)),
          lte: toDateOnly(lastDayOfPeriod(period)),
        },
      },
      include: { category: true },
      orderBy: [{ occurredOn: 'asc' }, { id: 'asc' }],
    });
  }

  /** Rejects impossible dates and anything in the future (PRD 6.9). */
  private assertUsableDate(value: string): string {
    if (!isDateString(value)) {
      throw AppException.validation(`spentOn must be a real calendar date, got "${value}"`, [
        { field: 'spentOn', constraint: 'format' },
      ]);
    }

    const today = this.clock.today();
    if (value > today) {
      throw AppException.validation(`spentOn must not be in the future (today is ${today})`, [
        { field: 'spentOn', constraint: 'notInFuture' },
      ]);
    }

    return value;
  }

  private async assertCategoryOwned(userId: number, categoryId: number | null): Promise<void> {
    if (categoryId === null || categoryId === undefined) return;

    const category = await this.prisma.category.findFirst({
      where: { id: categoryId, userId },
      select: { id: true },
    });

    if (!category) {
      throw AppException.validation(`category ${categoryId} does not exist`, [
        { field: 'categoryId', constraint: 'exists' },
      ]);
    }
  }

  /** An empty or symbol-only name is stored as NULL in both columns, never as '' (PRD 6.15). */
  private cleanMerchant(raw: string | null | undefined): { value: string | null; key: string | null } {
    const key = normalizeMerchant(raw);
    if (key === null) return { value: null, key: null };
    return { value: (raw as string).trim(), key };
  }

  private buildWhere(userId: number, query: QueryExpensesDto): Prisma.TransactionWhereInput {
    const where: Prisma.TransactionWhereInput = { userId, deletedAt: null };
    const range = this.resolveRange(query);

    if (query.categoryId !== undefined) where.categoryId = query.categoryId;
    if (query.merchantKey) where.merchantKey = query.merchantKey;

    if (query.q) {
      where.OR = [{ merchant: { contains: query.q } }, { note: { contains: query.q } }];
    }

    if (query.dayType) {
      // MySQL cannot express "is a weekday" through Prisma's where clause, so the filter
      // is resolved to the concrete dates in range. That is why the range stays bounded.
      const dates = eachDateInRange(range.from, range.to).filter(
        (date) => dayTypeOf(date) === query.dayType,
      );
      where.occurredOn = { in: dates.map(toDateOnly) };
    } else {
      where.occurredOn = { gte: toDateOnly(range.from), lte: toDateOnly(range.to) };
    }

    return where;
  }

  /**
   * Works out the date window to query.
   *
   * `period` sets the window; `from`/`to` narrow it further; `weekIndex` narrows it to one
   * week segment. A `dayType` or `weekIndex` filter with no window at all falls back to the
   * current month rather than scanning all history.
   */
  private resolveRange(query: QueryExpensesDto): { from: string; to: string } {
    let from = '1970-01-01';
    let to = '2999-12-31';

    const needsBounds = Boolean(query.dayType || query.weekIndex);
    const period = query.period ?? (needsBounds && !query.from && !query.to ? this.clock.currentPeriod() : undefined);

    if (period) {
      from = firstDayOfPeriod(period);
      to = lastDayOfPeriod(period);
    }

    if (query.weekIndex !== undefined) {
      if (!period) {
        throw AppException.validation('weekIndex requires period', [
          { field: 'weekIndex', constraint: 'requiresPeriod' },
        ]);
      }

      const segment = buildWeekSegments(period).find((s) => s.weekIndex === query.weekIndex);
      if (!segment) {
        throw AppException.validation(`week ${query.weekIndex} does not exist in ${period}`, [
          { field: 'weekIndex', constraint: 'exists' },
        ]);
      }

      from = segment.startDate;
      to = segment.endDate;
    }

    if (query.from && query.from > from) from = query.from;
    if (query.to && query.to < to) to = query.to;

    if (from > to) {
      throw AppException.validation('the requested date range is empty', [
        { field: 'from', constraint: 'range' },
      ]);
    }

    if (query.dayType) {
      const days = eachDateInRange(from, to).length;
      if (days > MAX_DAY_TYPE_RANGE_DAYS) {
        throw AppException.validation(
          `a dayType filter needs a range of at most ${MAX_DAY_TYPE_RANGE_DAYS} days`,
          [{ field: 'dayType', constraint: 'rangeTooWide' }],
        );
      }
    }

    return { from, to };
  }

  /** Parses `field:dir,field:dir`, falling back to the documented default. */
  private buildOrderBy(sort?: string): Prisma.TransactionOrderByWithRelationInput[] {
    const parsed = (sort ?? DEFAULT_EXPENSE_SORT)
      .split(',')
      .map((token) => token.trim())
      .filter(Boolean)
      .flatMap((token) => {
        const [field, direction = 'desc'] = token.split(':');
        const column = SORTABLE_FIELDS.get(field);
        if (!column) return [];
        return [{ [column]: direction === 'asc' ? 'asc' : 'desc' } as Prisma.TransactionOrderByWithRelationInput];
      });

    return parsed.length > 0 ? parsed : [{ occurredOn: 'desc' }, { id: 'desc' }];
  }
}

export type { Transaction };
