import { formatRupiah } from '@/lib/format';

/**
 * What the toast says after a deposit (PRD v2 11.3).
 *
 * Two numbers, never one. A 2.000.000 deposit that put back 600.000 of an earlier
 * withdrawal moved the balance by 2.000.000 and moved the *goal* by 1.400.000, and the
 * second figure is the one that decides whether the target is still reachable. A toast
 * that reported only the gross amount would congratulate a month that stood still --
 * which is precisely goal G6.
 */
export function depositToastMessage(
  amount: number,
  repaid: number,
  fresh: number,
): { title: string; description?: string } {
  const title = `Masuk ${formatRupiah(amount)}`;

  if (repaid <= 0) {
    return { title, description: 'Semuanya nambah tabungan.' };
  }

  return {
    title,
    description: `${formatRupiah(repaid)} nutup utang, ${formatRupiah(fresh)} nambah tabungan.`,
  };
}
