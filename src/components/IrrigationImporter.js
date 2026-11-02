import { useState, useRef, useCallback, useMemo } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Box, Typography,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  CircularProgress, Chip, Alert, Stepper, Step, StepLabel,
  Select, MenuItem, FormControl, Collapse, IconButton,
} from '@mui/material';
import {
  CloudUpload as UploadIcon,
  CheckCircleOutline as OkIcon,
  WarningAmberOutlined as WarnIcon,
  ErrorOutline as ErrIcon,
  ExpandMore as ExpandIcon,
  ExpandLess as CollapseIcon,
} from '@mui/icons-material';
import * as XLSX from 'xlsx';
import { bulkImportIrrigation } from '../utils/backendApi';
import { parseIrrigationWorkbook } from '../utils/irrigationImportParser';

const HEADER_FILL = '#1B5E20';
const hdrStyle = {
  background: HEADER_FILL, color: '#fff', fontWeight: 700,
  fontSize: '0.72rem', padding: '6px 8px', border: '1px solid #c8c8c8', whiteSpace: 'nowrap',
};
const cellStyle = { fontSize: '0.72rem', padding: '5px 8px', border: '1px solid #c8c8c8' };

const STEPS = ['Upload Excel', 'Preview & Options', 'Import Results'];
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function IrrigationImporter({
  open,
  onClose,
  siteId,
  year: pageYear,
  farmName,
  pivotFields = [],
  onImportComplete,
}) {
  const [step, setStep] = useState(0);
  const [parseError, setParseError] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState(null);
  const [sheetData, setSheetData] = useState([]);
  const [detectedYear, setDetectedYear] = useState(pageYear);
  const [expandedSheet, setExpandedSheet] = useState(null);
  const fileRef = useRef(null);

  const totalCounts = useMemo(() => {
    let ok = 0;
    let warn = 0;
    let err = 0;
    let importable = 0;
    sheetData.forEach((s) => {
      ok += s.okCount || 0;
      warn += s.warnCount || 0;
      err += s.errCount || 0;
      importable += (s.rows || []).filter((r) => r._errors.length === 0).length;
    });
    return { ok, warn, err, importable };
  }, [sheetData]);

  const handleFileUpload = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const { sheets, year } = parseIrrigationWorkbook(workbook, {
          fields: pivotFields,
          yearHint: pageYear,
          filename: file.name,
        });

        if (sheets.length === 0) {
          setParseError('No month sheets found (Jan–Dec). SUMMARY and calc sheets are skipped.');
          return;
        }

        setDetectedYear(year || pageYear);
        setSheetData(sheets);
        setStep(1);
      } catch (err) {
        setParseError(`Failed to read Excel: ${err.message}`);
      }
    };
    reader.readAsArrayBuffer(file);
  }, [pivotFields, pageYear]);

  const setSheetMode = useCallback((idx, mode) => {
    setSheetData((prev) => prev.map((s, i) => (i === idx ? { ...s, mode } : s)));
  }, []);

  const setAllModes = useCallback((mode) => {
    setSheetData((prev) => prev.map((s) => ({ ...s, mode })));
  }, []);

  const handleImport = useCallback(async () => {
    if (!siteId) return;
    setImporting(true);
    try {
      const sheets = sheetData
        .filter((s) => s.rows && s.rows.length > 0)
        .map((s) => ({
          month: s.month,
          mode: s.mode || 'merge',
          records: s.rows
            .filter((r) => r._errors.length === 0 && r.fieldId)
            .map((r) => ({
              fieldId: r.fieldId,
              date: r.date,
              segmentId: r.segmentId,
              areaHa: r.areaHa,
              crop: r.crop,
              flowRateM3Hr: r.flowRateM3Hr,
              cycleDurationHr: r.cycleDurationHr,
              authorizedBy: r.authorizedBy,
            })),
        }))
        .filter((s) => s.records.length > 0);

      if (sheets.length === 0) {
        setImportResults({ months: [], totalInserted: 0, totalSkipped: 0, error: 'No valid rows to import' });
        setStep(2);
        setImporting(false);
        return;
      }

      const res = await bulkImportIrrigation({
        siteId,
        year: detectedYear || pageYear,
        farmName,
        sheets,
      });

      setImportResults(res);
      if (onImportComplete) onImportComplete(res);
    } catch (err) {
      setImportResults({ months: [], totalInserted: 0, totalSkipped: 0, error: err.message || 'Import failed' });
    }
    setStep(2);
    setImporting(false);
  }, [siteId, sheetData, detectedYear, pageYear, farmName, onImportComplete]);

  const handleClose = () => {
    setStep(0);
    setSheetData([]);
    setImportResults(null);
    setParseError(null);
    setExpandedSheet(null);
    if (fileRef.current) fileRef.current.value = '';
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="lg" fullWidth>
      <DialogTitle sx={{ background: HEADER_FILL, color: '#fff', fontWeight: 700, py: 1.5 }}>
        Import RC-133 Irrigation Excel
      </DialogTitle>
      <DialogContent sx={{ pt: '16px !important' }}>
        <Stepper activeStep={step} alternativeLabel sx={{ mb: 3 }}>
          {STEPS.map((label) => <Step key={label}><StepLabel>{label}</StepLabel></Step>)}
        </Stepper>

        {step === 0 && (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Typography variant="body2" sx={{ mb: 2, color: '#555' }}>
              Upload an RC-133 workbook with month tabs (Jan, Feb, Mar…). SUMMARY and calc sheets are ignored.
              Year defaults to {pageYear} unless detected from filename or sheet info row.
            </Typography>
            {parseError && <Alert severity="error" sx={{ mb: 2 }}>{parseError}</Alert>}
            <Button variant="contained" component="label" startIcon={<UploadIcon />}
              sx={{ backgroundColor: HEADER_FILL, '&:hover': { backgroundColor: '#2E7D32' } }}>
              Select Excel File
              <input type="file" hidden accept=".xlsx,.xls" ref={fileRef} onChange={handleFileUpload} />
            </Button>
          </Box>
        )}

        {step === 1 && (
          <Box>
            <Typography variant="body2" sx={{ mb: 1 }}>
              Found <strong>{sheetData.length}</strong> month sheet(s) for year <strong>{detectedYear || pageYear}</strong>.
              {' '}Ready to import <strong>{totalCounts.importable}</strong> row(s)
              ({totalCounts.ok} ok, {totalCounts.warn} warnings, {totalCounts.err} errors).
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
              <Button size="small" variant="outlined" onClick={() => setAllModes('merge')}
                sx={{ textTransform: 'none', fontSize: '0.75rem' }}>
                Merge All
              </Button>
              <Button size="small" variant="outlined" color="warning" onClick={() => setAllModes('replace')}
                sx={{ textTransform: 'none', fontSize: '0.75rem' }}>
                Replace All
              </Button>
            </Box>
            <Alert severity="info" sx={{ mb: 2, fontSize: '0.75rem' }}>
              Merge skips rows that match an existing date + field + segment. Replace deletes all records for that month first.
            </Alert>

            <TableContainer sx={{ maxHeight: 320, mb: 2 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={hdrStyle}>Sheet</TableCell>
                    <TableCell sx={hdrStyle}>Month</TableCell>
                    <TableCell sx={hdrStyle}>Rows</TableCell>
                    <TableCell sx={hdrStyle}>Ok / Warn / Err</TableCell>
                    <TableCell sx={hdrStyle}>Mode</TableCell>
                    <TableCell sx={hdrStyle} />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sheetData.map((s, idx) => (
                    <TableRow key={s.sheetName}>
                      <TableCell sx={cellStyle}>{s.sheetName}</TableCell>
                      <TableCell sx={cellStyle}>{MONTH_LABELS[s.month - 1]}</TableCell>
                      <TableCell sx={cellStyle}>{s.rows?.length || 0}</TableCell>
                      <TableCell sx={cellStyle}>
                        <Chip size="small" icon={<OkIcon />} label={s.okCount || 0} sx={{ mr: 0.5, height: 20, fontSize: '0.65rem' }} />
                        <Chip size="small" icon={<WarnIcon />} label={s.warnCount || 0} color="warning" sx={{ mr: 0.5, height: 20, fontSize: '0.65rem' }} />
                        <Chip size="small" icon={<ErrIcon />} label={s.errCount || 0} color="error" sx={{ height: 20, fontSize: '0.65rem' }} />
                      </TableCell>
                      <TableCell sx={cellStyle}>
                        <FormControl size="small" sx={{ minWidth: 100 }}>
                          <Select
                            value={s.mode || 'merge'}
                            onChange={(e) => setSheetMode(idx, e.target.value)}
                            sx={{ fontSize: '0.72rem', height: 28 }}
                          >
                            <MenuItem value="merge" sx={{ fontSize: '0.72rem' }}>Merge</MenuItem>
                            <MenuItem value="replace" sx={{ fontSize: '0.72rem' }}>Replace</MenuItem>
                          </Select>
                        </FormControl>
                      </TableCell>
                      <TableCell sx={cellStyle}>
                        <IconButton size="small" onClick={() => setExpandedSheet(expandedSheet === idx ? null : idx)}>
                          {expandedSheet === idx ? <CollapseIcon fontSize="small" /> : <ExpandIcon fontSize="small" />}
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            {sheetData.map((s, idx) => (
              <Collapse key={`detail-${s.sheetName}`} in={expandedSheet === idx}>
                <TableContainer sx={{ maxHeight: 200, mb: 2 }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={hdrStyle}>#</TableCell>
                        <TableCell sx={hdrStyle}>Date</TableCell>
                        <TableCell sx={hdrStyle}>Field</TableCell>
                        <TableCell sx={hdrStyle}>Flow</TableCell>
                        <TableCell sx={hdrStyle}>Cycle</TableCell>
                        <TableCell sx={hdrStyle}>Status</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {(s.rows || []).slice(0, 50).map((r, ri) => (
                        <TableRow key={ri}>
                          <TableCell sx={cellStyle}>{ri + 1}</TableCell>
                          <TableCell sx={cellStyle}>{r.date}</TableCell>
                          <TableCell sx={cellStyle}>{r.fieldName}</TableCell>
                          <TableCell sx={cellStyle}>{r.flowRateM3Hr ?? ''}</TableCell>
                          <TableCell sx={cellStyle}>{r.cycleDurationHr ?? ''}</TableCell>
                          <TableCell sx={cellStyle}>
                            {r._errors.length > 0 ? (
                              <Typography variant="caption" color="error">{r._errors.join('; ')}</Typography>
                            ) : r._warnings.length > 0 ? (
                              <Typography variant="caption" color="warning.main">{r._warnings.join('; ')}</Typography>
                            ) : (
                              <OkIcon sx={{ fontSize: 14, color: '#2E7D32' }} />
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Collapse>
            ))}
          </Box>
        )}

        {step === 2 && importResults && (
          <Box>
            {importResults.error ? (
              <Alert severity="error">{importResults.error}</Alert>
            ) : (
              <>
                <Alert severity="success" sx={{ mb: 2 }}>
                  Imported <strong>{importResults.totalInserted}</strong> record(s),
                  skipped <strong>{importResults.totalSkipped}</strong>.
                </Alert>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={hdrStyle}>Month</TableCell>
                        <TableCell sx={hdrStyle}>Inserted</TableCell>
                        <TableCell sx={hdrStyle}>Skipped</TableCell>
                        <TableCell sx={hdrStyle}>Errors</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {(importResults.months || []).map((m) => (
                        <TableRow key={m.month}>
                          <TableCell sx={cellStyle}>{MONTH_LABELS[m.month - 1]}</TableCell>
                          <TableCell sx={cellStyle}>{m.inserted}</TableCell>
                          <TableCell sx={cellStyle}>{m.skipped}</TableCell>
                          <TableCell sx={cellStyle}>
                            {m.errors?.length ? m.errors.slice(0, 3).join('; ') : '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose}>{step === 2 ? 'Close' : 'Cancel'}</Button>
        {step === 1 && (
          <Button variant="contained" onClick={handleImport} disabled={importing || totalCounts.importable === 0}
            sx={{ backgroundColor: HEADER_FILL, '&:hover': { backgroundColor: '#2E7D32' } }}
            startIcon={importing ? <CircularProgress size={16} color="inherit" /> : null}>
            {importing ? 'Importing…' : `Import ${totalCounts.importable} rows`}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
