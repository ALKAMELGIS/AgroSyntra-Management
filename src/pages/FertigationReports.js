import { useState, useEffect, useMemo } from 'react';
import {
  Container,
  Paper,
  Typography,
  Grid,
  Button,
  Box,
  Tabs,
  Tab,
  TextField,
  MenuItem,
} from '@mui/material';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdfOutlined';
import TableChartIcon from '@mui/icons-material/TableChartOutlined';
import AssessmentIcon from '@mui/icons-material/AssessmentOutlined';
import { loadMasterData } from '../utils/masterDataUtils';
import { listFertigationAll } from '../utils/backendApi';
import { generateFertigationReport, downloadPDF } from '../utils/pdfExport';
import { useNotification } from '../contexts/NotificationContext';
import { useActiveSite } from '../contexts/ActiveSiteContext';
import useOpsExcelExport from '../hooks/useOpsExcelExport';
import { OPS_EXPORT } from '../utils/companyExcelExport';
import { waterQtyPerValve } from '../utils/fertigationWaterQty';
import { buildFertigationExcelSheets } from '../utils/fertigationExcelExport';
import ExecutiveReportPanel from '../components/reports/ExecutiveReportPanel';
import { getDefaultDateRange } from '../utils/executiveReportUtils';
import { buildFertigationExecutiveReport } from '../utils/executiveReports/fertigationExecutive';
import PageTitle from '../components/PageTitle';

