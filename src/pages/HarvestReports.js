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
} from '@mui/material';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import TableChartIcon from '@mui/icons-material/TableChart';
import AssessmentIcon from '@mui/icons-material/Assessment';
import { loadMasterData } from '../utils/masterDataUtils';
import { listHarvestsAll } from '../utils/backendApi';
import { useActiveSite } from '../contexts/ActiveSiteContext';
import { generateHarvestReport, downloadPDF } from '../utils/pdfExport';
import { useNotification } from '../contexts/NotificationContext';
import useOpsExcelExport from '../hooks/useOpsExcelExport';
import { OPS_EXPORT } from '../utils/companyExcelExport';
import { buildHarvestExcelSheets } from '../utils/harvestExcelExport';
import ExecutiveReportPanel from '../components/reports/ExecutiveReportPanel';
import { getDefaultDateRange } from '../utils/executiveReportUtils';
import { buildHarvestExecutiveReport } from '../utils/executiveReports/harvestExecutive';

function HarvestReports() {
  const notify = useNotification();
  const exportOpsExcel = useOpsExcelExport();
  const { activeSiteId, activeSite } = useActiveSite();
  const [tab, setTab] = useState(0);
  const [harvestEntries, setHarvestEntries] = useState([]);
  const [fieldInfoMap, setFieldInfoMap] = useState({});
  const defaultRange = getDefaultDateRange(30);
  const [dateFrom, setDateFrom] = useState(defaultRange.from);
  const [dateTo, setDateTo] = useState(defaultRange.to);

  useEffect(() => {
    loadHarvestData();
  }, [activeSiteId]);

  const loadHarvestData = async () => {
    try {
      const [harvests, masterData] = await Promise.all([
        listHarvestsAll({ site_id: activeSiteId }),
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
              };
            });
          });
        });
      });
      setFieldInfoMap(fieldMap);
      setHarvestEntries(harvests);
    } catch {
      setHarvestEntries([]);
    }
  };

  const filterByRange = (entries) => {
    return entries.filter((entry) => {
      const d = (entry.date || '').split('T')[0];
      if (dateFrom && d < dateFrom) return false;
      if (dateTo && d > dateTo) return false;
      return true;
    });
  };

  const executiveReport = useMemo(
    () => buildHarvestExecutiveReport(harvestEntries, fieldInfoMap, dateFrom, dateTo),
    [harvestEntries, fieldInfoMap, dateFrom, dateTo],
  );

  const exportHarvestExcel = async (entries, filename, emptyMessage) => {
    if (!entries.length) {
      notify.warning(emptyMessage);
      return;
    }
    const sheets = await buildHarvestExcelSheets(entries, {
      siteId: activeSiteId,
      fieldInfoMap,
    });
    if (sheets.every((sheet) => sheet.rows.length === 0)) {
      notify.warning(emptyMessage);
      return;
    }
    const ok = await exportOpsExcel(null, {
      filename,
      sheets,
      ...OPS_EXPORT.harvest,
    });
    return ok;
  };

  const generateDailyReport = async () => {
    const today = new Date().toISOString().split('T')[0];
    const todayEntries = harvestEntries.filter((entry) => entry.date === today);
    const ok = await exportHarvestExcel(
      todayEntries,
      `Daily_Harvest_Report_${today}`,
      'No harvest entries found for today',
    );
    if (ok) notify.success('Daily report generated successfully!');
  };

  const generateWeeklyReport = async () => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    const startOfWeek = new Date(now.setDate(diff));
    startOfWeek.setHours(0, 0, 0, 0);
    const weekStartStr = startOfWeek.toISOString().split('T')[0];
    const weekEndStr = new Date().toISOString().split('T')[0];

    const weekEntries = harvestEntries.filter(
      (entry) => entry.date >= weekStartStr && entry.date <= weekEndStr,
    );
    const ok = await exportHarvestExcel(
      weekEntries,
      `Weekly_Harvest_Report_${weekStartStr}_to_${weekEndStr}`,
      'No harvest entries found for this week',
    );
    if (ok) notify.success('Weekly report generated successfully!');
  };

  const exportRangeExcel = async () => {
    const ok = await exportHarvestExcel(
      filterByRange(harvestEntries),
      `Harvest_Report_${dateFrom}_to_${dateTo}`,
      'No harvest data for the selected date range',
    );
    if (ok) notify.success('Excel report exported for selected period');
  };

  const exportAllData = async () => {
    const ok = await exportHarvestExcel(
      harvestEntries,
      `All_Harvest_Data_${new Date().toISOString().split('T')[0]}`,
      'No harvest data to export',
    );
    if (ok) notify.success('All harvest data exported successfully!');
  };

  const exportToPDF = () => {
    const ranged = filterByRange(harvestEntries);
    if (ranged.length === 0) {
      notify.warning('No harvest data to export');
      return;
    }

    const pdfData = ranged.flatMap((entry) => {
      const fieldInfo = fieldInfoMap[entry.fieldId] || {};
      const fieldLabel = entry.fieldName || fieldInfo.name || entry.fieldId;
      return entry.varieties.map((variety) => ({
        date: entry.date,
        fieldName: fieldLabel,
        variety: variety.variety,
        quantity: variety.quantity,
        grade: variety.grade,
        notes: entry.notes || '',
      }));
    });

    const doc = generateHarvestReport(pdfData, {
      title: 'Harvest Report',
      subtitle: `${activeSite?.name || 'Farm'} · ${dateFrom} to ${dateTo}`,
    });

    downloadPDF(doc, `Harvest_Report_${dateFrom}_to_${dateTo}.pdf`);
    notify.success('PDF report generated successfully!');
  };

  return (
    <Container maxWidth="lg">
      <Paper elevation={3} sx={{ p: 4, mt: 2 }}>
        <Typography variant="h4" gutterBottom>
          Harvest Reports
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
            title="Harvest"
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
            <Box sx={{ mb: 2, p: 1.5, bgcolor: 'grey.50', borderRadius: 1 }}>
              <Typography variant="body2" color="text.secondary">
                Period exports use the same date range as Executive Report ({dateFrom} to {dateTo}).
                Change dates on the Executive Report tab.
              </Typography>
            </Box>
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
                    Export today&apos;s harvest entries
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
                    Export this week&apos;s harvest entries
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
                    Export complete harvest history
                  </Typography>
                  <Button variant="contained" color="secondary" fullWidth onClick={exportAllData}>
                    Export All Harvest Data
                  </Button>
                </Paper>
              </Grid>
            </Grid>

            <Box sx={{ mt: 4, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
              <Typography variant="body2" color="text.secondary">
                <strong>Note:</strong> Excel exports include each variety as a separate row.
                Use &quot;Export Period as Excel&quot; to match the date range on the Executive Report tab.
              </Typography>
            </Box>
          </>
        )}
      </Paper>
    </Container>
  );
}

export default HarvestReports;
