import { useState, useEffect, useCallback } from 'react';
import {
  Container,
  Paper,
  Typography,
  Box,
  Stepper,
  Step,
  StepLabel,
  Button,
  TextField,
  MenuItem,
  Grid,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  FormControlLabel,
  Checkbox,
} from '@mui/material';
import {
  DownloadOutlined as DownloadIcon,
  PictureAsPdfOutlined as PdfIcon,
} from '@mui/icons-material';
import { apiRequest } from '../utils/api';
import { useNotification } from '../contexts/NotificationContext';
import { useActiveSite } from '../contexts/ActiveSiteContext';
import { generateHarvestReport, generateFertigationReport, generateECPHReport, downloadPDF } from '../utils/pdfExport';
import { exportToExcel } from '../utils/masterDataUtils';
import PageTitle from '../components/PageTitle';

const ENTITY_OPTIONS = [
  { value: 'harvest', label: 'Harvest', endpoint: '/harvests' },
  { value: 'fertigation', label: 'Fertigation', endpoint: '/fertigation' },
  { value: 'ecph', label: 'EC/PH', endpoint: '/ecph' },
  { value: 'weather', label: 'Weather Logs', endpoint: '/weather-logs' },
];

const steps = ['Select Data', 'Configure', 'Preview & Export'];

export default function ReportBuilder() {
  const [activeStep, setActiveStep] = useState(0);
  const [entity, setEntity] = useState('harvest');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [columns, setColumns] = useState([]);
  const [selectedColumns, setSelectedColumns] = useState([]);
  const notify = useNotification();
  const { activeSiteId } = useActiveSite();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const opt = ENTITY_OPTIONS.find((e) => e.value === entity);
      let url = `${opt.endpoint}?limit=500`;
      if (activeSiteId) url += `&site_id=${activeSiteId}`;
      if (dateFrom) url += `&start_date=${dateFrom}`;
      if (dateTo) url += `&end_date=${dateTo}`;

      const result = await apiRequest(url);
      const rows = Array.isArray(result) ? result : result.data || [];
      setData(rows);

      // Auto-detect columns
      if (rows.length > 0) {
        const cols = Object.keys(rows[0]).filter(
          (k) => !k.endsWith('_id') && k !== 'id' && !k.startsWith('created') && !k.startsWith('updated') && !k.startsWith('deleted')
        );
        setColumns(cols);
        setSelectedColumns(cols.slice(0, 8)); // default first 8
      }
    } catch (err) {
      notify.error(err.message || 'Failed to fetch data');
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [entity, dateFrom, dateTo, notify]);

  const handleNext = () => {
    if (activeStep === 0) {
      fetchData();
    }
    setActiveStep((prev) => Math.min(prev + 1, 2));
  };

  const handleBack = () => {
    setActiveStep((prev) => Math.max(prev - 1, 0));
  };

  const toggleColumn = (col) => {
    setSelectedColumns((prev) =>
      prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]
    );
  };

  const exportExcel = () => {
    const exportData = data.map((row) => {
      const obj = {};
      selectedColumns.forEach((col) => {
        obj[col] = row[col];
      });
      return obj;
    });
    exportToExcel(exportData, `${entity}_report_${new Date().toISOString().split('T')[0]}`);
    notify.success('Excel report downloaded');
  };

  const exportPdf = () => {
    let doc;
    const opts = {
      title: `${ENTITY_OPTIONS.find((e) => e.value === entity)?.label} Report`,
      subtitle: `${dateFrom || 'All'} to ${dateTo || 'Present'}`,
    };

    if (entity === 'harvest') {
      doc = generateHarvestReport(data, opts);
    } else if (entity === 'fertigation') {
      doc = generateFertigationReport(data, opts);
    } else if (entity === 'ecph') {
      doc = generateECPHReport(data, opts);
    } else {
      // Generic: export as Excel for unsupported PDF types
      exportExcel();
      return;
    }

    downloadPDF(doc, `${entity}_report_${new Date().toISOString().split('T')[0]}.pdf`);
    notify.success('PDF report downloaded');
  };

  return (
    <Container maxWidth="lg">
      <Paper elevation={3} sx={{ p: 3, mt: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
          <PageTitle>Report Builder</PageTitle>
        </Box>

        <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
          {steps.map((label) => (
            <Step key={label}><StepLabel>{label}</StepLabel></Step>
          ))}
        </Stepper>

        {/* Step 1: Select Data */}
        {activeStep === 0 && (
          <Box sx={{ maxWidth: 500 }}>
            <TextField
              select
              fullWidth
              label="Data Source"
              value={entity}
              onChange={(e) => setEntity(e.target.value)}
              sx={{ mb: 2 }}
            >
              {ENTITY_OPTIONS.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
              ))}
            </TextField>
            <Grid container spacing={2}>
              <Grid size={6}>
                <TextField
                  fullWidth
                  type="date"
                  label="From Date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid size={6}>
                <TextField
                  fullWidth
                  type="date"
                  label="To Date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
            </Grid>
          </Box>
        )}

        {/* Step 2: Configure Columns */}
        {activeStep === 1 && (
          <Box>
            <Typography variant="subtitle1" gutterBottom>
              Select columns to include ({data.length} records found)
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
              {columns.map((col) => (
                <FormControlLabel
                  key={col}
                  control={
                    <Checkbox
                      checked={selectedColumns.includes(col)}
                      onChange={() => toggleColumn(col)}
                      size="small"
                    />
                  }
                  label={col.replace(/_/g, ' ')}
                />
              ))}
            </Box>
          </Box>
        )}

        {/* Step 3: Preview & Export */}
        {activeStep === 2 && (
          <Box>
            <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
              <Button variant="contained" startIcon={<DownloadIcon />} onClick={exportExcel}>
                Export Excel
              </Button>
              <Button variant="outlined" startIcon={<PdfIcon />} onClick={exportPdf} color="error">
                Export PDF
              </Button>
              <Chip label={`${data.length} records`} />
            </Box>

            {loading ? (
              <Box sx={{ textAlign: 'center', py: 4 }}><CircularProgress /></Box>
            ) : (
              <TableContainer sx={{ maxHeight: 400 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      {selectedColumns.map((col) => (
                        <TableCell key={col} sx={{ fontWeight: 600, textTransform: 'capitalize' }}>
                          {col.replace(/_/g, ' ')}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {data.slice(0, 50).map((row, i) => (
                      <TableRow key={i}>
                        {selectedColumns.map((col) => (
                          <TableCell key={col}>
                            {typeof row[col] === 'object' ? JSON.stringify(row[col]) : String(row[col] ?? '')}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
            {data.length > 50 && (
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                Showing first 50 of {data.length} records. Full data will be exported.
              </Typography>
            )}
          </Box>
        )}

        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2, mt: 3 }}>
          <Button disabled={activeStep === 0} onClick={handleBack}>Back</Button>
          <Button variant="contained" onClick={handleNext} disabled={activeStep === 2}>
            {activeStep === 0 ? 'Fetch Data' : 'Next'}
          </Button>
        </Box>
      </Paper>
    </Container>
  );
}
