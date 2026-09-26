import { Inject, Injectable, Logger } from '@nestjs/common';
import { Receipt } from '@prisma/client';
import { Readable } from 'node:stream';
import { AppException } from '@/common/errors';
import { PrismaService } from '@/prisma/prisma.service';
import { STORAGE_SERVICE, StorageService } from './storage/storage.service';

@Injectable()
export class ReceiptsService {
  private readonly logger = new Logger(ReceiptsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  async findOwned(userId: number, id: number): Promise<Receipt> {
    const receipt = await this.prisma.receipt.findFirst({
      where: { id, userId, deletedAt: null },
    });

    // Deliberately 404 rather than 403: another user's receipt should not be confirmed to
    // exist at all (PRD 8.5, E7).
    if (!receipt) {
      throw AppException.notFound(`receipt ${id} not found`);
    }

    return receipt;
  }

  async openFile(
    userId: number,
    id: number,
    variant?: string,
  ): Promise<{ receipt: Receipt; stream: Readable }> {
    const receipt = await this.findOwned(userId, id);
    const key = variant === 'thumb' && receipt.thumbKey ? receipt.thumbKey : receipt.storageKey;

    if (!(await this.storage.exists(key))) {
      throw AppException.notFound(`receipt ${id} has no stored file`);
    }

    return { receipt, stream: await this.storage.read(key) };
  }

  /** Soft-deletes the row and removes the files from disk (PRD 8.5). */
  async remove(userId: number, id: number): Promise<void> {
    const receipt = await this.findOwned(userId, id);

    await this.prisma.receipt.update({ where: { id }, data: { deletedAt: new Date() } });

    // Storage cleanup runs after the row is marked deleted: a failure here leaves an
    // orphaned file, which is harmless, whereas the reverse would leave a broken link.
    await Promise.all(
      [receipt.storageKey, receipt.thumbKey]
        .filter((key): key is string => Boolean(key))
        .map((key) =>
          this.storage.delete(key).catch((error: Error) => {
            this.logger.warn(`Failed to delete ${key}: ${error.message}`);
          }),
        ),
    );
  }
}
