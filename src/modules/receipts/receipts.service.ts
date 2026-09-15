import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Receipt } from '@prisma/client';
import sharp from 'sharp';
import { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { AppException } from '@/common/errors';
import { fromDateOnly } from '@/common/utils/date-only';
import { Env } from '@/config/env.schema';
import { PrismaService } from '@/prisma/prisma.service';
import { detectImageType } from './image-type';
import { STORAGE_SERVICE, StorageService } from './storage/storage.service';

/** Normalisation targets from PRD 8.5. */
const OUTPUT_MAX_EDGE = 1600;
const THUMB_MAX_EDGE = 320;
const WEBP_QUALITY = 80;

export interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Injectable()
export class ReceiptsService {
  private readonly logger = new Logger(ReceiptsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  get maxPerExpense(): number {
    return this.config.get('MAX_RECEIPTS_PER_EXPENSE', { infer: true });
  }

  /**
   * Stores receipts for an expense.
   *
   * Every image is re-encoded to WebP rather than stored as uploaded: it strips EXIF
   * (which carries GPS coordinates), caps the dimensions, and means one decoder handles
   * every variant a phone camera might produce.
   */
  async attach(userId: number, expenseId: number, files: UploadedFile[]): Promise<Receipt[]> {
    const expense = await this.prisma.transaction.findFirst({
      where: { id: expenseId, userId, deletedAt: null },
      select: { id: true, occurredOn: true },
    });

    if (!expense) {
      throw AppException.notFound(`expense ${expenseId} not found`);
    }

    if (files.length === 0) {
      throw AppException.validation('no files were uploaded', [
        { field: 'files', constraint: 'required' },
      ]);
    }

    const existing = await this.prisma.receipt.count({
      where: { transactionId: expenseId, deletedAt: null },
    });

    if (existing + files.length > this.maxPerExpense) {
      throw AppException.conflict(
        `an expense can hold at most ${this.maxPerExpense} receipts (it already has ${existing})`,
      );
    }

    const spentOn = fromDateOnly(expense.occurredOn);
    const created: Receipt[] = [];

    for (const file of files) {
      created.push(await this.storeOne(userId, expenseId, spentOn, file));
    }

    return created;
  }

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

  private async storeOne(
    userId: number,
    expenseId: number,
    spentOn: string,
    file: UploadedFile,
  ): Promise<Receipt> {
    const detected = detectImageType(file.buffer);

    if (!detected) {
      throw AppException.unsupportedMediaType(
        `${file.originalname || 'file'} is not a supported image (jpeg, png, webp, heic, heif)`,
      );
    }

    let full: { data: Buffer; info: sharp.OutputInfo };
    let thumb: Buffer;

    try {
      full = await sharp(file.buffer)
        .rotate() // honour the EXIF orientation before the metadata is dropped
        .resize({
          width: OUTPUT_MAX_EDGE,
          height: OUTPUT_MAX_EDGE,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: WEBP_QUALITY })
        .toBuffer({ resolveWithObject: true });

      thumb = await sharp(file.buffer)
        .rotate()
        .resize({
          width: THUMB_MAX_EDGE,
          height: THUMB_MAX_EDGE,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: WEBP_QUALITY })
        .toBuffer();
    } catch (error) {
      this.logger.warn(`Failed to process ${detected} upload: ${(error as Error).message}`);
      throw AppException.unsupportedMediaType(
        `${file.originalname || 'file'} could not be decoded as an image`,
      );
    }

    // Filed under the month the money was spent, which is how backups and manual browsing
    // are organised. The original filename is never used as a path (PRD 8.5).
    const [year, month] = spentOn.split('-');
    const id = randomUUID();
    const storageKey = `receipts/${year}/${month}/${id}.webp`;
    const thumbKey = `receipts/${year}/${month}/${id}_thumb.webp`;

    await this.storage.save(storageKey, full.data, 'image/webp');
    await this.storage.save(thumbKey, thumb, 'image/webp');

    return this.prisma.receipt.create({
      data: {
        transactionId: expenseId,
        userId,
        storageKey,
        thumbKey,
        mimeType: 'image/webp',
        sizeBytes: full.data.byteLength,
        width: full.info.width,
        height: full.info.height,
        originalName: file.originalname?.slice(0, 255) ?? null,
      },
    });
  }
}
