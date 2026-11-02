import { useState, useRef, useCallback } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Box, Typography,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  CircularProgress, Chip, Alert, Stepper, Step, StepLabel,
  FormControl, Select, MenuItem,
} from '@mui/material';
import {
  CloudUpload as UploadIcon,
  CheckCircleOutline as OkIcon,
  WarningAmberOutlined as WarnIcon,
  ErrorOutline as ErrIcon,
} from '@mui/icons-material';
import * as XLSX from 'xlsx';
import { bulkImportFertApp, syncFertilizerProducts } from '../../utils/backendApi';
import { parseRc132Workbook } from '../../utils/pivotFertigationImportParser';

const hdrStyle = {
  background: '#1B5E20', color: '#fff', fontWeight: 700,
  fontSize: '0.72rem', padding: '6px 8px', border: '1px solid #c8c8c8', whiteSpace: 'nowrap',
};
const cellStyle = { fontSize: '0.72rem', padding: '5px 8px', border: '1px solid #c8c8c8' };

const STEPS = ['Upload Excel', 'Preview & Options', 'Import Results'];

export default function PivotFertigationImporter({
  open,
  onClose,
  siteId,
  farmName,
  pivotFields = [],
  onImportComplete,
}) {
  const [step, setStep] = useState(0);
  const [parseError, setParseError] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [importMode, setImportMode] = useState('merge');
  const fileRef = useRef(null);

  const reset = () => {
    setStep(0);
    setParseError(null);
    setImporting(false);
    setImportResults(null);
    setParsed(null);
    setImportMode('merge');
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const importableCount = parsed?.importableRecords?.length ?? 0;
  const fertilizerNameCount = parsed?.uniqueFertilizerNames?.length ?? 0;

  const handleFileUpload = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: 'array', cellDates: false });
        const result = parseRc132Workbook(workbook, { fields: pivotFields });

        if (result.error) {
          setParseError(result.error);
          return;
        }
        if ((result.allRows || []).length === 0) {
          setParseError('No data rows found in Fertilization sheet');
          return;
        }

        setParsed(result);
        setStep(1);
      } catch (err) {
        setParseError(err.message || 'Failed to parse Excel file');
      }
    };
    reader.readAsArrayBuffer(file);
  }, [pivotFields]);

  const handleImport = async () => {
    if (!siteId || !parsed) return;
    setImporting(true);
    setParseError(null);
    try {
      let catalogResult = { upserted: 0, total: 0 };
      if (parsed.uniqueFertilizerNames?.length) {
        catalogResult = await syncFertilizerProducts(parsed.uniqueFertilizerNames);
      }

      let result = {
        inserted: 0,
        skipped: 0,
        productsUpserted: catalogResult.upserted,
        catalogTotal: catalogResult.total,
        errors: [],
      };

      if (parsed.importableRecords?.length) {
        result = {
          ...await bulkImportFertApp({
            siteId,
            farmName,
            mode: importMode,
            records: parsed.importableRecords,
          }),
          catalogTotal: catalogResult.total,
          catalogUpserted: catalogResult.upserted,
        };
      }

      setImportResults(result);
      setStep(2);
      onImportComplete?.();
    } catch (err) {
      setParseError(err.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const previewRows = (parsed?.allRows || []).slice(0, 50);

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="lg" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>Import RC-132 Fertilizer Application Record</DialogTitle>
      <DialogContent>
        <Stepper activeStep={step} sx={{ mb: 3, mt: 1 }}>
          {STEPS.map((label) => (
            <Step key={label}><StepLabel>{label}</StepLabel></Step>
          ))}
        </Stepper>

        {parseError && <Alert severity="error" sx={{ mb: 2 }}>{parseError}</Alert>}

        {step === 0 && (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" hidden onChange={handleFileUpload} />
            <Button variant="contained" startIcon={<UploadIcon />} onClick={() => fileRef.current?.click()}
              sx={{ backgroundColor: '#1B5E20' }}>
              Select Excel File
            </Button>
            <Typography sx={{ mt: 2, fontSize: '0.85rem', color: '#666' }}>
              Upload your RC-132 workbook. All rows from the Fertilization sheet import into one continuous log — same as Excel.
            </Typography>
          </Box>
        )}

        {step === 1 && parsed && (
          <Box>
            <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
              <Chip icon={<OkIcon />} label={`${parsed.okCount} valid rows`} color="success" size="small" />
              <Chip icon={<WarnIcon />} label={`${parsed.warnCount} warnings`} color="warning" size="small" />
              <Chip icon={<ErrIcon />} label={`${parsed.errCount} errors`} color="error" size="small" />
              <Chip label={`${importableCount} ready to import`} size="small" />
              <Chip label={`${fertilizerNameCount} fertilizer names`} size="small" variant="outlined" />
            </Box>

            <FormControl size="small" sx={{ minWidth: 200, mb: 2 }}>
              <Select value={importMode} onChange={(e) => setImportMode(e.target.value)}>
                <MenuItem value="merge">Merge (skip duplicates)</MenuItem>
                <MenuItem value="replace">Replace all existing records</MenuItem>
              </Select>
            </FormControl>

            <TableContainer sx={{ maxHeight: 360, border: '1px solid #ccc' }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    {['Row', 'Date', 'Field', 'Fertilizer', 'Total Kg', 'Status'].map((h) => (
                      <TableCell key={h} sx={hdrStyle}>{h}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {previewRows.map((r) => (
                    <TableRow key={r.excelRow} sx={{ backgroundColor: r._errors.length ? '#ffebee' : undefined }}>
                      <TableCell sx={cellStyle}>{r.excelRow}</TableCell>
                      <TableCell sx={cellStyle}>{r.date}</TableCell>
                      <TableCell sx={cellStyle}>{r.fieldId ? '✓' : '—'}</TableCell>
                      <TableCell sx={cellStyle}>{r.fertilizerName}</TableCell>
                      <TableCell sx={cellStyle}>{r.totalKg ?? '—'}</TableCell>
                      <TableCell sx={cellStyle}>
                        {r._errors.length > 0 ? r._errors.join('; ') : r._warnings.join('; ') || 'OK'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            {(parsed.allRows?.length || 0) > 50 && (
              <Typography sx={{ fontSize: '0.75rem', color: '#888', mt: 1 }}>
                Showing first 50 of {parsed.allRows.length} rows
              </Typography>
            )}
          </Box>
        )}

        {step === 2 && importResults && (
          <Box>
            <Alert severity="success" sx={{ mb: 2 }}>
              {importResults.catalogTotal != null && (
                <>Synced {importResults.catalogTotal} fertilizer name{importResults.catalogTotal !== 1 ? 's' : ''} to catalog. </>
              )}
              Imported {importResults.inserted} record{importResults.inserted !== 1 ? 's' : ''}
              {importResults.skipped > 0 ? ` (${importResults.skipped} skipped as duplicates)` : ''}.
              {importResults.productsUpserted > 0 ? ` ${importResults.productsUpserted} new fertilizer names added during import.` : ''}
            </Alert>
            {importResults.errors?.length > 0 && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                {importResults.errors.slice(0, 5).join('; ')}
                {importResults.errors.length > 5 ? ` …and ${importResults.errors.length - 5} more` : ''}
              </Alert>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>{step === 2 ? 'Close' : 'Cancel'}</Button>
        {step === 1 && (
          <Button variant="contained" onClick={handleImport}
            disabled={importing || (importableCount === 0 && fertilizerNameCount === 0)}
            sx={{ backgroundColor: '#1B5E20' }}>
            {importing ? <CircularProgress size={20} color="inherit" /> : (
              importableCount > 0
                ? `Import ${importableCount} records`
                : `Sync ${fertilizerNameCount} fertilizer names`
            )}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
