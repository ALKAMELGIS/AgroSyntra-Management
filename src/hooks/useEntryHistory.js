import { useState, useEffect, useCallback } from 'react';
import { getDateRangeForPreset } from '../utils/entryDateRange';

export function useEntryHistory({
  fetchAll,
  siteId,
  datePreset = 'season',
  seasonRange = {},
  enabled = true,
  filterRow,
}) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!enabled) {
      setRows([]);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);

    const { start_date, end_date } = getDateRangeForPreset(datePreset, {
      startDate: seasonRange.startDate,
      endDate: seasonRange.endDate,
    });
    const params = {
      ...(siteId ? { site_id: siteId } : {}),
      ...(start_date ? { start_date } : {}),
      ...(end_date ? { end_date } : {}),
    };

    fetchAll(params)
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data) ? data : [];
        setRows(filterRow ? list.filter(filterRow) : list);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [fetchAll, siteId, datePreset, seasonRange.startDate, seasonRange.endDate, refreshKey, enabled, filterRow]);

  return { rows, loading, refresh };
}
