import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Put,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { MonthlyBudget } from '@prisma/client';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { ParsePeriodPipe } from '@/common/pipes/parse-period.pipe';
import { BudgetsService } from './budgets.service';
import { UpsertBudgetDto } from './dto/upsert-budget.dto';
import { MonthComputationService } from './month-computation.service';

export interface BudgetResponse {
  period: string;
  amount: number;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A history row also carries the derived columns the budget screen shows (PRD 9.7). */
export interface BudgetHistoryResponse extends BudgetResponse {
  totalSpent: number;
  carryIn: number;
  carryOut: number;
  dailyWeekdayRate: number;
  weekdayCount: number;
}

function toBudgetResponse(budget: MonthlyBudget): BudgetResponse {
  return {
    period: budget.period,
    amount: budget.amount,
    note: budget.note,
    createdAt: budget.createdAt.toISOString(),
    updatedAt: budget.updatedAt.toISOString(),
  };
}

@ApiTags('budgets')
@Controller('budgets')
export class BudgetsController {
  constructor(
    private readonly budgets: BudgetsService,
    private readonly computation: MonthComputationService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Budget history, newest first, with spend and carry-over' })
  async list(
    @CurrentUser('id') userId: number,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<{ items: BudgetHistoryResponse[]; total: number }> {
    const take = clamp(Number(limit ?? 24), 1, 120);
    const skip = Math.max(0, Number(offset ?? 0) || 0);

    const { items, total } = await this.budgets.list(userId, take, skip);

    const enriched = await Promise.all(
      items.map(async (budget) => {
        const report = await this.computation.computeMonthReport(userId, budget.period);
        return {
          ...toBudgetResponse(budget),
          totalSpent: report.totalSpent,
          carryIn: report.carryIn,
          carryOut: report.carryOut,
          dailyWeekdayRate: report.dailyWeekdayRate,
          weekdayCount: report.weekdayCount,
        };
      }),
    );

    return { items: enriched, total };
  }

  @Get(':period')
  @ApiOperation({ summary: 'The budget for one month' })
  async findOne(
    @CurrentUser('id') userId: number,
    @Param('period', ParsePeriodPipe) period: string,
  ): Promise<BudgetResponse> {
    return toBudgetResponse(await this.budgets.findOne(userId, period));
  }

  @Put(':period')
  @ApiOperation({ summary: 'Set or replace the budget for one month' })
  async upsert(
    @CurrentUser('id') userId: number,
    @Param('period', ParsePeriodPipe) period: string,
    @Body() dto: UpsertBudgetDto,
  ): Promise<BudgetResponse> {
    return toBudgetResponse(await this.budgets.upsert(userId, period, dto));
  }

  @Delete(':period')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove the budget for one month, leaving its expenses in place' })
  async remove(
    @CurrentUser('id') userId: number,
    @Param('period', ParsePeriodPipe) period: string,
  ): Promise<void> {
    await this.budgets.remove(userId, period);
  }
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(Math.trunc(value), min), max);
}
