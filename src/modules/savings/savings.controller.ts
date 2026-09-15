import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { TransactionKind, WalletType } from '@prisma/client';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { AppException } from '@/common/errors';
import { PrismaService } from '@/prisma/prisma.service';
import { WalletsService } from '@/modules/wallets/wallets.service';
import { TransactionResponse, toTransactionResponse } from '@/modules/transactions/transaction.mapper';
import { CreateDepositDto } from './dto/deposit.dto';
import { CreateGoalDto, UpdateGoalDto } from './dto/goal.dto';
import {
  CreateWithdrawalDto,
  PreviewWithdrawalDto,
  UpdateSavingsTransactionDto,
} from './dto/withdrawal.dto';
import { addMonthsTo } from './engine/month-span';
import {
  AdvanceResponse,
  GoalResponse,
  GoalWithReport,
  WithdrawalPreviewResponse,
  toAdvanceResponse,
  toGoalResponse,
  toGoalWithReport,
  toWithdrawalPreview,
} from './savings.mapper';
import { SavingsComputationService } from './savings-computation.service';
import { SavingsService } from './savings.service';

/**
 * The savings half of the app (PRD v2 10.3).
 *
 * Everything here lives under a wallet, and every route checks the wallet is a SAVINGS one
 * first -- the same mechanism that refuses a budget on a savings wallet, pointed the other
 * way.
 */
@ApiTags('savings')
@Controller('wallets/:walletId')
export class SavingsController {
  constructor(
    private readonly savings: SavingsService,
    private readonly computation: SavingsComputationService,
    private readonly wallets: WalletsService,
    private readonly prisma: PrismaService,
  ) {}

  private async walletIdFor(userId: number, walletId: number): Promise<number> {
    return (await this.wallets.findOwnedOfType(userId, walletId, WalletType.SAVINGS)).id;
  }

  @Post('goal')
  @ApiOperation({ summary: 'Set the wallet goal. 409 if one is already active.' })
  async createGoal(
    @CurrentUser('id') userId: number,
    @Param('walletId', ParseIntPipe) walletId: number,
    @Body() dto: CreateGoalDto,
  ): Promise<GoalResponse> {
    const id = await this.walletIdFor(userId, walletId);
    return toGoalResponse(await this.savings.createGoal(userId, id, dto));
  }

  @Get('goal')
  @ApiOperation({ summary: 'The active goal with every derived figure from section 5.2' })
  async getGoal(
    @CurrentUser('id') userId: number,
    @Param('walletId', ParseIntPipe) walletId: number,
  ): Promise<GoalWithReport> {
    const id = await this.walletIdFor(userId, walletId);
    const result = await this.computation.report(id);

    if (!result) {
      throw AppException.notFound(`wallet ${walletId} has no active goal`);
    }

    return toGoalWithReport(result.goal, result.report);
  }

  @Patch('goal')
  @ApiOperation({ summary: 'Change target, deadline or name; recomputes the monthly plan' })
  async updateGoal(
    @CurrentUser('id') userId: number,
    @Param('walletId', ParseIntPipe) walletId: number,
    @Body() dto: UpdateGoalDto,
  ): Promise<GoalResponse> {
    const id = await this.walletIdFor(userId, walletId);
    return toGoalResponse(await this.savings.updateGoal(id, dto));
  }

  @Post('goal/archive')
  @ApiOperation({ summary: 'Retire the goal, freeing the wallet for a new one' })
  async archiveGoal(
    @CurrentUser('id') userId: number,
    @Param('walletId', ParseIntPipe) walletId: number,
  ): Promise<GoalResponse> {
    const id = await this.walletIdFor(userId, walletId);
    return toGoalResponse(await this.savings.archiveGoal(id));
  }

