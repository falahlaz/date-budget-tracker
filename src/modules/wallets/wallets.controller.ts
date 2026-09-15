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
import { CreateWalletDto } from './dto/create-wallet.dto';
import { QueryWalletsDto } from './dto/query-wallets.dto';
import { UpdateWalletDto } from './dto/update-wallet.dto';
import { WalletResponse, toWalletResponse } from './wallet.mapper';
import { WalletSummaryService } from './wallet-summary.service';
import { WalletsService } from './wallets.service';

@ApiTags('wallets')
@Controller('wallets')
export class WalletsController {
  constructor(
    private readonly wallets: WalletsService,
    private readonly summaries: WalletSummaryService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Every wallet, each with the summary its type calls for' })
  async list(
    @CurrentUser('id') userId: number,
    @Query() query: QueryWalletsDto,
  ): Promise<WalletResponse[]> {
    const wallets = await this.wallets.list(userId, query.includeArchived ?? false);

    // Sequential rather than Promise.all: each summary runs the full engine for that
    // wallet, and a personal account has a handful of wallets, not hundreds.
    const responses: WalletResponse[] = [];
    for (const wallet of wallets) {
      responses.push(toWalletResponse(wallet, await this.summaries.summarise(wallet)));
    }

    return responses;
  }

  @Post()
  @ApiOperation({ summary: 'Create a wallet; a savings wallet seeds its withdrawal categories' })
  async create(
    @CurrentUser('id') userId: number,
    @Body() dto: CreateWalletDto,
  ): Promise<WalletResponse> {
    return toWalletResponse(await this.wallets.create(userId, dto));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Rename, recolour, reorder, archive, or make default' })
  async update(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateWalletDto,
  ): Promise<WalletResponse> {
    return toWalletResponse(await this.wallets.update(userId, id, dto));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Archive a wallet. The default wallet is refused (8.14).' })
  async remove(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    await this.wallets.archive(userId, id);
  }
}
