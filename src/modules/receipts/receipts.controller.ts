import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Res,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { memoryStorage } from 'multer';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { ReceiptResponse, toReceiptResponse } from '@/modules/expenses/expense.mapper';
import { ReceiptsService, UploadedFile } from './receipts.service';

/**
 * Upload limits (PRD 8.5, 10.5).
 *
 * Read straight from process.env because a decorator is evaluated when the class is
 * imported, before Nest can inject ConfigService. The values are still validated at boot
 * by the env schema, and ReceiptsService re-checks the per-expense cap against config.
 */
const MAX_FILES_PER_REQUEST = Number(process.env.MAX_RECEIPTS_PER_EXPENSE ?? 5) || 5;
const MAX_UPLOAD_BYTES = (Number(process.env.MAX_UPLOAD_MB ?? 10) || 10) * 1024 * 1024;

@ApiTags('receipts')
@Controller()
export class ReceiptsController {
  constructor(private readonly receipts: ReceiptsService) {}

  @Post('expenses/:id/receipts')
  @UseInterceptors(
    FilesInterceptor('files', MAX_FILES_PER_REQUEST, {
      storage: memoryStorage(),
      limits: { fileSize: MAX_UPLOAD_BYTES },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { files: { type: 'array', items: { type: 'string', format: 'binary' } } },
    },
  })
  @ApiOperation({ summary: 'Attach receipt photos to an expense' })
  async upload(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) expenseId: number,
    @UploadedFiles() files: UploadedFile[] = [],
  ): Promise<{ items: ReceiptResponse[] }> {
    const stored = await this.receipts.attach(userId, expenseId, files);
    return { items: stored.map(toReceiptResponse) };
  }

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
