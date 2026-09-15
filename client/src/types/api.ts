/**
 * API response shapes, mirroring the contract in PRD section 8.
 *
 * All money fields are whole-rupiah integers and MAY be negative (PRD 4.4).
 */

export type DayType = 'WEEKDAY' | 'WEEKEND';

export type PaymentMethod =
  | 'CASH'
  | 'QRIS'
  | 'DEBIT'
  | 'CREDIT'
  | 'TRANSFER'
  | 'EWALLET'
  | 'OTHER';

export const PAYMENT_METHODS: PaymentMethod[] = [
  'CASH',
  'QRIS',
  'DEBIT',
  'CREDIT',
  'TRANSFER',
  'EWALLET',
  'OTHER',
];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Tunai',
  QRIS: 'QRIS',
  DEBIT: 'Debit',
  CREDIT: 'Kartu kredit',
  TRANSFER: 'Transfer',
  EWALLET: 'E-wallet',
  OTHER: 'Lainnya',
};

export interface AuthUser {
  id: number;
  email: string;
  displayName: string;
}

export interface LoginResponse {
  accessToken: string;
  expiresIn: number;
  user: AuthUser;
}

export type WalletType = 'DATE_BUDGET' | 'SAVINGS';
export type TransactionKind = 'SPEND' | 'DEPOSIT' | 'WITHDRAW' | 'TRANSFER_IN' | 'TRANSFER_OUT';
export type Direction = 'IN' | 'OUT';

/** Shown in the switcher for a date-budget wallet (PRD v2 10.2). */
export interface DateBudgetSummary {
  period: string;
  dayRemaining: number;
  weekendBudgetProjected: number;
  monthRemaining: number;
}

/** Every goal-derived field is null until a goal exists on the wallet. */
export interface SavingsSummary {
  balance: number;
  goalName: string | null;
  progress: number | null;
  paceDelta: number | null;
  outstandingAdvance: number;
}

export interface Wallet {
  id: number;
  name: string;
  type: WalletType;
  color: string;
  icon: string | null;
  isDefault: boolean;
  isArchived: boolean;
  sortOrder: number;
  summary?: DateBudgetSummary | SavingsSummary;
}

export interface Category {
  id: number;
  name: string;
  color: string;
  icon: string | null;
  sortOrder: number;
  isArchived: boolean;
}

export interface Receipt {
  id: number;
  url: string;
  thumbUrl: string | null;
  mimeType: string;
  sizeBytes: number;
}

export interface Transaction {
  id: number;
  walletId: number;
  kind: TransactionKind;
  direction: Direction;
  occurredOn: string;
  amount: number;
  dayType: DayType;
  weekIndex: number;
  merchant: string | null;
  merchantKey: string | null;
  paymentMethod: PaymentMethod;
  note: string | null;
  /** Savings fields (v2 5.1): null / false / 0 for the kinds they mean nothing to. */
  reason: string | null;
  expectedReturn: boolean;
  returnedAmount: number;
  settled: boolean;
  /** Both halves of a transfer carry it; deleting one means deleting the pair (v2 8.9). */
  transferGroupId: string | null;
  counterpartWalletId: number | null;
  category: Pick<Category, 'id' | 'name' | 'color' | 'icon'> | null;
  receipts: Receipt[];
  createdAt: string;
  updatedAt: string;
}

export interface TransactionList {
  items: Transaction[];
  total: number;
  sumAmount: number;
}

export interface MerchantSuggestion {
  merchantKey: string;
  displayName: string;
  lastCategoryId: number | null;
  lastPaymentMethod: PaymentMethod;
  usageCount: number;
  lastOccurredOn: string;
}

