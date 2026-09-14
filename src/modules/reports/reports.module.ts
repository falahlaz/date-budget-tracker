import { Module } from '@nestjs/common';
import { BudgetsModule } from '../budgets/budgets.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { WalletsCoreModule } from '../wallets/wallets-core.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

/**
 * Exports ReportsService so the wallet switcher can reuse the home-screen figures rather
 * than recomputing them (PRD v2 10.2).
 */
@Module({
  imports: [BudgetsModule, TransactionsModule, WalletsCoreModule],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