  @Post('deposits')
  @ApiOperation({ summary: 'Pay in, optionally settling outstanding advances' })
  async createDeposit(
    @CurrentUser('id') userId: number,
    @Param('walletId', ParseIntPipe) walletId: number,
    @Body() dto: CreateDepositDto,
  ): Promise<{ transaction: TransactionResponse; repaid: number; fresh: number }> {
    const id = await this.walletIdFor(userId, walletId);
    const { transaction, repaid, fresh } = await this.savings.createDeposit(userId, id, dto);

    // Both numbers, because the toast names both: what went to debt, and what is progress
    // (section 11.3). The second is the one that matters.
    return { transaction: toTransactionResponse(transaction), repaid, fresh };
  }

  @Post('withdrawals')
  @ApiOperation({ summary: 'Take money out. A reason is required (8.13).' })
  async createWithdrawal(
    @CurrentUser('id') userId: number,
    @Param('walletId', ParseIntPipe) walletId: number,
    @Body() dto: CreateWithdrawalDto,
  ): Promise<TransactionResponse> {
    const id = await this.walletIdFor(userId, walletId);
    return toTransactionResponse(await this.savings.createWithdrawal(userId, id, dto));
  }

  /**
   * What this withdrawal would cost, in time (PRD v2 10.3, goal G4).
   *
   * Writes nothing. It exists so the friction dialog shows a number the server computed,
   * rather than one the client worked out and could disagree about.
   */
  @Post('withdrawals/preview')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Dry run: the delay this withdrawal would cause' })
  async previewWithdrawal(
    @CurrentUser('id') userId: number,
    @Param('walletId', ParseIntPipe) walletId: number,
    @Body() dto: PreviewWithdrawalDto,
  ): Promise<WithdrawalPreviewResponse> {
    const id = await this.walletIdFor(userId, walletId);
    const result = await this.computation.report(id);

    if (!result) {
      throw AppException.notFound(`wallet ${walletId} has no active goal`);
    }

    const { report } = result;

    // The target moves further away by exactly the time it takes to save this much again.
    const projectedDateAfter =
      report.projectedMonths === null || report.rate <= 0
        ? null
        : addMonthsTo(report.projectedDate as string, dto.amount / report.rate);

    return toWithdrawalPreview(dto.amount, report, projectedDateAfter);
  }

  @Get('advances')
  @ApiOperation({ summary: 'Withdrawals marked "I will pay this back" that are still owed' })
  async advances(
    @CurrentUser('id') userId: number,
    @Param('walletId', ParseIntPipe) walletId: number,
  ): Promise<{ items: AdvanceResponse[]; outstanding: number }> {
    const id = await this.walletIdFor(userId, walletId);

    const rows = await this.prisma.transaction.findMany({
      where: {
        walletId: id,
        kind: TransactionKind.WITHDRAW,
        expectedReturn: true,
        settledAt: null,
        deletedAt: null,
      },
      orderBy: [{ occurredOn: 'asc' }, { id: 'asc' }],
    });

    const items = rows.map(toAdvanceResponse);

    return {
      items,
      outstanding: items.reduce((total, item) => total + item.outstanding, 0),
    };
  }

  @Patch('transactions/:id')
  @ApiOperation({ summary: 'Correct a deposit or withdrawal (8.7, 8.16)' })
  async updateTransaction(
    @CurrentUser('id') userId: number,
    @Param('walletId', ParseIntPipe) walletId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSavingsTransactionDto,
  ): Promise<TransactionResponse> {
    const resolved = await this.walletIdFor(userId, walletId);
    return toTransactionResponse(await this.savings.updateTransaction(userId, resolved, id, dto));
  }

  @Delete('transactions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a deposit or withdrawal, undoing any repayments (8.7, 8.8)' })
  async removeTransaction(
    @CurrentUser('id') userId: number,
    @Param('walletId', ParseIntPipe) walletId: number,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    const resolved = await this.walletIdFor(userId, walletId);
    await this.savings.removeTransaction(userId, resolved, id);
  }
}
