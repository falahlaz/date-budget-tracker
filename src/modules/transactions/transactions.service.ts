import { Injectable } from '@nestjs/common';
import { Direction, PaymentMethod, Prisma, Transaction, TransactionKind } from '@prisma/client';
import { ClockService } from '@/common/clock/clock.service';
import { AppException } from '@/common/errors';
import { fromDateOnly, toDateOnly } from '@/common/utils/date-only';
import { normalizeMerchant } from '@/common/utils/merchant';
import { PrismaService } from '@/prisma/prisma.service';
import { BudgetCacheService } from '@/modules/budgets/budget-cache.service';
import { WalletsService } from '@/modules/wallets/wallets.service';
import { assertKindSuitsWallet, defaultKindFor, directionOf } from './transaction-kind';
import {
  buildWeekSegments,
  dayTypeOf,
  eachDateInRange,
  firstDayOfPeriod,
  isDateString,
  lastDayOfPeriod,
  periodOf,
} from '@/modules/reports/engine/calendar';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import {
  DEFAULT_TRANSACTION_LIMIT,
  DEFAULT_TRANSACTION_SORT,
  MAX_TRANSACTION_LIMIT,
  QueryTransactionsDto,
  QueryMerchantsDto,
} from './dto/query-transactions.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { TransactionWithRelations } from './transaction.mapper';

export interface MerchantSuggestion {
  merchantKey: string;
  displayName: string;
  lastCategoryId: number | null;
  lastPaymentMethod: PaymentMethod;
  usageCount: number;
  lastOccurredOn: string;
}

