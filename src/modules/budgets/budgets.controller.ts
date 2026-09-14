import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Put,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { MonthlyBudget, WalletType } from '@prisma/client';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { ParsePeriodPipe } from '@/common/pipes/parse-period.pipe';
import { WalletsService } from '@/modules/wallets/wallets.service';
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
@Controller('wallets/:walletId/budgets')
export class BudgetsController {
  constructor(
    private readonly budgets: BudgetsService,
    private readonly computation: MonthComputationService,
    private readonly wallets: WalletsService,
  ) {}

  /**
   * Resolves the wallet in the path, and refuses one that has no budgets (PRD v2 10.1).
   *
   * A budget is the date-budget engine's input; a savings wallet answers "how much must I
   * put in?" from its goal instead, so a budget on one would be a number nothing reads.
   */
  private walletFor(userId: number, walletId: number): Promise<{ id: number }> {
    return this.wallets.findOwnedOfType(userId, walletId, WalletType.DATE_BUDGET);
  }

  @Get()
  @ApiOperation({ summary: 'Budget history, newest first, with spend and carry-over' })
  async list(
    @CurrentUser('id') userId: number,
    @Param('walletId', ParseIntPipe) walletId: number,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<{ items: BudgetHistoryResponse[]; total: number }> {
    const wallet = await this.walletFor(userId, walletId);
    const take = clamp(Number(limit ?? 24), 1, 120);
    const skip = Math.max(0, Number(offset ?? 0) || 0);

    const { items, total } = await this.budgets.list(wallet.id, take, skip);

    const enriched = await Promise.all(
      items.map(async (budget) => {
        const report = await this.computation.computeMonthReport(wallet.id, budget.period);
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
    @Param('walletId', ParseIntPipe) walletId: number,
    @Param('period', ParsePeriodPipe) period: string,
  ): Promise<BudgetResponse> {
    const wallet = await this.walletFor(userId, walletId);
    return toBudgetResponse(await this.budgets.findOne(wallet.id, period));
  }

  @Put(':period')
  @ApiOperation({ summary: 'Set or replace the budget for one month' })
  async upsert(
    @CurrentUser('id') userId: number,
    @Param('walletId', ParseIntPipe) walletId: number,
    @Param('period', ParsePeriodPipe) period: string,
    @Body() dto: UpsertBudgetDto,
  ): Promise<BudgetResponse> {
    const wallet = await this.walletFor(userId, walletId);
    return toBudgetResponse(await this.budgets.upsert(userId, wallet.id, period, dto));
  }

  @Delete(':period')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove the budget for one month, leaving its expenses in place' })
  async remove(
    @CurrentUser('id') userId: number,
    @Param('walletId', ParseIntPipe) walletId: number,
    @Param('period', ParsePeriodPipe) period: string,
  ): Promise<void> {
    const wallet = await this.walletFor(userId, walletId);
    await this.budgets.remove(wallet.id, period);
  }
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(Math.trunc(value), min), max);
}
