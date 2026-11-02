import { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import { useActiveSite } from '../contexts/ActiveSiteContext';
import { useAuth } from '../contexts/AuthContext';
import useSocket from './useSocket';

const REFRESH_EVENT = 'phi-audit-count-refresh';

export function refreshPhiAuditBadgeCount() {
  window.dispatchEvent(new CustomEvent(REFRESH_EVENT));
}

// Only the auditor reviews PHI conflicts, so only the auditor gets the badge.
export default function usePhiAuditBadgeCount() {
  const { activeSiteId } = useActiveSite();
  const { user } = useAuth();
  const isAuditor = user?.role === 'auditor';
  const [count, setCount] = useState(0);
  const { on, off } = useSocket();

  const fetchCount = useCallback(async () => {
    if (!isAuditor) {
      setCount(0);
      return;
    }
    try {
      const siteParam = activeSiteId ? `?siteId=${activeSiteId}` : '';
      const res = await api.get(`/phi-audit-log/unreviewed-count${siteParam}`);
      setCount(res.data?.data?.badgeCount ?? 0);
    } catch {
      // silent
    }
  }, [activeSiteId, isAuditor]);

  useEffect(() => {
    fetchCount();
    const interval = setInterval(fetchCount, 30000);
    const onRefresh = () => fetchCount();
    window.addEventListener(REFRESH_EVENT, onRefresh);

    const onAlert = (alert) => {
      if (alert?.entity_type === 'phi_conflict') fetchCount();
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
