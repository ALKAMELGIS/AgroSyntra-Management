import { useCallback, useEffect, useMemo, useState } from 'react';
import { useActiveSeason } from '../contexts/ActiveSeasonContext';
import { clampDateToSeason, seasonListDateRange } from '../utils/seasonListDates';

/**
 * From/To dates that follow the sidebar season and can be narrowed inside it.
 */
export default function useSeasonListDates() {
  const { activeSeason, activeSeasonId, isLoaded } = useActiveSeason();
  const bounds = useMemo(() => seasonListDateRange(activeSeason), [activeSeason]);
  const [startDate, setStartDateRaw] = useState(bounds.startDate);
  const [endDate, setEndDateRaw] = useState(bounds.endDate);
  const [appliedKey, setAppliedKey] = useState(null);

  useEffect(() => {
    if (!isLoaded) return;
    setStartDateRaw(bounds.startDate);
    setEndDateRaw(bounds.endDate);
    setAppliedKey(activeSeasonId || '');
  }, [isLoaded, activeSeasonId, bounds.startDate, bounds.endDate]);

  const setStartDate = useCallback((value) => {
    setStartDateRaw(clampDateToSeason(value, bounds.startDate, bounds.endDate));
  }, [bounds.startDate, bounds.endDate]);

  const setEndDate = useCallback((value) => {
    setEndDateRaw(clampDateToSeason(value, bounds.startDate, bounds.endDate));
  }, [bounds.startDate, bounds.endDate]);

  return {
    startDate,
    endDate,
    setStartDate,
    setEndDate,
    seasonStart: bounds.startDate,
    seasonEnd: bounds.endDate,
    isReady: isLoaded && appliedKey === (activeSeasonId || ''),
  };
}
