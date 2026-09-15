import { Injectable } from '@nestjs/common';
import {
  Direction,
  GoalStatus,
  Prisma,
  SavingsGoal,
  Transaction,
  TransactionKind,
  WalletType,
} from '@prisma/client';
import { ClockService } from '@/common/clock/clock.service';
import { AppException } from '@/common/errors';
import { fromDateOnly, toDateOnly } from '@/common/utils/date-only';
import { PrismaService } from '@/prisma/prisma.service';
import { assertDateString } from '@/modules/reports/engine/calendar';
import { CreateDepositDto, ManualAllocationDto } from './dto/deposit.dto';
import { CreateGoalDto, UpdateGoalDto } from './dto/goal.dto';
import { CreateWithdrawalDto, UpdateSavingsTransactionDto } from './dto/withdrawal.dto';
import { ProposedAllocation, allocateFifo } from './engine/allocate-fifo';
import { planPerMonthFor } from './engine/compute-savings';
import { TransactionWithRelations } from '@/modules/transactions/transaction.mapper';
import { SavingsComputationService } from './savings-computation.service';

/**
 * A balance is not allowed anywhere near the 32-bit ceiling (PRD v2 8.15).
 *
 * Well under `MONEY_MAX` on purpose: the guard has to trip while the arithmetic is still
 * correct, not at the point where it has already wrapped.
 */
const MAX_BALANCE = 2_000_000_000;

