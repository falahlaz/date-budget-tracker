import { SavingsGoal, Transaction } from '@prisma/client';
import { fromDateOnly } from '@/common/utils/date-only';
import { SavingsReport } from './engine/compute-savings';
import { NO_PROJECTION_MESSAGE, delayDays, delayLabel } from './engine/delay';

export interface GoalResponse {
  id: number;
  walletId: number;
  name: string;
  targetAmount: number;
  openingBalance: number;
  startDate: string;
  deadline: string;
  planPerMonth: number;
  /** Set when the goal was edited, so the UI can say the pace baseline moved (8.6). */
  planRevisedAt: string | null;
  status: string;
  achievedAt: string | null;
  note: string | null;
}

/** The goal plus every derived figure from section 5.2. */
export interface GoalWithReport extends GoalResponse {
  balance: number;
  remaining: number;
  surplus: number;
  achieved: boolean;
  progress: number;
  totalMonths: number;
  monthsLeft: number;
  requiredPerMonth: number;
  expectedBalance: number;
  paceDelta: number;
  rate: number;
  rateBasis: string;
  projectedMonths: number | null;
  projectedDate: string | null;
  projectedDaysLate: number | null;
  deadlinePassedDays: number;
  outstandingAdvance: number;
  /** The sentence to show instead of a projection when the rate is flat (8.2). */
  projectionNote: string | null;
}

export interface AdvanceResponse {
  id: number;
  occurredOn: string;
  amount: number;
  returnedAmount: number;
  outstanding: number;
  reason: string | null;
  categoryId: number | null;
  settled: boolean;
}

/** The friction dialog's payload (PRD v2 10.3). */
export interface WithdrawalPreviewResponse {
  amount: number;
  balanceAfter: number;
  rate: number;
  rateBasis: string;
  delayDays: number | null;
  delayLabel: string | null;
  projectedDateBefore: string | null;
  projectedDateAfter: string | null;
  wouldGoNegative: boolean;
  /** Present only when there is no projection to give (8.2). */
  projectionNote: string | null;
}

export function toGoalResponse(goal: SavingsGoal): GoalResponse {
  return {
    id: goal.id,
    walletId: goal.walletId,
    name: goal.name,
    targetAmount: goal.targetAmount,
    openingBalance: goal.openingBalance,
    startDate: fromDateOnly(goal.startDate),
    deadline: fromDateOnly(goal.deadline),
    planPerMonth: goal.planPerMonth,
    planRevisedAt: goal.planRevisedAt?.toISOString() ?? null,
    status: goal.status,
    achievedAt: goal.achievedAt?.toISOString() ?? null,
    note: goal.note,
  };
}

export function toGoalWithReport(goal: SavingsGoal, report: SavingsReport): GoalWithReport {
  return {
    ...toGoalResponse(goal),
    balance: report.balance,
    remaining: report.remaining,
    surplus: report.surplus,
    achieved: report.achieved,
    progress: report.progress,
    totalMonths: report.totalMonths,
    monthsLeft: report.monthsLeft,
    requiredPerMonth: report.requiredPerMonth,
    expectedBalance: report.expectedBalance,
    paceDelta: report.paceDelta,
    rate: Math.round(report.rate),
    rateBasis: report.rateBasis,
    projectedMonths: report.projectedMonths,
    projectedDate: report.projectedDate,
    projectedDaysLate: report.projectedDaysLate,
    deadlinePassedDays: report.deadlinePassedDays,
    outstandingAdvance: report.outstandingAdvance,
    projectionNote: report.projectedDate === null ? NO_PROJECTION_MESSAGE : null,
  };
}

export function toAdvanceResponse(advance: Transaction): AdvanceResponse {
  return {
    id: advance.id,
    occurredOn: fromDateOnly(advance.occurredOn),
    amount: advance.amount,
    returnedAmount: advance.returnedAmount,
    outstanding: advance.amount - advance.returnedAmount,
    reason: advance.reason,
    categoryId: advance.categoryId,
    settled: advance.settledAt !== null,
  };
}

/**
 * What a withdrawal costs, before it is made (PRD v2 10.3, goal G4).
 *
 * Both projected dates are computed here and handed over whole, so the sentence in the
 * dialog cannot disagree with the projection on the savings home screen. The client does
 * no arithmetic on these -- that is the point of the endpoint existing at all.
 */
export function toWithdrawalPreview(
  amount: number,
  report: SavingsReport,
  projectedDateAfter: string | null,
): WithdrawalPreviewResponse {
  const days = delayDays(amount, report.rate);

  return {
    amount,
    balanceAfter: report.balance - amount,
    rate: Math.round(report.rate),
    rateBasis: report.rateBasis,
    delayDays: days,
    delayLabel: delayLabel(days),
    projectedDateBefore: report.projectedDate,
    projectedDateAfter,
    wouldGoNegative: report.balance - amount < 0,
    projectionNote: days === null ? NO_PROJECTION_MESSAGE : null,
  };
}
