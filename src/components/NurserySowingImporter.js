import { useState, useRef, useCallback, useMemo } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Box, Typography,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  CircularProgress, Chip, Alert, Stepper, Step, StepLabel,
} from '@mui/material';
import {
  CloudUploadOutlined as UploadIcon,
  CheckCircleOutlineOutlined as OkIcon,
  WarningAmberOutlined as WarnIcon,
  ErrorOutlineOutlined as ErrIcon,
  FileDownloadOutlined as ImportIcon,
} from '@mui/icons-material';
import * as XLSX from 'xlsx';
import { apiRequest } from '../utils/api';
import InfoNote from './InfoNote';

const bannerBg = '#1f7a4d';
const bannerColor = '#fff';
const hdrStyle = {
  background: '#1f7a4d', color: '#fff', fontWeight: 700,
  fontSize: '0.72rem', padding: '6px 8px', border: '1px solid #c8c8c8', whiteSpace: 'nowrap',
};
const cellStyle = { fontSize: '0.72rem', padding: '5px 8px', border: '1px solid #c8c8c8' };
const warnBg = '#fff8e1';
const errBg = '#ffebee';

const steps = ['Upload Excel', 'Review & Validate', 'Import Results'];

function excelSerialToDate(serial) {
  if (typeof serial !== 'number') return '';
  const d = XLSX.SSF.parse_date_code(serial);
  if (!d) return '';
  return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
}

