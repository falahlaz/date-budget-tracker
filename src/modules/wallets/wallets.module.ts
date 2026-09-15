import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { ReportsModule } from '../reports/reports.module';
import { SavingsModule } from '../savings/savings.module';
import { WalletsCoreModule } from './wallets-core.module';
import { WalletSummaryService } from './wallet-summary.service';
import { WalletsController } from './wallets.controller';

/** The wallets API. Depends on both engines, because the switcher shows their numbers. */
@Module({
  imports: [PrismaModule, WalletsCoreModule, ReportsModule, SavingsModule],
  controllers: [WalletsController],
  providers: [WalletSummaryService],
})
export class WalletsModule {}