/** Sort keys a client may ask for. Anything else is ignored rather than passed to Prisma. */
const SORTABLE_FIELDS = new Set(['occurredOn', 'amount', 'createdAt', 'id']);
/** A dayType filter is resolved to an explicit date list, so the range must stay bounded. */
const MAX_DAY_TYPE_RANGE_DAYS = 400;

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
    private readonly cache: BudgetCacheService,
    private readonly wallets: WalletsService,
  ) {}

  async create(userId: number, dto: CreateTransactionDto): Promise<TransactionWithRelations> {
    const occurredOn = this.assertUsableDate(dto.occurredOn);
    await this.assertCategoryOwned(userId, dto.categoryId ?? null);

    const merchant = this.cleanMerchant(dto.merchant);
    // No walletId means the default wallet (PRD v2 4.2) -- what keeps recording a spend a
    // request with no wallet in it at all.
    const wallet = await this.wallets.resolve(userId, dto.walletId);
    // The kind has to suit the wallet, and the direction follows from the kind. A client
    // value for `direction` is ignored on purpose (PRD v2 9.2).
    const kind = assertKindSuitsWallet(dto.kind ?? defaultKindFor(wallet.type), wallet.type);

    return this.prisma.$transaction(async (tx) => {
      const expense = await tx.transaction.create({
        data: {
          userId,
          walletId: wallet.id,
          kind,
          direction: directionOf(kind),
          categoryId: dto.categoryId ?? null,
          occurredOn: toDateOnly(occurredOn),
          amount: dto.amount,
          merchant: merchant.value,
          // Always derived here; a client-supplied merchantKey never reaches this point.
          merchantKey: merchant.key,
          paymentMethod: dto.paymentMethod ?? PaymentMethod.CASH,
          note: dto.note ?? null,
        },
        include: { category: true, receipts: true },
      });

      await this.cache.invalidateFrom(wallet.id, periodOf(occurredOn), tx);
      return expense;
    });
  }

  async findOne(userId: number, id: number): Promise<TransactionWithRelations> {
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
  async update(userId: number, id: number, dto: UpdateTransactionDto): Promise<TransactionWithRelations> {
    const existing = await this.findOne(userId, id);
    const previousPeriod = periodOf(fromDateOnly(existing.occurredOn));

    const data: Prisma.TransactionUpdateInput = {};
    let nextPeriod = previousPeriod;

    if (dto.occurredOn !== undefined) {
      const occurredOn = this.assertUsableDate(dto.occurredOn);
      data.occurredOn = toDateOnly(occurredOn);
      nextPeriod = periodOf(occurredOn);
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

      await this.cache.invalidateFromEarliest(existing.walletId, [previousPeriod, nextPeriod], tx);
      return expense;
    });
  }

  /** Soft delete: the row stays for audit but leaves every list and every calculation. */
  async remove(userId: number, id: number): Promise<void> {
    const existing = await this.findOne(userId, id);

    // One side of a transfer is not a thing that can be deleted on its own -- doing so
    // would leave money that left one wallet and arrived nowhere (PRD v2 8.9, test E24).
    if (existing.transferGroupId !== null) {
      throw AppException.conflict(
        `transaction ${id} is one side of a transfer; delete it through ` +
          `DELETE /api/transfers/${existing.transferGroupId} so both sides go together`,
      );
    }

    const period = periodOf(fromDateOnly(existing.occurredOn));

    await this.prisma.$transaction(async (tx) => {
      await tx.transaction.update({ where: { id }, data: { deletedAt: new Date() } });
      await this.cache.invalidateFrom(existing.walletId, period, tx);
    });
  }

  async list(
    userId: number,
    query: QueryTransactionsDto,
  ): Promise<{ items: TransactionWithRelations[]; total: number; sumAmount: number }> {
    const wallet = await this.wallets.resolve(userId, query.walletId);
    const where = this.buildWhere(wallet.id, query);
    const take = Math.min(query.limit ?? DEFAULT_TRANSACTION_LIMIT, MAX_TRANSACTION_LIMIT);
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
    const wallet = await this.wallets.resolve(userId, query.walletId);

    const where: Prisma.TransactionWhereInput = {
      walletId: wallet.id,
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
      where: { walletId: wallet.id, deletedAt: null, merchantKey: { in: keys } },
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
          lastOccurredOn: fromDateOnly(group._max.occurredOn ?? latest.occurredOn),
        },
      ];
    });
  }

  /**
   * Loads full rows for a period, for the report aggregations.
   *
   * SPEND only. Transfers carry no category and are deliberately absent from every
   * category, merchant and payment-method breakdown (PRD v2 6.1); they appear on the
   * receipt card as their own line instead.
   */
  loadForPeriod(walletId: number, period: string): Promise<TransactionWithRelations[]> {
    return this.prisma.transaction.findMany({
      where: {
        walletId,
        kind: TransactionKind.SPEND,
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
      throw AppException.validation(`occurredOn must be a real calendar date, got "${value}"`, [
        { field: 'occurredOn', constraint: 'format' },
      ]);
    }

    const today = this.clock.today();
    if (value > today) {
      throw AppException.validation(`occurredOn must not be in the future (today is ${today})`, [
        { field: 'occurredOn', constraint: 'notInFuture' },
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

  /** Every transaction query is scoped to one wallet; an unscoped one is a bug (v2 4.1). */
  private buildWhere(walletId: number, query: QueryTransactionsDto): Prisma.TransactionWhereInput {
    const where: Prisma.TransactionWhereInput = { walletId, deletedAt: null };
    const range = this.resolveRange(query);

    if (query.kind !== undefined) where.kind = query.kind;
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
  private resolveRange(query: QueryTransactionsDto): { from: string; to: string } {
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
    const parsed = (sort ?? DEFAULT_TRANSACTION_SORT)
      .split(',')
      .map((token) => token.trim())
      .filter(Boolean)
      .flatMap((token) => {
        const [field, direction = 'desc'] = token.split(':');
        if (!SORTABLE_FIELDS.has(field)) return [];
        return [{ [field]: direction === 'asc' ? 'asc' : 'desc' } as Prisma.TransactionOrderByWithRelationInput];
      });

    return parsed.length > 0 ? parsed : [{ occurredOn: 'desc' }, { id: 'desc' }];
  }
}

export type { Transaction };
