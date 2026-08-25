import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query';
import type { Category } from '@/types/api';

export function useCategories(includeArchived = false) {
  return useQuery({
    queryKey: queryKeys.categories(includeArchived),
    queryFn: () =>
      api.get<Category[]>(`/categories${includeArchived ? '?includeArchived=true' : ''}`),
    staleTime: 5 * 60_000,
  });
}

export function useCreateCategory() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: { name: string; color?: string; icon?: string }) =>
      api.post<Category>('/categories', input),
    onSuccess: () => client.invalidateQueries({ queryKey: ['categories'] }),
  });
}

export function useUpdateCategory() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...input }: { id: number } & Partial<Category>) =>
      api.patch<Category>(`/categories/${id}`, input),
    onSuccess: () => client.invalidateQueries({ queryKey: ['categories'] }),
  });
}

export function useArchiveCategory() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api.delete<void>(`/categories/${id}`),
    onSuccess: () => client.invalidateQueries({ queryKey: ['categories'] }),
  });
}
