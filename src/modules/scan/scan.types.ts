import { PaymentMethod } from '@prisma/client';

/**
 * The receipt layouts the scanner understands.
 *
 * The user picks one explicitly before uploading, so the server never has to guess which
 * app a screenshot came from -- each provider gets a parser written for its exact layout.
 */
export const SCAN_PROVIDERS = ['GOPAY', 'BCA', 'JAGO'] as const;
export type ScanProvider = (typeof SCAN_PROVIDERS)[number];

/** What a parser could read off a receipt. Every field is a suggestion the user confirms. */
export interface ParsedReceipt {
  amount: number | null;
  occurredOn: string | null;
  merchant: string | null;
  paymentMethod: PaymentMethod | null;
  reference: string | null;
}

export interface ScanResult extends ParsedReceipt {
  provider: ScanProvider;
  rawText: string;
}
