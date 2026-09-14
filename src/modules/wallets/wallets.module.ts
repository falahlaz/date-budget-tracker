import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { ReportsModule } from '../reports/reports.module';
import { WalletsCoreModule } from './wallets-core.module';
import { WalletSummaryService } from './wallet-summary.service';
import { WalletsController } from './wallets.controller';

/** The wallets API. Depends on the engines, because the switcher shows their numbers. */
@Module({
  imports: [PrismaModule, WalletsCoreModule, ReportsModule],
  controllers: [WalletsController],
  providers: [WalletSummaryService],
})
export class WalletsModule {}
