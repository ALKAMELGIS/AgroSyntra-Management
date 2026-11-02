import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../utils/api';
import { fetchOccupancyMap, uniqueFieldIdsFromRows } from '../utils/plantingOccupancy';

export default function usePlantingOccupancy(source, rows) {
  const fieldIds = useMemo(() => uniqueFieldIdsFromRows(rows), [rows]);
  const idsKey = fieldIds.slice().sort().join(',');

  const [occupancyByField, setOccupancyByField] = useState({});
  const [loading, setLoading] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    if (!idsKey) {
      setOccupancyByField({});
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    fetchOccupancyMap(apiRequest, source, idsKey.split(','))
      .then((map) => {
        if (!cancelled) {
          setOccupancyByField(map);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setOccupancyByField({});
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [source, idsKey, reloadToken]);

  return { occupancyByField, loading, reload, fieldIds };
}
