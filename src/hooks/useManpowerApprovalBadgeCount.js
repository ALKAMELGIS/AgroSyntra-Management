import { useState, useEffect, useCallback } from 'react';
import { apiRequest } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { canApproveManpowerRecords } from '../utils/roleAccess';
import useSocket from './useSocket';

const REFRESH_EVENT = 'manpower-approval-count-refresh';

export function refreshManpowerApprovalBadgeCount() {
  window.dispatchEvent(new CustomEvent(REFRESH_EVENT));
}

export default function useManpowerApprovalBadgeCount() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);
  const { on, off } = useSocket();

  const fetchCount = useCallback(async () => {
    if (!canApproveManpowerRecords(user)) {
      setCount(0);
      return;
    }
    try {
      const data = await apiRequest('/manpower/approvals/pending-count');
      setCount(data?.badgeCount ?? data?.count ?? 0);
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
      if (alert?.entity_type === 'manpower_submission') fetchCount();
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
