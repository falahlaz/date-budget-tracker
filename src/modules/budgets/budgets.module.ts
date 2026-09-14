import { Module } from '@nestjs/common';
import { WalletsCoreModule } from '../wallets/wallets-core.module';
import { BudgetCacheService } from './budget-cache.service';
import { BudgetsController } from './budgets.controller';
import { BudgetsService } from './budgets.service';
import { MonthComputationService } from './month-computation.service';

/**
 * Owns everything about a budget period, including the carry-over chain. Expenses and
 * reports both depend on this module, so the dependency graph stays acyclic.
 */
@Module({
  imports: [WalletsCoreModule],
  controllers: [BudgetsController],
  providers: [BudgetsService, BudgetCacheService, MonthComputationService],
  exports: [BudgetsService, BudgetCacheService, MonthComputationService],
})
export class BudgetsModule {}
