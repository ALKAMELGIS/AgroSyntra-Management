import { useTranslation } from 'react-i18next';
import {
  Alert, Box, CircularProgress, Grid, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography,
} from '@mui/material';
import {
  Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis,
} from 'recharts';
import DashboardSection, { DashboardChartBody } from '../dashboard/DashboardSection';
import DashboardStatCard from '../dashboard/DashboardStatCard';
import { CHART_COLORS, CHART_GRID, CHART_TICK, CHART_TOOLTIP, FARM_GREEN } from '../dashboard/dashboardChartTheme';
import { excelTableSx, GutterCell } from '../table/ExcelTable';
import { formatAed, formatHours } from '../../utils/manpowerCost';
import { MissingRateAlert } from './ManpowerCostTable';

const MAX_ACTIVITY_BARS = 15;

function CostBarChart({ data, height }) {
  return (
    <DashboardChartBody height={height}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 11, fill: CHART_TICK }} />
          <YAxis type="category" dataKey="label" width={140} tick={{ fontSize: 11, fill: CHART_TICK }} />
          <RTooltip
            contentStyle={CHART_TOOLTIP}
            formatter={(value, _name, item) => [
              `${formatAed(value)} AED · ${formatHours(item?.payload?.hours)} h`,
            ]}
          />
          <Bar dataKey="cost" radius={[0, 4, 4, 0]}>
            {data.map((entry) => (
              <Cell key={entry.key} fill={entry.color || FARM_GREEN} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </DashboardChartBody>
  );
}

function chartHeight(count) {
  return Math.max(160, Math.min(count, MAX_ACTIVITY_BARS) * 32 + 40);
}

export default function ManpowerCostDashboard({ data, loading, error }) {
  const { t } = useTranslation();

  if (loading) {
    return <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>;
  }
  if (error) {
    return <Alert severity="error">{error.message || t('manpowerCost.loadFailed')}</Alert>;
  }
  if (!data || data.totals.hours === 0) {
    return <Box sx={{ p: 4, textAlign: 'center' }}><Typography color="text.secondary">{t('manpowerCost.noData')}</Typography></Box>;
  }

  const { totals } = data;
  const avgRate = totals.costedHours > 0 ? totals.cost / totals.costedHours : null;

  const categoryData = data.byCategory.map((b, i) => ({
    ...b,
    label: t(`manpowerCost.category.${b.key}`, { defaultValue: b.label }),
    color: CHART_COLORS[i % CHART_COLORS.length],
  }));
  const activityData = data.byActivity.slice(0, MAX_ACTIVITY_BARS).map((b) => ({
    ...b,
    label: b.label || t('manpowerCost.dashboard.unassigned'),
  }));
  const siteData = data.bySite.map((b, i) => ({
    ...b,
    label: b.label || t('manpowerCost.noSite'),
    color: CHART_COLORS[i % CHART_COLORS.length],
  }));

  return (
    <Box>
      <MissingRateAlert totals={totals} missingRate={data.missingRate} />

      <Grid container spacing={1.5} sx={{ mb: 3 }}>
        <Grid size={{ xs: 6, md: 3 }}>
          <DashboardStatCard title={t('manpowerCost.dashboard.totalCost')} value={formatAed(totals.cost)} />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <DashboardStatCard title={t('manpowerCost.dashboard.totalHours')} value={formatHours(totals.hours)} color="#3b82f6" />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <DashboardStatCard title={t('manpowerCost.dashboard.workers')} value={totals.workers} color="#6366f1" />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <DashboardStatCard title={t('manpowerCost.dashboard.avgRate')} value={formatAed(avgRate)} color="#f59e0b" />
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <DashboardSection title={t('manpowerCost.dashboard.casualVsPermanent')}>
            <CostBarChart data={categoryData} height={chartHeight(categoryData.length)} />
          </DashboardSection>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <DashboardSection title={t('manpowerCost.dashboard.bySite')}>
            <CostBarChart data={siteData} height={chartHeight(siteData.length)} />
          </DashboardSection>
        </Grid>
      </Grid>

      <DashboardSection title={t('manpowerCost.dashboard.byActivity')}>
        <CostBarChart data={activityData} height={chartHeight(activityData.length)} />
      </DashboardSection>

      <DashboardSection title={t('manpowerCost.dashboard.offGroup')}>
        {data.offGroupRate.length === 0 ? (
          <Typography color="text.secondary" sx={{ p: 2 }}>{t('manpowerCost.dashboard.offGroupNone')}</Typography>
        ) : (
          <TableContainer>
            <Table size="small" sx={excelTableSx}>
              <TableHead>
                <TableRow>
                  <GutterCell />
                  <TableCell>{t('manpowerCost.cols.employeeId')}</TableCell>
                  <TableCell>{t('manpowerCost.cols.worker')}</TableCell>
                  <TableCell>{t('manpowerCost.cols.category')}</TableCell>
                  <TableCell>{t('manpowerCost.cols.site')}</TableCell>
                  <TableCell className="col-numeric">{t('manpowerCost.cols.personalRate')}</TableCell>
                  <TableCell className="col-numeric">{t('manpowerCost.cols.groupRate')}</TableCell>
                  <TableCell className="col-numeric">{t('manpowerCost.cols.hours')}</TableCell>
                  <TableCell className="col-numeric">{t('manpowerCost.cols.cost')}</TableCell>
                  <TableCell className="col-numeric">{t('manpowerCost.cols.difference')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.offGroupRate.map((w, idx) => (
                  <TableRow key={w.workerId} hover>
                    <GutterCell index={idx + 1} />
                    <TableCell>{w.employeeId}</TableCell>
                    <TableCell>{w.workerName}</TableCell>
                    <TableCell>{t(`manpowerCost.category.${w.category}`, { defaultValue: w.category })}</TableCell>
                    <TableCell>{w.siteName || t('manpowerCost.noSite')}</TableCell>
                    <TableCell className="col-numeric">{w.personalRates.map(formatAed).join(' / ')}</TableCell>
                    <TableCell className="col-numeric">{formatAed(w.groupRate)}</TableCell>
                    <TableCell className="col-numeric">{formatHours(w.hours)}</TableCell>
                    <TableCell className="col-numeric">{formatAed(w.cost)}</TableCell>
                    <TableCell className="col-numeric">
                      {w.differenceVsGroup == null ? '-' : `${w.differenceVsGroup > 0 ? '+' : ''}${formatAed(w.differenceVsGroup)}`}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DashboardSection>
    </Box>
  );
}
