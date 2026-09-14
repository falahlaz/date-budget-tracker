import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { WalletType } from '@prisma/client';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { ParsePeriodPipe } from '@/common/pipes/parse-period.pipe';
import { WalletsService } from '@/modules/wallets/wallets.service';
import { SavingsMonthReportResponse, SavingsReportService } from './savings-report.service';

/**
 * The savings month screen (PRD v2 10.5, 11.5).
 *
 * Sits alongside `ReportsController` under the same `wallets/:walletId/reports` prefix and
 * guards the other way: that one refuses a savings wallet, this one refuses a date-budget
 * wallet. Two engines, two reports, one path shape.
 */
@ApiTags('reports')
@Controller('wallets/:walletId/reports/savings')
export class SavingsReportsController {
  constructor(
    private readonly reports: SavingsReportService,
    private readonly wallets: WalletsService,
  ) {}

  @Get(':period')
  @ApiOperation({ summary: 'One month of a savings wallet, with every withdrawal and its reason' })
  async month(
    @CurrentUser('id') userId: number,
    @Param('walletId', ParseIntPipe) walletId: number,
    @Param('period', ParsePeriodPipe) period: string,
  ): Promise<SavingsMonthReportResponse> {
    const wallet = await this.wallets.findOwnedOfType(userId, walletId, WalletType.SAVINGS);

    return this.reports.monthReport(wallet.id, period);
  }
}
