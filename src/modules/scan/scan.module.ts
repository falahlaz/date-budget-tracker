import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Env } from '@/config/env.schema';
import { OcrService } from './ocr.service';
import { ScanController } from './scan.controller';
import { ScanService } from './scan.service';

@Module({
  imports: [
    // Memory storage on purpose: a receipt being scanned is never written to disk, which
    // is what keeps this from reopening the disk-filling hole that removing receipt
    // uploads closed.
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        storage: memoryStorage(),
        limits: {
          fileSize: config.get('SCAN_MAX_UPLOAD_MB', { infer: true }) * 1024 * 1024,
          files: 1,
        },
      }),
    }),
  ],
  controllers: [ScanController],
  providers: [ScanService, OcrService],
})
export class ScanModule {}
