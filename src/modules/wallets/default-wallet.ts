import { Prisma, WalletType } from '@prisma/client';

/**
 * The wallet every account starts with (PRD v2 section 4.2).
 *
 * The migration creates this row for users that already existed; this is the same wallet
 * for users created afterwards. The name matches the migration's literal on purpose --
 * a second spelling would give one user "Kencan" and another "Dompet Kencan".
 */
export const DEFAULT_WALLET = {
  name: 'Kencan',
  type: WalletType.DATE_BUDGET,
  color: '#5C63C4',
} as const;

/**
 * Seeds the default wallet for a brand new user.
 *
 * Takes the transaction client rather than the service, because a user without a wallet
 * cannot record anything -- the two rows have to land together or not at all.
 */
export function createDefaultWallet(
  tx: Prisma.TransactionClient,
  userId: number,
): Promise<{ id: number }> {
  return tx.wallet.create({
    data: {
      userId,
      name: DEFAULT_WALLET.name,
      type: DEFAULT_WALLET.type,
      color: DEFAULT_WALLET.color,
      isDefault: true,
      sortOrder: 0,
    },
    select: { id: true },
  });
}
