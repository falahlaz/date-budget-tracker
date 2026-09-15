import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { WalletType } from '@prisma/client';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { ParsePeriodPipe } from '@/common/pipes/parse-period.pipe';
import { WalletsService } from '@/modules/wallets/wallets.service';
import {
  MonthReportResponse,
  ReportsService,
  TodayReportResponse,
  WeekReportResponse,
} from './reports.service';

@ApiTags('reports')
@Controller('wallets/:walletId/reports')
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly wallets: WalletsService,
  ) {}

  /** These are the date-budget engine's screens; a savings wallet has its own (10.5). */
  private async walletIdFor(userId: number, walletId: number): Promise<number> {
    return (await this.wallets.findOwnedOfType(userId, walletId, WalletType.DATE_BUDGET)).id;
  }

  @Get('month/:period')
  @ApiOperation({ summary: 'Full monthly dashboard: weeks, categories, places, top spends' })
  async month(
    @CurrentUser('id') userId: number,
    @Param('walletId', ParseIntPipe) walletId: number,
    @Param('period', ParsePeriodPipe) period: string,
  ): Promise<MonthReportResponse> {
    return this.reports.monthReport(await this.walletIdFor(userId, walletId), period);
  }

  @Get('week/current')
  @ApiOperation({ summary: 'The week segment containing today in Asia/Jakarta' })
  async currentWeek(
    @CurrentUser('id') userId: number,
    @Param('walletId', ParseIntPipe) walletId: number,
  ): Promise<WeekReportResponse> {
    return this.reports.currentWeekReport(await this.walletIdFor(userId, walletId));
  }

  @Get('week/:period/:weekIndex')
  @ApiOperation({ summary: 'One week segment of a month' })
  async week(
    @CurrentUser('id') userId: number,
    @Param('walletId', ParseIntPipe) walletId: number,
    @Param('period', ParsePeriodPipe) period: string,
    @Param('weekIndex', ParseIntPipe) weekIndex: number,
  ): Promise<WeekReportResponse> {
    return this.reports.weekReport(await this.walletIdFor(userId, walletId), period, weekIndex);
  }

  @Get('today')
  @ApiOperation({ summary: 'Compact summary for the home screen widget' })
  async today(
    @CurrentUser('id') userId: number,
    @Param('walletId', ParseIntPipe) walletId: number,
  ): Promise<TodayReportResponse> {
    return this.reports.todayReport(await this.walletIdFor(userId, walletId));
  }
}
