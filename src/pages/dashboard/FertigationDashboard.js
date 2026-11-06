import { useState, useEffect, useMemo } from 'react';
import {
  Box, Typography, Grid,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TableSortLabel, CircularProgress, IconButton,
} from '@mui/material';
import { ChevronLeftOutlined as ChevronLeft, ChevronRightOutlined as ChevronRight } from '@mui/icons-material';
import {
  LineChart, Line, BarChart, Bar, Area, PieChart, Pie, Cell,
  ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { listRecipesAll } from '../../utils/backendApi';
import { fetchFertigationDashboardData } from './fertigationDashboardAdapter';
import { formatDate, toNumber } from './dashboardUtils';
import DashboardSection, { DashboardChartBody } from '../../components/dashboard/DashboardSection';
import DashboardStatCard from '../../components/dashboard/DashboardStatCard';
import { excelTableSx, GutterCell } from '../../components/table/ExcelTable';
import { FARM_GREEN, CHART_GRID, CHART_TICK, CHART_TOOLTIP, CHART_COLORS } from '../../components/dashboard/dashboardChartTheme';

export default function FertigationDashboard({ fieldId, siteId, dateFrom, dateTo, allFields = [] }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortConfig, setSortConfig] = useState({ key: 'date', dir: 'desc' });
  const [recipes, setRecipes] = useState([]);
  const [chartOffset, setChartOffset] = useState(-1);

  useEffect(() => {
    listRecipesAll().then(items => setRecipes(items || [])).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = {};
    if (siteId) params.site_id = siteId;
    if (fieldId) params.field_id = fieldId;
    if (dateFrom) params.start_date = dateFrom;
    if (dateTo) params.end_date = dateTo;

    fetchFertigationDashboardData(params).then((items) => {
      if (!cancelled) { setData(items || []); setLoading(false); }
    }).catch(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [fieldId, siteId, dateFrom, dateTo]);

  const fieldMap = useMemo(() => {
    const m = {};
    allFields.forEach(f => { m[f.id] = f.name; });
    return m;
  }, [allFields]);

  const recipeMap = useMemo(() => {
    const m = {};
    recipes.forEach(r => { m[r.id] = r.name; });
    return m;
  }, [recipes]);

  const stats = useMemo(() => {
    if (data.length === 0) return { count: 0, avgWater: '-', avgFlow: '-', totalFert: '-', avgFreq: '-', avgValves: '-' };
    const avg = (arr) => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2) : '-';
    const sum = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0).toFixed(1) : '-';

    const waters = data.map(d => toNumber(d.dailyWater)).filter(v => v > 0);
    const flows = data.map(d => toNumber(d.flowRate)).filter(v => v > 0);
    const ferts = data.map(d => toNumber(d.totalFertilizer)).filter(v => v > 0);
    const freqs = data.map(d => toNumber(d.frequency)).filter(v => v > 0);
    const valves = data.map(d => toNumber(d.valvesCount)).filter(v => v > 0);

    return {
      count: data.length,
      avgWater: avg(waters),
      avgFlow: avg(flows),
      totalFert: sum(ferts),
      avgFreq: avg(freqs),
      avgValves: avg(valves),
    };
  }, [data]);

  const allTrendData = useMemo(() => {
    const byDate = {};
    data.forEach(entry => {
      const d = (entry.date || '').toString().split('T')[0];
      if (!d) return;
      if (!byDate[d]) byDate[d] = { water: [], fert: [], flow: [] };
      const w = toNumber(entry.dailyWater);
      if (w > 0) byDate[d].water.push(w);
      const f = toNumber(entry.totalFertilizer);
      if (f > 0) byDate[d].fert.push(f);
      const fl = toNumber(entry.flowRate);
      if (fl > 0) byDate[d].flow.push(fl);
    });
    const avg = (arr) => arr.length ? parseFloat((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2)) : null;
    const sum = (arr) => arr.length ? parseFloat(arr.reduce((a, b) => a + b, 0).toFixed(2)) : null;
    return Object.keys(byDate).sort().map(d => ({
      date: formatDate(d),
      dailyWater: sum(byDate[d].water),
      totalFertilizer: sum(byDate[d].fert),
      flowRate: avg(byDate[d].flow),
    }));
  }, [data]);

  const FERT_VISIBLE = 30;
  const fertEffectiveOffset = chartOffset < 0 ? Math.max(0, allTrendData.length - FERT_VISIBLE) : chartOffset;
  const trendData = allTrendData.slice(fertEffectiveOffset, fertEffectiveOffset + FERT_VISIBLE);
  const fertCanGoLeft = fertEffectiveOffset > 0;
  const fertCanGoRight = fertEffectiveOffset + FERT_VISIBLE < allTrendData.length;

  const fieldComparisonData = useMemo(() => {
    if (fieldId) return [];
    const byField = {};
    data.forEach(entry => {
      const name = fieldMap[entry.fieldId] || entry.fieldId;
      if (!byField[name]) byField[name] = { water: [], fert: [] };
      const w = toNumber(entry.dailyWater);
      if (w > 0) byField[name].water.push(w);
      const f = toNumber(entry.totalFertilizer);
      if (f > 0) byField[name].fert.push(f);
    });
    const avg = (arr) => arr.length ? parseFloat((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2)) : 0;
    return Object.entries(byField).map(([name, vals]) => ({
      name,
      dailyWater: avg(vals.water),
      totalFertilizer: avg(vals.fert),
    })).sort((a, b) => a.name.localeCompare(b.name));
  }, [data, fieldId, fieldMap]);

  const fertCompositionData = useMemo(() => {
    const totals = {};
    data.forEach(entry => {
      if (entry.fertilizers && typeof entry.fertilizers === 'object') {
        Object.entries(entry.fertilizers).forEach(([name, qty]) => {
          const val = toNumber(qty);
          if (val > 0) totals[name] = (totals[name] || 0) + val;
        });
      }
    });
    return Object.entries(totals)
      .map(([name, total]) => ({ name, total: parseFloat(total.toFixed(2)) }))
      .sort((a, b) => b.total - a.total);
  }, [data]);

  const cumulativeData = useMemo(() => {
    const byDate = {};
    data.forEach(entry => {
      const d = (entry.date || '').toString().split('T')[0];
      if (!d) return;
      const f = toNumber(entry.totalFertilizer);
      if (f > 0) byDate[d] = (byDate[d] || 0) + f;
    });
    let cumulative = 0;
    return Object.keys(byDate).sort().map(d => {
      cumulative += byDate[d];
      return { date: formatDate(d), cumulative: parseFloat(cumulative.toFixed(2)), daily: parseFloat(byDate[d].toFixed(2)) };
    });
  }, [data]);

  const recipeUsageData = useMemo(() => {
    const counts = {};
    data.forEach(entry => {
      if (entry.recipeId) {
        const name = recipeMap[entry.recipeId] || entry.recipeId;
        counts[entry.recipeId] = (counts[entry.recipeId] || { count: 0, name });
        counts[entry.recipeId].count += 1;
        if (recipeMap[entry.recipeId]) counts[entry.recipeId].name = recipeMap[entry.recipeId];
      }
    });
    return Object.values(counts)
      .map(r => ({ name: r.name, count: r.count }))
      .sort((a, b) => b.count - a.count);
  }, [data, recipeMap]);

  const fertPerFieldData = useMemo(() => {
    if (fieldId) return { chartData: [], fertNames: [] };
    const byField = {};
    const allFertNames = new Set();
    data.forEach(entry => {
      const name = fieldMap[entry.fieldId] || entry.fieldId;
      if (!byField[name]) byField[name] = {};
      if (entry.fertilizers && typeof entry.fertilizers === 'object') {
        Object.entries(entry.fertilizers).forEach(([fName, qty]) => {
          const val = toNumber(qty);
          if (val > 0) {
            byField[name][fName] = (byField[name][fName] || 0) + val;
            allFertNames.add(fName);
          }
        });
      }
    });
    const fertNames = [...allFertNames].sort();
    const chartData = Object.entries(byField).map(([field, ferts]) => {
      const row = { name: field };
      fertNames.forEach(fn => { row[fn] = parseFloat((ferts[fn] || 0).toFixed(2)); });
      return row;
    }).sort((a, b) => a.name.localeCompare(b.name));
    return { chartData, fertNames };
  }, [data, fieldId, fieldMap]);

  const weeklyData = useMemo(() => {
    const byWeek = {};
    data.forEach(entry => {
      const wk = entry.weekNumber;
      if (!wk) return;
      if (!byWeek[wk]) byWeek[wk] = { water: 0, fert: 0 };
      const w = toNumber(entry.dailyWater);
      if (w > 0) byWeek[wk].water += w;
      const f = toNumber(entry.totalFertilizer);
      if (f > 0) byWeek[wk].fert += f;
    });
    return Object.keys(byWeek)
      .map(Number)
      .sort((a, b) => a - b)
      .map(wk => ({
        week: `W${wk}`,
        water: parseFloat(byWeek[wk].water.toFixed(2)),
        fertilizer: parseFloat(byWeek[wk].fert.toFixed(2)),
      }));
  }, [data]);

  const tableData = useMemo(() => {
    const rows = data.slice(0, 200).map(entry => ({
      date: formatDate(entry.date),
      rawDate: entry.date,
      fieldName: fieldMap[entry.fieldId] || entry.fieldId,
      weekNumber: entry.weekNumber ?? '-',
      flowRate: toNumber(entry.flowRate) || '-',
      frequency: entry.frequency ?? '-',
      valvesCount: entry.valvesCount ?? '-',
      dailyWater: toNumber(entry.dailyWater) || '-',
      totalFertilizer: toNumber(entry.totalFertilizer) || '-',
    }));
    if (!sortConfig.key) return rows;
    return [...rows].sort((a, b) => {
      const av = a[sortConfig.key], bv = b[sortConfig.key];
      const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av || '').localeCompare(String(bv || ''));
      return sortConfig.dir === 'asc' ? cmp : -cmp;
    });
  }, [data, fieldMap, sortConfig]);

  const handleSort = (key) => {
    setSortConfig(prev => prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' });
  };

  if (loading) {
    return <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /><Typography sx={{ mt: 1 }}>Loading fertigation data...</Typography></Box>;
  }

  if (data.length === 0) {
    return <Box sx={{ p: 4, textAlign: 'center' }}><Typography color="text.secondary">No fertigation data found for the selected filters.</Typography></Box>;
  }

  return (
    <Box>
      <Grid container spacing={1.5} sx={{ mb: 3 }}>
        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <DashboardStatCard title="Total Entries" value={stats.count} color="#333" />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <DashboardStatCard title="Avg Daily Water" value={stats.avgWater} subtitle="m³" />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <DashboardStatCard title="Avg Flow Rate" value={stats.avgFlow} color="#3b82f6" />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <DashboardStatCard title="Total Fertilizer" value={stats.totalFert} subtitle="kg" color="#f59e0b" />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <DashboardStatCard title="Avg Frequency" value={stats.avgFreq} color="#2f6aa8" />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <DashboardStatCard title="Avg Valves" value={stats.avgValves} color="#a84b07" />
        </Grid>
      </Grid>

      <DashboardSection title="Daily Water Usage (m³)">
        <DashboardChartBody height={340}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: CHART_TICK }} />
              <YAxis tick={{ fontSize: 11, fill: CHART_TICK }} />
              <RTooltip contentStyle={CHART_TOOLTIP} />
              <Legend />
              <Line type="monotone" dataKey="dailyWater" name="Daily Water (m³)" stroke={FARM_GREEN} strokeWidth={2} dot={{ r: 3 }} connectNulls />
              <Line type="monotone" dataKey="flowRate" name="Flow Rate" stroke="#4b8fc4" strokeWidth={2} dot={{ r: 3 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </DashboardChartBody>
      </DashboardSection>

      <DashboardSection title="Total Fertilizer (kg)">
        <DashboardChartBody
          height={300}
          footer={allTrendData.length > FERT_VISIBLE ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 2, mt: 1 }}>
              <IconButton disabled={!fertCanGoLeft} onClick={() => setChartOffset(Math.max(0, fertEffectiveOffset - 7))} size="small" aria-label="Previous">
                <ChevronLeft />
              </IconButton>
              <Typography variant="caption" color="text.secondary">
                {trendData[0]?.date} — {trendData[trendData.length - 1]?.date}
              </Typography>
              <IconButton disabled={!fertCanGoRight} onClick={() => setChartOffset(Math.min(allTrendData.length - FERT_VISIBLE, fertEffectiveOffset + 7))} size="small" aria-label="Next">
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
              <Bar dataKey="totalFertilizer" name="Total Fertilizer (kg)" fill="#d08a1e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </DashboardChartBody>
      </DashboardSection>

      {fertCompositionData.length > 0 && (
        <DashboardSection title="Fertilizer Composition (Total kg)">
          <DashboardChartBody height={Math.max(300, fertCompositionData.length * 32)}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={fertCompositionData} layout="vertical" margin={{ left: 120 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                <XAxis type="number" tick={{ fontSize: 11, fill: CHART_TICK }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: CHART_TICK }} width={120} />
                <RTooltip contentStyle={CHART_TOOLTIP} />
                <Bar dataKey="total" name="Total (kg)" radius={[0, 4, 4, 0]}>
                  {fertCompositionData.map((_, idx) => (
                    <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </DashboardChartBody>
        </DashboardSection>
      )}

      {cumulativeData.length > 0 && (
        <DashboardSection title="Cumulative Fertilizer Usage (kg)">
          <DashboardChartBody height={340}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={cumulativeData}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: CHART_TICK }} />
                <YAxis tick={{ fontSize: 11, fill: CHART_TICK }} />
                <RTooltip contentStyle={CHART_TOOLTIP} />
                <Legend />
                <Area type="monotone" dataKey="cumulative" name="Cumulative (kg)" stroke="#2f6aa8" fill="#2f6aa8" fillOpacity={0.15} strokeWidth={2} />
                <Line type="monotone" dataKey="daily" name="Daily (kg)" stroke="#d08a1e" strokeWidth={1.5} dot={{ r: 2 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </DashboardChartBody>
        </DashboardSection>
      )}

      {recipeUsageData.length > 0 && (
        <DashboardSection title="Recipe Usage (number of entries)">
          <DashboardChartBody height={300}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={recipeUsageData} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`} labelLine={{ strokeWidth: 1 }}>
                  {recipeUsageData.map((_, idx) => (
                    <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <RTooltip contentStyle={CHART_TOOLTIP} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </DashboardChartBody>
        </DashboardSection>
      )}

      {weeklyData.length > 0 && (
        <DashboardSection title="Weekly Fertilizer & Water Summary">
          <DashboardChartBody height={320}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyData}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                <XAxis dataKey="week" tick={{ fontSize: 11, fill: CHART_TICK }} />
                <YAxis tick={{ fontSize: 11, fill: CHART_TICK }} />
                <RTooltip contentStyle={CHART_TOOLTIP} />
                <Legend />
                <Bar dataKey="water" name="Water (m³)" fill={FARM_GREEN} radius={[4, 4, 0, 0]} />
                <Bar dataKey="fertilizer" name="Fertilizer (kg)" fill="#d08a1e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </DashboardChartBody>
        </DashboardSection>
      )}

      {!fieldId && fertPerFieldData.chartData.length > 0 && fertPerFieldData.fertNames.length > 0 && (
        <DashboardSection title="Fertilizer per Field (kg)">
          <DashboardChartBody height={Math.max(340, fertPerFieldData.chartData.length * 40)}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={fertPerFieldData.chartData} layout="vertical" margin={{ left: 80 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                <XAxis type="number" tick={{ fontSize: 11, fill: CHART_TICK }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: CHART_TICK }} width={80} />
                <RTooltip contentStyle={CHART_TOOLTIP} />
                <Legend />
                {fertPerFieldData.fertNames.slice(0, 8).map((fn, idx) => (
                  <Bar key={fn} dataKey={fn} stackId="fert" fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </DashboardChartBody>
        </DashboardSection>
      )}

      {!fieldId && fieldComparisonData.length > 0 && (
        <DashboardSection title="Field Comparison (Avg Daily Water & Fertilizer)">
          <DashboardChartBody height={340}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={fieldComparisonData}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: CHART_TICK, angle: -30 }} height={60} />
                <YAxis tick={{ fontSize: 11, fill: CHART_TICK }} />
                <RTooltip contentStyle={CHART_TOOLTIP} />
                <Legend />
                <Bar dataKey="dailyWater" name="Avg Water (m³)" fill={FARM_GREEN} radius={[4, 4, 0, 0]} />
                <Bar dataKey="totalFertilizer" name="Avg Fertilizer (kg)" fill="#d08a1e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </DashboardChartBody>
        </DashboardSection>
      )}

      <DashboardSection title="Recent Entries">
        <TableContainer sx={{ maxHeight: 400 }}>
          <Table size="small" sx={excelTableSx}>
            <TableHead>
              <TableRow>
                <GutterCell />
                {[
                  { key: 'date', label: 'Date' },
                  { key: 'fieldName', label: 'Field' },
                  { key: 'weekNumber', label: 'Week' },
                  { key: 'flowRate', label: 'Flow Rate', numeric: true },
                  { key: 'frequency', label: 'Frequency', numeric: true },
                  { key: 'valvesCount', label: 'Valves', numeric: true },
                  { key: 'dailyWater', label: 'Daily Water (m³)', numeric: true },
                  { key: 'totalFertilizer', label: 'Total Fert (kg)', numeric: true },
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
                  <TableCell>{r.weekNumber}</TableCell>
                  <TableCell className="col-numeric">{r.flowRate}</TableCell>
                  <TableCell className="col-numeric">{r.frequency}</TableCell>
                  <TableCell className="col-numeric">{r.valvesCount}</TableCell>
                  <TableCell className="col-numeric">{r.dailyWater}</TableCell>
                  <TableCell className="col-numeric">{r.totalFertilizer}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        {data.length > 200 && (
          <Typography variant="caption" color="text.secondary" sx={{ px: 2, py: 1, display: 'block' }}>
            Showing 200 of {data.length} entries
          </Typography>
        )}
      </DashboardSection>
    </Box>
  );
}
