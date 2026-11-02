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
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import TableChartIcon from '@mui/icons-material/TableChart';
import AssessmentIcon from '@mui/icons-material/Assessment';
import { loadMasterData } from '../utils/masterDataUtils';
import { listEcphAll } from '../utils/backendApi';
import { generateECPHReport, downloadPDF } from '../utils/pdfExport';
import { useNotification } from '../contexts/NotificationContext';
import { useActiveSite } from '../contexts/ActiveSiteContext';
import useOpsExcelExport from '../hooks/useOpsExcelExport';
import { OPS_EXPORT } from '../utils/companyExcelExport';
import { buildEcphExcelSheets } from '../utils/ecphExcelExport';
import ExecutiveReportPanel from '../components/reports/ExecutiveReportPanel';
import { getDefaultDateRange } from '../utils/executiveReportUtils';
import { buildEcphExecutiveReport } from '../utils/executiveReports/ecphExecutive';

function ECPHReports() {
  const notify = useNotification();
  const exportOpsExcel = useOpsExcelExport();
  const { activeSiteId, activeSite } = useActiveSite();
  const [tab, setTab] = useState(0);
  const [ecphEntries, setEcphEntries] = useState([]);
  const [fieldInfoMap, setFieldInfoMap] = useState({});
  const [masterData, setMasterData] = useState(null);
  const defaultRange = getDefaultDateRange(30);
  const [dateFrom, setDateFrom] = useState(defaultRange.from);
  const [dateTo, setDateTo] = useState(defaultRange.to);
  const [filterFarmAreaId, setFilterFarmAreaId] = useState('');
  const [filterFieldId, setFilterFieldId] = useState('');

  useEffect(() => {
    loadEcphData();
    setFilterFarmAreaId('');
    setFilterFieldId('');
  }, [activeSiteId]);

  const loadEcphData = async () => {
    try {
      const [entries, masterData] = await Promise.all([
        listEcphAll(activeSiteId ? { site_id: activeSiteId } : {}),
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
                crop: field.crop,
                cropHistory: field.cropHistory,
                type: field.type,
                farmAreaId: farmArea.id,
                farmAreaName: farmArea.name,
                siteId: site.id,
                siteName: site.name,
              };
            });
          });
        });
      });
      setFieldInfoMap(fieldMap);
      setMasterData(masterData);
      setEcphEntries(entries);
    } catch {
      setEcphEntries([]);
    }
  };

  const flattenEntries = (entries) => {
    const rows = [];
    entries.forEach((entry) => {
      const fieldInfo = fieldInfoMap[entry.fieldId] || {};
      const fieldLabel = entry.fieldName || fieldInfo.name || entry.fieldId;
      const valves = entry.valveReadings || [];
      if (valves.length === 0) {
        rows.push({
          date: entry.date,
          time: entry.time || '',
          field: fieldLabel,
          valve: '-',
          ecIn: '',
          ecOut: '',
          phIn: '',
          phOut: '',
          dripVolume: '',
          drainVolume: '',
          percentDrain: '',
          qtyOfWater: entry.qtyOfWater ?? '',
          cycle: entry.cycle ?? '',
          totalWaterQty: entry.totalWaterQty ?? '',
        });
      } else {
        valves.forEach((v) => {
          rows.push({
            date: entry.date,
            time: entry.time || '',
            field: fieldLabel,
            valve: v.valveNumber ?? '',
            ecIn: v.ecIn ?? '',
            ecOut: v.ecOut ?? v.ec ?? '',
            phIn: v.phIn ?? '',
            phOut: v.phOut ?? v.ph ?? '',
            dripVolume: v.dripVolume ?? '',
            drainVolume: v.drainVolume ?? v.drain ?? '',
            percentDrain: v.percentDrain ?? '',
            qtyOfWater: v.qtyOfWater ?? entry.qtyOfWater ?? '',
            cycle: v.cycle ?? entry.cycle ?? '',
            totalWaterQty: v.totalWaterQty ?? entry.totalWaterQty ?? '',
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
    if (!dateFrom && !dateTo) return entries;
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

  const exportEcphExcel = async (entries, filename, emptyMessage) => {
    const scoped = filterByAreaAndField(entries);
    if (scoped.length === 0) {
      notify.warning(emptyMessage);
      return;
    }
    const sheets = buildEcphExcelSheets(scoped, { fieldInfoMap, masterData });
    if (sheets.length === 0) {
      notify.warning(emptyMessage);
      return;
    }
    const ok = await exportOpsExcel(null, {
      filename,
      sheets,
      ...OPS_EXPORT.ecph,
    });
    return ok;
  };

  const executiveReport = useMemo(
    () => buildEcphExecutiveReport(ecphEntries, fieldInfoMap, dateFrom, dateTo),
    [ecphEntries, fieldInfoMap, dateFrom, dateTo],
  );

  const generateDailyReport = async () => {
    const today = new Date().toISOString().split('T')[0];
    const todayEntries = ecphEntries.filter((entry) => (entry.date || '').split('T')[0] === today);
    const ok = await exportEcphExcel(
      todayEntries,
      `Daily_ECPH_Report_${today}`,
      'No EC/PH entries found for today',
    );
    if (ok) notify.success('Daily EC/PH report generated successfully!');
  };

  const generateWeeklyReport = async () => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    const startOfWeek = new Date(now.setDate(diff));
    startOfWeek.setHours(0, 0, 0, 0);
    const weekStartStr = startOfWeek.toISOString().split('T')[0];
    const weekEndStr = new Date().toISOString().split('T')[0];

    const weekEntries = ecphEntries.filter((entry) => {
      const d = (entry.date || '').split('T')[0];
      return d >= weekStartStr && d <= weekEndStr;
    });
    const ok = await exportEcphExcel(
      weekEntries,
      `Weekly_ECPH_Report_${weekStartStr}_to_${weekEndStr}`,
      'No EC/PH entries found for this week',
    );
    if (ok) notify.success('Weekly EC/PH report generated successfully!');
  };

  const exportRangeExcel = async () => {
    const ok = await exportEcphExcel(
      filterByRange(ecphEntries),
      `ECPH_Report_${dateFrom}_to_${dateTo}`,
      'No EC/PH data for the selected filters',
    );
    if (ok) notify.success('Excel report exported for selected period');
  };

  const exportAllData = async () => {
    const ok = await exportEcphExcel(
      filterByRange(ecphEntries),
      `All_ECPH_Data_${new Date().toISOString().split('T')[0]}`,
      'No EC/PH data to export',
    );
    if (ok) notify.success('EC/PH data exported successfully!');
  };

  const exportToPDF = () => {
    const ranged = filterByRange(ecphEntries);
    if (ranged.length === 0) {
      notify.warning('No EC/PH data to export');
      return;
    }

    const rows = flattenEntries(ranged);
    const doc = generateECPHReport(rows, {
      title: 'EC/pH Report',
      subtitle: `${activeSite?.name || 'Farm'} · ${dateFrom} to ${dateTo}`,
    });

    downloadPDF(doc, `ECPH_Report_${dateFrom}_to_${dateTo}.pdf`);
    notify.success('PDF report generated successfully!');
  };

  return (
    <Container maxWidth="lg">
      <Paper elevation={3} sx={{ p: 4, mt: 2 }}>
        <Typography variant="h4" gutterBottom>
          EC/PH Reports
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
          Manager executive summary and detailed data exports
        </Typography>

        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}>
          <Tab icon={<AssessmentIcon />} iconPosition="start" label="Executive Report" />
          <Tab icon={<TableChartIcon />} iconPosition="start" label="Data Export" />
        </Tabs>

        {tab === 0 && (
          <ExecutiveReportPanel
            title="EC/pH"
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
                    Export today&apos;s EC/PH entries
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
                    Export this week&apos;s EC/PH entries
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
                    Export matching rows, one sheet each for Nethouse, Greenhouse, and Open Field
                  </Typography>
                  <Button variant="contained" color="secondary" fullWidth onClick={exportAllData}>
                    Export All EC/PH Data
                  </Button>
                </Paper>
              </Grid>
            </Grid>

            <Box sx={{ mt: 4, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
              <Typography variant="body2" color="text.secondary">
                <strong>Note:</strong> Excel files split Nethouse, Greenhouse, and Open Field onto
                separate sheets. Farm area and field filters apply to every Excel button; date
                range applies to Period and All. Times print as AM/PM.
              </Typography>
            </Box>
          </>
        )}
      </Paper>
    </Container>
  );
}

export default ECPHReports;
