import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Query,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { ReceiptsService } from './receipts.service';

/**
 * Receipts are read-only now: uploading was removed so nobody can fill the server's disk.
 * Existing receipts can still be viewed and deleted, which is how old files get cleaned up.
 */
@ApiTags('receipts')
@Controller()
export class ReceiptsController {
  constructor(private readonly receipts: ReceiptsService) {}

  /**
   * Receipts are streamed through an authenticated endpoint, never static middleware, so
   * an image cannot be read by anyone who guesses a filename (PRD 8.5).
   */
  @Get('receipts/:id/file')
  @ApiOperation({ summary: 'Stream a receipt image, optionally its thumbnail' })
  async file(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Res() response: Response,
    @Query('variant') variant?: string,
  ): Promise<void> {
    const { receipt, stream } = await this.receipts.openFile(userId, id, variant);

    response.setHeader('Content-Type', receipt.mimeType);
    response.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    stream.pipe(response);
  }

  @Delete('receipts/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a receipt and its files' })
  async remove(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    await this.receipts.remove(userId, id);
  }
}
