import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../utils/api';

/**
 * Hook for GET requests with caching via React Query.
 *
 * Usage:
 *   const { data, isLoading, error, refetch } = useApiQuery(['tasks'], '/tasks');
 *   const { data, isLoading } = useApiQuery(['tasks', { status: 'todo' }], '/tasks?status=todo');
 */
export function useApiQuery(queryKey, endpoint, options = {}) {
  return useQuery({
    queryKey,
    queryFn: () => apiRequest(endpoint),
    ...options,
  });
}

/**
 * Hook for mutations (POST/PUT/DELETE) with automatic cache invalidation.
 *
 * Usage:
 *   const { mutateAsync: createTask } = useApiMutation('/tasks', { method: 'POST' }, ['tasks']);
 *   await createTask({ title: 'New task', ... });
 */
export function useApiMutation(endpoint, fetchOptions = {}, invalidateKeys = []) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body) =>
      apiRequest(endpoint, {
        ...fetchOptions,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      }),
    onSuccess: () => {
      invalidateKeys.forEach((key) => {
        queryClient.invalidateQueries({ queryKey: Array.isArray(key) ? key : [key] });
      });
    },
  });
}

/**
 * Hook for dynamic endpoint mutations (e.g., DELETE /tasks/:id).
 *
 * Usage:
 *   const { mutateAsync: deleteTask } = useDynamicMutation(
 *     (id) => `/tasks/${id}`,
 *     { method: 'DELETE' },
 *     ['tasks']
 *   );
 *   await deleteTask(taskId);
 */
export function useDynamicMutation(endpointFn, fetchOptions = {}, invalidateKeys = []) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ pathArg, body } = {}) =>
      apiRequest(endpointFn(pathArg), {
        ...fetchOptions,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      }),
    onSuccess: () => {
      invalidateKeys.forEach((key) => {
        queryClient.invalidateQueries({ queryKey: Array.isArray(key) ? key : [key] });
      });
    },
  });
}
