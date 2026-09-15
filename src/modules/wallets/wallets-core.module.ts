import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { WalletsService } from './wallets.service';

/**
 * Wallet resolution and ownership, with no dependency on either engine.
 *
 * Kept apart from `WalletsModule` on purpose: budgets, transactions and reports all need
 * to resolve a wallet, while the wallet *list* needs those modules back to build its
 * per-type summaries. Splitting the service off is what keeps that from being a cycle.
 */
@Module({
  imports: [PrismaModule],
  providers: [WalletsService],
  exports: [WalletsService],
})
export class WalletsCoreModule {}