@Injectable()
export class SavingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly computation: SavingsComputationService,
    private readonly clock: ClockService,
  ) {}

  // ---------------------------------------------------------------- goal

  /**
   * Creates the wallet's goal (PRD v2 10.3).
   *
   * One ACTIVE goal per wallet. MySQL 8 has no partial unique index, so the rule is held
   * by the transaction rather than by a check that could lose a race (9.3).
   */
  async createGoal(userId: number, walletId: number, dto: CreateGoalDto): Promise<SavingsGoal> {
    const startDate = assertDateString(dto.startDate);
    const deadline = assertDateString(dto.deadline);
    const openingBalance = dto.openingBalance ?? 0;

    this.assertDeadlineAfterStart(startDate, deadline);

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.savingsGoal.findFirst({
        where: { walletId, status: { in: [GoalStatus.ACTIVE, GoalStatus.ACHIEVED] } },
      });

      if (existing) {
        throw AppException.conflict(
          `wallet ${walletId} already has a goal ("${existing.name}"); archive it first`,
        );
      }

      return tx.savingsGoal.create({
        data: {
          userId,
          walletId,
          name: dto.name.trim(),
          targetAmount: dto.targetAmount,
          openingBalance,
          startDate: toDateOnly(startDate),
          deadline: toDateOnly(deadline),
          planPerMonth: planPerMonthFor({
            targetAmount: dto.targetAmount,
            openingBalance,
            startDate,
            deadline,
          }),
          note: dto.note ?? null,
        },
      });
    });
  }

  /**
   * Edits the goal (PRD v2 8.6).
   *
   * `plan_per_month` is recomputed from the ORIGINAL `startDate`, so the pace baseline
   * stays one straight line rather than a curve that flatters today's balance.
   * `plan_revised_at` is stamped so the UI can say the yardstick moved.
   */
  async updateGoal(walletId: number, dto: UpdateGoalDto): Promise<SavingsGoal> {
    const goal = await this.requireCurrentGoal(walletId);

    const targetAmount = dto.targetAmount ?? goal.targetAmount;
    const deadline = dto.deadline ? assertDateString(dto.deadline) : fromDateOnly(goal.deadline);
    const startDate = fromDateOnly(goal.startDate);

    this.assertDeadlineAfterStart(startDate, deadline);

    const planChanged = dto.targetAmount !== undefined || dto.deadline !== undefined;

    const updated = await this.prisma.savingsGoal.update({
      where: { id: goal.id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.note !== undefined ? { note: dto.note } : {}),
        targetAmount,
        deadline: toDateOnly(deadline),
        ...(planChanged
          ? {
              planPerMonth: planPerMonthFor({
                targetAmount,
                openingBalance: goal.openingBalance,
                startDate,
                deadline,
              }),
              planRevisedAt: this.clock.now(),
            }
          : {}),
      },
    });

    return this.syncStatus(updated);
  }

  async archiveGoal(walletId: number): Promise<SavingsGoal> {
    const goal = await this.requireCurrentGoal(walletId);

    return this.prisma.savingsGoal.update({
      where: { id: goal.id },
      data: { status: GoalStatus.ARCHIVED },
    });
  }

  // ------------------------------------------------------------- deposits

  /**
   * Records a deposit and, optionally, what it pays back (PRD v2 5.4).
   *
   * Insert, allocations, `returned_amount` bumps and `settled_at` all land in ONE database
   * transaction. A deposit that was written while its allocations were not would report
   * progress it did not make -- the exact failure section 5.3 exists to prevent.
   */
  async createDeposit(
    userId: number,
    walletId: number,
    dto: CreateDepositDto,
  ): Promise<{ transaction: Transaction; repaid: number; fresh: number }> {
    const occurredOn = this.assertUsableDate(dto.occurredOn);
    await this.assertWithinCeiling(walletId, dto.amount);

    const allocations = await this.resolveAllocations(walletId, dto);
    const repaid = allocations.reduce((total, allocation) => total + allocation.amount, 0);

    const transaction = await this.prisma.$transaction(async (tx) => {
      const deposit = await tx.transaction.create({
        data: {
          userId,
          walletId,
          kind: TransactionKind.DEPOSIT,
          direction: Direction.IN,
          occurredOn: toDateOnly(occurredOn),
          amount: dto.amount,
          note: dto.note ?? null,
        },
      });

      for (const allocation of allocations) {
        await tx.repaymentAllocation.create({
          data: {
            userId,
            depositTransactionId: deposit.id,
            withdrawalTransactionId: allocation.withdrawalId,
            amount: allocation.amount,
          },
        });

        const advance = await tx.transaction.update({
          where: { id: allocation.withdrawalId },
          data: { returnedAmount: { increment: allocation.amount } },
        });

        // Settled the moment the last rupiah is back, so it stops showing as owed (5.4).
        if (advance.returnedAmount >= advance.amount) {
          await tx.transaction.update({
            where: { id: advance.id },
            data: { settledAt: this.clock.now() },
          });
        }
      }

      return deposit;
    });

    await this.syncStatusFor(walletId);

    return { transaction, repaid, fresh: dto.amount - repaid };
  }

  // ---------------------------------------------------------- withdrawals

  /**
   * Records a withdrawal (PRD v2 8.1, 8.13).
   *
   * `reason` is enforced by the DTO. What this adds is the balance floor: unlike the date
   * budget, which may go negative because a budget is a plan, a savings balance is a fact
   * about an account, and an account cannot hold less than nothing (5.5).
   */
  async createWithdrawal(
    userId: number,
    walletId: number,
    dto: CreateWithdrawalDto,
  ): Promise<Transaction> {
    const occurredOn = this.assertUsableDate(dto.occurredOn);
    await this.assertCategoryUsable(userId, dto.categoryId);

    const balance = await this.computation.balance(walletId);

    if (balance - dto.amount < 0) {
      throw AppException.validation(
        `this withdrawal would leave the wallet below zero: balance is ${balance}, ` +
          `withdrawal is ${dto.amount}`,
        [{ field: 'amount', constraint: 'insufficientBalance' }],
      );
    }

    const withdrawal = await this.prisma.transaction.create({
      data: {
        userId,
        walletId,
        kind: TransactionKind.WITHDRAW,
        direction: Direction.OUT,
        occurredOn: toDateOnly(occurredOn),
        amount: dto.amount,
        reason: dto.reason,
        categoryId: dto.categoryId,
        expectedReturn: dto.expectedReturn ?? false,
        note: dto.note ?? null,
      },
    });

    await this.syncStatusFor(walletId);

    return withdrawal;
  }

  // --------------------------------------------------------------- edits

  /**
   * Corrects a savings transaction (PRD v2 8.7, 8.16).
   *
   * The generic endpoint sends every non-SPEND row here, because two of the checks below
   * exist nowhere else.
   *
   * A deposit's amount cannot fall below what has already been allocated against it: the
   * allocations would then describe a repayment larger than the deposit that made it, and
   * every advance they credit would be reporting a debt that was never actually paid.
   * Lowering the amount deliberately does not silently release allocations either -- that
   * is a decision about which debt is no longer settled, and only the caller can make it,
   * by deleting the deposit and re-recording it.
   *
   * A withdrawal cannot be raised past the balance, for the same reason it could not be
   * recorded that way in the first place (8.1): an account cannot hold less than nothing.
   */
  async updateTransaction(
    userId: number,
    walletId: number,
    id: number,
    dto: UpdateSavingsTransactionDto,
  ): Promise<TransactionWithRelations> {
    const existing = await this.findOwnedTransaction(userId, walletId, id);

    if (existing.transferGroupId !== null) {
      throw AppException.conflict(
        `transaction ${id} is one side of a transfer; edit it through ` +
          `PATCH /api/transfers/${existing.transferGroupId} so both sides stay in step`,
      );
    }

    const data: Prisma.TransactionUpdateInput = {};

    if (dto.occurredOn !== undefined) {
      data.occurredOn = toDateOnly(this.assertUsableDate(dto.occurredOn));
    }

    if (dto.amount !== undefined && dto.amount !== existing.amount) {
      await this.assertAmountStillValid(walletId, existing, dto.amount);
      data.amount = dto.amount;
    }

    if (dto.note !== undefined) data.note = dto.note;

    if (existing.kind === TransactionKind.WITHDRAW) {
      if (dto.reason !== undefined) data.reason = dto.reason;
      if (dto.expectedReturn !== undefined) {
        // Un-marking an advance that has already been partly repaid would orphan the
        // allocations pointing at it -- they would credit a withdrawal that no longer
        // claims to be a debt at all.
        if (dto.expectedReturn === false && existing.returnedAmount > 0) {
          throw AppException.conflict(
            `withdrawal ${id} has ${existing.returnedAmount} already repaid; delete the ` +
              'deposits that repaid it before un-marking it',
          );
        }
        data.expectedReturn = dto.expectedReturn;
      }

      if (dto.categoryId !== undefined) {
        await this.assertCategoryUsable(userId, dto.categoryId);
        data.category = { connect: { id: dto.categoryId } };
      }
    }

    // The category comes back on the response, so the sheet that sent this can render the
    // row it just edited without a second request.
    const updated = await this.prisma.transaction.update({
      where: { id },
      data,
      include: { category: true, receipts: { where: { deletedAt: null } } },
    });

    await this.syncStatusFor(walletId);

    return updated;
  }

  /**
   * Whether this row may hold this amount, given what already points at it.
   *
   * The balance check runs against the balance *without* this row, so raising a withdrawal
   * is measured against what the wallet would actually hold rather than double-counting
   * the withdrawal being edited.
   */
  private async assertAmountStillValid(
    walletId: number,
    existing: Transaction,
    amount: number,
  ): Promise<void> {
    if (existing.kind === TransactionKind.DEPOSIT) {
      const allocated = await this.prisma.repaymentAllocation.aggregate({
        where: { depositTransactionId: existing.id },
        _sum: { amount: true },
      });
      const total = allocated._sum.amount ?? 0;

      if (amount < total) {
        throw AppException.validation(
          `this deposit already repays ${total}; it cannot be lowered to ${amount}. ` +
            'Delete it and record it again if the split has changed.',
          [{ field: 'amount', constraint: 'belowAllocated' }],
        );
      }
    }

    const balance = await this.computation.balance(walletId);
    // What the wallet holds with this row taken back out.
    const withoutThis =
      existing.direction === Direction.IN ? balance - existing.amount : balance + existing.amount;

    if (existing.direction === Direction.OUT && withoutThis - amount < 0) {
      throw AppException.validation(
        `this withdrawal would leave the wallet below zero: balance without it is ` +
          `${withoutThis}, withdrawal would be ${amount}`,
        [{ field: 'amount', constraint: 'insufficientBalance' }],
      );
    }

    if (existing.direction === Direction.IN && withoutThis + amount > MAX_BALANCE) {
      throw AppException.validation(
        `this deposit would take the balance past ${MAX_BALANCE}, which is beyond what this ` +
          'app stores; split it across wallets',
        [{ field: 'amount', constraint: 'balanceCeiling' }],
      );
    }
  }

  private async findOwnedTransaction(
    userId: number,
    walletId: number,
    id: number,
  ): Promise<Transaction> {
    const existing = await this.prisma.transaction.findFirst({
      where: { id, walletId, userId, deletedAt: null },
    });

    if (!existing) {
      throw AppException.notFound(`transaction ${id} not found`);
    }

    return existing;
  }

  // ------------------------------------------------------------- deletes

  /**
   * Removes a savings transaction, undoing whatever it caused (PRD v2 8.7, 8.8).
   *
   * Deleting a deposit releases its allocations and puts the debt back; deleting an
   * advance that has been partly repaid is refused, because the deposits pointing at it
   * would be left describing a repayment of a row that no longer exists.
   */
  async removeTransaction(userId: number, walletId: number, id: number): Promise<void> {
    const existing = await this.prisma.transaction.findFirst({
      where: { id, walletId, userId, deletedAt: null },
    });

    if (!existing) {
      throw AppException.notFound(`transaction ${id} not found`);
    }

    if (existing.transferGroupId !== null) {
      throw AppException.conflict(
        `transaction ${id} is one side of a transfer; delete it through ` +
          `DELETE /api/transfers/${existing.transferGroupId} so both sides go together`,
      );
    }

    if (existing.kind === TransactionKind.WITHDRAW && existing.returnedAmount > 0) {
      throw AppException.conflict(
        `withdrawal ${id} has ${existing.returnedAmount} of ${existing.amount} repaid; ` +
          'delete the deposits that repaid it first',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      if (existing.kind === TransactionKind.DEPOSIT) {
        const allocations = await tx.repaymentAllocation.findMany({
          where: { depositTransactionId: id },
        });

        for (const allocation of allocations) {
          const advance = await tx.transaction.update({
            where: { id: allocation.withdrawalTransactionId },
            data: { returnedAmount: { decrement: allocation.amount } },
          });

          // It is owed again, so it must stop reading as settled (8.7).
          if (advance.returnedAmount < advance.amount && advance.settledAt !== null) {
            await tx.transaction.update({
              where: { id: advance.id },
              data: { settledAt: null },
            });
          }
        }

        await tx.repaymentAllocation.deleteMany({ where: { depositTransactionId: id } });
      }

      await tx.transaction.update({ where: { id }, data: { deletedAt: this.clock.now() } });
    });

    await this.syncStatusFor(walletId);
  }

  // ------------------------------------------------------------- helpers

  async requireCurrentGoal(walletId: number): Promise<SavingsGoal> {
    const goal = await this.computation.findCurrentGoal(walletId);

    if (!goal) {
      throw AppException.notFound(`wallet ${walletId} has no goal`);
    }

    return goal;
  }

  /**
   * Turns the request into a concrete list of allocations, or refuses it.
   *
   * Nothing is written from here, so a 422 raised below leaves the database untouched --
   * which is what section 8.16 means by "tidak ada yang tertulis sebagian".
   */
  private async resolveAllocations(
    walletId: number,
    dto: CreateDepositDto,
  ): Promise<ProposedAllocation[]> {
    const advances = await this.computation.loadOpenAdvances(walletId);

    if (dto.allocations && dto.allocations.length > 0) {
      return this.validateManualAllocations(dto.amount, dto.allocations, advances);
    }

    return dto.applyToAdvances === true ? allocateFifo(dto.amount, advances).allocations : [];
  }

  private validateManualAllocations(
    depositAmount: number,
    manual: ManualAllocationDto[],
    advances: { id: number; amount: number; returnedAmount: number }[],
  ): ProposedAllocation[] {
    const total = manual.reduce((sum, allocation) => sum + allocation.amount, 0);

    if (total > depositAmount) {
      throw AppException.validation(
        `allocations total ${total}, which is more than the deposit of ${depositAmount}`,
        [{ field: 'allocations', constraint: 'exceedsDeposit' }],
      );
    }

    const byId = new Map(advances.map((advance) => [advance.id, advance]));
    const seen = new Set<number>();

    return manual.map((allocation) => {
      if (seen.has(allocation.transactionId)) {
        throw AppException.validation(
          `advance ${allocation.transactionId} appears twice in allocations`,
          [{ field: 'allocations', constraint: 'duplicate' }],
        );
      }
      seen.add(allocation.transactionId);

      const advance = byId.get(allocation.transactionId);

      if (!advance) {
        throw AppException.validation(
          `transaction ${allocation.transactionId} is not an unsettled advance in this wallet`,
          [{ field: 'allocations', constraint: 'notAnOpenAdvance' }],
        );
      }

      const owed = advance.amount - advance.returnedAmount;

      if (allocation.amount > owed) {
        throw AppException.validation(
          `advance ${advance.id} only has ${owed} outstanding, but ${allocation.amount} was allocated`,
          [{ field: 'allocations', constraint: 'exceedsOutstanding' }],
        );
      }

      return { withdrawalId: advance.id, amount: allocation.amount };
    });
  }

  /**
   * Keeps `status` and `achieved_at` in step with the balance (PRD v2 8.4).
   *
   * `achieved_at` is written once and kept: it records when the target was first reached,
   * and a later withdrawal does not un-happen that. The status does go back to ACTIVE,
   * because there is a target to chase again.
   */
  private async syncStatusFor(walletId: number): Promise<void> {
    const goal = await this.prisma.savingsGoal.findFirst({
      where: { walletId, status: { in: [GoalStatus.ACTIVE, GoalStatus.ACHIEVED] } },
      orderBy: { id: 'desc' },
    });

    if (goal) await this.syncStatus(goal);
  }

  private async syncStatus(goal: SavingsGoal): Promise<SavingsGoal> {
    if (goal.status === GoalStatus.ARCHIVED) return goal;

    const balance = await this.computation.balance(goal.walletId);
    const achieved = balance >= goal.targetAmount;
    const status = achieved ? GoalStatus.ACHIEVED : GoalStatus.ACTIVE;

    if (status === goal.status && (!achieved || goal.achievedAt !== null)) {
      return goal;
    }

    return this.prisma.savingsGoal.update({
      where: { id: goal.id },
      data: {
        status,
        ...(achieved && goal.achievedAt === null ? { achievedAt: this.clock.now() } : {}),
      },
    });
  }

  private assertDeadlineAfterStart(startDate: string, deadline: string): void {
    // Same month is valid and means a one-month plan (8.11); earlier is not (8.12).
    if (deadline < startDate) {
      throw AppException.validation(
        `deadline ${deadline} falls before the start date ${startDate}`,
        [{ field: 'deadline', constraint: 'afterStartDate' }],
      );
    }
  }

  /** Same rule as a spend: nothing is recorded in the future (PRD 6.9). */
  private assertUsableDate(value: string): string {
    const date = assertDateString(value);
    const today = this.clock.today();

    if (date > today) {
      throw AppException.validation(`occurredOn must not be in the future (today is ${today})`, [
        { field: 'occurredOn', constraint: 'notInFuture' },
      ]);
    }

    return date;
  }

  private async assertWithinCeiling(walletId: number, incoming: number): Promise<void> {
    const balance = await this.computation.balance(walletId);

    if (balance + incoming > MAX_BALANCE) {
      throw AppException.validation(
        `this deposit would take the balance past ${MAX_BALANCE}, which is beyond what this ` +
          'app stores; split it across wallets',
        [{ field: 'amount', constraint: 'balanceCeiling' }],
      );
    }
  }

  /** Withdrawal categories are their own vocabulary (PRD v2 9.4). */
  private async assertCategoryUsable(userId: number, categoryId: number): Promise<void> {
    const category = await this.prisma.category.findFirst({
      where: { id: categoryId, userId, walletType: WalletType.SAVINGS },
    });

    if (!category) {
      throw AppException.validation(
        `category ${categoryId} is not one of your withdrawal categories`,
        [{ field: 'categoryId', constraint: 'exists' }],
      );
    }
  }
}
