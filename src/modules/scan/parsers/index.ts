import { ParsedReceipt, ScanProvider } from '../scan.types';
import { parseBca } from './bca.parser';
import { parseGopay } from './gopay.parser';
import { parseJago } from './jago.parser';

export const RECEIPT_PARSERS: Record<ScanProvider, (text: string) => ParsedReceipt> = {
  GOPAY: parseGopay,
  BCA: parseBca,
  JAGO: parseJago,
};
