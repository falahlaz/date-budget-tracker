import { Module } from '@nestjs/common';
import { BudgetsModule } from '../budgets/budgets.module';
import { WalletsCoreModule } from '../wallets/wallets-core.module';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';

@Module({
  imports: [BudgetsModule, WalletsCoreModule],
  controllers: [TransactionsController],
  providers: [TransactionsService],
  exports: [TransactionsService],
})
export class TransactionsModule {}
