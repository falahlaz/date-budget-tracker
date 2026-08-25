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
import { CreateExpenseDto } from './dto/create-expense.dto';
import { QueryExpensesDto, QueryMerchantsDto } from './dto/query-expenses.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { ExpenseResponse, toExpenseResponse } from './expense.mapper';
import { ExpensesService, MerchantSuggestion } from './expenses.service';

@ApiTags('expenses')
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  @Post()
  @ApiOperation({ summary: 'Record an expense' })
  async create(
    @CurrentUser('id') userId: number,
    @Body() dto: CreateExpenseDto,
  ): Promise<ExpenseResponse> {
    return toExpenseResponse(await this.expenses.create(userId, dto));
  }

  @Get()
  @ApiOperation({ summary: 'List expenses with filters, plus the total of the filtered set' })
  async list(
    @CurrentUser('id') userId: number,
    @Query() query: QueryExpensesDto,
  ): Promise<{ items: ExpenseResponse[]; total: number; sumAmount: number }> {
    const { items, total, sumAmount } = await this.expenses.list(userId, query);
    return { items: items.map(toExpenseResponse), total, sumAmount };
  }

  /**
   * Declared before `:id` on purpose -- Express matches routes in order, and otherwise
   * "merchants" would be parsed as an expense id.
   */
  @Get('merchants')
  @ApiOperation({ summary: 'Place suggestions for the quick-add autocomplete' })
  async merchants(
    @CurrentUser('id') userId: number,
    @Query() query: QueryMerchantsDto,
  ): Promise<{ items: MerchantSuggestion[] }> {
    return { items: await this.expenses.suggestMerchants(userId, query) };
  }

  @Get(':id')
  @ApiOperation({ summary: 'One expense, including its receipts' })
  async findOne(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ExpenseResponse> {
    return toExpenseResponse(await this.expenses.findOne(userId, id));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an expense; merchantKey is always re-derived' })
  async update(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateExpenseDto,
  ): Promise<ExpenseResponse> {
    return toExpenseResponse(await this.expenses.update(userId, id, dto));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft delete an expense' })
  async remove(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    await this.expenses.remove(userId, id);
  }
}