function FertigationReports() {
  const notify = useNotification();
  const exportOpsExcel = useOpsExcelExport();
  const { activeSiteId, activeSite } = useActiveSite();
  const [tab, setTab] = useState(0);
  const [fertigationEntries, setFertigationEntries] = useState([]);
  const [fieldInfoMap, setFieldInfoMap] = useState({});
  const defaultRange = getDefaultDateRange(30);
  const [dateFrom, setDateFrom] = useState(defaultRange.from);
  const [dateTo, setDateTo] = useState(defaultRange.to);
  const [filterFarmAreaId, setFilterFarmAreaId] = useState('');
  const [filterFieldId, setFilterFieldId] = useState('');

  useEffect(() => {
    loadFertigationData();
    setFilterFarmAreaId('');
    setFilterFieldId('');
  }, [activeSiteId]);

  const loadFertigationData = async () => {
    try {
      const [entries, masterData] = await Promise.all([
        listFertigationAll(activeSiteId ? { site_id: activeSiteId } : {}),
        loadMasterData(),
      ]);
      const fieldMap = {};
      masterData.countries?.forEach((country) => {
        country.sites?.forEach((site) => {
          site.farmAreas?.forEach((farmArea) => {
            farmArea.fields?.forEach((field) => {
              fieldMap[field.id] = {
                name: field.name,
                currentCrop: field.currentCrop,
                farmAreaId: farmArea.id,
                farmAreaName: farmArea.name,
                siteId: site.id,
              };
            });
          });
        });
      });
      setFieldInfoMap(fieldMap);
      setFertigationEntries(entries);
    } catch {
      setFertigationEntries([]);
    }
  };

  const flattenEntries = (entries) => {
    const rows = [];
    entries.forEach((entry) => {
      const fieldInfo = fieldInfoMap[entry.fieldId] || {};
      const fieldLabel = entry.fieldName || fieldInfo.name || entry.fieldId;
      const fertilizers = entry.fertilizers || {};
      const fertilizerNames = Object.keys(fertilizers);

      if (fertilizerNames.length === 0) {
        rows.push({
          date: entry.date,
          field: fieldLabel,
          recipeName: entry.recipeName || entry.recipe_name || '-',
          operatorName: entry.operatorName || entry.operator_name || '',
          flowRate: entry.flowRate ?? '',
          frequency: entry.frequency ?? '',
          dailyWater: entry.dailyWater ?? '',
          waterQty: waterQtyPerValve(entry),
          fertilizer: '-',
          amount: '',
          totalFertilizer: entry.totalFertilizer ?? '',
          weekNumber: entry.weekNumber ?? '',
        });
      } else {
        fertilizerNames.forEach((name) => {
          rows.push({
            date: entry.date,
            field: fieldLabel,
            recipeName: entry.recipeName || entry.recipe_name || '-',
            operatorName: entry.operatorName || entry.operator_name || '',
            flowRate: entry.flowRate ?? '',
            frequency: entry.frequency ?? '',
            dailyWater: entry.dailyWater ?? '',
            waterQty: waterQtyPerValve(entry),
            fertilizer: name,
            amount: fertilizers[name] ?? '',
            totalFertilizer: entry.totalFertilizer ?? '',
            weekNumber: entry.weekNumber ?? '',
          });
        });
      }
    });
    return rows;
  };

  const siteFieldEntries = useMemo(
    () => Object.entries(fieldInfoMap).filter(([, f]) => !activeSiteId || f.siteId === activeSiteId),
    [fieldInfoMap, activeSiteId],
  );

  const farmAreas = useMemo(() => {
    const seen = new Map();
    siteFieldEntries.forEach(([, f]) => {
      if (f.farmAreaId && !seen.has(f.farmAreaId)) {
        seen.set(f.farmAreaId, { id: f.farmAreaId, name: f.farmAreaName || f.farmAreaId });
      }
    });
    return [...seen.values()].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true }),
    );
  }, [siteFieldEntries]);

  const fieldsForSelect = useMemo(() => {
    return siteFieldEntries
      .filter(([, f]) => !filterFarmAreaId || f.farmAreaId === filterFarmAreaId)
      .map(([id, f]) => ({ id, name: f.name || id }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  }, [siteFieldEntries, filterFarmAreaId]);

  const filterByRange = (entries) => {
    return entries.filter((entry) => {
      const d = (entry.date || '').split('T')[0];
      if (dateFrom && d < dateFrom) return false;
      if (dateTo && d > dateTo) return false;
      return true;
    });
  };

  const filterByAreaAndField = (entries) => {
    return entries.filter((entry) => {
      if (filterFieldId && entry.fieldId !== filterFieldId) return false;
      if (filterFarmAreaId) {
        const info = fieldInfoMap[entry.fieldId];
        if ((info?.farmAreaId || entry.farmAreaId) !== filterFarmAreaId) return false;
      }
      return true;
    });
  };

  const exportFertigationExcel = async (entries, filename, emptyMessage) => {
    const scoped = filterByAreaAndField(entries);
    if (scoped.length === 0) {
      notify.warning(emptyMessage);
      return;
    }
    const sheets = await buildFertigationExcelSheets(scoped, {
      siteId: activeSiteId,
      getFieldLabel: (entry) => {
        const info = fieldInfoMap[entry.fieldId] || {};
        return entry.fieldName || info.name || entry.fieldId;
      },
      getRecipeName: (entry) => entry.recipeName || entry.recipe_name || '',
      getCrop: (entry) => fieldInfoMap[entry.fieldId]?.currentCrop || entry.currentCrop || '',
    });
    if (sheets.every((sheet) => sheet.rows.length === 0)) {
      notify.warning(emptyMessage);
      return;
    }
    const ok = await exportOpsExcel(null, {
      filename,
      sheets,
      ...OPS_EXPORT.fertigation,
    });
    return ok;
  };

  const executiveReport = useMemo(
    () => buildFertigationExecutiveReport(fertigationEntries, fieldInfoMap, dateFrom, dateTo),
    [fertigationEntries, fieldInfoMap, dateFrom, dateTo],
  );

  const generateDailyReport = async () => {
    const today = new Date().toISOString().split('T')[0];
    const todayEntries = fertigationEntries.filter((entry) => (entry.date || '').split('T')[0] === today);
    const ok = await exportFertigationExcel(
      todayEntries,
      `Daily_Fertigation_Report_${today}`,
      'No fertigation entries found for today',
    );
    if (ok) notify.success('Daily fertigation report generated successfully!');
  };

  const generateWeeklyReport = async () => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    const startOfWeek = new Date(now.setDate(diff));
    startOfWeek.setHours(0, 0, 0, 0);
    const weekStartStr = startOfWeek.toISOString().split('T')[0];
    const weekEndStr = new Date().toISOString().split('T')[0];

    const weekEntries = fertigationEntries.filter((entry) => {
      const d = (entry.date || '').split('T')[0];
      return d >= weekStartStr && d <= weekEndStr;
    });
    const ok = await exportFertigationExcel(
      weekEntries,
      `Weekly_Fertigation_Report_${weekStartStr}_to_${weekEndStr}`,
      'No fertigation entries found for this week',
    );
    if (ok) notify.success('Weekly fertigation report generated successfully!');
  };

  const exportRangeExcel = async () => {
    const ok = await exportFertigationExcel(
      filterByRange(fertigationEntries),
      `Fertigation_Report_${dateFrom}_to_${dateTo}`,
      'No fertigation data for the selected filters',
    );
    if (ok) notify.success('Excel report exported for selected period');
  };

  const exportAllData = async () => {
    const ok = await exportFertigationExcel(
      filterByRange(fertigationEntries),
      `All_Fertigation_Data_${new Date().toISOString().split('T')[0]}`,
      'No fertigation data to export',
    );
    if (ok) notify.success('Fertigation data exported successfully!');
  };

  const exportToPDF = () => {
    const ranged = filterByAreaAndField(filterByRange(fertigationEntries));
    if (ranged.length === 0) {
      notify.warning('No fertigation data to export');
      return;
    }

    const rows = flattenEntries(ranged);
    const doc = generateFertigationReport(rows, {
      title: 'Fertigation Report',
      subtitle: `${activeSite?.name || 'Farm'} · ${dateFrom} to ${dateTo}`,
    });

    downloadPDF(doc, `Fertigation_Report_${dateFrom}_to_${dateTo}.pdf`);
    notify.success('PDF report generated successfully!');
  };

  return (
    <Container maxWidth="lg">
      <Box>
        <PageTitle sx={{ mb: 1 }}>
          Fertigation Reports
        </PageTitle>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
          Manager executive summary and detailed data exports
        </Typography>

        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}>
          <Tab icon={<AssessmentIcon />} iconPosition="start" label="Executive Report" />
          <Tab icon={<TableChartIcon />} iconPosition="start" label="Data Export" />
        </Tabs>

        {tab === 0 && (
          <ExecutiveReportPanel
            title="Fertigation"
            report={executiveReport}
            dateFrom={dateFrom}
            dateTo={dateTo}
            onDateFromChange={setDateFrom}
            onDateToChange={setDateTo}
            siteName={activeSite?.name}
          />
        )}

        {tab === 1 && (
          <>
            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <TextField
                  label="Date from"
                  type="date"
                  size="small"
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <TextField
                  label="Date to"
                  type="date"
                  size="small"
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <TextField
                  select
                  label="Farm area"
                  size="small"
                  fullWidth
                  value={filterFarmAreaId}
                  onChange={(e) => {
                    const next = e.target.value;
                    setFilterFarmAreaId(next);
                    if (next && filterFieldId) {
                      const field = fieldInfoMap[filterFieldId];
                      if (field && field.farmAreaId !== next) setFilterFieldId('');
                    }
                  }}
                >
                  <MenuItem value="">All farm areas</MenuItem>
                  {farmAreas.map((area) => (
                    <MenuItem key={area.id} value={area.id}>{area.name}</MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <TextField
                  select
                  label="Field"
                  size="small"
                  fullWidth
                  value={filterFieldId}
                  onChange={(e) => setFilterFieldId(e.target.value)}
                >
                  <MenuItem value="">All fields</MenuItem>
                  {fieldsForSelect.map((field) => (
                    <MenuItem key={field.id} value={field.id}>{field.name}</MenuItem>
                  ))}
                </TextField>
              </Grid>
            </Grid>
            <Box sx={{ mb: 4 }}>
              <Button
                variant="outlined"
                color="error"
                startIcon={<PictureAsPdfIcon />}
                onClick={exportToPDF}
                sx={{ mr: 2, mb: 1 }}
              >
                Export Period as PDF
              </Button>
              <Button
                variant="outlined"
                startIcon={<TableChartIcon />}
                onClick={exportRangeExcel}
                sx={{ mb: 1 }}
              >
                Export Period as Excel
              </Button>
            </Box>

            <Grid container spacing={3}>
              <Grid size={{ xs: 12, md: 4 }}>
                <Paper elevation={2} sx={{ p: 3, textAlign: 'center' }}>
                  <Typography variant="h6" gutterBottom>Daily Report</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Export today&apos;s fertigation entries
                  </Typography>
                  <Button variant="contained" color="primary" fullWidth onClick={generateDailyReport}>
                    Generate Daily Report
                  </Button>
                </Paper>
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <Paper elevation={2} sx={{ p: 3, textAlign: 'center' }}>
                  <Typography variant="h6" gutterBottom>Weekly Report</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Export this week&apos;s fertigation entries
                  </Typography>
                  <Button variant="contained" color="primary" fullWidth onClick={generateWeeklyReport}>
                    Generate Weekly Report
                  </Button>
                </Paper>
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <Paper elevation={2} sx={{ p: 3, textAlign: 'center' }}>
                  <Typography variant="h6" gutterBottom>Export All Data</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Export complete fertigation history
                  </Typography>
                  <Button variant="contained" color="secondary" fullWidth onClick={exportAllData}>
                    Export All Fertigation Data
                  </Button>
                </Paper>
              </Grid>
            </Grid>

            <Box sx={{ mt: 4, p: 2, bgcolor: 'background.muted', borderRadius: 1 }}>
              <Typography variant="body2" color="text.secondary">
                <strong>Note:</strong> Excel exports include each fertilizer as a separate row.
                Farm area and field filters apply to every Excel button; date range applies to Period and All.
              </Typography>
            </Box>
          </>
        )}
      </Box>
    </Container>
  );
}

export default FertigationReports;
