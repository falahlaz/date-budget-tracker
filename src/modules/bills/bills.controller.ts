import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseBoolPipe,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import {
  TransactionResponse,
  toTransactionResponse,
} from '@/modules/transactions/transaction.mapper';
import { BillResponse, toBillResponse } from './bill.mapper';
import { BillsService, BillsSummary } from './bills.service';
import { CreateBillDto } from './dto/create-bill.dto';
import { PayBillDto } from './dto/pay-bill.dto';
import { UpdateBillDto } from './dto/update-bill.dto';

@ApiTags('bills')
@Controller('bills')
export class BillsController {
  constructor(private readonly bills: BillsService) {}

  @Get()
  @ApiOperation({ summary: 'Every bill with where it stands today, most urgent first' })
  async list(
    @CurrentUser('id') userId: number,
    @Query('includeArchived', new ParseBoolPipe({ optional: true })) includeArchived?: boolean,
  ): Promise<{ items: BillResponse[]; summary: BillsSummary }> {
    const { items, summary } = await this.bills.list(userId, includeArchived ?? false);
    return { items: items.map(toBillResponse), summary };
  }

  @Post()
  @ApiOperation({ summary: 'Create a bill' })
  async create(
    @CurrentUser('id') userId: number,
    @Body() dto: CreateBillDto,
  ): Promise<BillResponse> {
    return toBillResponse(await this.bills.create(userId, dto));
  }

  @Get(':id')
  @ApiOperation({ summary: 'One bill, with its payment history' })
  async findOne(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<BillResponse> {
    return toBillResponse(await this.bills.findOne(userId, id));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit, archive or restore a bill' })
  async update(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateBillDto,
  ): Promise<BillResponse> {
    return toBillResponse(await this.bills.update(userId, id, dto));
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an unpaid bill, or archive one that has payments' })
  remove(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<{ archived: boolean }> {
    return this.bills.remove(userId, id);
  }

  @Post(':id/pay')
  @ApiOperation({
    summary: 'Pay one month of a bill from a wallet; writes a SPEND or a WITHDRAW there',
  })
  async pay(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PayBillDto,
  ): Promise<{ bill: BillResponse; transaction: TransactionResponse; period: string }> {
    const result = await this.bills.pay(userId, id, dto);
    return {
      bill: toBillResponse(result.bill),
      transaction: toTransactionResponse(result.transaction),
      period: result.period,
    };
  }
}
