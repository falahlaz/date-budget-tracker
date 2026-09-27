import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SCAN_PROVIDERS, ScanResult } from './scan.types';
import { ScanReceiptDto } from './dto/scan-receipt.dto';
import { ScanService } from './scan.service';

@ApiTags('transactions')
@Controller('transactions')
export class ScanController {
  constructor(private readonly scanner: ScanService) {}

  /**
   * Nothing is created: this only suggests fields for the quick-add form, which the user
   * confirms before saving through POST /transactions like any manual entry.
   */
  @Post('scan')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['provider', 'file'],
      properties: {
        provider: { type: 'string', enum: [...SCAN_PROVIDERS] },
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiOperation({ summary: 'Read a payment receipt screenshot into suggested transaction fields' })
  async scan(
    @Body() dto: ScanReceiptDto,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<ScanResult> {
    return this.scanner.scan(dto.provider, file?.buffer);
  }
}
