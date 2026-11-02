import { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { canListChangeRequests } from '../utils/changeRequestAccess';
import useSocket from './useSocket';

const REFRESH_EVENT = 'change-request-count-refresh';

export function refreshChangeRequestBadgeCount() {
  window.dispatchEvent(new CustomEvent(REFRESH_EVENT));
}

export default function useChangeRequestBadgeCount() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);
  const { on, off } = useSocket();

  const fetchCount = useCallback(async () => {
    if (!canListChangeRequests(user)) {
      setCount(0);
      return;
    }
    try {
      const res = await api.get('/ipm/change-requests/pending-count');
      setCount(res.data?.data?.badgeCount ?? 0);
    } catch {
      // silent
    }
  }, [user]);

  useEffect(() => {
    fetchCount();
    const interval = setInterval(fetchCount, 30000);
    const onRefresh = () => fetchCount();
    window.addEventListener(REFRESH_EVENT, onRefresh);

    const onAlert = (alert) => {
      if (alert?.entity_type === 'change_request') fetchCount();
    };
    on('alert:new', onAlert);

    return () => {
      clearInterval(interval);
      window.removeEventListener(REFRESH_EVENT, onRefresh);
      off('alert:new', onAlert);
    };
  }, [fetchCount, on, off]);

  return count;
}
