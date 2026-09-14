import { Direction, TransactionKind, WalletType } from '@prisma/client';
import { AppException } from '@/common/errors';

/**
 * The `kind` -> `direction` map, and which kinds belong in which wallet (PRD v2 9.2).
 *
 * NORMATIVE. `direction` is a deterministic function of `kind`, stored only so aggregation
 * is one `SUM ... GROUP BY direction`. The server fills it in and a client-supplied value
 * is ignored -- the sign of money is not something a caller gets a say in.
 */

const DIRECTION_OF: Record<TransactionKind, Direction> = {
  [TransactionKind.SPEND]: Direction.OUT,
  [TransactionKind.DEPOSIT]: Direction.IN,
  [TransactionKind.WITHDRAW]: Direction.OUT,
  [TransactionKind.TRANSFER_IN]: Direction.IN,
  [TransactionKind.TRANSFER_OUT]: Direction.OUT,
};

/** Transfers are the only kinds at home in either wallet type. */
const KINDS_BY_WALLET: Record<WalletType, ReadonlySet<TransactionKind>> = {
  [WalletType.DATE_BUDGET]: new Set([
    TransactionKind.SPEND,
    TransactionKind.TRANSFER_IN,
    TransactionKind.TRANSFER_OUT,
  ]),
  [WalletType.SAVINGS]: new Set([
    TransactionKind.DEPOSIT,
    TransactionKind.WITHDRAW,
    TransactionKind.TRANSFER_IN,
    TransactionKind.TRANSFER_OUT,
  ]),
};

/** What a wallet of this type records when the caller does not say (PRD v2 10.1). */
const DEFAULT_KIND: Record<WalletType, TransactionKind> = {
  [WalletType.DATE_BUDGET]: TransactionKind.SPEND,
  [WalletType.SAVINGS]: TransactionKind.DEPOSIT,
};

export function directionOf(kind: TransactionKind): Direction {
  return DIRECTION_OF[kind];
}

export function defaultKindFor(type: WalletType): TransactionKind {
  return DEFAULT_KIND[type];
}

export function kindSuitsWallet(kind: TransactionKind, type: WalletType): boolean {
  return KINDS_BY_WALLET[type].has(kind);
}

/**
 * Rejects a kind that does not belong in this wallet (PRD v2 9.2, test E27).
 *
 * A DEPOSIT into the date-budget wallet is not a harmless mislabel: it would be invisible
 * to both engines -- the date engine ignores it and the savings engine never looks at that
 * wallet -- so the money would simply vanish from every screen.
 */
export function assertKindSuitsWallet(kind: TransactionKind, type: WalletType): TransactionKind {
  if (!kindSuitsWallet(kind, type)) {
    throw AppException.validation(`a ${type} wallet cannot hold a ${kind} transaction`, [
      { field: 'kind', constraint: 'walletType' },
    ]);
  }

  return kind;
}
