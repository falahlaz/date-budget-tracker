import { Module } from '@nestjs/common';
import { BudgetsModule } from '../budgets/budgets.module';
import { ExpensesModule } from '../expenses/expenses.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [BudgetsModule, ExpensesModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
