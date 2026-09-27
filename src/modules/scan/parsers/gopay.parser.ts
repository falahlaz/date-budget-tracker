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
 * GoPay transaction detail ("Rincian transaksi").
 *
 * Layout: the amount sits big at the top with the merchant name right under it, followed by
 * label/value rows -- Status, Metode pembayaran, Waktu, Tanggal ("26 Sep 2026"), ID transaksi,
 * and for a QRIS payment the Acquirer and Merchant rows.
 */
export function parseGopay(text: string): ParsedReceipt {
  const lines = toLines(text);
  const amountIndex = findAmountLine(lines);

  const merchant =
    (amountIndex >= 0 ? cleanName(lines[amountIndex + 1]) : null) ??
    cleanName(valueAfterLabel(lines, /merchant\s*name/i));

  // Acquirer and Merchant rows only appear when a QRIS code was scanned at a shop; anything
  // else paid from GoPay (a transfer, a bill) is plain e-wallet money.
  const paymentMethod = /acq[uw]irer|merchant\s*(name|location)|qris/i.test(text)
    ? PaymentMethod.QRIS
    : PaymentMethod.EWALLET;

  return {
    amount: amountIndex >= 0 ? amountInLine(lines[amountIndex]) : null,
    occurredOn: findDate(valueAfterLabel(lines, /tanggal/i) ?? '') ?? findDate(text),
    merchant,
    paymentMethod,
    reference: cleanReference(valueAfterLabel(lines, /id\s*tran[sa-z]*/i)),
  };
}
