import { formatDayShort, formatRupiah } from '@/lib/format';
import type { Loan } from '@/types/api';

export type LoanTone = 'over' | 'warn' | 'ok' | 'idle';

/** One line saying where a loan stands, and how loudly to say it. */
export function loanStatusLine(
  loan: Pick<Loan, 'status' | 'daysOverdue' | 'dueDate' | 'repaidAmount' | 'remaining'>,
): { text: string; tone: LoanTone } {
  if (loan.status === 'SETTLED') return { text: 'Lunas ✓', tone: 'ok' };

  if (loan.status === 'OVERDUE') {
    return {
      text: `Telat ${loan.daysOverdue} hari · sisa ${formatRupiah(loan.remaining)}`,
      tone: 'over',
    };
  }

  const parts = [
    loan.repaidAmount > 0 ? `Sisa ${formatRupiah(loan.remaining)}` : 'Belum dibalikin',
    loan.dueDate ? `janji ${formatDayShort(loan.dueDate)}` : null,
  ];

  return { text: parts.filter(Boolean).join(' · '), tone: loan.repaidAmount > 0 ? 'warn' : 'idle' };
}

/** 0..1, how much of the loan is back. */
export function repaidShare(loan: Pick<Loan, 'amount' | 'repaidAmount'>): number {
  if (loan.amount <= 0) return 0;
  return Math.min(1, loan.repaidAmount / loan.amount);
}
