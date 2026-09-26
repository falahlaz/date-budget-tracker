import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { invalidateReports, queryKeys } from '@/lib/query';
import type {
  Bill,
  BillCategory,
  BillKind,
  BillList,
  BillPayResult,
  PaymentMethod,
  WalletType,
} from '@/types/api';

export function useBills(includeArchived = false) {
  return useQuery({
    queryKey: queryKeys.bills(includeArchived),
    queryFn: () => api.get<BillList>(`/bills${includeArchived ? '?includeArchived=true' : ''}`),
  });
}

export function useBill(id: number) {
  return useQuery({
    queryKey: queryKeys.bill(id),
    queryFn: () => api.get<Bill>(`/bills/${id}`),
    enabled: Number.isInteger(id) && id > 0,
  });
}

export interface BillInput {
  name: string;
  platform: string | null;
  amount: number;
  kind: BillKind;
  category: BillCategory;
  dueDay: number;
  startPeriod: string;
  endPeriod: string | null;
  note: string | null;
}

function useInvalidateBills() {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: ['bills'] }),
      client.invalidateQueries({ queryKey: ['bill'] }),
    ]);
}

export function useCreateBill() {
  const invalidate = useInvalidateBills();

  return useMutation({
    mutationFn: (input: BillInput) => api.post<Bill>('/bills', input),
    onSuccess: invalidate,
  });
}

export function useUpdateBill() {
  const invalidate = useInvalidateBills();

  return useMutation({
    mutationFn: ({ id, ...input }: Partial<BillInput> & { id: number; isArchived?: boolean }) =>
      api.patch<Bill>(`/bills/${id}`, input),
    onSuccess: invalidate,
  });
}

export function useDeleteBill() {
  const invalidate = useInvalidateBills();

  return useMutation({
    mutationFn: (id: number) => api.delete<{ archived: boolean }>(`/bills/${id}`),
    onSuccess: invalidate,
  });
}

export interface PayBillInput {
  billId: number;
  walletId: number;
  amount: number;
  occurredOn: string;
  paymentMethod?: PaymentMethod;
}

/** Paying moves money, so everything a transaction can move is refreshed, bills included. */
export function usePayBill() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ billId, ...input }: PayBillInput) =>
      api.post<BillPayResult>(`/bills/${billId}/pay`, input),
    onSuccess: () => invalidateReports(client),
  });
}

/**
 * Takes a payment back by deleting the transaction it wrote.
 *
 * Each wallet type deletes through its own door: a savings withdrawal is refused by the
 * generic endpoint because only the savings one keeps its side effects in step.
 */
export function useUndoBillPayment() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({
      transactionId,
      walletId,
      walletType,
    }: {
      transactionId: number;
      walletId: number;
      walletType: WalletType;
    }) =>
      walletType === 'SAVINGS'
        ? api.delete<void>(`/wallets/${walletId}/transactions/${transactionId}`)
        : api.delete<void>(`/transactions/${transactionId}`),
    onSuccess: () => invalidateReports(client),
  });
}
