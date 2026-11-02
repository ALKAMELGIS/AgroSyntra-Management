import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Typography, Button, TextField, Alert, CircularProgress,
  Tabs, Tab, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  Stack, ToggleButton, ToggleButtonGroup,
} from '@mui/material';
import {
  RefreshOutlined as RefreshIcon,
  UploadFileOutlined as ExportIcon,
} from '@mui/icons-material';
import api from '../../utils/api';
import { useNotification } from '../../contexts/NotificationContext';
import useOpsExcelExport from '../../hooks/useOpsExcelExport';
import useSeasonListDates from '../../hooks/useSeasonListDates';
import { OPS_EXPORT } from '../../utils/companyExcelExport';
import { safeExportFilename } from '../../utils/excelSheetName';
import { buildScoutingSummarySheets } from '../../utils/scoutingSummaryExcelExport';

const cellBorder = '1px solid #c8c8c8';
const SCOUTING_HEADER_BG = '#E8A598';
const BIO_HEADER_BG = '#FFEB3B';
const altRowBg = '#fafcf7';

const headerCellStyle = {
  border: cellBorder,
  padding: '2px 6px',
  fontSize: '0.75rem',
  lineHeight: 1.2,
  fontWeight: 700,
  textAlign: 'center',
  whiteSpace: 'nowrap',
};

function getHeaderCellStyle(column) {
  const bg = column.kind === 'bio' ? BIO_HEADER_BG : SCOUTING_HEADER_BG;
  return {
    ...headerCellStyle,
    backgroundColor: bg,
    color: '#333',
    textTransform: 'none',
    letterSpacing: 'normal',
    '&.MuiTableCell-head': { backgroundColor: `${bg} !important` },
    '&.MuiTableCell-stickyHeader': { backgroundColor: `${bg} !important` },
  };
}

const bodyCellStyle = {
  border: cellBorder,
  padding: '2px 6px',
  fontSize: '0.75rem',
  textAlign: 'right',
  whiteSpace: 'nowrap',
};

