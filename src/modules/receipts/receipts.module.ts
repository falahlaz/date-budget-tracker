import { Module } from '@nestjs/common';
import { ReceiptsController } from './receipts.controller';
import { ReceiptsService } from './receipts.service';
import { LocalDiskStorageService } from './storage/local-disk-storage.service';
import { STORAGE_SERVICE } from './storage/storage.service';

@Module({
  controllers: [ReceiptsController],
  providers: [
    ReceiptsService,
    // Swapping in an S3 driver later is a one-line change here (PRD 10.4, 14).
    { provide: STORAGE_SERVICE, useClass: LocalDiskStorageService },
  ],
  exports: [ReceiptsService],
})
export class ReceiptsModule {}
