import { useState, useEffect, useMemo } from 'react';
import {
  Box, Typography, Grid,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TableSortLabel, CircularProgress, IconButton,
} from '@mui/material';
import { ChevronLeftOutlined as ChevronLeft, ChevronRightOutlined as ChevronRight } from '@mui/icons-material';
import {
  BarChart, Bar, Line, PieChart, Pie, Cell,
  ComposedChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { listHarvestsAll } from '../../utils/backendApi';
import { formatDate, toNumber } from './dashboardUtils';
import DashboardSection, { DashboardChartBody } from '../../components/dashboard/DashboardSection';
import DashboardStatCard from '../../components/dashboard/DashboardStatCard';
import { excelTableSx, GutterCell } from '../../components/table/ExcelTable';
import { FARM_GREEN, CHART_GRID, CHART_TICK, CHART_TOOLTIP, CHART_COLORS } from '../../components/dashboard/dashboardChartTheme';

export default function HarvestDashboard({ fieldId, siteId, dateFrom, dateTo, allFields = [] }) {
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

    listHarvestsAll(params).then((items) => {
      if (!cancelled) { setData(items || []); setLoading(false); }
    }).catch(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [fieldId, siteId, dateFrom, dateTo]);

  const fieldMap = useMemo(() => {
    const m = {};
    allFields.forEach(f => { m[f.id] = f.name; });
    return m;
  }, [allFields]);

  const stats = useMemo(() => {
    if (data.length === 0) return { count: 0, totalKg: '0', avgPerEntry: '0', topCrop: '-' };
    const total = data.reduce((sum, d) => sum + toNumber(d.totalQuantity), 0);
    const cropTotals = {};
    data.forEach(d => {
      (d.varieties || []).forEach(v => {
        const name = v.variety || 'Unknown';
        cropTotals[name] = (cropTotals[name] || 0) + toNumber(v.quantity);
      });
    });
    const topCrop = Object.entries(cropTotals).sort((a, b) => b[1] - a[1])[0];

    return {
      count: data.length,
      totalKg: total.toLocaleString(undefined, { maximumFractionDigits: 1 }),
      avgPerEntry: (total / data.length).toFixed(1),
      topCrop: topCrop ? topCrop[0] : '-',
    };
  }, [data]);

  const allTrendData = useMemo(() => {
    const byDate = {};
    data.forEach(entry => {
      const d = (entry.date || '').toString().split('T')[0];
      if (!d) return;
      byDate[d] = (byDate[d] || 0) + toNumber(entry.totalQuantity);
    });
    return Object.keys(byDate).sort().map(d => ({
      date: formatDate(d),
      quantity: parseFloat(byDate[d].toFixed(1)),
    }));
  }, [data]);

  const VISIBLE_POINTS = 30;
  const effectiveOffset = chartOffset < 0 ? Math.max(0, allTrendData.length - VISIBLE_POINTS) : chartOffset;
  const trendData = allTrendData.slice(effectiveOffset, effectiveOffset + VISIBLE_POINTS);
  const canGoLeft = effectiveOffset > 0;
  const canGoRight = effectiveOffset + VISIBLE_POINTS < allTrendData.length;

  const fieldComparisonData = useMemo(() => {
    if (fieldId) return [];
    const byField = {};
    data.forEach(entry => {
      const name = fieldMap[entry.fieldId] || entry.fieldName || entry.fieldId;
      byField[name] = (byField[name] || 0) + toNumber(entry.totalQuantity);
    });
    return Object.entries(byField)
      .map(([name, total]) => ({ name, total: parseFloat(total.toFixed(1)) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 20);
  }, [data, fieldId, fieldMap]);

  const cropBreakdownData = useMemo(() => {
    const totals = {};
    data.forEach(entry => {
      (entry.varieties || []).forEach(v => {
        const name = v.variety || 'Unknown';
        totals[name] = (totals[name] || 0) + toNumber(v.quantity);
      });
    });
    return Object.entries(totals)
      .map(([name, total]) => ({ name, total: parseFloat(total.toFixed(1)) }))
      .sort((a, b) => b.total - a.total);
  }, [data]);

  const cumulativeData = useMemo(() => {
    const byDate = {};
    data.forEach(entry => {
      const d = (entry.date || '').toString().split('T')[0];
      if (!d) return;
      byDate[d] = (byDate[d] || 0) + toNumber(entry.totalQuantity);
    });
    let cumulative = 0;
    return Object.keys(byDate).sort().map(d => {
      cumulative += byDate[d];
      return { date: formatDate(d), cumulative: parseFloat(cumulative.toFixed(1)), daily: parseFloat(byDate[d].toFixed(1)) };
    });
  }, [data]);

  const tableData = useMemo(() => {
    const rows = data.slice(0, 200).map(entry => {
      const varieties = entry.varieties || [];
      const mainVariety = varieties.length > 0 ? varieties[0] : {};
      return {
        date: formatDate(entry.date),
        rawDate: entry.date,
        fieldName: fieldMap[entry.fieldId] || entry.fieldName || entry.fieldId,
        cropName: mainVariety.variety || '-',
        quantity: toNumber(entry.totalQuantity),
        grade: mainVariety.grade || '-',
      };
    });
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
    return <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /><Typography sx={{ mt: 1 }}>Loading harvest data...</Typography></Box>;
  }

  if (data.length === 0) {
    return <Box sx={{ p: 4, textAlign: 'center' }}><Typography color="text.secondary">No harvest data found for the selected filters.</Typography></Box>;
  }

  return (
    <Box>
      <Grid container spacing={1.5} sx={{ mb: 3 }}>
        <Grid size={{ xs: 6, sm: 3 }}>
          <DashboardStatCard title="Total Harvest" value={`${stats.totalKg} kg`} />
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <DashboardStatCard title="Entries" value={stats.count} />
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <DashboardStatCard title="Avg per Entry" value={`${stats.avgPerEntry} kg`} color="#3b82f6" />
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <DashboardStatCard title="Top Crop" value={stats.topCrop} color="#f59e0b" />
        </Grid>
      </Grid>

      <DashboardSection title="Daily Harvest Trend (kg)">
        <DashboardChartBody
          height={340}
          footer={allTrendData.length > VISIBLE_POINTS ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 2, mt: 1 }}>
              <IconButton disabled={!canGoLeft} onClick={() => setChartOffset(Math.max(0, effectiveOffset - 7))} size="small" aria-label="Previous">
                <ChevronLeft />
              </IconButton>
              <Typography variant="caption" color="text.secondary">
                {trendData[0]?.date} — {trendData[trendData.length - 1]?.date}
              </Typography>
              <IconButton disabled={!canGoRight} onClick={() => setChartOffset(Math.min(allTrendData.length - VISIBLE_POINTS, effectiveOffset + 7))} size="small" aria-label="Next">
                <ChevronRight />
              </IconButton>
            </Box>
          ) : null}
        >
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: CHART_TICK }} />
              <YAxis tick={{ fontSize: 11, fill: CHART_TICK }} />
              <RTooltip contentStyle={CHART_TOOLTIP} />
              <Legend />
              <Bar dataKey="quantity" name="Daily Harvest (kg)" fill={FARM_GREEN} radius={[4, 4, 0, 0]} />
              <Line type="monotone" dataKey="quantity" name="Trend" stroke="#e65100" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </DashboardChartBody>
      </DashboardSection>

      {!fieldId && fieldComparisonData.length > 0 && (
        <DashboardSection title="Harvest by Field (kg)">
          <DashboardChartBody height={Math.max(300, fieldComparisonData.length * 32)}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={fieldComparisonData} layout="vertical" margin={{ left: 100 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                <XAxis type="number" tick={{ fontSize: 11, fill: CHART_TICK }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: CHART_TICK }} width={100} />
                <RTooltip contentStyle={CHART_TOOLTIP} />
                <Bar dataKey="total" name="Total (kg)" radius={[0, 4, 4, 0]}>
                  {fieldComparisonData.map((_, idx) => (
                    <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </DashboardChartBody>
        </DashboardSection>
      )}

      {cropBreakdownData.length > 0 && (
        <DashboardSection title="Harvest by Crop / Variety">
          <DashboardChartBody height={320}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={cropBreakdownData} dataKey="total" nameKey="name" cx="50%" cy="50%" outerRadius={110} label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`} labelLine={{ strokeWidth: 1 }}>
                  {cropBreakdownData.map((_, idx) => (
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

      {cumulativeData.length > 1 && (
        <DashboardSection title="Cumulative Harvest (kg)">
          <DashboardChartBody height={340}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={cumulativeData}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: CHART_TICK }} />
                <YAxis tick={{ fontSize: 11, fill: CHART_TICK }} />
                <RTooltip contentStyle={CHART_TOOLTIP} />
                <Legend />
                <Area type="monotone" dataKey="cumulative" name="Cumulative (kg)" stroke="#2f6aa8" fill="#2f6aa8" fillOpacity={0.15} strokeWidth={2} />
                <Line type="monotone" dataKey="daily" name="Daily (kg)" stroke={FARM_GREEN} strokeWidth={1.5} dot={{ r: 2 }} />
              </ComposedChart>
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
                  { key: 'cropName', label: 'Crop / Variety' },
                  { key: 'quantity', label: 'Quantity (kg)', numeric: true },
                  { key: 'grade', label: 'Grade' },
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
                  <TableCell>{r.cropName}</TableCell>
                  <TableCell className="col-numeric">{r.quantity.toLocaleString()}</TableCell>
                  <TableCell>{r.grade}</TableCell>
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
