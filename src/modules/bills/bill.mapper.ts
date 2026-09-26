import { BillCategory, BillKind } from '@prisma/client';
import { fromDateOnly } from '@/common/utils/date-only';
import { BillSchedule } from './engine/bill-schedule';
import { BillWithSchedule, livePayments } from './bills.service';

export interface BillPaymentResponse {
  id: number;
  period: string;
  transactionId: number;
  walletId: number;
  walletName: string;
  walletColor: string;
  amount: number;
  occurredOn: string;
}

export interface BillResponse {
  id: number;
  name: string;
  platform: string | null;
  amount: number;
  kind: BillKind;
  category: BillCategory;
  dueDay: number;
  startPeriod: string;
  endPeriod: string | null;
  note: string | null;
  isArchived: boolean;
  schedule: BillSchedule;
  /** Newest first. Payments whose transaction was deleted are left out. */
  payments: BillPaymentResponse[];
  createdAt: string;
  updatedAt: string;
}

export function toBillResponse(bill: BillWithSchedule): BillResponse {
  return {
    id: bill.id,
    name: bill.name,
    platform: bill.platform,
    amount: bill.amount,
    kind: bill.kind,
    category: bill.category,
    dueDay: bill.dueDay,
    startPeriod: bill.startPeriod,
    endPeriod: bill.endPeriod,
    note: bill.note,
    isArchived: bill.isArchived,
    schedule: bill.schedule,
    payments: livePayments(bill)
      .sort((a, b) => b.period.localeCompare(a.period))
      .map((payment) => ({
        id: payment.id,
        period: payment.period,
        transactionId: payment.transaction.id,
        walletId: payment.transaction.walletId,
        walletName: payment.transaction.wallet.name,
        walletColor: payment.transaction.wallet.color,
        amount: payment.transaction.amount,
        occurredOn: fromDateOnly(payment.transaction.occurredOn),
      })),
    createdAt: bill.createdAt.toISOString(),
    updatedAt: bill.updatedAt.toISOString(),
  };
}
