import { Category, Direction, Receipt, Transaction, TransactionKind } from '@prisma/client';
import { fromDateOnly } from '@/common/utils/date-only';
import { DayType, buildWeekSegments, dayTypeOf, findSegmentForDate, periodOf } from '@/modules/reports/engine/calendar';

export interface ReceiptResponse {
  id: number;
  url: string;
  thumbUrl: string | null;
  mimeType: string;
  sizeBytes: number;
}

export interface TransactionResponse {
  id: number;
  walletId: number;
  kind: TransactionKind;
  /** Derived from `kind` by the server; a client-sent value is ignored (PRD v2 9.2). */
  direction: Direction;
  occurredOn: string;
  amount: number;
  /** Derived, never stored (PRD 8.4). */
  dayType: DayType;
  /** Derived, never stored: which week segment of its own month the date falls in. */
  weekIndex: number;
  merchant: string | null;
  /** Read-only: computed by the server, ignored if a client sends it. */
  merchantKey: string | null;
  paymentMethod: string;
  note: string | null;
  category: { id: number; name: string; color: string; icon: string | null } | null;
  receipts: ReceiptResponse[];
  createdAt: string;
  updatedAt: string;
}

export type TransactionWithRelations = Transaction & {
  category?: Category | null;
  receipts?: Receipt[];
};

export function toReceiptResponse(receipt: Receipt): ReceiptResponse {
  return {
    id: receipt.id,
    url: `/api/receipts/${receipt.id}/file`,
    thumbUrl: receipt.thumbKey ? `/api/receipts/${receipt.id}/file?variant=thumb` : null,
    mimeType: receipt.mimeType,
    sizeBytes: receipt.sizeBytes,
  };
}

/**
 * Maps a database row onto the API shape (PRD 8.4).
 *
 * `dayType` and `weekIndex` are computed here rather than stored, so they can never drift
 * out of sync with `occurred_on` -- the same reason the whole engine recomputes rather
 * than caches.
 *
 * They stay on the response even for kinds that have no notion of a weekend, because the
 * field set is what the date-budget screens already read and splitting the shape by kind
 * would buy nothing.
 */
export function toTransactionResponse(expense: TransactionWithRelations): TransactionResponse {
  const occurredOn = fromDateOnly(expense.occurredOn);
  const segments = buildWeekSegments(periodOf(occurredOn));

  return {
    id: expense.id,
    walletId: expense.walletId,
    kind: expense.kind,
    direction: expense.direction,
    occurredOn,
    amount: expense.amount,
    dayType: dayTypeOf(occurredOn),
    weekIndex: findSegmentForDate(segments, occurredOn)?.weekIndex ?? 1,
    merchant: expense.merchant,
    merchantKey: expense.merchantKey,
    paymentMethod: expense.paymentMethod,
    note: expense.note,
    category: expense.category
      ? {
          id: expense.category.id,
          name: expense.category.name,
          color: expense.category.color,
          icon: expense.category.icon,
        }
      : null,
    receipts: (expense.receipts ?? []).filter((r) => r.deletedAt === null).map(toReceiptResponse),
    createdAt: expense.createdAt.toISOString(),
    updatedAt: expense.updatedAt.toISOString(),
  };
}
