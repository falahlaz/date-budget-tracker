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
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { CreateLoanDto } from './dto/create-loan.dto';
import { RepayLoanDto } from './dto/repay-loan.dto';
import { UpdateLoanDto } from './dto/update-loan.dto';
import { LoanResponse, toLoanResponse } from './loan.mapper';
import { LoansService, LoansSummary } from './loans.service';

@ApiTags('loans')
@Controller('loans')
export class LoansController {
  constructor(private readonly loans: LoansService) {}

  @Get()
  @ApiOperation({ summary: 'Every loan with what is still owed, overdue first' })
  async list(
    @CurrentUser('id') userId: number,
  ): Promise<{ items: LoanResponse[]; summary: LoansSummary }> {
    const { items, summary } = await this.loans.list(userId);
    return { items: items.map(toLoanResponse), summary };
  }

  @Post()
  @ApiOperation({ summary: 'Lend money out of a wallet; writes a LOAN_OUT there' })
  async create(
    @CurrentUser('id') userId: number,
    @Body() dto: CreateLoanDto,
  ): Promise<LoanResponse> {
    return toLoanResponse(await this.loans.create(userId, dto));
  }

  @Get(':id')
  @ApiOperation({ summary: 'One loan, with its repayments' })
  async findOne(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<LoanResponse> {
    return toLoanResponse(await this.loans.findOne(userId, id));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit a loan' })
  async update(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateLoanDto,
  ): Promise<LoanResponse> {
    return toLoanResponse(await this.loans.update(userId, id, dto));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a loan with nothing paid back; the money returns' })
  remove(@CurrentUser('id') userId: number, @Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.loans.remove(userId, id);
  }

  @Post(':id/repay')
  @ApiOperation({ summary: 'Record money paid back; writes a LOAN_IN into a wallet' })
  async repay(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RepayLoanDto,
  ): Promise<{ loan: LoanResponse; transactionId: number; amount: number }> {
    const result = await this.loans.repay(userId, id, dto);
    return { ...result, loan: toLoanResponse(result.loan) };
  }

  @Delete(':id/repayments/:repaymentId')
  @ApiOperation({ summary: 'Remove a repayment; the loan is owed again by that much' })
  async removeRepayment(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Param('repaymentId', ParseIntPipe) repaymentId: number,
  ): Promise<LoanResponse> {
    return toLoanResponse(await this.loans.removeRepayment(userId, id, repaymentId));
  }
}