export function parseFlexDate(val) {
  if (val == null || val === '') return '';
  if (val instanceof Date) return val.toISOString().split('T')[0];
  if (typeof val === 'number') return excelSerialToDate(val);
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().split('T')[0];
  const parts = s.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
  if (parts) {
    let yr = parts[3].length === 2 ? `20${parts[3]}` : parts[3];
    return `${yr}-${parts[2].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
  }
  return '';
}

function normalizeGermPct(val) {
  if (val === '' || val == null) return null;
  const n = Number(val);
  if (!Number.isFinite(n)) return null;
  if (n > 0 && n <= 1) return n * 100;
  return n;
}

function findDataStartRow(raw) {
  for (let i = 0; i < Math.min(30, raw.length); i++) {
    const row = raw[i] || [];
    const text = row.map((c) => String(c || '').toLowerCase()).join(' ');
    if (text.includes('date') && (text.includes('sow') || text.includes('sowing'))) {
      const next = raw[i + 1] || [];
      const nextText = next.map((c) => String(c || '').toLowerCase()).join(' ');
      if (nextText.includes('perlite') || nextText.includes('peat') || nextText.includes('uom')) {
        return i + 2;
      }
      return i + 1;
    }
  }
  for (let i = 0; i < raw.length; i++) {
    const r = raw[i];
    if (!r) continue;
    const seedDate = parseFlexDate(r[0]);
    if (seedDate) return i;
  }
  return 9;
}

function parseRc241Sheet(ws) {
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
  const start = findDataStartRow(raw);
  const rows = [];
  for (let i = start; i < raw.length; i++) {
    const r = raw[i];
    if (!r || !r.some((c) => c !== '' && c != null)) continue;
    const seedDate = parseFlexDate(r[0]);
    if (!seedDate) continue;
    const row = {
      _rowNum: i + 1,
      seedingDate: seedDate,
      cropName: String(r[1] ?? '').trim(),
      varietyName: String(r[2] ?? '').trim(),
      seedBatch: String(r[3] ?? '').trim(),
      breederName: String(r[4] ?? '').trim(),
      seedsPerCell: r[5] != null && r[5] !== '' ? String(r[5]) : '',
      trayType: r[6] != null && r[6] !== '' ? String(r[6]) : '',
      trayCount: r[7] != null && r[7] !== '' ? String(r[7]) : '',
      growingMediaBrand: String(r[8] ?? '').trim(),
      mediaComponents: {
        perlite: { qty: r[9] != null && r[9] !== '' ? String(r[9]) : '', uom: String(r[10] || 'Lit') },
        peatMoss: { qty: r[11] != null && r[11] !== '' ? String(r[11]) : '', uom: String(r[12] || 'Lit') },
        compost: { qty: r[13] != null && r[13] !== '' ? String(r[13]) : '', uom: String(r[14] || 'Lit') },
        vermiculite: { qty: r[15] != null && r[15] !== '' ? String(r[15]) : '', uom: String(r[16] || 'Lit') },
      },
      seedlingCount: r[17] != null && r[17] !== '' ? String(r[17]) : '',
      germinationPct: r[18] != null && r[18] !== '' ? String(normalizeGermPct(r[18]) ?? r[18]) : '',
      totalDays: r[20] != null && r[20] !== '' ? String(Math.round(Number(r[20]))) : '',
      readyToTransplantDate: '',
      releaseDate: '',
      seedlingsPlanted: r[22] != null && r[22] !== '' ? String(r[22]) : '',
    };
    if (row.totalDays && row.seedingDate) {
      const d = new Date(`${row.seedingDate}T12:00:00`);
      d.setDate(d.getDate() + parseInt(row.totalDays, 10));
      const iso = d.toISOString().slice(0, 10);
      row.readyToTransplantDate = iso;
      row.releaseDate = iso;
    } else {
      row.readyToTransplantDate = parseFlexDate(r[19]);
      row.releaseDate = parseFlexDate(r[21]) || row.readyToTransplantDate;
      if (row.readyToTransplantDate && row.seedingDate && !row.totalDays) {
        const a = new Date(`${row.seedingDate}T12:00:00`);
        const b = new Date(`${row.readyToTransplantDate}T12:00:00`);
        row.totalDays = String(Math.round((b - a) / 86400000));
      }
    }
    rows.push(row);
  }
  return rows;
}

function rowToPayload(row, siteId) {
  return {
    siteId,
    seedingDate: row.seedingDate,
    cropId: row._cropId || null,
    varietyId: row._varietyId || null,
    seedBatch: row.seedBatch || null,
    breederId: row._breederId || null,
    seedsPerCell: row.seedsPerCell || null,
    trayType: row.trayType || null,
    trayCount: row.trayCount || null,
    growingMediaBrand: row.growingMediaBrand || null,
    mediaComponents: row.mediaComponents,
    seedlingCount: row.seedlingCount || null,
    germinationPct: normalizeGermPct(row.germinationPct),
    readyToTransplantDate: row.readyToTransplantDate || null,
    releaseDate: row.releaseDate || null,
    seedlingsPlanted: row.seedlingsPlanted || null,
  };
}

export default function NurserySowingImporter({
  open, onClose, siteId, crops = [], allVarietiesByCrop = {}, breeders = [], onImportComplete,
}) {
  const [step, setStep] = useState(0);
  const [validatedRows, setValidatedRows] = useState([]);
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState(null);
  const [parseError, setParseError] = useState(null);
  const [sheetChoices, setSheetChoices] = useState([]);
  const [workbookRef, setWorkbookRef] = useState(null);
  const fileRef = useRef(null);

  const cropList = useMemo(() =>
    crops.map((c) => (typeof c === 'object' ? c : { id: c, name: String(c) })),
    [crops]
  );

  const resolveCrop = useCallback((name) => {
    const n = String(name || '').trim().toLowerCase();
    if (!n) return null;
    for (const c of cropList) {
      if (!c.name) continue;
      const cn = c.name.toLowerCase();
      if (cn === n || n.includes(cn) || cn.includes(n)) return c;
    }
    return null;
  }, [cropList]);

  const resolveVariety = useCallback((cropId, name) => {
    const n = String(name || '').trim().toLowerCase();
    if (!cropId || !n) return null;
    const list = allVarietiesByCrop[cropId] || [];
    return list.find((v) => {
      const vn = (v.name || '').toLowerCase();
      return vn === n || n.includes(vn) || vn.includes(n);
    }) || null;
  }, [allVarietiesByCrop]);

  const resolveBreeder = useCallback((name) => {
    const n = String(name || '').trim().toLowerCase();
    if (!n) return null;
    return breeders.find((b) => (b.name || '').toLowerCase() === n) || null;
  }, [breeders]);

  const validateRows = useCallback((rows) => rows.map((row) => {
    const warnings = [];
    const errors = [];
    if (!row.seedingDate) errors.push('Missing sowing date');

    let cropId = null;
    let varietyId = null;
    let breederId = null;

    if (row.cropName) {
      const crop = resolveCrop(row.cropName);
      if (crop) cropId = crop.id;
      else warnings.push(`Crop "${row.cropName}" not matched — saved without crop link`);
    } else {
      warnings.push('No crop on row');
    }

    if (row.varietyName && cropId) {
      const variety = resolveVariety(cropId, row.varietyName);
      if (variety) varietyId = variety.id;
      else warnings.push(`Variety "${row.varietyName}" not matched`);
    }

    if (row.breederName) {
      const breeder = resolveBreeder(row.breederName);
      if (breeder) breederId = breeder.id;
      else warnings.push(`Breeder "${row.breederName}" not matched`);
    }

    const status = errors.length ? 'error' : warnings.length ? 'warning' : 'ok';
    return {
      ...row,
      _cropId: cropId,
      _varietyId: varietyId,
      _breederId: breederId,
      _status: status,
      _warnings: warnings,
      _errors: errors,
    };
  }), [resolveCrop, resolveVariety, resolveBreeder]);

  const importableRows = useMemo(
    () => validatedRows.filter((r) => r._status !== 'error'),
    [validatedRows]
  );

  const counts = useMemo(() => ({
    ok: validatedRows.filter((r) => r._status === 'ok').length,
    warn: validatedRows.filter((r) => r._status === 'warning').length,
    err: validatedRows.filter((r) => r._status === 'error').length,
    total: validatedRows.length,
  }), [validatedRows]);

  const reset = useCallback(() => {
    setStep(0);
    setValidatedRows([]);
    setImporting(false);
    setImportResults(null);
    setParseError(null);
    setSheetChoices([]);
    setWorkbookRef(null);
  }, []);

  const handleClose = () => { reset(); onClose(); };

  const parseSheet = useCallback((workbook, sheetName) => {
    const ws = workbook.Sheets[sheetName];
    if (!ws) {
      setParseError('Sheet not found.');
      return;
    }
    const parsed = parseRc241Sheet(ws);
    if (parsed.length === 0) {
      setParseError('No data rows found. Use the RC-241 "Sowing Record" sheet with dates in column A.');
      return;
    }
    setValidatedRows(validateRows(parsed));
    setParseError(null);
    setStep(1);
  }, [validateRows]);

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError(null);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'binary', cellDates: true });
        setWorkbookRef(wb);
        const names = wb.SheetNames || [];
        setSheetChoices(names);
        const preferred = names.find((n) => n.toLowerCase().includes('sowing')) || names[0];
        if (preferred) parseSheet(wb, preferred);
      } catch {
        setParseError('Failed to read Excel file.');
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const handleImport = useCallback(async () => {
    if (!siteId || importableRows.length === 0) return;
    setImporting(true);
    try {
      const result = await apiRequest('/nursery-sowing-records/bulk', {
        method: 'POST',
        body: JSON.stringify({
          entries: importableRows.map((r) => rowToPayload(r, siteId)),
        }),
      });
      setImportResults({
        created: result?.created ?? importableRows.length,
        failed: 0,
        errors: [],
      });
      setStep(2);
      onImportComplete?.();
    } catch (err) {
      setImportResults({
        created: 0,
        failed: importableRows.length,
        errors: [err.message || 'Import failed'],
      });
      setStep(2);
    } finally {
      setImporting(false);
    }
  }, [siteId, importableRows, onImportComplete]);

  const renderStep0 = () => (
    <Box sx={{ textAlign: 'center', py: 4 }}>
      <UploadIcon sx={{ fontSize: 48, color: 'primary.main', mb: 2 }} />
      <Typography variant="h6" gutterBottom>Upload RC-241 Sowing Record</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3, maxWidth: 520, mx: 'auto' }}>
        Select the official Excel file (sheet &quot;Sowing Record&quot;). You will review rows before anything is saved to the database.
      </Typography>
      <Button variant="contained" component="label" startIcon={<UploadIcon />}>
        Choose File
        <input type="file" hidden accept=".xlsx,.xls" ref={fileRef} onChange={handleFileUpload} />
      </Button>
      {parseError && <Alert severity="error" sx={{ mt: 3, textAlign: 'left' }}>{parseError}</Alert>}
      {sheetChoices.length > 1 && workbookRef && (
        <Box sx={{ mt: 3 }}>
          <Typography variant="body2" color="text.secondary" gutterBottom>Sheet</Typography>
          {sheetChoices.map((name) => (
            <Button key={name} size="small" sx={{ mx: 0.5 }} variant="outlined"
              onClick={() => parseSheet(workbookRef, name)}>
              {name}
            </Button>
          ))}
        </Box>
      )}
    </Box>
  );

  const statusIcon = (status) => {
    if (status === 'ok') return <OkIcon fontSize="small" color="success" />;
    if (status === 'warning') return <WarnIcon fontSize="small" color="warning" />;
    return <ErrIcon fontSize="small" color="error" />;
  };

  const renderStep1 = () => (
    <Box>
      <InfoNote severity="info" sx={{ mb: 2 }}>
        {importableRows.length} of {counts.total} rows will be saved to sowing records.
        Unmatched crop/variety names still import as text fields where possible.
      </InfoNote>
      <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 420 }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={hdrStyle}>#</TableCell>
              <TableCell sx={hdrStyle}>Status</TableCell>
              <TableCell sx={hdrStyle}>Sowing date</TableCell>
              <TableCell sx={hdrStyle}>Crop</TableCell>
              <TableCell sx={hdrStyle}>Variety</TableCell>
              <TableCell sx={hdrStyle}>Seed batch</TableCell>
              <TableCell sx={hdrStyle}>Notes</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {validatedRows.map((row, i) => (
              <TableRow key={i} sx={{ bgcolor: row._status === 'error' ? errBg : row._status === 'warning' ? warnBg : undefined }}>
                <TableCell sx={cellStyle}>{row._rowNum}</TableCell>
                <TableCell sx={cellStyle}>{statusIcon(row._status)}</TableCell>
                <TableCell sx={cellStyle}>{row.seedingDate}</TableCell>
                <TableCell sx={cellStyle}>{row.cropName || '—'}</TableCell>
                <TableCell sx={cellStyle}>{row.varietyName || '—'}</TableCell>
                <TableCell sx={cellStyle}>{row.seedBatch || '—'}</TableCell>
                <TableCell sx={cellStyle}>
                  {[...(row._errors || []), ...(row._warnings || [])].join('; ') || '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <Box sx={{ display: 'flex', gap: 1, mt: 2, flexWrap: 'wrap' }}>
        <Chip size="small" icon={<OkIcon />} label={`${counts.ok} OK`} color="success" variant="outlined" />
        <Chip size="small" icon={<WarnIcon />} label={`${counts.warn} warnings`} color="warning" variant="outlined" />
        <Chip size="small" icon={<ErrIcon />} label={`${counts.err} errors`} color="error" variant="outlined" />
      </Box>
    </Box>
  );

  const renderStep2 = () => (
    <Box sx={{ py: 2 }}>
      {importResults?.created > 0 && (
        <Alert severity="success" sx={{ mb: 2 }}>
          Saved <strong>{importResults.created}</strong> sowing record(s) to this site.
        </Alert>
      )}
      {importResults?.failed > 0 && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Import failed. {(importResults.errors || []).join(' ')}
        </Alert>
      )}
    </Box>
  );

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="lg" fullWidth PaperProps={{ sx: { minHeight: '50vh' } }}>
      <DialogTitle sx={{ background: bannerBg, color: bannerColor, py: 1.5, fontSize: '1rem' }}>
        Import RC-241 Sowing Record
      </DialogTitle>
      <DialogContent sx={{ pt: 3, pb: 1 }}>
        <Stepper activeStep={step} sx={{ mb: 3 }} alternativeLabel>
          {steps.map((label) => <Step key={label}><StepLabel>{label}</StepLabel></Step>)}
        </Stepper>
        {step === 0 && renderStep0()}
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        {step === 1 && (
          <Button onClick={() => { setStep(0); setValidatedRows([]); }} color="inherit">Back</Button>
        )}
        <Box sx={{ flex: 1 }} />
        {step === 1 && (
          <Button variant="contained" onClick={handleImport}
            disabled={importing || importableRows.length === 0 || !siteId}
            startIcon={importing ? <CircularProgress size={16} color="inherit" /> : <ImportIcon />}>
            {importing ? 'Saving…' : `Save ${importableRows.length} row(s) to database`}
          </Button>
        )}
        {step === 2 && (
          <Button variant="contained" onClick={handleClose}>Done</Button>
        )}
        {step === 0 && (
          <Button onClick={handleClose} color="inherit">Cancel</Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
