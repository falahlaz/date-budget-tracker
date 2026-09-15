import { Injectable } from '@nestjs/common';
import { Prisma, Wallet, WalletType } from '@prisma/client';
import { AppException } from '@/common/errors';
import { PrismaService } from '@/prisma/prisma.service';
import { SAVINGS_CATEGORIES } from '@/modules/categories/default-categories';
import { CreateWalletDto } from './dto/create-wallet.dto';
import { UpdateWalletDto } from './dto/update-wallet.dto';

type PrismaLike = PrismaService | Prisma.TransactionClient;

/**
 * Wallets (PRD v2 section 4).
 *
 * One user, many wallets, and the `type` decides which engine reads them. Nothing here
 * knows how either engine works -- it resolves and owns wallets, and the report services
 * ask it which wallet they are talking about.
 */
@Injectable()
export class WalletsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The wallet an endpoint means when it was not told (PRD v2 section 4.2).
   *
   * Every user has exactly one: the migration created it for accounts that predate v2,
   * and `createDefaultWallet` does it for new ones. A user without one is a broken
   * account rather than an empty state, so this throws rather than returning null.
   */
  async findDefault(userId: number, client: PrismaLike = this.prisma): Promise<Wallet> {
    const wallet = await client.wallet.findFirst({
      where: { userId, isDefault: true },
      orderBy: { id: 'asc' },
    });

    if (!wallet) {
      throw AppException.notFound(`user ${userId} has no default wallet`);
    }

    return wallet;
  }

  async findDefaultId(userId: number, client: PrismaLike = this.prisma): Promise<number> {
    return (await this.findDefault(userId, client)).id;
  }

  /**
   * The wallet this request is about.
   *
   * `walletId` absent means the default one, which is what keeps `POST /api/transactions`
   * a one-field request for the common case (PRD v2 10.1).
   */
  async resolve(
    userId: number,
    walletId?: number,
    client: PrismaLike = this.prisma,
  ): Promise<Wallet> {
    return walletId === undefined
      ? this.findDefault(userId, client)
      : this.findOwned(userId, walletId, client);
  }

  /**
   * One wallet, or 404.
   *
   * Another user's wallet reads as "not found" rather than "forbidden", matching the
   * convention the rest of the app uses: a 403 would confirm the row exists.
   */
  async findOwned(
    userId: number,
    walletId: number,
    client: PrismaLike = this.prisma,
  ): Promise<Wallet> {
    const wallet = await client.wallet.findFirst({ where: { id: walletId, userId } });

    if (!wallet) {
      throw AppException.notFound(`wallet ${walletId} not found`);
    }

    return wallet;
  }

  /** Rejects a wallet of the wrong type, for endpoints only one engine can answer. */
  async findOwnedOfType(userId: number, walletId: number, type: WalletType): Promise<Wallet> {
    const wallet = await this.findOwned(userId, walletId);

    if (wallet.type !== type) {
      throw AppException.validation(
        `this endpoint is only for ${type} wallets; wallet ${walletId} is ${wallet.type}`,
        [{ field: 'walletId', constraint: 'walletType' }],
      );
    }

    return wallet;
  }

  list(userId: number, includeArchived = false): Promise<Wallet[]> {
    return this.prisma.wallet.findMany({
      where: { userId, ...(includeArchived ? {} : { isArchived: false }) },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
  }

  /**
   * Creates a wallet, and seeds the withdrawal categories the first time a savings wallet
   * appears (PRD v2 section 9.4).
   *
   * The seed lives here rather than in the migration because categories are per-user rows,
   * and a migration has no user to attach them to -- the same reasoning as the date-budget
   * categories seeded at user creation.
   */
  async create(userId: number, dto: CreateWalletDto): Promise<Wallet> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const wallet = await tx.wallet.create({
          data: {
            userId,
            name: dto.name.trim(),
            type: dto.type,
            ...(dto.color ? { color: dto.color } : {}),
            icon: dto.icon ?? null,
            sortOrder: dto.sortOrder ?? (await this.nextSortOrder(userId, tx)),
          },
        });

        if (dto.type === WalletType.SAVINGS) {
          await this.seedSavingsCategories(userId, tx);
        }

        return wallet;
      });
    } catch (error) {
      throw this.translateDuplicate(error, dto.name);
    }
  }

  /**
   * Partial update.
   *
   * `type` is deliberately absent: switching a wallet's type would hand its existing rows
   * to an engine that has no idea what they mean.
   */
  async update(userId: number, walletId: number, dto: UpdateWalletDto): Promise<Wallet> {
    const existing = await this.findOwned(userId, walletId);

    if (dto.isArchived === true) {
      this.assertArchivable(existing);
    }

    const data: Prisma.WalletUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.color !== undefined) data.color = dto.color;
    if (dto.icon !== undefined) data.icon = dto.icon;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    if (dto.isArchived !== undefined) data.isArchived = dto.isArchived;

    try {
      return await this.prisma.$transaction(async (tx) => {
        // Exactly one default per user, held by the transaction rather than by a check
        // that could lose a race and leave the user with two (PRD v2 4.2).
        if (dto.isDefault === true) {
          await tx.wallet.updateMany({
            where: { userId, isDefault: true },
            data: { isDefault: false },
          });
          data.isDefault = true;
          // A wallet cannot be both the default and hidden from the switcher.
          data.isArchived = false;
        }

        return tx.wallet.update({ where: { id: walletId }, data });
      });
    } catch (error) {
      throw this.translateDuplicate(error, dto.name ?? existing.name);
    }
  }

  /** Archive, never delete: the transactions stay readable through the reports (8.14). */
  async archive(userId: number, walletId: number): Promise<void> {
    const wallet = await this.findOwned(userId, walletId);
    this.assertArchivable(wallet);

    await this.prisma.wallet.update({ where: { id: walletId }, data: { isArchived: true } });
  }

  /**
   * The default wallet cannot be archived (PRD v2 8.14, test E28).
   *
   * Every endpoint that is not told a wallet falls back to the default one, so archiving
   * it would leave those requests pointing at a wallet the switcher no longer shows.
   */
  private assertArchivable(wallet: Wallet): void {
    if (wallet.isDefault) {
      throw AppException.conflict(
        `wallet ${wallet.id} is the default wallet; make another wallet the default first`,
      );
    }
  }

  private async nextSortOrder(userId: number, client: PrismaLike): Promise<number> {
    const last = await client.wallet.findFirst({
      where: { userId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });

    return (last?.sortOrder ?? -1) + 1;
  }

  /**
   * Idempotent: `skipDuplicates` means a second savings wallet does not double the list,
   * and a user who deleted one of them does not get it back.
   */
  private async seedSavingsCategories(userId: number, client: PrismaLike): Promise<void> {
    await client.category.createMany({
      data: SAVINGS_CATEGORIES.map((category, index) => ({
        userId,
        walletType: WalletType.SAVINGS,
        name: category.name,
        color: category.color,
        icon: category.icon,
        sortOrder: index,
      })),
      skipDuplicates: true,
    });
  }

  private translateDuplicate(error: unknown, name: string): unknown {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return AppException.conflict(`a wallet named "${name}" already exists`);
    }

    return error;
  }
}
