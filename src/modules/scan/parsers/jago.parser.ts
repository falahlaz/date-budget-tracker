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
 * Bank Jago "Rincian Transaksi".
 *
 * Layout: the counterparty on top (sometimes with a second descriptor line such as
 * "650-2530000 CA" and a masked card number), then "-Rp35.520", then label-over-value
 * pairs: ID Transaksi, Dari (the pocket), Tanggal dan waktu ("11 September 2026, 10.27").
 * The grey labels are faint enough that OCR often drops them, so nothing here depends on
 * a label being read.
 */
export function parseJago(text: string): ParsedReceipt {
  const lines = toLines(text);
  const amountIndex = findAmountLine(lines);
  const headerIndex = lines.findIndex((line) => /rincian\s*transaksi/i.test(line));

  // The counterparty is the first line between the screen title and the amount that reads
  // like a name rather than a phone number or card descriptor.
  const nameArea = lines.slice(headerIndex + 1, amountIndex >= 0 ? amountIndex : undefined);
  const merchant =
    nameArea
      .filter((line) => {
        const letters = line.match(/\p{L}/gu)?.length ?? 0;
        const digits = line.match(/\d/g)?.length ?? 0;
        return letters > digits;
      })
      .map(cleanName)
      .find((name) => name !== null) ?? null;

  // The reference is printed on the line below its label; when the label was lost to OCR
  // it is still the first long run of digits after the amount.
  const afterAmount = amountIndex >= 0 ? lines.slice(amountIndex + 1) : [];
  const reference =
    cleanReference(valueAfterLabel(lines, /id\s*transaksi/i)) ??
    cleanReference(afterAmount.find((line) => /^\d{8,}$/.test(line)) ?? null);

  return {
    amount: amountIndex >= 0 ? amountInLine(lines[amountIndex]) : null,
    occurredOn: findDate(text),
    merchant,
    paymentMethod: jagoPaymentMethod(text),
    reference,
  };
}

/**
 * Jago uses one screen for card payments, QRIS and transfers alike, so the method is only
 * filled in when the receipt says so; otherwise it is left for the user to pick.
 */
function jagoPaymentMethod(text: string): PaymentMethod | null {
  if (/qris/i.test(text)) return PaymentMethod.QRIS;
  if (/(?:[•*·]\s*){4}/.test(text)) return PaymentMethod.DEBIT;
  if (/transfer|bi-?fast/i.test(text)) return PaymentMethod.TRANSFER;
  return null;
}
