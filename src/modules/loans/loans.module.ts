import { Module } from '@nestjs/common';
import { BudgetsModule } from '../budgets/budgets.module';
import { SavingsModule } from '../savings/savings.module';
import { WalletsCoreModule } from '../wallets/wallets-core.module';
import { LoansController } from './loans.controller';
import { LoansService } from './loans.service';

/**
 * Loans sit on top of both engines the way transfers do: the budget cache for a
 * date-budget wallet, the balance floor for a savings one.
 */
@Module({
  imports: [WalletsCoreModule, BudgetsModule, SavingsModule],
  controllers: [LoansController],
  providers: [LoansService],
})
export class LoansModule {}
