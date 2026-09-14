import { Module } from '@nestjs/common';
import { BudgetsModule } from '../budgets/budgets.module';
import { WalletsModule } from '../wallets/wallets.module';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';

@Module({
  imports: [BudgetsModule, WalletsModule],
  controllers: [ExpensesController],
  providers: [ExpensesService],
  exports: [ExpensesService],
})
export class ExpensesModule {}
