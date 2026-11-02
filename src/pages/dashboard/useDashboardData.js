import { useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { loadMasterData } from '../../utils/masterDataUtils';
import {
  listEcphAll,
  listHarvestsAll,
  getHarvestSummary,
  getWaterUsage,
  getMonthlySummary,
} from '../../utils/backendApi';
import { fetchFertigationDashboardData } from './fertigationDashboardAdapter';
import { fetchWeatherForSiteFields } from '../../utils/siteFieldWeather';
import { apiRequest } from '../../utils/api';
import { useActiveSite } from '../../contexts/ActiveSiteContext';

// ─── Agronomic thresholds (for EC/pH icon coloring) ─────────────────
function useAgronomicThresholds() {
  return useQuery({
    queryKey: ['agronomicThresholds'],
    queryFn: () => apiRequest('/agronomic/thresholds'),
    staleTime: 30 * 1000,
    select: (res) => Array.isArray(res) ? res : res.data || [],
  });
}

// ─── Master data ────────────────────────────────────────────────────
function useMasterData() {
  return useQuery({
    queryKey: ['masterData'],
    queryFn: loadMasterData,
    staleTime: 5 * 60 * 1000, // 5 min — rarely changes
  });
}

// ─── Core farm data (ecph, fertigation, harvest, field overview) ────
function useFarmData(siteId, dateFrom, dateTo) {
  const siteParam = siteId ? { site_id: siteId } : {};

  const ecph = useQuery({
    queryKey: ['dashboard', 'ecph', siteId],
    queryFn: () => listEcphAll(siteParam),
  });

  const fertigation = useQuery({
    queryKey: ['dashboard', 'fertigation', siteId, dateFrom, dateTo],
    queryFn: () => {
      const params = { ...siteParam };
      if (dateFrom) params.start_date = dateFrom;
      if (dateTo) params.end_date = dateTo;
      return fetchFertigationDashboardData(params);
    },
  });

  const harvests = useQuery({
    queryKey: ['dashboard', 'harvest', siteId],
    queryFn: () => listHarvestsAll(siteParam),
  });

  const fieldOverview = useQuery({
    queryKey: ['dashboard', 'fieldOverview', siteId, dateFrom, dateTo],
    queryFn: () => {
      const params = new URLSearchParams();
      if (siteId) params.set('site_id', siteId);
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);
      const qs = params.toString();
      return apiRequest(`/ipm/field-overview${qs ? `?${qs}` : ''}`);
    },
    retry: false,
  });

  const isLoading = ecph.isLoading || fertigation.isLoading || harvests.isLoading;

  return {
    ecphData: ecph.data ?? [],
    fertigationData: fertigation.data ?? [],
    harvestData: harvests.data ?? [],
    fieldOverview: fieldOverview.data ?? [],
    isLoading,
  };
}

// ─── Analytics (water usage, harvest summary, monthly) ──────────────
function useAnalytics(analyticsParams) {
  const toISODate = (d) => d.toISOString().split('T')[0];
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const thisWeekStart = new Date(today);
  thisWeekStart.setDate(today.getDate() - (today.getDay() || 7) + 1);
  thisWeekStart.setHours(0, 0, 0, 0);
  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(thisWeekStart.getDate() - 7);

  const normalizeDateKey = (value) => {
    const d = new Date(value);
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const waterUsage = useQuery({
    queryKey: ['dashboard', 'waterUsage', analyticsParams],
    queryFn: () =>
      getWaterUsage({
        start_date: toISODate(yesterday),
        end_date: toISODate(today),
        group_by: 'day',
        ...analyticsParams,
      }),
    select: (data) =>
      Array.isArray(data)
        ? data.map((row) => ({
            ...row,
            period: normalizeDateKey(row.period),
            total_water: Number(row.total_water) || 0,
          }))
        : null,
  });

  const harvestSummary = useQuery({
    queryKey: ['dashboard', 'harvestSummary', analyticsParams],
    queryFn: () =>
      getHarvestSummary({
        start_date: toISODate(lastWeekStart),
        end_date: toISODate(today),
        group_by: 'week',
        ...analyticsParams,
      }),
    select: (data) =>
      Array.isArray(data)
        ? data.map((row) => ({
            ...row,
            period: normalizeDateKey(row.period),
            total_quantity: Number(row.total_quantity) || 0,
          }))
        : null,
  });

  const monthlySummary = useQuery({
    queryKey: ['dashboard', 'monthlySummary', analyticsParams],
    queryFn: () => getMonthlySummary(analyticsParams),
    select: (data) =>
      Array.isArray(data)
        ? data.map((row) => ({
            period: row.period,
            totalWater: Number(row.totalWater) || 0,
            totalFertilizer: Number(row.totalFertilizer) || 0,
            totalHarvest: Number(row.totalHarvest) || 0,
          }))
        : [],
  });

  return {
    waterUsageSummary: waterUsage.data ?? null,
    harvestSummary: harvestSummary.data ?? null,
    monthlySummary: monthlySummary.data ?? [],
  };
}

function useSiteFieldWeather(siteId, masterData) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['dashboard', 'fieldWeather', siteId],
    queryFn: () => fetchWeatherForSiteFields(masterData, siteId),
    enabled: Boolean(siteId && masterData?.countries?.length),
    staleTime: 10 * 60 * 1000,
    retry: false,
  });

  const refreshWeather = useCallback(() => {
    if (!siteId || !masterData?.countries?.length) return Promise.resolve();
    return queryClient.fetchQuery({
      queryKey: ['dashboard', 'fieldWeather', siteId],
      queryFn: () => fetchWeatherForSiteFields(masterData, siteId, { refresh: true }),
    });
  }, [siteId, masterData, queryClient]);

  return { ...query, refreshWeather };
}

