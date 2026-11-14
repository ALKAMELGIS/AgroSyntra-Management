import { useState, useRef, useCallback, useMemo } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Box, Typography,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  CircularProgress, Chip, Alert, Stepper, Step, StepLabel, Tooltip,
  MenuItem, Select, FormControl,
} from '@mui/material';
import {
  CloudUploadOutlined as UploadIcon,
  CheckCircleOutlineOutlined as OkIcon,
  WarningAmberOutlined as WarnIcon,
  ErrorOutlineOutlined as ErrIcon,
  FileDownloadOutlined as ImportIcon,
} from '@mui/icons-material';
import * as XLSX from 'xlsx';
import { guessFieldKey, normalizeHeader } from '../utils/pestImportGuess';
import { formatPercentSeen } from '../utils/percentSeen';
import { applyFieldPickToExcelValue, resolveImportField } from '../utils/pppImportFieldMatch';
import { runBulkImportBatches } from '../utils/pppBulkImportBatches';
import InfoNote from './InfoNote';

// ─── Excel-like colour palette (matches SpreadsheetGrid) ──────────
const headerBg = 'var(--sheet-header)'; // = theme palette.table.headerBg
const bannerBg = 'var(--grid-band-bg)';
const bannerColor = 'var(--grid-band-fg)';
const altRowBg = 'rgba(31,122,77,0.06)';
const cellBorder = '1px solid #c8c8c8';
const warnBg = '#fff8e1';
const errBg = '#ffebee';

const hdrStyle = {
  background: 'var(--grid-head-bg)', color: 'var(--grid-head-fg)', fontWeight: 700,
  fontSize: '0.6875rem', padding: '6px 8px', border: cellBorder, whiteSpace: 'nowrap',
};
const cellStyle = { fontSize: '0.6875rem', padding: '5px 8px', border: cellBorder };

const steps = ['Upload Excel', 'Map Columns', 'Review & Validate', 'Import Results'];

// ─── Excel serial conversions ─────────────────────────────────────

