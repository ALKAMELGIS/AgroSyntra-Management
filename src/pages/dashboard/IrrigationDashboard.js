import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box, CircularProgress, FormControlLabel, Grid, Switch, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Typography,
} from '@mui/material';
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis,
} from 'recharts';
import { apiRequest } from '../../utils/api';
import { listFertigationAll, listIrrigationRecordsAll, listWeatherLogsAll } from '../../utils/backendApi';
import DashboardSection, { DashboardChartBody } from '../../components/dashboard/DashboardSection';
import DashboardStatCard from '../../components/dashboard/DashboardStatCard';
import { excelTableSx, GutterCell } from '../../components/table/ExcelTable';
import { FARM_GREEN, CHART_GRID, CHART_TICK, CHART_TOOLTIP } from '../../components/dashboard/dashboardChartTheme';
import { formatDate, toIsoDate } from './dashboardUtils';
import { indexFertigationByHouseDate, waterOnlyRemainder } from './irrigationWaterOnly';
import { attachTemps, buildDailyTempIndex, formatTempRange } from './irrigationWeather';

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function matchesField(entryFieldId, locationLabel, fieldId, fieldName) {
  if (!fieldId) return true;
  if (entryFieldId && entryFieldId === fieldId) return true;
  if (fieldName && locationLabel && String(locationLabel) === String(fieldName)) return true;
  return false;
}

/** Hover for the daily water chart: water in m³, plus that day's site temperature when logged. */
function WaterTempTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload || {};
  const temp = formatTempRange(point);
  return (
    <Box sx={{ ...CHART_TOOLTIP, bgcolor: 'background.paper', px: 1.25, py: 0.75 }}>
      <Typography sx={{ fontSize: 12, fontWeight: 600, mb: 0.25 }}>{point.date}</Typography>
      <Typography sx={{ fontSize: 12, color: FARM_GREEN }}>Water: {Number(point.water).toFixed(2)} m³</Typography>
      {temp && <Typography sx={{ fontSize: 12, color: '#a84b07' }}>Temp: {temp}</Typography>}
    </Box>
  );
}

