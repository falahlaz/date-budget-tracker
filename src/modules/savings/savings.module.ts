import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { WalletsCoreModule } from '../wallets/wallets-core.module';
import { SavingsComputationService } from './savings-computation.service';
import { SavingsController } from './savings.controller';
import { SavingsReportService } from './savings-report.service';
import { SavingsReportsController } from './savings-reports.controller';
import { SavingsService } from './savings.service';

/**
 * Exports the computation service so the wallet switcher can summarise a savings wallet
 * without a second copy of the database-to-engine bridge.
 */
@Module({
  imports: [PrismaModule, WalletsCoreModule],
  controllers: [SavingsController, SavingsReportsController],
  providers: [SavingsService, SavingsComputationService, SavingsReportService],
  exports: [SavingsComputationService],
})
export class SavingsModule {}
