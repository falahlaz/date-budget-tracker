import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import sharp from 'sharp';
import { createWorker, Worker } from 'tesseract.js';

// The English model is bundled as an npm package so the server never fetches it from a CDN
// at runtime. It reads Indonesian receipts fine: what matters on these screens is digits,
// "Rp", and names, none of which need an Indonesian dictionary.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ENG_DATA = require('@tesseract.js-data/eng') as { langPath: string; gzip: boolean };

/** Past this, a recognition is abandoned and the worker restarted. */
const OCR_TIMEOUT_MS = 20_000;

/** Width screenshots are scaled to: big enough for small grey labels, small enough to be fast. */
const OCR_WIDTH = 1500;

export type Preprocessing = 'normalize' | 'threshold';

export class OcrTimeoutError extends Error {
  constructor() {
    super('OCR timed out');
  }
}

/**
 * Turns an image into text, entirely in memory.
 *
 * Nothing here touches the disk: the upload arrives as a Buffer, sharp produces another
 * Buffer, and Tesseract reads that. The traineddata cache is disabled as well, so a scan
 * leaves no file behind of any kind.
 */
@Injectable()
export class OcrService implements OnModuleDestroy {
  private readonly logger = new Logger(OcrService.name);
  private worker: Promise<Worker> | null = null;
  /** Serialises recognitions so a timeout measures one job, not the queue in front of it. */
  private queue: Promise<unknown> = Promise.resolve();

  async onModuleDestroy(): Promise<void> {
    await this.resetWorker();
  }

  recognize(image: Buffer, preprocessing: Preprocessing = 'normalize'): Promise<string> {
    const job = this.queue.then(() => this.run(image, preprocessing));
    this.queue = job.catch(() => undefined);
    return job;
  }

  private async run(image: Buffer, preprocessing: Preprocessing): Promise<string> {
    const prepared = await prepareForOcr(image, preprocessing);
    const worker = await this.getWorker();

    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new OcrTimeoutError()), OCR_TIMEOUT_MS);
    });

    try {
      const { data } = await Promise.race([worker.recognize(prepared), timeout]);
      return data.text;
    } catch (error) {
      // A stuck or crashed worker is thrown away; the next scan starts a fresh one.
      await this.resetWorker();
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  private getWorker(): Promise<Worker> {
    if (!this.worker) {
      this.worker = createWorker('eng', 1, {
        langPath: ENG_DATA.langPath,
        gzip: ENG_DATA.gzip,
        cacheMethod: 'none',
      });
      this.worker.catch(() => {
        this.worker = null;
      });
    }
    return this.worker;
  }

  private async resetWorker(): Promise<void> {
    const current = this.worker;
    this.worker = null;
    if (!current) return;

    try {
      await (await current).terminate();
    } catch (error) {
      this.logger.warn(`failed to terminate OCR worker: ${String(error)}`);
    }
  }
}

/**
 * Makes a phone screenshot easy for Tesseract: upright, a consistent width, greyscale, and
 * always dark text on a light background -- dark-mode screens (GoPay) are inverted, since
 * Tesseract reads light-on-dark text badly.
 *
 * `threshold` is a harsher second pass: it loses big coloured text but recovers the faint
 * grey labels that the normal pass sometimes drops.
 */
export async function prepareForOcr(image: Buffer, preprocessing: Preprocessing): Promise<Buffer> {
  const base = sharp(image, { failOn: 'error' }).rotate().greyscale();
  const { channels } = await base.clone().stats();
  const isDark = channels[0].mean < 128;

  let pipeline = base.resize({ width: OCR_WIDTH });
  if (isDark) pipeline = pipeline.negate({ alpha: false });
  pipeline = preprocessing === 'threshold' ? pipeline.threshold(200) : pipeline.normalize();

  return pipeline.png().toBuffer();
}
