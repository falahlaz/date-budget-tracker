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
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { QueryTransactionsDto, QueryMerchantsDto } from './dto/query-transactions.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { TransactionResponse, toTransactionResponse } from './transaction.mapper';
import { TransactionsService, MerchantSuggestion } from './transactions.service';

@ApiTags('transactions')
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactions: TransactionsService) {}

  @Post()
  @ApiOperation({ summary: 'Record a transaction in a wallet' })
  async create(
    @CurrentUser('id') userId: number,
    @Body() dto: CreateTransactionDto,
  ): Promise<TransactionResponse> {
    return toTransactionResponse(await this.transactions.create(userId, dto));
  }

  @Get()
  @ApiOperation({ summary: "List a wallet's transactions, plus the total of the filtered set" })
  async list(
    @CurrentUser('id') userId: number,
    @Query() query: QueryTransactionsDto,
  ): Promise<{ items: TransactionResponse[]; total: number; sumAmount: number }> {
    const { items, total, sumAmount } = await this.transactions.list(userId, query);
    return { items: items.map(toTransactionResponse), total, sumAmount };
  }

  /**
   * Declared before `:id` on purpose -- Express matches routes in order, and otherwise
   * "merchants" would be parsed as a transaction id.
   */
  @Get('merchants')
  @ApiOperation({ summary: 'Place suggestions for the quick-add autocomplete' })
  async merchants(
    @CurrentUser('id') userId: number,
    @Query() query: QueryMerchantsDto,
  ): Promise<{ items: MerchantSuggestion[] }> {
    return { items: await this.transactions.suggestMerchants(userId, query) };
  }

  @Get(':id')
  @ApiOperation({ summary: 'One transaction, including its receipts' })
  async findOne(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<TransactionResponse> {
    return toTransactionResponse(await this.transactions.findOne(userId, id));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a transaction; merchantKey is always re-derived' })
  async update(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTransactionDto,
  ): Promise<TransactionResponse> {
    return toTransactionResponse(await this.transactions.update(userId, id, dto));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft delete a transaction' })
  async remove(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    await this.transactions.remove(userId, id);
  }
}
