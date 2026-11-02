import { renderHook, act } from '@testing-library/react';
import { useWorkerSession, saveWorkerSession, workerLogout, getWorkerToken } from '../pages/WorkerLogin';

describe('useWorkerSession', () => {
  beforeEach(() => {
    workerLogout();
  });

  it('returns stable worker reference across rerenders when token unchanged', () => {
    saveWorkerSession('test-token', { id: 'w1', name: 'Test Leader', isTeamLeader: true });

    const { result, rerender } = renderHook(() => useWorkerSession());
    const firstWorker = result.current.worker;
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.workerId).toBe('w1');

    rerender();
    expect(result.current.worker).toBe(firstWorker);
    expect(getWorkerToken()).toBe('test-token');
  });

  it('is not authenticated when session cleared', () => {
    const { result } = renderHook(() => useWorkerSession());
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('updates when saveWorkerSession dispatches event', () => {
    const { result } = renderHook(() => useWorkerSession());
    expect(result.current.isAuthenticated).toBe(false);

    act(() => {
      saveWorkerSession('tok-2', { id: 'w2', name: 'Leader Two', isTeamLeader: true });
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.workerId).toBe('w2');
  });
});
