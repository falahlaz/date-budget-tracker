import { Injectable } from '@nestjs/common';
import { Prisma, Wallet } from '@prisma/client';
import { AppException } from '@/common/errors';
import { PrismaService } from '@/prisma/prisma.service';

type PrismaLike = PrismaService | Prisma.TransactionClient;

/**
 * Wallet resolution (PRD v2 section 4).
 *
 * M10 scope only: enough to answer "which wallet does this belong to" so the existing
 * endpoints keep working against the renamed table. Wallet CRUD, archiving, the default
 * flag and the per-type summaries are M12 -- this file grows, it does not get replaced.
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
}
