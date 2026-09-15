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

/** Where a kind that this endpoint will not create has to be sent instead. */
const OWN_ENDPOINT: Partial<Record<TransactionKind, string>> = {
  [TransactionKind.DEPOSIT]: 'POST /api/wallets/:walletId/deposits',
  [TransactionKind.WITHDRAW]: 'POST /api/wallets/:walletId/withdrawals',
  [TransactionKind.TRANSFER_IN]: 'POST /api/transfers',
  [TransactionKind.TRANSFER_OUT]: 'POST /api/transfers',
};

/**
 * Only a SPEND is a plain row (PRD v2 8.13, 10.3).
 *
 * Every other kind carries side effects that only its own endpoint performs: a withdrawal
 * needs a reason and a balance floor, a deposit may settle advances, a transfer is two
 * rows at once. Letting this endpoint create them too would mean a second copy of each of
 * those rules -- and section 8.13's "a withdrawal cannot be saved without a reason" would
 * be one forgotten copy away from being false. One door per concept instead.
 */
export function assertCreatableHere(kind: TransactionKind): TransactionKind {
  const elsewhere = OWN_ENDPOINT[kind];

  if (elsewhere) {
    throw AppException.validation(
      `a ${kind} is not created here because it does more than write one row; use ${elsewhere}`,
      [{ field: 'kind', constraint: 'wrongEndpoint' }],
    );
  }

  return kind;
}

/** Where a kind that this endpoint will not edit or delete has to be sent instead. */
const OWN_EDIT_ENDPOINT: Partial<Record<TransactionKind, string>> = {
  [TransactionKind.DEPOSIT]: '/api/wallets/:walletId/transactions/:id',
  [TransactionKind.WITHDRAW]: '/api/wallets/:walletId/transactions/:id',
};

/**
 * The same one-door rule, applied to editing and deleting (PRD v2 8.7, 8.8, 8.16).
 *
 * `assertCreatableHere` closed the front door; this closes the other two, and they matter
 * just as much. Deleting a deposit here would soft-delete the row and leave its
 * `repayment_allocations` behind, still crediting advances that were never actually repaid.
 * Deleting a part-repaid advance is meant to be refused (8.8) -- and the FK RESTRICT that
 * is supposed to back that up never fires, because these deletes are soft. Editing a
 * deposit's amount below what is already allocated against it breaks 8.16 outright.
 *
 * `SavingsService.removeTransaction` and `updateTransaction` already handle every one of
 * those cases. Sending callers there keeps one copy of the rules rather than two that can
 * drift apart.
 *
 * Transfers are not listed here: both sides always carry a `transferGroupId`, and the
 * service refuses on that first with a 409 naming the group (8.9, test E24).
 */
export function assertEditableHere(
  kind: TransactionKind,
  verb: 'PATCH' | 'DELETE',
): TransactionKind {
  const elsewhere = OWN_EDIT_ENDPOINT[kind];

  if (elsewhere) {
    throw AppException.validation(
      `a ${kind} is not ${verb === 'PATCH' ? 'edited' : 'deleted'} here because it does more ` +
        `than touch one row; use ${verb} ${elsewhere}`,
      [{ field: 'kind', constraint: 'wrongEndpoint' }],
    );
  }

  return kind;
}