function excelSerialToDate(serial) {
  if (!serial || typeof serial === 'string') return serial || '';
  const epoch = new Date(Date.UTC(1899, 11, 30));
  const d = new Date(epoch.getTime() + serial * 86400000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function excelFractionToTime(frac) {
  if (!frac && frac !== 0) return '';
  if (typeof frac === 'string') return frac;
  const totalMinutes = Math.round(frac * 24 * 60);
  const h = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
  const m = String(totalMinutes % 60).padStart(2, '0');
  return `${h}:${m}`;
}

// ─── Template field definitions for column mapping ────────────────

const TEMPLATE_FIELDS = [
  { key: 'cropName', label: 'Crop' },
  { key: 'variety', label: 'Variety' },
  { key: 'fieldId', label: 'Field ID' },
  { key: 'segmentId', label: 'Segment ID' },
  { key: 'applicationDate', label: 'Application Date' },
  { key: 'justification', label: 'Justification' },
  { key: 'percentSeen', label: '% Seen' },
  { key: 'scoutingDate', label: 'Scouting Date' },
  { key: 'applicationStartTime', label: 'Start Time' },
  { key: 'applicationEndTime', label: 'End Time' },
  { key: 'productName', label: 'Name of PPP' },
  { key: 'activeIngredient', label: 'Active Ingredient' },
  { key: 'dosage', label: 'Dose' },
  { key: 'uom', label: 'UOM' },
  { key: 'totalQuantityApplied', label: 'Qty Applied' },
  { key: 'unitPrice', label: 'Unit Price' },
  { key: 'cost', label: 'Cost' },
  { key: 'totalWaterQty', label: 'Total Water Qty' },
  { key: 'machineryUsed', label: 'Machinery Used' },
  { key: 'phiDays', label: 'PHI Days' },
  { key: 'clearToHarvestDate', label: 'Clear to Harvest' },
  { key: 'weatherConditions', label: 'Weather' },
  { key: 'operatorName', label: 'Operator' },
  { key: 'verifiedBy', label: 'Verified By' },
];

// Detect header row in a sheet (scan first 20 rows for any data-like header)
const ANCHOR_KEYWORDS = ['field id', 'field', 'crop', 'name of ppp', 'application date', 'ppp application'];

function detectHeaderRow(allRows) {
  for (let i = 0; i < Math.min(20, allRows.length); i++) {
    const row = allRows[i];
    let anchorHits = 0;
    for (let j = 0; j < row.length; j++) {
      const cell = normalizeHeader(row[j]);
      if (ANCHOR_KEYWORDS.some(kw => cell.includes(kw))) anchorHits++;
    }
    if (anchorHits >= 2) {
      const firstNonEmpty = row.findIndex(c => c !== '');
      return { headerIdx: i, colOffset: firstNonEmpty > 0 ? firstNonEmpty : 0 };
    }
  }
  return null;
}

// ─── Main Component ───────────────────────────────────────────────

export default function SpreadsheetImporter({
  open, onClose, fields = [], nurseryFields = [], products = [], templateId, templateName = 'Sheet',
  onBulkImport, onImportComplete,
}) {
  const [step, setStep] = useState(0);
  const [validatedRows, setValidatedRows] = useState([]);
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState(null);
  const [parseError, setParseError] = useState(null);
  const fileRef = useRef(null);

  // Sheet selection state
  const [sheetChoices, setSheetChoices] = useState([]);
  const [workbookRef, setWorkbookRef] = useState(null);

  // Column mapping state
  const [excelHeaders, setExcelHeaders] = useState([]);
  const [columnMapping, setColumnMapping] = useState({});
  const [rawDataRows, setRawDataRows] = useState([]);
  const [colOffset, setColOffset] = useState(0);
  const [sampleRows, setSampleRows] = useState([]);

  // ─── Field & product lookup maps ──────────────────────────────

  const fieldLookup = useMemo(() => {
    const m = {};
    fields.forEach(f => {
      const nameKey = (f.name || '').trim().toLowerCase();
      if (nameKey) m[nameKey] = f;
      if (f.id) m[f.id] = f;
    });
    return m;
  }, [fields]);

  const productByName = useMemo(() => {
    const m = {};
    products.forEach(p => {
      const key = (p.name || '').trim().toLowerCase();
      if (key) m[key] = p;
    });
    return m;
  }, [products]);

  const fieldPickerOptions = useMemo(() => {
    const nurseryIds = new Set((nurseryFields || []).map((n) => n.id));
    const options = [];
    (nurseryFields || []).forEach((n) => {
      if (n?.id) options.push({ id: n.id, name: n.name, nursery: true });
    });
    (fields || []).forEach((f) => {
      if (!f?.id || nurseryIds.has(f.id)) return;
      options.push({ id: f.id, name: f.name, nursery: false });
    });
    return options;
  }, [fields, nurseryFields]);

  // ─── Validation engine ───────────────────────────────────────

  const validateRows = useCallback((rows) => {
    return rows.map(row => {
      const warnings = [];
      const errors = [];
      let resolvedFieldId = null;
      let resolvedCrop = row.cropName || '';
      let resolvedVariety = row.variety || '';
      let resolvedProductId = null;
      let resolvedProductName = row.productName || '';
      let fieldSource = null;
      let needsFieldPick = false;

      const match = resolveImportField({
        excelField: row.fieldId,
        fields,
        nurseryFields,
        pickedFieldId: row._pickedFieldId || null,
      });
      fieldSource = match.source;
      needsFieldPick = match.needsPick;
      if (match.error) errors.push(match.error);
      if (match.warning) warnings.push(match.warning);

      const fieldKey = match.field?.id || '';
      const field = fieldKey
        ? (fieldLookup[fieldKey] || fieldLookup[(match.field.name || '').trim().toLowerCase()] || match.field)
        : null;
      if (field) {
        resolvedFieldId = field.id;
        if (field.current_crop || field.crop_name || field.currentCrop) {
          resolvedCrop = field.current_crop || field.crop_name || field.currentCrop || '';
          resolvedVariety = field.variety || field.varietyName || '';
          if (row.cropName && resolvedCrop && row.cropName.toLowerCase() !== resolvedCrop.toLowerCase()) {
            warnings.push(`Crop: using system "${resolvedCrop}" instead of Excel "${row.cropName}"`);
          }
        } else if (row.cropName) {
          warnings.push(`Field has no crop assigned; using Excel value "${row.cropName}"`);
        } else {
          warnings.push('Field has no crop assigned and Excel is blank');
        }
      }

      const prodKey = (row.productName || '').toString().trim().toLowerCase();
      if (prodKey) {
        const product = productByName[prodKey];
        if (product) {
          resolvedProductId = product.id;
          resolvedProductName = product.name;
        } else {
          warnings.push(`Product "${row.productName}" will be added to site catalog`);
        }
      }

      if (!(row.applicationDate || '').toString().trim()) {
        errors.push('Missing Application Date');
      }

      const status = errors.length > 0 ? 'error' : warnings.length > 0 ? 'warning' : 'ok';

      return {
        ...row,
        _status: status,
        _errors: errors,
        _warnings: warnings,
        _resolvedFieldId: resolvedFieldId,
        _resolvedCrop: resolvedCrop,
        _resolvedVariety: resolvedVariety,
        _resolvedProductId: resolvedProductId,
        _resolvedProductName: resolvedProductName,
        _fieldSource: fieldSource,
        _needsFieldPick: needsFieldPick,
      };
    });
  }, [fieldLookup, productByName, fields, nurseryFields]);

  // ─── Parse a specific sheet and go to column mapping ──────────

  const parseSheet = useCallback((workbook, sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const allRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    const detection = detectHeaderRow(allRows);
    if (!detection) {
      setParseError(`Could not find a data header row in "${sheetName}". The sheet may be a summary or reference.`);
      return;
    }

    const { headerIdx, colOffset: offset } = detection;
    const headers = allRows[headerIdx].slice(offset).map(h => (h || '').toString().trim()).filter(h => h);

    // Auto-guess initial mapping
    const autoMap = {};
    const usedKeys = new Set();
    headers.forEach((h, idx) => {
      const guess = guessFieldKey(h);
      if (guess && !usedKeys.has(guess)) {
        autoMap[idx] = guess;
        usedKeys.add(guess);
      }
    });

    // Collect raw data rows (after header)
    const dataRows = [];
    for (let i = headerIdx + 1; i < allRows.length; i++) {
      const rawRow = allRows[i];
      const hasData = rawRow.some((c, ci) => ci >= offset && c !== '');
      if (hasData) dataRows.push({ cells: rawRow, _rowNum: i + 1 });
    }

    if (dataRows.length === 0) {
      setParseError(`Parsed 0 data rows from "${sheetName}".`);
      return;
    }

    setExcelHeaders(headers);
    setColumnMapping(autoMap);
    setRawDataRows(dataRows);
    setColOffset(offset);
    setSampleRows(dataRows.slice(0, 3));
    setSheetChoices([]);
    setWorkbookRef(null);
    setStep(1);
  }, []);

  // ─── Step 0: Upload file ──────────────────────────────────────

  const handleFileUpload = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: 'array' });

        // Find sheets that have a data header row
        const dataSheets = [];
        for (const name of workbook.SheetNames) {
          const sheet = workbook.Sheets[name];
          const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
          const detection = detectHeaderRow(rows);
          if (detection) dataSheets.push(name);
        }

        if (dataSheets.length === 0) {
          setParseError('No data sheets found. Could not detect a header row with recognizable columns (Field ID, Crop, etc.).');
          return;
        }

        if (dataSheets.length === 1) {
          parseSheet(workbook, dataSheets[0]);
        } else {
          setWorkbookRef(workbook);
          setSheetChoices(dataSheets);
        }
      } catch (err) {
        setParseError('Failed to read Excel: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }, [parseSheet]);

  // ─── Step 1→2: Apply column mapping and validate ──────────────

  const applyMappingAndValidate = useCallback(() => {
    const mapped = rawDataRows.map(({ cells, _rowNum }) => {
      const row = {};
      excelHeaders.forEach((_, hIdx) => {
        const key = columnMapping[hIdx];
        if (!key) return;
        let val = cells[hIdx + colOffset];
        if ((key === 'applicationDate' || key === 'scoutingDate' || key === 'clearToHarvestDate')) {
          if (typeof val === 'number') val = excelSerialToDate(val);
          else val = (val == null ? '' : String(val).trim());
        }
        if ((key === 'applicationStartTime' || key === 'applicationEndTime') && typeof val === 'number') {
          val = excelFractionToTime(val);
        }
        if (key === 'percentSeen') val = formatPercentSeen(val);
        row[key] = val;
      });
      row._rowNum = _rowNum;
      return row;
    });

    const withData = mapped.filter(r => r.fieldId || r.productName);
    if (withData.length === 0) {
      setParseError('No valid rows found after applying column mapping. Make sure "Field ID" or "Name of PPP" is mapped.');
      return;
    }

    const validated = validateRows(withData);
    setValidatedRows(validated);
    setStep(2);
  }, [rawDataRows, excelHeaders, columnMapping, colOffset, validateRows]);

  // ─── Step 3: Import ───────────────────────────────────────────

  const importableRows = useMemo(
    () => validatedRows.filter(r => r._status !== 'error'),
    [validatedRows]
  );

  const counts = useMemo(() => {
    const ok = validatedRows.filter(r => r._status === 'ok').length;
    const warn = validatedRows.filter(r => r._status === 'warning').length;
    const err = validatedRows.filter(r => r._status === 'error').length;
    return { ok, warn, err, total: validatedRows.length };
  }, [validatedRows]);

  const handleImport = useCallback(async () => {
    setImporting(true);

    const payloads = importableRows.map(row => ({
      templateId,
      fieldId: row._resolvedFieldId,
      cropName: row._resolvedCrop,
      variety: row._resolvedVariety,
      segmentId: row.segmentId || '',
      applicationDate: (row.applicationDate || '').toString().trim(),
      justification: row.justification || '',
      percentSeen: formatPercentSeen(row.percentSeen),
      scoutingDate: (row.scoutingDate || '').toString().trim(),
      applicationStartTime: row.applicationStartTime || '',
      applicationEndTime: row.applicationEndTime || '',
      productId: row._resolvedProductId || null,
      productName: row._resolvedProductName || row.productName || '',
      activeIngredient: row.activeIngredient || '',
      dosage: row.dosage != null && row.dosage !== '' ? (isFinite(Number(row.dosage)) ? Number(row.dosage) : null) : null,
      uom: (row.uom && row.uom.toString().trim()) ? row.uom.toString().trim().toUpperCase() : 'ML',
      totalQuantityApplied: row.totalQuantityApplied != null && row.totalQuantityApplied !== '' ? (isFinite(Number(row.totalQuantityApplied)) ? Number(row.totalQuantityApplied) : null) : null,
      unitPrice: row.unitPrice != null && row.unitPrice !== '' ? (isFinite(Number(row.unitPrice)) ? Number(row.unitPrice) : null) : null,
      cost: row.cost != null && row.cost !== '' ? (isFinite(Number(row.cost)) ? Number(row.cost) : null) : null,
      totalWaterQty: row.totalWaterQty != null && row.totalWaterQty !== '' ? (isFinite(Number(row.totalWaterQty)) ? Number(row.totalWaterQty) : null) : null,
      machineryUsed: row.machineryUsed || '',
      weatherConditions: row.weatherConditions || '',
      operatorName: row.operatorName || '',
      verifiedBy: row.verifiedBy || '',
    }));

    try {
      const outcome = await runBulkImportBatches(payloads, onBulkImport, { batchSize: 200 });
      setImportResults({
        success: outcome.inserted,
        failed: outcome.failed,
        errorDetails: outcome.errorDetails,
      });
      if (outcome.inserted > 0 && onImportComplete) {
        onImportComplete({ inserted: outcome.inserted, productsCreated: outcome.productsCreated });
      }
      setStep(3);
    } finally {
      setImporting(false);
    }
  }, [importableRows, templateId, onBulkImport, onImportComplete]);

  // ─── Reset & Close ────────────────────────────────────────────

  const handleClose = () => {
    setStep(0);
    setValidatedRows([]);
    setImportResults(null);
    setParseError(null);
    setSheetChoices([]);
    setWorkbookRef(null);
    setExcelHeaders([]);
    setColumnMapping({});
    setRawDataRows([]);
    setSampleRows([]);
    if (fileRef.current) fileRef.current.value = '';
    onClose();
  };

  // ─── Column mapping helpers ───────────────────────────────────

  const mappedCount = useMemo(() => Object.values(columnMapping).filter(Boolean).length, [columnMapping]);

  const handleFieldPick = useCallback((rowIndex, fieldId) => {
    setValidatedRows((prev) => {
      const excelField = prev[rowIndex]?.fieldId;
      const next = applyFieldPickToExcelValue(prev, excelField, fieldId || null);
      return validateRows(next);
    });
  }, [validateRows]);

  const handleMappingChange = useCallback((hIdx, value) => {
    setColumnMapping(prev => {
      const next = { ...prev };
      if (!value) {
        delete next[hIdx];
      } else {
        // Remove duplicate: if another column already maps to this key, clear it
        for (const k of Object.keys(next)) {
          if (next[k] === value && Number(k) !== hIdx) delete next[k];
        }
        next[hIdx] = value;
      }
      return next;
    });
  }, []);

  // ─── Render ───────────────────────────────────────────────────

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xl" fullWidth disableEnforceFocus>
      <DialogTitle sx={{ background: bannerBg, color: bannerColor, py: 1.5 }}>
        <Typography sx={{ fontSize: '0.9375rem', fontWeight: 700 }}>
          Import from Excel — {templateName}
        </Typography>
      </DialogTitle>
      <DialogContent sx={{ px: 2, pt: 2 }}>
        <Stepper activeStep={step} sx={{ mb: 2 }} alternativeLabel>
          {steps.map(label => <Step key={label}><StepLabel>{label}</StepLabel></Step>)}
        </Stepper>

        {/* Step 0: Upload */}
        {step === 0 && (
          <Box>
            {sheetChoices.length === 0 ? (
              <Paper
                variant="outlined"
                sx={{ p: 5, textAlign: 'center', borderStyle: 'dashed', borderColor: headerBg, cursor: 'pointer', '&:hover': { background: 'rgba(31,122,77,0.05)' } }}
                onClick={() => fileRef.current?.click()}
              >
                <UploadIcon sx={{ fontSize: 56, color: headerBg, mb: 1 }} />
                <Typography sx={{ fontWeight: 600 }}>Click to upload Excel file</Typography>
                <Typography variant="caption" color="text.secondary">
                  Supported: .xlsx, .xls — If the file has multiple sheets, you'll pick which one to import
                </Typography>
                <input ref={fileRef} type="file" hidden accept=".xlsx,.xls" onChange={handleFileUpload} />
              </Paper>
            ) : (
              <Box sx={{ textAlign: 'center' }}>
                <Typography sx={{ fontWeight: 600, mb: 1 }}>
                  {sheetChoices.length} data sheets detected — select which to import:
                </Typography>
                <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'center', flexWrap: 'wrap', mt: 1 }}>
                  {sheetChoices.map(name => (
                    <Button key={name} variant="outlined" onClick={() => parseSheet(workbookRef, name)}
                      sx={{ textTransform: 'none', borderColor: headerBg, color: headerBg, '&:hover': { background: 'rgba(31,122,77,0.06)' } }}>
                      {name}
                    </Button>
                  ))}
                </Box>
              </Box>
            )}
            {parseError && <Alert severity="error" sx={{ mt: 2 }}>{parseError}</Alert>}
          </Box>
        )}

        {/* Step 1: Column Mapping */}
        {step === 1 && (
          <Box>
            <InfoNote mode="line" severity="info" sx={{ mb: 2 }}>
              {mappedCount} of {excelHeaders.length} columns mapped — {rawDataRows.length} data rows detected.
              Adjust any incorrect mappings below, then click "Continue".
            </InfoNote>
            <TableContainer sx={{ maxHeight: 420, border: cellBorder }}>
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ ...hdrStyle, width: 50 }}>#</TableCell>
                    <TableCell sx={hdrStyle}>Excel Column</TableCell>
                    <TableCell sx={{ ...hdrStyle, width: 200 }}>Maps To</TableCell>
                    <TableCell sx={hdrStyle}>Sample 1</TableCell>
                    <TableCell sx={hdrStyle}>Sample 2</TableCell>
                    <TableCell sx={hdrStyle}>Sample 3</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {excelHeaders.map((h, idx) => {
                    const mapped = columnMapping[idx] || '';
                    const s1 = sampleRows[0]?.cells[idx + colOffset] ?? '';
                    const s2 = sampleRows[1]?.cells[idx + colOffset] ?? '';
                    const s3 = sampleRows[2]?.cells[idx + colOffset] ?? '';
                    return (
                      <TableRow key={idx} sx={{ background: mapped ? '#f0f7f0' : (idx % 2 === 0 ? '#fff' : altRowBg) }}>
                        <TableCell sx={{ ...cellStyle, textAlign: 'center', color: '#888' }}>{idx + 1}</TableCell>
                        <TableCell sx={{ ...cellStyle, fontWeight: 600 }}>{h}</TableCell>
                        <TableCell sx={cellStyle}>
                          <FormControl size="small" fullWidth>
                            <Select
                              value={mapped}
                              onChange={(e) => handleMappingChange(idx, e.target.value)}
                              displayEmpty
                              sx={{ fontSize: '0.6875rem' }}
                            >
                              <MenuItem value="" sx={{ fontSize: '0.6875rem', color: 'var(--sheet-ink-3)' }}>(skip)</MenuItem>
                              {TEMPLATE_FIELDS.map(f => (
                                <MenuItem key={f.key} value={f.key} sx={{ fontSize: '0.6875rem' }}>{f.label}</MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                        </TableCell>
                        <TableCell sx={{ ...cellStyle, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {typeof s1 === 'number' ? s1 : String(s1).slice(0, 30)}
                        </TableCell>
                        <TableCell sx={{ ...cellStyle, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {typeof s2 === 'number' ? s2 : String(s2).slice(0, 30)}
                        </TableCell>
                        <TableCell sx={{ ...cellStyle, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {typeof s3 === 'number' ? s3 : String(s3).slice(0, 30)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
            {parseError && <Alert severity="error" sx={{ mt: 2 }}>{parseError}</Alert>}
          </Box>
        )}

        {/* Step 2: Dry-run preview */}
        {step === 2 && (
          <Box>
            <Box sx={{ display: 'flex', gap: 1.5, mb: 2, alignItems: 'center', flexWrap: 'wrap' }}>
              <Chip icon={<OkIcon />} label={`${counts.ok} Ready`} color="success" size="small" sx={{ fontWeight: 600 }} />
              <Chip icon={<WarnIcon />} label={`${counts.warn} Warnings`} color="warning" size="small" sx={{ fontWeight: 600 }} />
              <Chip icon={<ErrIcon />} label={`${counts.err} Errors`} color="error" size="small" sx={{ fontWeight: 600 }} />
              <Typography sx={{ fontSize: '0.75rem', color: 'var(--sheet-ink-2)', ml: 1 }}>
                {counts.total} rows parsed — {importableRows.length} will be imported (errors are skipped).
                Unmatched Field IDs can be picked below.
              </Typography>
            </Box>
            <TableContainer sx={{ maxHeight: 450, border: cellBorder }}>
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ ...hdrStyle, width: 36 }}>#</TableCell>
                    <TableCell sx={hdrStyle}>Status</TableCell>
                    <TableCell sx={hdrStyle}>Field ID</TableCell>
                    <TableCell sx={hdrStyle}>Crop</TableCell>
                    <TableCell sx={hdrStyle}>Variety</TableCell>
                    <TableCell sx={hdrStyle}>Date</TableCell>
                    <TableCell sx={hdrStyle}>Product</TableCell>
                    <TableCell sx={hdrStyle}>Qty</TableCell>
                    <TableCell sx={hdrStyle}>Unit Price</TableCell>
                    <TableCell sx={hdrStyle}>Cost</TableCell>
                    <TableCell sx={hdrStyle}>Notes</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {validatedRows.map((r, i) => {
                    const bg = r._status === 'error' ? errBg : r._status === 'warning' ? warnBg : (i % 2 === 0 ? '#fff' : altRowBg);
                    const notes = [...r._errors, ...r._warnings].join('; ');
                    return (
                      <TableRow key={i} sx={{ background: bg }}>
                        <TableCell sx={{ ...cellStyle, textAlign: 'center', color: '#888' }}>{r._rowNum}</TableCell>
                        <TableCell sx={cellStyle}>
                          {r._status === 'ok' && <OkIcon sx={{ fontSize: 16, color: 'var(--sheet-accent)' }} />}
                          {r._status === 'warning' && <WarnIcon sx={{ fontSize: 16, color: '#a84b07' }} />}
                          {r._status === 'error' && <ErrIcon sx={{ fontSize: 16, color: '#c62828' }} />}
                        </TableCell>
                        <TableCell sx={{ ...cellStyle, fontWeight: 600 }}>
                          {(r._needsFieldPick || r._fieldSource === 'nursery' || r._fieldSource === 'picked') ? (
                            <Box>
                              <Typography sx={{ fontSize: '0.6875rem', color: '#888', fontWeight: 400, mb: 0.25 }}>
                                {r.fieldId}
                              </Typography>
                              <FormControl size="small" fullWidth>
                                <Select
                                  value={r._resolvedFieldId || ''}
                                  onChange={(e) => handleFieldPick(i, e.target.value)}
                                  displayEmpty
                                  sx={{ fontSize: '0.6875rem', minWidth: 140 }}
                                >
                                  <MenuItem value="" sx={{ fontSize: '0.6875rem', color: 'var(--sheet-ink-3)' }}>
                                    <em>Pick field</em>
                                  </MenuItem>
                                  {fieldPickerOptions.map((opt) => (
                                    <MenuItem key={opt.id} value={opt.id} sx={{ fontSize: '0.6875rem' }}>
                                      {opt.name}{opt.nursery ? ' (nursery)' : ''}
                                    </MenuItem>
                                  ))}
                                </Select>
                              </FormControl>
                            </Box>
                          ) : (
                            r.fieldId
                          )}
                        </TableCell>
                        <TableCell sx={cellStyle}>{r._resolvedCrop}</TableCell>
                        <TableCell sx={cellStyle}>{r._resolvedVariety}</TableCell>
                        <TableCell sx={cellStyle}>{r.applicationDate}</TableCell>
                        <TableCell sx={cellStyle}>{r._resolvedProductName || r.productName}</TableCell>
                        <TableCell sx={{ ...cellStyle, textAlign: 'right' }}>{r.totalQuantityApplied}</TableCell>
                        <TableCell sx={{ ...cellStyle, textAlign: 'right' }}>{r.unitPrice}</TableCell>
                        <TableCell sx={{ ...cellStyle, textAlign: 'right', fontWeight: 600, color: 'var(--sheet-accent)' }}>{r.cost}</TableCell>
                        <TableCell sx={{ ...cellStyle, fontSize: '0.6875rem', color: r._status === 'error' ? '#c62828' : '#e65100', maxWidth: 220 }}>
                          <Tooltip title={notes} describeChild><span>{notes.length > 60 ? notes.slice(0, 60) + '...' : notes}</span></Tooltip>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}

        {/* Step 3: Results */}
        {step === 3 && importResults && (
          <Box sx={{ textAlign: 'center', py: 3 }}>
            <OkIcon sx={{ fontSize: 56, color: 'success.main', mb: 1 }} />
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>Import Complete</Typography>
            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', mb: 2 }}>
              <Chip label={`${importResults.success} imported`} color="success" />
              {importResults.failed > 0 && <Chip label={`${importResults.failed} failed`} color="error" />}
            </Box>
            {importResults.errorDetails.length > 0 && (
              <Alert severity="warning" sx={{ textAlign: 'left', maxWidth: 500, mx: 'auto' }}>
                {importResults.errorDetails.map((e, i) => <div key={i}>{e}</div>)}
              </Alert>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 2, py: 1.5 }}>
        {step === 1 && (
          <Button onClick={() => { setStep(0); setSheetChoices([]); setWorkbookRef(null); }} sx={{ textTransform: 'none', mr: 'auto' }}>
            Back
          </Button>
        )}
        {step === 2 && (
          <Button onClick={() => setStep(1)} sx={{ textTransform: 'none', mr: 'auto' }}>
            Back to Mapping
          </Button>
        )}
        <Button onClick={handleClose} sx={{ textTransform: 'none' }}>
          {step === 3 ? 'Done' : 'Cancel'}
        </Button>
        {step === 1 && (
          <Button
            variant="contained"
            onClick={applyMappingAndValidate}
            disabled={!columnMapping || Object.values(columnMapping).filter(Boolean).length === 0}
            sx={{ textTransform: 'none' }}
          >
            Continue — Validate {rawDataRows.length} rows
          </Button>
        )}
        {step === 2 && (
          <Button
            variant="contained"
            onClick={handleImport}
            disabled={importing || importableRows.length === 0}
            startIcon={importing ? <CircularProgress size={16} /> : <ImportIcon />}
            sx={{ textTransform: 'none' }}
          >
            {importing ? 'Importing...' : `Import ${importableRows.length} rows`}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