export interface Budget {
  period: string;
  amount: number;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BudgetHistoryRow extends Budget {
  totalSpent: number;
  carryIn: number;
  carryOut: number;
  dailyWeekdayRate: number;
  weekdayCount: number;
}

export interface WeekRow {
  weekIndex: number;
  startDate: string;
  endDate: string;
  weekdayDays: number;
  weekendDays: number;
  weekBudget: number;
  weekdaySpent: number;
  rolloverIn: number;
  /** Money moved out to another wallet during this segment; cuts the weekend budget (v2 6.2). */
  transferOut: number;
  transferIn: number;
  weekendBudget: number;
  weekendSpent: number;
  weekRemaining: number;
  isCurrent: boolean;
}

export interface CategoryBreakdown {
  categoryId: number | null;
  name: string;
  color: string;
  amount: number;
  share: number;
  count: number;
}

export interface PaymentMethodBreakdown {
  paymentMethod: PaymentMethod;
  amount: number;
  count: number;
}

export interface MerchantBreakdown {
  merchantKey: string | null;
  displayName: string;
  amount: number;
  count: number;
  avgAmount: number;
  share: number;
  categoryName: string | null;
}

export interface TopExpense {
  id: number;
  occurredOn: string;
  amount: number;
  merchant: string | null;
  categoryName: string | null;
  note: string | null;
}

export interface MonthReport {
  period: string;
  hasBudget: boolean;
  monthlyBudget: number;
  carryIn: number;
  roundingRemainder: number;
  weekdayCount: number;
  weekendCount: number;
  dailyWeekdayRate: number;
  totalSpent: number;
  weekdaySpent: number;
  weekendSpent: number;
  transferOut: number;
  transferIn: number;
  carryOut: number;
  isOverspent: boolean;
  spendableRemaining: number;
  daysElapsed: number;
  daysTotal: number;
  weeks: WeekRow[];
  byCategory: CategoryBreakdown[];
  byPaymentMethod: PaymentMethodBreakdown[];
  byMerchant: MerchantBreakdown[];
  topExpenses: TopExpense[];
}

export interface DayRow {
  date: string;
  dayType: DayType;
  dayBudget: number;
  spent: number;
  remaining: number;
  isToday: boolean;
  expenseCount: number;
}

/** Where the week navigation controls land; the server resolves month boundaries. */
export interface WeekNeighbour {
  period: string;
  weekIndex: number;
}

export interface WeekReport extends WeekRow {
  period: string;
  dailyWeekdayRate: number;
  days: DayRow[];
  prevWeek: WeekNeighbour;
  nextWeek: WeekNeighbour;
  projection: {
    weekendBudgetIfNoMoreWeekdaySpend: number;
    remainingWeekdayDays: number;
  };
}

export interface TodayReport {
  date: string;
  dayType: DayType;
  dayBudget: number;
  spent: number;
  remaining: number;
  weekIndex: number;
  weekendBudgetProjected: number;
  monthRemaining: number;
}

export interface ApiErrorBody {
  statusCode: number;
  error: string;
  message: string;
  details?: { field: string; constraint: string }[];
  timestamp: string;
  path: string;
}

// ---------------------------------------------------------------- savings (v2)

export type GoalStatus = 'ACTIVE' | 'ACHIEVED' | 'ARCHIVED';
export type RateBasis = 'LAST_3_MONTHS' | 'PLAN_FALLBACK';

export interface SavingsGoal {
  id: number;
  walletId: number;
  name: string;
  targetAmount: number;
  openingBalance: number;
  startDate: string;
  deadline: string;
  planPerMonth: number;
  /** Set when the goal was edited, so the UI can say the pace baseline moved (v2 8.6). */
  planRevisedAt: string | null;
  status: GoalStatus;
  achievedAt: string | null;
  note: string | null;
}

/** The goal plus every derived figure from PRD v2 section 5.2. */
export interface GoalWithReport extends SavingsGoal {
  balance: number;
  remaining: number;
  surplus: number;
  achieved: boolean;
  progress: number;
  totalMonths: number;
  monthsLeft: number;
  requiredPerMonth: number;
  expectedBalance: number;
  /** Negative means behind plan. */
  paceDelta: number;
  rate: number;
  rateBasis: RateBasis;
  projectedMonths: number | null;
  projectedDate: string | null;
  projectedDaysLate: number | null;
  deadlinePassedDays: number;
  /**
   * Money owed back to the wallet. NOT subtracted from `balance` -- it already left the
   * account, and taking it off twice would understate what is actually there (v2 5.2).
   */
  outstandingAdvance: number;
  /** The sentence to print instead of a projection when the rate is flat (v2 8.2). */
  projectionNote: string | null;
}

export interface Advance {
  id: number;
  occurredOn: string;
  amount: number;
  returnedAmount: number;
  outstanding: number;
  reason: string | null;
  categoryId: number | null;
  settled: boolean;
}

export interface AdvanceList {
  items: Advance[];
  outstanding: number;
}

/** What a withdrawal costs in time, computed server-side for the friction dialog (v2 10.3). */
export interface WithdrawalPreview {
  amount: number;
  balanceAfter: number;
  rate: number;
  rateBasis: RateBasis;
  delayDays: number | null;
  delayLabel: string | null;
  projectedDateBefore: string | null;
  projectedDateAfter: string | null;
  wouldGoNegative: boolean;
  projectionNote: string | null;
}

/**
 * The two numbers the deposit toast names (v2 11.3).
 *
 * `fresh` is the one that matters: a deposit that only patched an earlier withdrawal moved
 * the balance without moving the goal.
 */
export interface DepositResult {
  transaction: Transaction;
  repaid: number;
  fresh: number;
}

export interface SavingsWithdrawalRow {
  id: number;
  occurredOn: string;
  amount: number;
  reason: string | null;
  categoryId: number | null;
  categoryName: string | null;
  categoryColor: string | null;
  expectedReturn: boolean;
  returnedAmount: number;
  settled: boolean;
  note: string | null;
}

export interface SavingsMonthReport {
  period: string;
  openingBalance: number;
  closingBalance: number;
  depositTotal: number;
  repaymentTotal: number;
  freshContribution: number;
  withdrawTotal: number;
  net: number;
  /** Memos: already counted inside depositTotal / withdrawTotal (v2 10.5). */
  transferInTotal: number;
  transferOutTotal: number;
  planPerMonth: number | null;
  /** `freshContribution − planPerMonth`, never the gross deposit (v2 5.3). */
  vsPlan: number | null;
  withdrawals: SavingsWithdrawalRow[];
  withdrawalsByCategory: CategoryBreakdown[];
  outstandingAdvanceAtClose: number;
}

export interface Transfer {
  transferGroupId: string;
  out: Transaction;
  in: Transaction;
}
