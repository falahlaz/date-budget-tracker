import { Injectable } from '@nestjs/common';
import { AppException } from '@/common/errors';
import { detectImageType } from './image-type';
import { OcrService, OcrTimeoutError } from './ocr.service';
import { RECEIPT_PARSERS } from './parsers';
import { ParsedReceipt, ScanProvider, ScanResult } from './scan.types';

/**
 * Reads a payment receipt screenshot into suggested transaction fields.
 *
 * The image only ever lives in memory for the length of the request -- it is never written
 * to storage or the database, and nothing is recorded as a transaction here. The client
 * shows the result for the user to confirm and then creates the transaction the usual way.
 */
@Injectable()
export class ScanService {
  constructor(private readonly ocr: OcrService) {}

  async scan(provider: ScanProvider, image: Buffer | undefined): Promise<ScanResult> {
    if (!image || image.length === 0) {
      throw AppException.validation('an image file is required', [
        { field: 'file', constraint: 'required' },
      ]);
    }

    if (!detectImageType(image)) {
      throw AppException.unsupportedMediaType('only JPEG, PNG or WebP images can be scanned');
    }

    const parse = RECEIPT_PARSERS[provider];

    let text = await this.read(image, 'normalize');
    let parsed = parse(text);

    // The normal pass occasionally drops something a harsher pass picks up (and the other
    // way round), so a second pass only fills the gaps -- it never overrides a value.
    if (hasGaps(parsed)) {
      const secondText = await this.read(image, 'threshold');
      parsed = fillGaps(parsed, parse(secondText));
      text = `${text}\n${secondText}`;
    }

    if (isFailedTransaction(text)) {
      throw AppException.validation('this receipt is for a failed transaction', [
        { field: 'file', constraint: 'failedTransaction' },
      ]);
    }

    if (parsed.amount === null) {
      throw AppException.validation(
        'could not read an amount from this receipt; check the provider or enter it manually',
        [{ field: 'file', constraint: 'unreadable' }],
      );
    }

    return { provider, ...parsed, rawText: text };
  }

  private async read(image: Buffer, preprocessing: 'normalize' | 'threshold'): Promise<string> {
    try {
      return await this.ocr.recognize(image, preprocessing);
    } catch (error) {
      if (error instanceof OcrTimeoutError) {
        throw AppException.validation('reading this receipt took too long; try a smaller image', [
          { field: 'file', constraint: 'timeout' },
        ]);
      }
      // sharp rejects a file whose header says image but whose body is corrupt.
      if (error instanceof Error && /Input|unsupported image|corrupt/i.test(error.message)) {
        throw AppException.unsupportedMediaType('the image could not be decoded');
      }
      throw error;
    }
  }
}

function hasGaps(parsed: ParsedReceipt): boolean {
  return parsed.amount === null || parsed.occurredOn === null || parsed.merchant === null;
}

function fillGaps(primary: ParsedReceipt, fallback: ParsedReceipt): ParsedReceipt {
  return {
    amount: primary.amount ?? fallback.amount,
    occurredOn: primary.occurredOn ?? fallback.occurredOn,
    merchant: primary.merchant ?? fallback.merchant,
    paymentMethod: primary.paymentMethod ?? fallback.paymentMethod,
    reference: primary.reference ?? fallback.reference,
  };
}

/** A receipt that says the payment failed must not become a spend. */
export function isFailedTransaction(text: string): boolean {
  return /\bgagal\b/i.test(text) && !/\b(berhasil|selesai|sukses)\b/i.test(text);
}
