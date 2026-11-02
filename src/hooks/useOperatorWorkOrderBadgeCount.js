import { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import useSocket from './useSocket';

const REFRESH_EVENT = 'operator-work-order-count-refresh';

/** Call after an operator submits so the badge drops without waiting for the next poll. */
export function refreshOperatorWorkOrderBadgeCount() {
  window.dispatchEvent(new CustomEvent(REFRESH_EVENT));
}

/**
 * Number of issued work orders waiting for the signed-in operator (0 for other roles).
 * The API already limits operators to orders assigned to them.
 */
export default function useOperatorWorkOrderBadgeCount() {
  const { user } = useAuth();
  const isOperator = user?.role === 'operator';
  const [count, setCount] = useState(0);
  const { on, off } = useSocket();

  const fetchCount = useCallback(async () => {
    if (!isOperator) return;
    try {
      const res = await api.get('/ipm/work-orders?status=issued&limit=1');
      setCount(res.data?.meta?.total ?? 0);
    } catch {
      // silent
    }
  }, [isOperator]);

  useEffect(() => {
    if (!isOperator) { setCount(0); return undefined; }
    fetchCount();
    const interval = setInterval(fetchCount, 30000);
    const onRefresh = () => fetchCount();
    window.addEventListener(REFRESH_EVENT, onRefresh);
    const onAlert = (alert) => {
      if (alert?.entity_type === 'work_order') fetchCount();
    };
    on('alert:new', onAlert);
    return () => {
      clearInterval(interval);
      window.removeEventListener(REFRESH_EVENT, onRefresh);
      off('alert:new', onAlert);
    };
  }, [isOperator, fetchCount, on, off]);

  return count;
}
