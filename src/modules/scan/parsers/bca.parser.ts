import { PaymentMethod } from '@prisma/client';
import { ParsedReceipt } from '../scan.types';
import {
  amountInLine,
  cleanName,
  cleanReference,
  findAmountLine,
  findDate,
  toLines,
  valueAfterLabel,
} from './common';

/**
 * BCA mobile m-Transfer confirmation.
 *
 * Layout, one value per line: "m-Transfer:", "BERHASIL", "15/09/2026 17:56:04",
 * "Ke <account number>", the recipient's name, "Rp 25.000,00", then "Ref <number>".
 * The recipient is the closest thing a transfer has to a merchant, so it goes there.
 */
export function parseBca(text: string): ParsedReceipt {
  const lines = toLines(text);
  const amountIndex = findAmountLine(lines);
  const toIndex = lines.findIndex((line) => /^ke\b/i.test(line));

  const recipientLine = toIndex >= 0 ? lines[toIndex + 1] : undefined;
  const merchant =
    recipientLine !== undefined && amountInLine(recipientLine) === null
      ? cleanName(recipientLine)
      : null;

  return {
    amount: amountIndex >= 0 ? amountInLine(lines[amountIndex]) : null,
    occurredOn: findDate(text),
    merchant,
    paymentMethod: PaymentMethod.TRANSFER,
    reference: cleanReference(valueAfterLabel(lines, /^ref\b\.?/i)),
  };
}
