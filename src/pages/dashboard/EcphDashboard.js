import { useState, useEffect, useMemo } from 'react';
import {
  Box, Typography, Grid,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TableSortLabel, CircularProgress, IconButton,
} from '@mui/material';
import { ChevronLeftOutlined as ChevronLeft, ChevronRightOutlined as ChevronRight } from '@mui/icons-material';
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { listEcphAll } from '../../utils/backendApi';
import { formatDate, toNumber } from './dashboardUtils';
import DashboardSection, { DashboardChartBody } from '../../components/dashboard/DashboardSection';
import DashboardStatCard from '../../components/dashboard/DashboardStatCard';
import { excelTableSx, GutterCell } from '../../components/table/ExcelTable';
import { FARM_GREEN, CHART_GRID, CHART_TICK, CHART_TOOLTIP } from '../../components/dashboard/dashboardChartTheme';

export default function EcphDashboard({ fieldId, siteId, dateFrom, dateTo, allFields = [] }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortConfig, setSortConfig] = useState({ key: 'date', dir: 'desc' });
  const [chartOffset, setChartOffset] = useState(-1);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = {};
    if (siteId) params.site_id = siteId;
    if (fieldId) params.field_id = fieldId;
    if (dateFrom) params.start_date = dateFrom;
    if (dateTo) params.end_date = dateTo;

    listEcphAll(params).then((items) => {
      if (!cancelled) { setData(items || []); setLoading(false); }
    }).catch(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [fieldId, siteId, dateFrom, dateTo]);

  const fieldMap = useMemo(() => {
    const m = {};
    allFields.forEach(f => { m[f.id] = f.name; });
    return m;
  }, [allFields]);

  const flatReadings = useMemo(() => {
    const rows = [];
    data.forEach(entry => {
      const valves = entry.valveReadings || entry.valves || [];
      const fieldName = fieldMap[entry.fieldId] || entry.fieldName || entry.fieldId;
      valves.forEach(v => {
        rows.push({
          date: formatDate(entry.date),
          rawDate: entry.date,
          time: entry.time || '',
          fieldName,
          fieldId: entry.fieldId,
          valve: v.valveNumber ?? v.valve_number,
          ecIn: toNumber(v.ecIn ?? v.ec_in),
          ecOut: toNumber(v.ec ?? v.ecOut ?? v.ec_out),
          phIn: toNumber(v.phIn ?? v.ph_in),
          phOut: toNumber(v.ph ?? v.phOut ?? v.ph_out),
          dripVol: toNumber(v.dripVolume ?? v.drip_volume),
          drainVol: toNumber(v.drain ?? v.drainVolume ?? v.drain_volume),
          percentDrain: toNumber(v.percentDrain ?? v.percent_drain),
        });
      });
    });
    return rows;
  }, [data, fieldMap]);

  const stats = useMemo(() => {
    if (flatReadings.length === 0) return { ecIn: '-', ecOut: '-', phIn: '-', phOut: '-', drain: '-', count: 0 };
    const avg = (arr) => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2) : '-';
    const ecIns = flatReadings.map(r => r.ecIn).filter(v => v > 0);
    const ecOuts = flatReadings.map(r => r.ecOut).filter(v => v > 0);
    const phIns = flatReadings.map(r => r.phIn).filter(v => v > 0);
    const phOuts = flatReadings.map(r => r.phOut).filter(v => v > 0);
    const drains = flatReadings.map(r => r.percentDrain).filter(v => v > 0);
    return {
      ecIn: avg(ecIns), ecOut: avg(ecOuts),
      phIn: avg(phIns), phOut: avg(phOuts),
      drain: drains.length ? ((parseFloat(avg(drains)) * 100).toFixed(1) + '%') : '-',
      count: data.length,
    };
  }, [flatReadings, data.length]);

  const allTrendData = useMemo(() => {
    const byDate = {};
    flatReadings.forEach(r => {
      const d = r.rawDate?.split('T')[0] || r.date;
      if (!byDate[d]) byDate[d] = { ecIn: [], ecOut: [], phIn: [], phOut: [], drain: [] };
      if (r.ecIn > 0) byDate[d].ecIn.push(r.ecIn);
      if (r.ecOut > 0) byDate[d].ecOut.push(r.ecOut);
      if (r.phIn > 0) byDate[d].phIn.push(r.phIn);
      if (r.phOut > 0) byDate[d].phOut.push(r.phOut);
      if (r.percentDrain > 0) byDate[d].drain.push(r.percentDrain);
    });
    const avg = (arr) => arr.length ? parseFloat((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2)) : null;
    return Object.keys(byDate).sort().map(d => ({
      date: formatDate(d),
      ecIn: avg(byDate[d].ecIn),
      ecOut: avg(byDate[d].ecOut),
      phIn: avg(byDate[d].phIn),
      phOut: avg(byDate[d].phOut),
      drain: avg(byDate[d].drain) != null ? parseFloat((avg(byDate[d].drain) * 100).toFixed(1)) : null,
    }));
  }, [flatReadings]);

  const ECPH_VISIBLE = 30;
  const ecphEffectiveOffset = chartOffset < 0 ? Math.max(0, allTrendData.length - ECPH_VISIBLE) : chartOffset;
  const trendData = allTrendData.slice(ecphEffectiveOffset, ecphEffectiveOffset + ECPH_VISIBLE);
  const ecphCanGoLeft = ecphEffectiveOffset > 0;
  const ecphCanGoRight = ecphEffectiveOffset + ECPH_VISIBLE < allTrendData.length;

  const fieldComparisonData = useMemo(() => {
    if (fieldId) return [];
    const byField = {};
    flatReadings.forEach(r => {
      if (!byField[r.fieldName]) byField[r.fieldName] = { ecIn: [], phIn: [] };
      if (r.ecIn > 0) byField[r.fieldName].ecIn.push(r.ecIn);
      if (r.phIn > 0) byField[r.fieldName].phIn.push(r.phIn);
    });
    const avg = (arr) => arr.length ? parseFloat((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2)) : 0;
    return Object.entries(byField).map(([name, vals]) => ({
      name,
      ecIn: avg(vals.ecIn),
      phIn: avg(vals.phIn),
    })).sort((a, b) => a.name.localeCompare(b.name));
  }, [flatReadings, fieldId]);

  const tableData = useMemo(() => {
    const rows = flatReadings.slice(0, 200);
    if (!sortConfig.key) return rows;
    return [...rows].sort((a, b) => {
      const av = a[sortConfig.key], bv = b[sortConfig.key];
      const cmp = typeof av === 'number' ? av - bv : String(av || '').localeCompare(String(bv || ''));
      return sortConfig.dir === 'asc' ? cmp : -cmp;
    });
  }, [flatReadings, sortConfig]);

  const handleSort = (key) => {
    setSortConfig(prev => prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' });
  };

  if (loading) {
    return <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /><Typography sx={{ mt: 1 }}>Loading EC/pH data...</Typography></Box>;
  }

  if (data.length === 0) {
    return <Box sx={{ p: 4, textAlign: 'center' }}><Typography color="text.secondary">No EC/pH data found for the selected filters.</Typography></Box>;
  }

  return (
    <Box>
      <Grid container spacing={1.5} sx={{ mb: 3 }}>
        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <DashboardStatCard title="Avg EC In" value={stats.ecIn} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <DashboardStatCard title="Avg EC Out" value={stats.ecOut} color="#f59e0b" />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <DashboardStatCard title="Avg pH In" value={stats.phIn} color="#3b82f6" />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <DashboardStatCard title="Avg pH Out" value={stats.phOut} color="#2f6aa8" />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <DashboardStatCard title="Avg Drain %" value={stats.drain} color="#e65100" />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <DashboardStatCard title="Total Entries" value={stats.count} />
        </Grid>
      </Grid>

      <DashboardSection title="EC Trends">
        <DashboardChartBody height={340}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: CHART_TICK }} />
              <YAxis tick={{ fontSize: 11, fill: CHART_TICK }} />
              <RTooltip contentStyle={CHART_TOOLTIP} />
              <Legend />
              <Line type="monotone" dataKey="ecIn" name="EC In" stroke={FARM_GREEN} strokeWidth={2} dot={{ r: 3 }} connectNulls />
              <Line type="monotone" dataKey="ecOut" name="EC Out" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </DashboardChartBody>
      </DashboardSection>

      <DashboardSection title="pH Trends">
        <DashboardChartBody height={340}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: CHART_TICK }} />
              <YAxis tick={{ fontSize: 11, fill: CHART_TICK }} domain={['auto', 'auto']} />
              <RTooltip contentStyle={CHART_TOOLTIP} />
              <Legend />
              <Line type="monotone" dataKey="phIn" name="pH In" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              <Line type="monotone" dataKey="phOut" name="pH Out" stroke="#2f6aa8" strokeWidth={2} dot={{ r: 3 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </DashboardChartBody>
      </DashboardSection>

      <DashboardSection title="Drain %">
        <DashboardChartBody
          height={300}
          footer={allTrendData.length > ECPH_VISIBLE ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 2, mt: 1 }}>
              <IconButton disabled={!ecphCanGoLeft} onClick={() => setChartOffset(Math.max(0, ecphEffectiveOffset - 7))} size="small" aria-label="Previous">
                <ChevronLeft />
              </IconButton>
              <Typography variant="caption" color="text.secondary">
                {trendData[0]?.date} — {trendData[trendData.length - 1]?.date}
              </Typography>
              <IconButton disabled={!ecphCanGoRight} onClick={() => setChartOffset(Math.min(allTrendData.length - ECPH_VISIBLE, ecphEffectiveOffset + 7))} size="small" aria-label="Next">
                <ChevronRight />
              </IconButton>
            </Box>
          ) : null}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: CHART_TICK }} />
              <YAxis tick={{ fontSize: 11, fill: CHART_TICK }} />
              <RTooltip contentStyle={CHART_TOOLTIP} />
              <Bar dataKey="drain" name="% Drain" fill="#e65100" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </DashboardChartBody>
      </DashboardSection>

      {!fieldId && fieldComparisonData.length > 0 && (
        <DashboardSection title="Field Comparison (Avg EC & pH In)">
          <DashboardChartBody height={340}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={fieldComparisonData}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: CHART_TICK, angle: -30 }} height={60} />
                <YAxis tick={{ fontSize: 11, fill: CHART_TICK }} />
                <RTooltip contentStyle={CHART_TOOLTIP} />
                <Legend />
                <Bar dataKey="ecIn" name="EC In" fill={FARM_GREEN} radius={[4, 4, 0, 0]} />
                <Bar dataKey="phIn" name="pH In" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </DashboardChartBody>
        </DashboardSection>
      )}

      <DashboardSection title="Recent Readings">
        <TableContainer sx={{ maxHeight: 400 }}>
          <Table size="small" sx={excelTableSx}>
            <TableHead>
              <TableRow>
                <GutterCell />
                {[
                  { key: 'date', label: 'Date' },
                  { key: 'fieldName', label: 'Field' },
                  { key: 'valve', label: 'Valve', numeric: true },
                  { key: 'ecIn', label: 'EC In', numeric: true },
                  { key: 'ecOut', label: 'EC Out', numeric: true },
                  { key: 'phIn', label: 'pH In', numeric: true },
                  { key: 'phOut', label: 'pH Out', numeric: true },
                  { key: 'dripVol', label: 'Drip Vol', numeric: true },
                  { key: 'drainVol', label: 'Drain Vol', numeric: true },
                  { key: 'percentDrain', label: '% Drain', numeric: true },
                ].map((col) => (
                  <TableCell key={col.key} className={col.numeric ? 'col-numeric' : undefined}>
                    <TableSortLabel
                      active={sortConfig.key === col.key}
                      direction={sortConfig.key === col.key ? sortConfig.dir : 'asc'}
                      onClick={() => handleSort(col.key)}
                    >
                      {col.label}
                    </TableSortLabel>
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {tableData.map((r, i) => (
                <TableRow key={i} hover>
                  <GutterCell index={i + 1} />
                  <TableCell>{r.date}</TableCell>
                  <TableCell>{r.fieldName}</TableCell>
                  <TableCell className="col-numeric">{r.valve}</TableCell>
                  <TableCell className="col-numeric">{r.ecIn || '-'}</TableCell>
                  <TableCell className="col-numeric">{r.ecOut || '-'}</TableCell>
                  <TableCell className="col-numeric">{r.phIn || '-'}</TableCell>
                  <TableCell className="col-numeric">{r.phOut || '-'}</TableCell>
                  <TableCell className="col-numeric">{r.dripVol || '-'}</TableCell>
                  <TableCell className="col-numeric">{r.drainVol || '-'}</TableCell>
                  <TableCell className="col-numeric">{r.percentDrain ? `${(r.percentDrain * 100).toFixed(1)}%` : '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        {flatReadings.length > 200 && (
          <Typography variant="caption" color="text.secondary" sx={{ px: 2, py: 1, display: 'block' }}>
            Showing 200 of {flatReadings.length} readings
          </Typography>
        )}
      </DashboardSection>
    </Box>
  );
}