function formatDate(value) {
  if (!value) return '';
  const d = new Date(`${value.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatCellValue(column, row) {
  if (column.kind === 'meta') {
    if (column.key === 'location') return row.location || '';
    if (column.key === 'crop') return row.cropName || '';
    if (column.key === 'scouting_date') return formatDate(row.reportDate);
    return '';
  }
  if (column.kind === 'notes') return row.notes || '';
  const value = row.metrics?.[column.key];
  if (value == null || value === '') return '';
  return value;
}

export default function ScoutingSummaryPanel({ activeSiteId, onOpenReport }) {
  const currentYear = new Date().getFullYear();
  const {
    startDate,
    endDate,
    setStartDate,
    setEndDate,
    seasonStart,
    seasonEnd,
    isReady: seasonDatesReady,
  } = useSeasonListDates();
  const [year, setYear] = useState(() => String((seasonStart || `${currentYear}-01-01`).slice(0, 4)));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState(null);
  const [fieldTab, setFieldTab] = useState(0);
  const [typeFilter, setTypeFilter] = useState('All');
  const [exporting, setExporting] = useState(false);
  const notify = useNotification();
  const exportOpsExcel = useOpsExcelExport();

  const fieldTypes = useMemo(() => {
    const types = new Set();
    (summary?.fields || []).forEach((field) => {
      if (field.fieldTypeName) types.add(field.fieldTypeName);
    });
    return ['All', ...Array.from(types).sort()];
  }, [summary]);

  const visibleFields = useMemo(() => {
    if (!summary?.fields?.length) return [];
    if (typeFilter === 'All') return summary.fields;
    return summary.fields.filter((field) => field.fieldTypeName === typeFilter);
  }, [summary, typeFilter]);

  const loadSummary = useCallback(async () => {
    if (!seasonDatesReady) return;
    try {
      setLoading(true);
      setError('');
      const params = new URLSearchParams();
      if (activeSiteId) params.set('site_id', activeSiteId);
      if (year) params.set('year', year);
      if (startDate) params.set('start_date', startDate);
      if (endDate) params.set('end_date', endDate);

      const res = await api.get(`/scouting/summary?${params.toString()}`);
      setSummary(res.data.data || null);
      setFieldTab(0);
      setTypeFilter('All');
    } catch (err) {
      setError(err.response?.data?.error?.message || err.message || 'Failed to load scouting summary');
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [activeSiteId, year, startDate, endDate, seasonDatesReady]);

  useEffect(() => {
    if (seasonStart) setYear(seasonStart.slice(0, 4));
  }, [seasonStart]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  const activeField = useMemo(() => {
    if (!visibleFields.length) return null;
    return visibleFields[fieldTab] || visibleFields[0];
  }, [visibleFields, fieldTab]);

  const handleTypeChange = (_, value) => {
    if (!value) return;
    setTypeFilter(value);
    setFieldTab(0);
  };

  const handleExport = async () => {
    const sheets = buildScoutingSummarySheets({ visibleFields });
    if (!sheets.length) {
      notify.error('Nothing to export');
      return;
    }
    const suffix = typeFilter === 'All' ? '' : ` ${typeFilter}`;
    setExporting(true);
    try {
      await exportOpsExcel([], {
        ...OPS_EXPORT.scoutingSummary,
        sheets,
        filename: safeExportFilename(`Scouting Summary ${year || currentYear}${suffix}`),
      });
    } finally {
      setExporting(false);
    }
  };

  const handleYearChange = (nextYear) => {
    setYear(nextYear);
    if (/^\d{4}$/.test(nextYear)) {
      setStartDate(`${nextYear}-01-01`);
      setEndDate(`${nextYear}-12-31`);
    }
  };

  if (loading && !summary) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={1.5}
        alignItems={{ xs: 'stretch', md: 'center' }}
        sx={{ mb: 2 }}
      >
        <TextField
          label="Year"
          size="small"
          type="number"
          value={year}
          onChange={(e) => handleYearChange(e.target.value)}
          sx={{ width: { xs: '100%', md: 120 } }}
        />
        <TextField
          label="Start date"
          size="small"
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          InputLabelProps={{ shrink: true }}
          inputProps={{ min: seasonStart || undefined, max: seasonEnd || undefined }}
          sx={{ width: { xs: '100%', md: 170 } }}
        />
        <TextField
          label="End date"
          size="small"
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          InputLabelProps={{ shrink: true }}
          inputProps={{ min: seasonStart || undefined, max: seasonEnd || undefined }}
          sx={{ width: { xs: '100%', md: 170 } }}
        />
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Button startIcon={<RefreshIcon />} variant="outlined" size="small" onClick={loadSummary}>
            Refresh
          </Button>
          <Button
            startIcon={<ExportIcon />}
            variant="contained"
            size="small"
            onClick={handleExport}
            disabled={!visibleFields.length || exporting}
          >
            {exporting ? 'Exporting…' : 'Export Excel'}
          </Button>
        </Box>
      </Stack>

      {fieldTypes.length > 2 && (
        <Box sx={{ display: 'flex', justifyContent: { xs: 'stretch', md: 'flex-end' }, mb: 2 }}>
          <ToggleButtonGroup
            value={typeFilter}
            exclusive
            onChange={handleTypeChange}
            size="small"
            sx={{ flexWrap: 'wrap' }}
          >
            {fieldTypes.map((type) => (
              <ToggleButton
                key={type}
                value={type}
                sx={{ textTransform: 'none', px: 2, py: 0.5, fontSize: '0.75rem' }}
              >
                {type}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Box>
      )}

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {!summary?.fields?.length ? (
        <Alert severity="info">No fields found for this site and date range.</Alert>
      ) : !visibleFields.length ? (
        <Alert severity="info">No fields match the selected field type.</Alert>
      ) : (
        <>
          <Tabs
            value={fieldTab}
            onChange={(_, value) => setFieldTab(value)}
            variant="scrollable"
            scrollButtons="auto"
            sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
          >
            {visibleFields.map((field, index) => (
              <Tab
                key={field.fieldId}
                label={field.fieldName}
                value={index}
              />
            ))}
          </Tabs>

          {activeField && (
            <TableContainer component={Paper} sx={{ overflowX: 'auto', maxHeight: '70vh' }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    {activeField.columns.map((column) => (
                      <TableCell key={column.key} sx={getHeaderCellStyle(column)}>
                        {column.header}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {activeField.rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={activeField.columns.length} sx={{ ...bodyCellStyle, textAlign: 'center' }}>
                        No scouting reports in this range.
                      </TableCell>
                    </TableRow>
                  ) : (
                    activeField.rows.map((row, rowIndex) => (
                      <TableRow
                        key={row.reportId}
                        hover={Boolean(onOpenReport)}
                        onClick={() => onOpenReport?.(row.reportId)}
                        sx={{
                          cursor: onOpenReport ? 'pointer' : 'default',
                          backgroundColor: rowIndex % 2 === 1 ? altRowBg : 'inherit',
                        }}
                      >
                        {activeField.columns.map((column) => {
                          const align = column.kind === 'meta' || column.kind === 'notes' ? 'left' : 'right';
                          return (
                            <TableCell
                              key={`${row.reportId}-${column.key}`}
                              sx={{ ...bodyCellStyle, textAlign: align }}
                            >
                              {formatCellValue(column, row)}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </>
      )}
    </Box>
  );
}
