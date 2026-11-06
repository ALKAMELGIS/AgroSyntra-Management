import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { loadMasterData } from './masterDataUtils';

const EMPTY_MASTER_DATA = { countries: [], crops: [], fieldTypes: [] };

export function useMasterData({ enabled = true } = {}) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['masterData'],
    queryFn: loadMasterData,
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['masterData'] });
  }, [queryClient]);

  return {
    data: query.data ?? EMPTY_MASTER_DATA,
    loading: query.isLoading,
    /** The first request has finished (with data or with an error). */
    settled: query.isSuccess || query.isError,
    refresh,
  };
}
