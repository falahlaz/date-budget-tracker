import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { TransactionResponse, toTransactionResponse } from '@/modules/transactions/transaction.mapper';
import { CreateTransferDto, UpdateTransferDto } from './dto/transfer.dto';
import { TransfersService } from './transfers.service';

interface TransferResponse {
  transferGroupId: string;
  out: TransactionResponse;
  in: TransactionResponse;
}

/**
 * Transfers between wallets (PRD v2 10.4).
 *
 * Addressed by the group rather than by row id, because one side of a transfer is not a
 * thing you can meaningfully act on -- `DELETE /api/transactions/:id` on one says so with
 * a 409 pointing here.
 */
@ApiTags('transfers')
@Controller('transfers')
export class TransfersController {
  constructor(private readonly transfers: TransfersService) {}

  @Post()
  @ApiOperation({ summary: 'Move money between two wallets, writing both sides at once' })
  async create(
    @CurrentUser('id') userId: number,
    @Body() dto: CreateTransferDto,
  ): Promise<TransferResponse> {
    return toTransferResponse(await this.transfers.create(userId, dto));
  }

  @Patch(':groupId')
  @ApiOperation({ summary: 'Change the amount, date or note on both sides' })
  async update(
    @CurrentUser('id') userId: number,
    @Param('groupId') groupId: string,
    @Body() dto: UpdateTransferDto,
  ): Promise<TransferResponse> {
    return toTransferResponse(await this.transfers.update(userId, groupId, dto));
  }

  @Delete(':groupId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft delete both sides together (8.9)' })
  async remove(
    @CurrentUser('id') userId: number,
    @Param('groupId') groupId: string,
  ): Promise<void> {
    await this.transfers.remove(userId, groupId);
  }
}

function toTransferResponse(pair: {
  transferGroupId: string;
  out: Parameters<typeof toTransactionResponse>[0];
  in: Parameters<typeof toTransactionResponse>[0];
}): TransferResponse {
  return {
    transferGroupId: pair.transferGroupId,
    out: toTransactionResponse(pair.out),
    in: toTransactionResponse(pair.in),
  };
}
