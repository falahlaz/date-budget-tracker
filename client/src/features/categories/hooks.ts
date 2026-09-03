import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '@/lib/api';
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

/**
 * Creates a category by name alone, for the picker inside the expense forms.
 *
 * A name taken by an *archived* category comes back as a 409, and Settings has no way to
 * un-archive one -- so a bare error would leave the user unable to create the category and
 * unable to reach the one blocking it. Reviving it is what they meant anyway.
 */
export function useAddCategory() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: async (name: string) => {
      const trimmed = name.trim();

      try {
        return await api.post<Category>('/categories', { name: trimmed });
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 409) throw error;

        const all = await client.fetchQuery({
          queryKey: queryKeys.categories(true),
          queryFn: () => api.get<Category[]>('/categories?includeArchived=true'),
        });
        const archived = all.find(
          (category) =>
            category.isArchived && category.name.toLowerCase() === trimmed.toLowerCase(),
        );

        if (!archived) throw error;

        return api.patch<Category>(`/categories/${archived.id}`, { isArchived: false });
      }
    },
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
