import { formatDayShort, formatPeriodLong } from '@/lib/format';
import type { Bill, BillCategory, BillKind } from '@/types/api';

export const BILL_KINDS: BillKind[] = ['INSTALLMENT', 'RECURRING', 'ONE_TIME'];

export const BILL_KIND_LABELS: Record<BillKind, string> = {
  INSTALLMENT: 'Cicilan',
  RECURRING: 'Langganan',
  ONE_TIME: 'Sekali bayar',
};

export const BILL_KIND_HINTS: Record<BillKind, string> = {
  INSTALLMENT: 'Tiap bulan sampai lunas, misal paylater 6x',
  RECURRING: 'Tiap bulan tanpa akhir, misal Netflix atau listrik',
  ONE_TIME: 'Sekali aja, misal pajak motor',
};

export const BILL_CATEGORIES: BillCategory[] = [
  'CICILAN',
  'LANGGANAN',
  'UTILITAS',
  'ASURANSI',
  'PENDIDIKAN',
  'LAINNYA',
];

export const BILL_CATEGORY_LABELS: Record<BillCategory, string> = {
  CICILAN: 'Cicilan',
  LANGGANAN: 'Langganan',
  UTILITAS: 'Utilitas',
  ASURANSI: 'Asuransi',
  PENDIDIKAN: 'Pendidikan',
  LAINNYA: 'Lainnya',
};

export type BillTone = 'over' | 'warn' | 'ok' | 'idle';

/**
 * The one line under a bill's name that says where it stands, and the colour to say it in.
 * Phrased as what the user has to do, not as a status code.
 */
export function billStatusLine(bill: Bill): { text: string; tone: BillTone } {
  const { schedule } = bill;
  const due = schedule.nextDueDate ? formatDayShort(schedule.nextDueDate) : '';
  const days = schedule.daysUntilDue ?? 0;

  switch (schedule.status) {
    case 'OVERDUE':
      return {
        text:
          schedule.overdueCount > 1
            ? `Telat ${schedule.overdueCount} bulan · sejak ${due}`
            : `Telat ${-days} hari · ${due}`,
        tone: 'over',
      };
    case 'DUE_SOON':
      return {
        text: days === 0 ? `Jatuh tempo hari ini` : `Jatuh tempo ${days} hari lagi · ${due}`,
        tone: 'warn',
      };
    case 'PAID':
      return { text: `Lunas bulan ini · berikutnya ${due}`, tone: 'ok' };
    case 'UPCOMING':
      return { text: `Jatuh tempo ${due}`, tone: 'idle' };
    case 'DONE':
      return { text: bill.kind === 'ONE_TIME' ? 'Udah dibayar' : 'Lunas semua', tone: 'ok' };
  }
}

/** "Sisa 2x dari 6" for an installment, nothing for the others. */
export function installmentLine(bill: Bill): string | null {
  const { remainingCount, totalCount } = bill.schedule;
  if (bill.kind !== 'INSTALLMENT' || totalCount === null || remainingCount === null) return null;
  return remainingCount === 0 ? `Lunas ${totalCount}x` : `Sisa ${remainingCount}x dari ${totalCount}`;
}

/** Whether a bill has something to pay right now (this month or earlier). */
export function isOwedNow(bill: Bill): boolean {
  return !bill.isArchived && bill.schedule.unpaidDueCount > 0;
}

export function periodLabel(period: string): string {
  return formatPeriodLong(period);
}

/** Months from `from` to `to` inclusive, as the server counts an installment. */
export function monthSpan(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm) + 1;
}
