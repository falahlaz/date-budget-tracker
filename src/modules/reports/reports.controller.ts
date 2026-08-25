import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { ParsePeriodPipe } from '@/common/pipes/parse-period.pipe';
import {
  MonthReportResponse,
  ReportsService,
  TodayReportResponse,
  WeekReportResponse,
} from './reports.service';

@ApiTags('reports')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('month/:period')
  @ApiOperation({ summary: 'Full monthly dashboard: weeks, categories, places, top spends' })
  month(
    @CurrentUser('id') userId: number,
    @Param('period', ParsePeriodPipe) period: string,
  ): Promise<MonthReportResponse> {
    return this.reports.monthReport(userId, period);
  }

  @Get('week/current')
  @ApiOperation({ summary: 'The week segment containing today in Asia/Jakarta' })
  currentWeek(@CurrentUser('id') userId: number): Promise<WeekReportResponse> {
    return this.reports.currentWeekReport(userId);
  }

  @Get('week/:period/:weekIndex')
  @ApiOperation({ summary: 'One week segment of a month' })
  week(
    @CurrentUser('id') userId: number,
    @Param('period', ParsePeriodPipe) period: string,
    @Param('weekIndex', ParseIntPipe) weekIndex: number,
  ): Promise<WeekReportResponse> {
    return this.reports.weekReport(userId, period, weekIndex);
  }

  @Get('today')
  @ApiOperation({ summary: 'Compact summary for the home screen widget' })
  today(@CurrentUser('id') userId: number): Promise<TodayReportResponse> {
    return this.reports.todayReport(userId);
  }
}