// ─── Public hook ────────────────────────────────────────────────────
export default function useDashboardData({ selectedField, selectedFarmArea, selectedSite, startDate, endDate }) {
  const queryClient = useQueryClient();
  const { activeSiteId } = useActiveSite();

  const { data: masterData } = useMasterData();
  const { data: agronomicThresholds } = useAgronomicThresholds();
  const effectiveSiteId = selectedSite || activeSiteId;
  const { ecphData, fertigationData, harvestData, fieldOverview, isLoading } = useFarmData(effectiveSiteId, startDate, endDate);
  const {
    data: weatherByFieldId = {},
    isLoading: weatherLoading,
    isFetching: weatherFetching,
    refreshWeather,
  } = useSiteFieldWeather(effectiveSiteId, masterData);

  // Derived location lists
  const allSites = useMemo(() => {
    const sites = [];
    (masterData?.countries ?? []).forEach((country) => {
      country.sites?.forEach((site) => {
        sites.push({ ...site, countryName: country.name });
      });
    });
    return sites;
  }, [masterData]);

  const allFarmAreas = useMemo(() => {
    const farmAreas = [];
    (masterData?.countries ?? []).forEach((country) => {
      country.sites?.forEach((site) => {
        site.farmAreas?.forEach((farmArea) => {
          farmAreas.push({ ...farmArea, siteId: site.id, siteName: site.name, countryName: country.name });
        });
      });
    });
    return farmAreas;
  }, [masterData]);

  const allFields = useMemo(() => {
    const fields = [];
    (masterData?.countries ?? []).forEach((country) => {
      country.sites?.forEach((site) => {
        site.farmAreas?.forEach((farmArea) => {
          farmArea.fields?.forEach((field) => {
            fields.push({ ...field, siteId: site.id, siteName: site.name, farmAreaId: farmArea.id, farmAreaName: farmArea.name, countryName: country.name });
          });
        });
      });
    });
    return fields;
  }, [masterData]);

  // Filtered field IDs based on current selection
  const filteredFieldIds = useMemo(() => {
    if (selectedField) return new Set([selectedField]);
    if (selectedFarmArea) return new Set(allFields.filter((f) => f.farmAreaId === selectedFarmArea).map((f) => f.id));
    if (selectedSite) return new Set(allFields.filter((f) => f.siteId === selectedSite).map((f) => f.id));
    return null;
  }, [selectedField, selectedFarmArea, selectedSite, allFields]);

  const filterByField = useCallback(
    (entries) => (!filteredFieldIds ? entries : entries.filter((e) => filteredFieldIds.has(e.fieldId))),
    [filteredFieldIds],
  );

  const filteredEcph = useMemo(() => filterByField(ecphData), [ecphData, filterByField]);
  const filteredFertigation = useMemo(() => filterByField(fertigationData), [fertigationData, filterByField]);
  const filteredHarvest = useMemo(() => filterByField(harvestData), [harvestData, filterByField]);

  // Analytics params derived from selection
  const analyticsParams = useMemo(() => {
    const params = {};
    if (selectedField) params.field_id = selectedField;
    else if (selectedFarmArea) params.farm_area_id = selectedFarmArea;
    else if (selectedSite) params.site_id = selectedSite;
    if (startDate) params.start_date = startDate;
    if (endDate) params.end_date = endDate;
    return params;
  }, [selectedField, selectedSite, selectedFarmArea, startDate, endDate]);

  const { waterUsageSummary, harvestSummary, monthlySummary } = useAnalytics(analyticsParams);

  /** Call this from a WebSocket handler to refresh all dashboard data. */
  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  }, [queryClient]);

  return {
    isLoading,
    // Master / Location data
    masterData,
    allSites,
    allFarmAreas,
    allFields,
    // Filtered datasets
    ecphData: filteredEcph,
    fertigationData: filteredFertigation,
    harvestData: filteredHarvest,
    fieldOverview,
    weatherByFieldId,
    weatherLoading,
    weatherFetching,
    refreshWeather,
    // Agronomic thresholds (for EC/pH icons on field cards)
    agronomicThresholds: agronomicThresholds ?? [],
    // Analytics
    waterUsageSummary,
    harvestSummary,
    monthlySummary,
    // Actions
    refresh,
  };
}
