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

export interface Expense {
  id: number;
  spentOn: string;
  amount: number;
  dayType: DayType;
  weekIndex: number;
  merchant: string | null;
  merchantKey: string | null;
  paymentMethod: PaymentMethod;
  note: string | null;
  category: Pick<Category, 'id' | 'name' | 'color' | 'icon'> | null;
  receipts: Receipt[];
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseList {
  items: Expense[];
  total: number;
  sumAmount: number;
}

export interface MerchantSuggestion {
  merchantKey: string;
  displayName: string;
  lastCategoryId: number | null;
  lastPaymentMethod: PaymentMethod;
  usageCount: number;
  lastSpentOn: string;
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
  spentOn: string;
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