export default function IrrigationDashboard({
  fieldId = '',
  siteId = '',
  dateFrom = '',
  dateTo = '',
  allFields = [],
}) {
  const [entries, setEntries] = useState([]);
  const [pivotRows, setPivotRows] = useState([]);
  const [fertigationEntries, setFertigationEntries] = useState([]);
  const [weatherLogs, setWeatherLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [waterOnly, setWaterOnly] = useState(false);

  const fieldName = useMemo(
    () => (allFields || []).find((f) => f.id === fieldId)?.name || '',
    [allFields, fieldId],
  );

  const load = useCallback(async () => {
    if (!siteId) {
      setEntries([]);
      setPivotRows([]);
      setFertigationEntries([]);
      setWeatherLogs([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ site_id: siteId });
      if (dateFrom) params.set('start_date', dateFrom);
      if (dateTo) params.set('end_date', dateTo);
      const fertParams = {
        site_id: siteId,
        start_date: dateFrom || undefined,
        end_date: dateTo || undefined,
        field_id: fieldId || undefined,
      };
      const [drip, pivot, fert, weather] = await Promise.all([
        apiRequest(`/irrigation-drip?${params.toString()}`),
        listIrrigationRecordsAll({
          site_id: siteId,
          start_date: dateFrom || undefined,
          end_date: dateTo || undefined,
          field_id: fieldId || undefined,
        }).catch(() => []),
        listFertigationAll(fertParams).catch(() => []),
        // Site weather for the chart hover; a failure only hides the temperature.
        listWeatherLogsAll({
          site_id: siteId,
          start_date: dateFrom || undefined,
          end_date: dateTo || undefined,
        }).catch(() => []),
      ]);
      setEntries(drip || []);
      setPivotRows(pivot || []);
      setFertigationEntries(fert || []);
      setWeatherLogs(weather || []);
    } catch (e) {
      setError(e.message || 'Failed to load irrigation dashboard');
      setEntries([]);
      setPivotRows([]);
      setFertigationEntries([]);
      setWeatherLogs([]);
    } finally {
      setLoading(false);
    }
  }, [siteId, dateFrom, dateTo, fieldId]);

  useEffect(() => { load(); }, [load]);

  const dripRows = useMemo(() => (
    (entries || []).filter((e) => (
      (toNum(e.dailyWater) > 0 || toNum(e.frequency) > 0)
      && matchesField(e.fieldId, e.locationLabel, fieldId, fieldName)
    ))
  ), [entries, fieldId, fieldName]);

  const fertigationIndex = useMemo(
    () => indexFertigationByHouseDate(fertigationEntries, allFields),
    [fertigationEntries, allFields],
  );

  const dripVisible = useMemo(() => {
    if (!waterOnly) {
      return dripRows.map((e) => ({
        ...e,
        displayFrequency: e.frequency,
        displayDailyTotal: e.dailyWater,
      }));
    }
    return dripRows.map((e) => {
      const leftover = waterOnlyRemainder(e, fertigationIndex, allFields);
      return {
        ...e,
        displayFrequency: leftover.frequency,
        displayDailyTotal: leftover.dailyWater,
      };
    }).filter((e) => toNum(e.displayDailyTotal) > 0 || toNum(e.displayFrequency) > 0);
  }, [dripRows, waterOnly, fertigationIndex, allFields]);

  const pivotFiltered = useMemo(() => (
    (pivotRows || []).filter((r) => !fieldId || r.fieldId === fieldId)
  ), [pivotRows, fieldId]);

  const waterByDate = useMemo(() => {
    const map = {};
    dripVisible.forEach((e) => {
      const d = toIsoDate(e.date);
      const w = toNum(e.displayDailyTotal);
      if (!d || w <= 0) return;
      map[d] = (map[d] || 0) + w;
    });
    pivotFiltered.forEach((r) => {
      const d = toIsoDate(r.date);
      const v = toNum(r.volumeM3);
      if (!d || v <= 0) return;
      map[d] = (map[d] || 0) + v;
    });
    const points = Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, water]) => ({
        isoDate: date,
        date: formatDate(date),
        water: Number(water.toFixed(2)),
      }));
    return attachTemps(points, buildDailyTempIndex(weatherLogs));
  }, [dripVisible, pivotFiltered, weatherLogs]);

  const freqByDate = useMemo(() => {
    const map = {};
    dripVisible.forEach((e) => {
      const d = toIsoDate(e.date);
      const c = toNum(e.displayFrequency);
      if (!d || c <= 0) return;
      map[d] = (map[d] || 0) + c;
    });
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, cycles]) => ({
        date: formatDate(date),
        cycles: Number(cycles.toFixed(2)),
      }));
  }, [dripVisible]);

  const tableRows = useMemo(() => {
    const drip = dripVisible.map((e) => ({
      id: e.id,
      date: toIsoDate(e.date),
      location: e.locationLabel || '',
      waterQty: e.waterQtyM3 ?? '',
      frequency: e.displayFrequency ?? '',
      dailyTotal: e.displayDailyTotal ?? '',
    }));
    const pivot = pivotFiltered.map((r) => ({
      id: r.id,
      date: toIsoDate(r.date),
      location: r.fieldName || fieldName || r.fieldId || 'Pivot',
      waterQty: r.volumeM3 ?? '',
      frequency: '',
      dailyTotal: r.volumeM3 ?? '',
    }));
    return [...drip, ...pivot].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }, [dripVisible, pivotFiltered, fieldName]);

  const totalWater = waterByDate.reduce((s, r) => s + r.water, 0);
  const totalCycles = freqByDate.reduce((s, r) => s + r.cycles, 0);
  const hasSourceData = dripRows.length > 0 || pivotFiltered.length > 0;
  const excludedFertCycles = waterOnly
    ? dripRows.reduce((sum, e) => {
      const leftover = waterOnlyRemainder(e, fertigationIndex, allFields);
      return sum + Math.max(0, toNum(e.frequency) - leftover.frequency);
    }, 0)
    : 0;

  const waterOnlySwitch = (
    <Box sx={{ mb: 2 }}>
      <FormControlLabel
        sx={{ ml: 0 }}
        control={(
          <Switch
            checked={waterOnly}
            onChange={(e) => setWaterOnly(e.target.checked)}
            color="primary"
          />
        )}
        label="Water only (exclude fertilizer cycles)"
      />
      {waterOnly && (
        <Typography variant="body2" color="text.secondary" sx={{ ml: 0.5 }}>
          Irrigation Daily Total minus Fertigation Daily Total (m³) for the same house and date
          {excludedFertCycles > 0 ? ` · ${Number(excludedFertCycles.toFixed(1))} fertigation cycles subtracted` : ''}.
        </Typography>
      )}
    </Box>
  );

  if (loading) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <CircularProgress />
        <Typography sx={{ mt: 1 }}>Loading irrigation data...</Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <Typography color="error">{error}</Typography>
      </Box>
    );
  }

  if (!hasSourceData) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <Typography color="text.secondary">No irrigation data found for the selected filters.</Typography>
      </Box>
    );
  }

  return (
    <Box>
      {waterOnlySwitch}
      {waterByDate.length === 0 && tableRows.length === 0 ? (
        <Box sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">No water-only irrigation in this range.</Typography>
        </Box>
      ) : (
        <>
      <Grid container spacing={1.5} sx={{ mb: 3 }}>
        <Grid size={{ xs: 6, sm: 4 }}>
          <DashboardStatCard title="Total water" value={totalWater.toFixed(1)} subtitle="m³" />
        </Grid>
        <Grid size={{ xs: 6, sm: 4 }}>
          <DashboardStatCard title="Total cycles" value={totalCycles.toFixed(0)} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4 }}>
          <DashboardStatCard title="Days with irrigation" value={waterByDate.length} />
        </Grid>
      </Grid>

      <DashboardSection title="Daily irrigation water (m³)">
        <DashboardChartBody height={340}>
          {waterByDate.length === 0 ? (
            <Typography color="text.secondary" sx={{ p: 2 }}>No irrigation water in this range.</Typography>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={waterByDate}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: CHART_TICK }} />
                <YAxis tick={{ fontSize: 11, fill: CHART_TICK }} unit=" m³" width={70} />
                <RTooltip content={<WaterTempTooltip />} />
                <Area type="monotone" dataKey="water" name="Water (m³)" stroke={FARM_GREEN} fill={FARM_GREEN} fillOpacity={0.25} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </DashboardChartBody>
      </DashboardSection>

      <DashboardSection title="Irrigation cycles">
        <DashboardChartBody height={300}>
          {freqByDate.length === 0 ? (
            <Typography color="text.secondary" sx={{ p: 2 }}>No irrigation cycles in this range.</Typography>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={freqByDate}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: CHART_TICK }} />
                <YAxis tick={{ fontSize: 11, fill: CHART_TICK }} />
                <RTooltip contentStyle={CHART_TOOLTIP} />
                <Area type="monotone" dataKey="cycles" name="cycles" stroke={FARM_GREEN} fill={FARM_GREEN} fillOpacity={0.25} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </DashboardChartBody>
      </DashboardSection>

      <DashboardSection title="Irrigation records">
        <TableContainer sx={{ maxHeight: 520 }}>
          <Table size="small" sx={excelTableSx} stickyHeader>
            <TableHead>
              <TableRow>
                <GutterCell />
                <TableCell>Date</TableCell>
                <TableCell>Location</TableCell>
                <TableCell>Water Qty (m³)</TableCell>
                <TableCell>Frequency</TableCell>
                <TableCell>Daily Total (m³)</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {tableRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center">No rows</TableCell>
                </TableRow>
              )}
              {tableRows.map((row, i) => (
                <TableRow key={row.id || `${row.date}-${row.location}-${i}`} hover>
                  <GutterCell index={i + 1} />
                  <TableCell>{formatDate(row.date)}</TableCell>
                  <TableCell>{row.location}</TableCell>
                  <TableCell>{row.waterQty}</TableCell>
                  <TableCell>{row.frequency}</TableCell>
                  <TableCell>{row.dailyTotal}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </DashboardSection>
        </>
      )}
    </Box>
  );
}
