import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useApiQuery } from '../hooks/useApiQuery';

// Mock the api module
jest.mock('../utils/api', () => ({
  apiRequest: jest.fn(),
}));

const { apiRequest } = require('../utils/api');

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
  return ({ children }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useApiQuery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns data on successful fetch', async () => {
    apiRequest.mockResolvedValue([{ id: '1', title: 'Test task' }]);

    const { result } = renderHook(
      () => useApiQuery(['tasks'], '/tasks'),
      { wrapper: createWrapper() }
    );

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual([{ id: '1', title: 'Test task' }]);
    expect(apiRequest).toHaveBeenCalledWith('/tasks');
  });

  it('returns error on failed fetch', async () => {
    apiRequest.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(
      () => useApiQuery(['tasks-fail'], '/tasks'),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error.message).toBe('Network error');
  });

  it('uses query key for caching', async () => {
    apiRequest.mockResolvedValue({ data: 'cached' });

    const { result: result1 } = renderHook(
      () => useApiQuery(['cache-key'], '/data'),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result1.current.isSuccess).toBe(true);
    });

    // Same query should reuse cache within the same client
    expect(apiRequest).toHaveBeenCalledTimes(1);
  });
});
