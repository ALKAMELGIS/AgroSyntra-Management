import { useState, useRef, useCallback, useMemo } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Box, Typography,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  CircularProgress, Chip, Alert, Stepper, Step, StepLabel, Tooltip,
  MenuItem, Select, FormControl, ToggleButtonGroup, ToggleButton,
} from '@mui/material';
import {
  CloudUploadOutlined as UploadIcon,
  CheckCircleOutlineOutlined as OkIcon,
  WarningAmberOutlined as WarnIcon,
  ErrorOutlineOutlined as ErrIcon,
  FileDownloadOutlined as ImportIcon,
} from '@mui/icons-material';
import * as XLSX from 'xlsx';
import { bulkCreateEcph } from '../utils/backendApi';
import InfoNote from './InfoNote';

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

const STEPS = ['Select Type & Upload', 'Map Columns', 'Review & Validate', 'Import Results'];
const IMPORT_TYPES = [
  { value: 'nethouse', label: 'Nethouse' },
  { value: 'greenhouse', label: 'Greenhouse' },
  { value: 'openfield', label: 'Open Field' },
];

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

function normalizeFieldName(name) {
  return (name || '').toString().trim().toLowerCase().replace(/[\s\-]+/g, '');
}

function normalizeHeader(h) {
  return (h || '').toString().trim().toLowerCase().replace(/\s+/g, ' ');
}

const NH_TEMPLATE_FIELDS = [
  { key: 'date', label: 'Date' },
  { key: 'location', label: 'NH/GH Location' },
  { key: 'valve', label: 'Valve' },
  { key: 'time', label: 'Time' },
  { key: 'ecIn', label: 'EC In' },
  { key: 'ecOut', label: 'EC Out' },
  { key: 'phIn', label: 'pH In' },
  { key: 'phOut', label: 'pH Out' },
  { key: 'dripVolume', label: 'Drip Volume' },
  { key: 'dripVolume12', label: '12 Drip Volume' },
  { key: 'drainVolume', label: 'Drain Volume' },
  { key: 'percentDrain', label: '% Drain' },
  { key: 'qtyOfWater', label: 'Qty Of Water (M3)' },
  { key: 'cycle', label: 'Cycle' },
  { key: 'totalWaterQty', label: 'Total Water QTY' },
  { key: 'totalWaterDrip', label: 'Total Water Based on Drip' },
];

const NH_KEYWORD_MAP = [
  { key: 'date', keywords: ['date'] },
  { key: 'location', keywords: ['nh location', 'gh location', 'location'] },
  { key: 'valve', keywords: ['valve'] },
  { key: 'time', keywords: ['time'] },
  { key: 'ecIn', keywords: ['ec in'] },
  { key: 'ecOut', keywords: ['ec out'] },
  { key: 'phIn', keywords: ['ph in'] },
  { key: 'phOut', keywords: ['ph out'] },
  { key: 'dripVolume', keywords: ['drip volume'] },
  { key: 'dripVolume12', keywords: ['12 drip'] },
  { key: 'drainVolume', keywords: ['drain volume'] },
  { key: 'percentDrain', keywords: ['%drain', '% drain', 'drain%'] },
  { key: 'qtyOfWater', keywords: ['qty of water', 'qty water'] },
  { key: 'cycle', keywords: ['cycle'] },
  { key: 'totalWaterQty', keywords: ['total water qty'] },
  { key: 'totalWaterDrip', keywords: ['total water qty based', 'based on drip', 'water qty based on drip'] },
];

const NH_ANCHORS = ['ec in', 'ph in', 'drip volume', 'valve', 'ec out', 'ph out'];

function guessNhKey(headerText) {
  const norm = normalizeHeader(headerText);
  if (!norm) return '';
  for (const { key, keywords } of NH_KEYWORD_MAP) {
    if (keywords.some(kw => norm.includes(kw))) return key;
  }
  return '';
}

function detectNhHeaderRow(allRows) {
  for (let i = 0; i < Math.min(10, allRows.length); i++) {
    const row = allRows[i];
    let hits = 0;
    for (let j = 0; j < row.length; j++) {
      const cell = normalizeHeader(row[j]);
      if (NH_ANCHORS.some(kw => cell.includes(kw))) hits++;
    }
    if (hits >= 2) {
      const firstNonEmpty = row.findIndex(c => c !== '');
      return { headerIdx: i, colOffset: firstNonEmpty > 0 ? firstNonEmpty : 0 };
    }
  }
  return null;
}

function parseNethouseSheet(workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName];
  const allRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  const detection = detectNhHeaderRow(allRows);
  if (!detection) return { error: `Could not find a data header row in "${sheetName}".` };

  const { headerIdx, colOffset } = detection;
  const headers = allRows[headerIdx].slice(colOffset).map(h => (h || '').toString().trim()).filter(h => h);

  const autoMap = {};
  const usedKeys = new Set();
  headers.forEach((h, idx) => {
    const guess = guessNhKey(h);
    if (guess && !usedKeys.has(guess)) {
      autoMap[idx] = guess;
      usedKeys.add(guess);
    }
  });

  const dataRows = [];
  for (let i = headerIdx + 1; i < allRows.length; i++) {
    const rawRow = allRows[i];
    const hasData = rawRow.some((c, ci) => ci >= colOffset && c !== '');
    if (hasData) dataRows.push({ cells: rawRow, _rowNum: i + 1 });
  }

  if (dataRows.length === 0) return { error: `Parsed 0 data rows from "${sheetName}".` };

  return { headers, autoMap, dataRows, colOffset };
}

function applyNhMapping(dataRows, headers, columnMapping, colOffset) {
  const rows = [];
  let prevDate = '';
  let prevLocation = '';

  for (const { cells, _rowNum } of dataRows) {
    const row = { _rowNum };
    headers.forEach((_, hIdx) => {
      const key = columnMapping[hIdx];
      if (!key) return;
      let val = cells[hIdx + colOffset];
      if (key === 'date' && typeof val === 'number') val = excelSerialToDate(val);
      if (key === 'time' && typeof val === 'number') val = excelFractionToTime(val);
      row[key] = val;
    });

    if (row.date) prevDate = row.date;
    else row.date = prevDate;

    if (row.location) prevLocation = row.location;
    else row.location = prevLocation;

    if (!row.date || !row.location) continue;
    rows.push(row);
  }

  return rows;
}

function parseOpenFieldSheet(workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName];
  const allRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (allRows.length < 4) return { error: 'Open field sheet is too short (needs at least 4 rows for headers + data).' };

  const fieldHeaderRow = allRows[1];
  const valveHeaderRow = allRows[2];

  const columnMap = [];
  let startCol = 6;
  for (let c = startCol; c < fieldHeaderRow.length; c++) {
    const fieldName = (fieldHeaderRow[c] || '').toString().trim();
    const valveRaw = (valveHeaderRow[c] || '').toString().trim();
    if (!valveRaw) continue;
    let resolvedField = fieldName;
    if (!resolvedField) {
      for (let back = c - 1; back >= startCol; back--) {
        const prev = (fieldHeaderRow[back] || '').toString().trim();
        if (prev) { resolvedField = prev; break; }
      }
    }
    if (!resolvedField) continue;
    const valveMatch = valveRaw.match(/\d+/);
    const valveNumber = valveMatch ? parseInt(valveMatch[0], 10) : null;
    columnMap.push({ colIdx: c, fieldName: resolvedField, valveLabel: valveRaw, valveNumber });
  }

  if (columnMap.length === 0) return { error: 'Could not detect field/valve columns in the open field sheet.' };

  const records = [];
  let i = 3;
  while (i < allRows.length) {
    const dateRow = allRows[i];
    const dateVal = dateRow[0];
    if (!dateVal && dateVal !== 0) { i++; continue; }
    const date = typeof dateVal === 'number' ? excelSerialToDate(dateVal) : (dateVal || '').toString().trim();
    if (!date) { i++; continue; }

    const method = (dateRow[1] || '').toString().trim();
    const uom = (dateRow[2] || '').toString().trim();
    const collector = (dateRow[3] || '').toString().trim();

    const paramRows = {};
    for (let p = i; p < Math.min(i + 5, allRows.length); p++) {
      const paramCell = (allRows[p][5] || '').toString().trim().toUpperCase();
      if (paramCell === 'EC' || paramCell === 'PH' || paramCell.includes('QTY')) {
        const key = paramCell.includes('QTY') ? 'QTY' : paramCell;
        paramRows[key] = allRows[p];
      }
    }

    for (const col of columnMap) {
      const ec = paramRows.EC ? parseFloat(paramRows.EC[col.colIdx]) || null : null;
      const ph = paramRows.PH ? parseFloat(paramRows.PH[col.colIdx]) || null : null;
      const qty = paramRows.QTY ? parseFloat(paramRows.QTY[col.colIdx]) || null : null;

      if (ec === null && ph === null && qty === null) continue;

      records.push({
        _rowNum: i + 1,
        date,
        location: col.fieldName,
        valve: col.valveNumber,
        valveLabel: col.valveLabel,
        ecIn: ec,
        phIn: ph,
        dripVolume: qty,
        method,
        uom,
        collector,
      });
    }

    let next = i + 1;
    while (next < allRows.length) {
      const paramCell = (allRows[next][5] || '').toString().trim().toUpperCase();
      if (paramCell === 'EC' || paramCell === 'PH' || paramCell.includes('QTY') || (!allRows[next][0] && !paramCell)) {
        next++;
      } else {
        break;
      }
    }
    i = next;
  }

  if (records.length === 0) return { error: 'No data records found in the open field sheet.' };
  return { records };
}

export default function EcphImporter({ open, onClose, fields = [], onImportComplete }) {
  const [step, setStep] = useState(0);
  const [importType, setImportType] = useState('nethouse');
  const [parseError, setParseError] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState(null);
  const fileRef = useRef(null);

  const [sheetChoices, setSheetChoices] = useState([]);
  const [workbookRef, setWorkbookRef] = useState(null);

  const [excelHeaders, setExcelHeaders] = useState([]);
  const [columnMapping, setColumnMapping] = useState({});
  const [rawDataRows, setRawDataRows] = useState([]);
  const [colOffset, setColOffset] = useState(0);
  const [sampleRows, setSampleRows] = useState([]);

  const [validatedRows, setValidatedRows] = useState([]);

  const fieldLookup = useMemo(() => {
    const m = {};
    fields.forEach(f => {
      const nameKey = normalizeFieldName(f.name);
      if (nameKey) m[nameKey] = f;
      const nameWithDash = (f.name || '').trim().toLowerCase();
      if (nameWithDash) m[nameWithDash] = f;
      if (f.id) m[f.id] = f;
    });
    return m;
  }, [fields]);

  const resolveField = useCallback((rawName) => {
    const norm = normalizeFieldName(rawName);
    return fieldLookup[norm] || fieldLookup[(rawName || '').trim().toLowerCase()] || null;
  }, [fieldLookup]);

  const validateEntries = useCallback((entries) => {
    return entries.map(entry => {
      const warnings = [];
      const errors = [];

      const field = resolveField(entry.location);
      if (!entry.location) {
        errors.push('Missing field/location');
      } else if (!field) {
        errors.push(`Field "${entry.location}" not found`);
      }

      if (!entry.date) errors.push('Missing date');

      const valveNum = typeof entry.valve === 'number' ? entry.valve : parseInt(entry.valve, 10);
      if (!valveNum && valveNum !== 0 && !entry.valveLabel) {
        warnings.push('No valve number');
      }

      const hasReadings = entry.ecIn || entry.ecOut || entry.phIn || entry.phOut || entry.dripVolume;
      if (!hasReadings) warnings.push('All readings are empty');

      const status = errors.length > 0 ? 'error' : warnings.length > 0 ? 'warning' : 'ok';

      return {
        ...entry,
        _status: status,
        _errors: errors,
        _warnings: warnings,
        _resolvedFieldId: field?.id || null,
        _resolvedFieldName: field?.name || entry.location,
        _valveNumber: !isNaN(valveNum) ? valveNum : null,
      };
    });
  }, [resolveField]);

  const groupIntoPayloads = useCallback((rows) => {
    const groups = new Map();
    for (const row of rows) {
      if (row._status === 'error') continue;
      const key = `${row._resolvedFieldId}|${row.date}|${row.time || ''}`;
      if (!groups.has(key)) {
        groups.set(key, {
          fieldId: row._resolvedFieldId,
          date: row.date,
          time: row.time || undefined,
          qtyOfWater: undefined,
          cycle: undefined,
          totalWaterQty: undefined,
          fieldTotalWaterBasedOnDrip: undefined,
          weatherCondition: undefined,
          irrigationStatus: undefined,
          valveReadings: [],
        });
      }
      const g = groups.get(key);

      const qw = parseFloat(row.qtyOfWater);
      if (!isNaN(qw) && qw > 0 && !g.qtyOfWater) g.qtyOfWater = qw;
      const cyc = parseInt(row.cycle, 10);
      if (!isNaN(cyc) && cyc > 0 && !g.cycle) g.cycle = cyc;
      const twq = parseFloat(row.totalWaterQty);
      if (!isNaN(twq) && twq > 0 && !g.totalWaterQty) g.totalWaterQty = twq;
      const twd = parseFloat(row.totalWaterDrip);
      if (!isNaN(twd) && twd > 0 && !g.fieldTotalWaterBasedOnDrip) g.fieldTotalWaterBasedOnDrip = twd;

      const vn = row._valveNumber;
      if (vn === null || vn === undefined) continue;

      const reading = { valveNumber: vn };
      const dv = parseFloat(row.dripVolume);
      if (!isNaN(dv)) reading.dripVolume = dv;
      const ecI = parseFloat(row.ecIn);
      if (!isNaN(ecI)) reading.ecIn = ecI;
      const ecO = parseFloat(row.ecOut);
      if (!isNaN(ecO)) reading.ec = ecO;
      const phI = parseFloat(row.phIn);
      if (!isNaN(phI)) reading.phIn = phI;
      const phO = parseFloat(row.phOut);
      if (!isNaN(phO)) reading.ph = phO;
      const dr = parseFloat(row.drainVolume);
      if (!isNaN(dr)) reading.drain = dr;
      const pd = parseFloat(row.percentDrain);
      if (!isNaN(pd)) reading.percentDrain = pd;

      g.valveReadings.push(reading);
    }
    return [...groups.values()].filter(g => g.valveReadings.length > 0);
  }, []);

  const handleNhSheetParsed = useCallback((result) => {
    if (result.error) {
      setParseError(result.error);
      return;
    }
    setExcelHeaders(result.headers);
    setColumnMapping(result.autoMap);
    setRawDataRows(result.dataRows);
    setColOffset(result.colOffset);
    setSampleRows(result.dataRows.slice(0, 3));
    setSheetChoices([]);
    setWorkbookRef(null);
    setStep(1);
  }, []);

  const handleOpenFieldParsed = useCallback((result) => {
    if (result.error) {
      setParseError(result.error);
      return;
    }
    const validated = validateEntries(result.records);
    setValidatedRows(validated);
    setStep(2);
  }, [validateEntries]);

  const handleFileUpload = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: 'array' });

        if (importType === 'openfield') {
          let ofSheet = workbook.SheetNames.find(n => /open\s*field/i.test(n));
          if (!ofSheet) ofSheet = workbook.SheetNames[0];
          const result = parseOpenFieldSheet(workbook, ofSheet);
          handleOpenFieldParsed(result);
          return;
        }

        const dataSheets = [];
        for (const name of workbook.SheetNames) {
          const sheet = workbook.Sheets[name];
          const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
          const detection = detectNhHeaderRow(rows);
          if (detection) dataSheets.push(name);
        }

        if (dataSheets.length === 0) {
          setParseError('No sheets with recognizable EC/pH headers found.');
          return;
        }

        const allLoc = dataSheets.find(n => /all\s*location/i.test(n));
        if (allLoc) {
          const result = parseNethouseSheet(workbook, allLoc);
          handleNhSheetParsed(result);
        } else if (dataSheets.length === 1) {
          const result = parseNethouseSheet(workbook, dataSheets[0]);
          handleNhSheetParsed(result);
        } else {
          setWorkbookRef(workbook);
          setSheetChoices(dataSheets);
        }
      } catch (err) {
        setParseError('Failed to read Excel: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }, [importType, handleNhSheetParsed, handleOpenFieldParsed]);

  const selectSheet = useCallback((sheetName) => {
    const result = parseNethouseSheet(workbookRef, sheetName);
    handleNhSheetParsed(result);
  }, [workbookRef, handleNhSheetParsed]);

  const applyMappingAndValidate = useCallback(() => {
    const rows = applyNhMapping(rawDataRows, excelHeaders, columnMapping, colOffset);
    if (rows.length === 0) {
      setParseError('No valid rows after mapping. Make sure Date and Location are mapped.');
      return;
    }
    const validated = validateEntries(rows);
    setValidatedRows(validated);
    setStep(2);
  }, [rawDataRows, excelHeaders, columnMapping, colOffset, validateEntries]);

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
    try {
      const payloads = groupIntoPayloads(importableRows);

      const BATCH = 200;
      let totalInserted = 0;
      let totalSkipped = 0;
      const allErrors = [];

      for (let i = 0; i < payloads.length; i += BATCH) {
        const batch = payloads.slice(i, i + BATCH);
        const res = await bulkCreateEcph(batch);
        totalInserted += res?.inserted || 0;
        totalSkipped += res?.skipped || 0;
        if (res?.errors?.length) allErrors.push(...res.errors);
      }

      setImportResults({ success: totalInserted, skipped: totalSkipped, failed: allErrors.length, errorDetails: allErrors });
      if (onImportComplete) onImportComplete({ inserted: totalInserted });
    } catch (err) {
      setImportResults({ success: 0, skipped: 0, failed: importableRows.length, errorDetails: [err.message || 'Bulk import failed'] });
    }
    setStep(3);
    setImporting(false);
  }, [importableRows, groupIntoPayloads, onImportComplete]);

  const handleClose = () => {
    setStep(0);
    setImportType('nethouse');
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

  const mappedCount = useMemo(() => Object.values(columnMapping).filter(Boolean).length, [columnMapping]);

  const handleMappingChange = useCallback((hIdx, value) => {
    setColumnMapping(prev => {
      const next = { ...prev };
      if (!value) {
        delete next[hIdx];
      } else {
        for (const k of Object.keys(next)) {
          if (next[k] === value && Number(k) !== hIdx) delete next[k];
        }
        next[hIdx] = value;
      }
      return next;
    });
  }, []);

  const isOpenField = importType === 'openfield';

  const previewColumns = useMemo(() => {
    if (isOpenField) {
      return [
        { key: '_rowNum', label: '#', width: 36 },
        { key: '_status', label: 'Status' },
        { key: 'date', label: 'Date' },
        { key: 'location', label: 'Field' },
        { key: 'valveLabel', label: 'Valve' },
        { key: 'ecIn', label: 'EC' },
        { key: 'phIn', label: 'pH' },
        { key: 'dripVolume', label: 'Drip Vol' },
        { key: '_notes', label: 'Notes' },
      ];
    }
    return [
      { key: '_rowNum', label: '#', width: 36 },
      { key: '_status', label: 'Status' },
      { key: 'date', label: 'Date' },
      { key: 'location', label: 'Field' },
      { key: 'valve', label: 'Valve' },
      { key: 'time', label: 'Time' },
      { key: 'ecIn', label: 'EC In' },
      { key: 'ecOut', label: 'EC Out' },
      { key: 'phIn', label: 'pH In' },
      { key: 'phOut', label: 'pH Out' },
      { key: 'dripVolume', label: 'Drip Vol' },
      { key: 'drainVolume', label: 'Drain Vol' },
      { key: 'qtyOfWater', label: 'Water M3' },
      { key: 'cycle', label: 'Cycle' },
      { key: '_notes', label: 'Notes' },
    ];
  }, [isOpenField]);

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xl" fullWidth>
      <DialogTitle sx={{ background: bannerBg, color: bannerColor, py: 1.5 }}>
        <Typography sx={{ fontSize: '0.9375rem', fontWeight: 700 }}>
          Import EC/pH from Excel
        </Typography>
      </DialogTitle>
      <DialogContent sx={{ px: 2, pt: 2 }}>
        <Stepper activeStep={step} sx={{ mb: 2 }} alternativeLabel>
          {STEPS.map(label => <Step key={label}><StepLabel>{label}</StepLabel></Step>)}
        </Stepper>

        {step === 0 && (
          <Box>
            <Box sx={{ mb: 3, textAlign: 'center' }}>
              <Typography sx={{ fontWeight: 600, mb: 1.5 }}>Select data type:</Typography>
              <ToggleButtonGroup
                value={importType}
                exclusive
                onChange={(_, v) => v && setImportType(v)}
                sx={{ mb: 2 }}
              >
                {IMPORT_TYPES.map(t => (
                  <ToggleButton key={t.value} value={t.value} sx={{ textTransform: 'none', px: 3 }}>
                    {t.label}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            </Box>

            {sheetChoices.length === 0 ? (
              <Paper
                variant="outlined"
                sx={{ p: 5, textAlign: 'center', borderStyle: 'dashed', borderColor: headerBg, cursor: 'pointer', '&:hover': { background: 'rgba(31,122,77,0.05)' } }}
                onClick={() => fileRef.current?.click()}
              >
                <UploadIcon sx={{ fontSize: 56, color: headerBg, mb: 1 }} />
                <Typography sx={{ fontWeight: 600 }}>
                  Click to upload {importType === 'openfield' ? 'Open Field' : importType === 'greenhouse' ? 'Greenhouse' : 'Nethouse'} Excel file
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Supported: .xlsx, .xls
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
                    <Button key={name} variant="outlined" onClick={() => selectSheet(name)}
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
                              {NH_TEMPLATE_FIELDS.map(f => (
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

        {step === 2 && (
          <Box>
            <InfoNote mode="line" severity="info" sx={{ mb: 2, fontSize: '0.75rem' }}>
              Duplicates are skipped — if a reading with the same field + date + time already exists, it won&apos;t be imported again.
            </InfoNote>
            <Box sx={{ display: 'flex', gap: 1.5, mb: 2, alignItems: 'center', flexWrap: 'wrap' }}>
              <Chip icon={<OkIcon />} label={`${counts.ok} Ready`} color="success" size="small" sx={{ fontWeight: 600 }} />
              <Chip icon={<WarnIcon />} label={`${counts.warn} Warnings`} color="warning" size="small" sx={{ fontWeight: 600 }} />
              <Chip icon={<ErrIcon />} label={`${counts.err} Errors`} color="error" size="small" sx={{ fontWeight: 600 }} />
              <Typography sx={{ fontSize: '0.75rem', color: '#666', ml: 1 }}>
                {counts.total} rows parsed — {importableRows.length} will be imported (errors skipped)
              </Typography>
            </Box>
            <TableContainer sx={{ maxHeight: 450, border: cellBorder }}>
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    {previewColumns.map(col => (
                      <TableCell key={col.key} sx={{ ...hdrStyle, ...(col.width ? { width: col.width } : {}) }}>
                        {col.label}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {validatedRows.map((r, i) => {
                    const bg = r._status === 'error' ? errBg : r._status === 'warning' ? warnBg : (i % 2 === 0 ? '#fff' : altRowBg);
                    const notes = [...r._errors, ...r._warnings].join('; ');
                    return (
                      <TableRow key={i} sx={{ background: bg }}>
                        {previewColumns.map(col => {
                          if (col.key === '_status') {
                            return (
                              <TableCell key={col.key} sx={cellStyle}>
                                {r._status === 'ok' && <OkIcon sx={{ fontSize: 16, color: 'var(--sheet-accent)' }} />}
                                {r._status === 'warning' && <WarnIcon sx={{ fontSize: 16, color: '#a84b07' }} />}
                                {r._status === 'error' && <ErrIcon sx={{ fontSize: 16, color: '#c62828' }} />}
                              </TableCell>
                            );
                          }
                          if (col.key === '_notes') {
                            return (
                              <TableCell key={col.key} sx={{ ...cellStyle, fontSize: '0.6875rem', color: r._status === 'error' ? '#c62828' : '#e65100', maxWidth: 220 }}>
                                <Tooltip title={notes} describeChild><span>{notes.length > 60 ? notes.slice(0, 60) + '...' : notes}</span></Tooltip>
                              </TableCell>
                            );
                          }
                          if (col.key === 'location') {
                            return (
                              <TableCell key={col.key} sx={{ ...cellStyle, fontWeight: 600 }}>
                                {r._resolvedFieldName || r.location}
                              </TableCell>
                            );
                          }
                          const val = r[col.key];
                          return (
                            <TableCell key={col.key} sx={cellStyle}>
                              {val !== undefined && val !== null && val !== '' ? String(val) : ''}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}

        {step === 3 && importResults && (
          <Box sx={{ textAlign: 'center', py: 3 }}>
            <OkIcon sx={{ fontSize: 56, color: 'success.main', mb: 1 }} />
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>Import Complete</Typography>
            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', mb: 2, flexWrap: 'wrap' }}>
              <Chip label={`${importResults.success} entries imported`} color="success" />
              {importResults.skipped > 0 && (
                <Chip
                  label={`${importResults.skipped} skipped (same field + date + time already exist)`}
                  color="info"
                />
              )}
              {importResults.failed > 0 && <Chip label={`${importResults.failed} failed`} color="error" />}
            </Box>
            {importResults.errorDetails.length > 0 && (
              <Alert severity="warning" sx={{ textAlign: 'left', maxWidth: 600, mx: 'auto', maxHeight: 200, overflow: 'auto' }}>
                {importResults.errorDetails.slice(0, 50).map((e, i) => <div key={i}>{e}</div>)}
                {importResults.errorDetails.length > 50 && <div>... and {importResults.errorDetails.length - 50} more</div>}
              </Alert>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 2, py: 1.5 }}>
        {step === 1 && (
          <Button onClick={() => { setStep(0); setSheetChoices([]); setWorkbookRef(null); setParseError(null); }} sx={{ textTransform: 'none', mr: 'auto' }}>
            Back
          </Button>
        )}
        {step === 2 && (
          <Button onClick={() => { isOpenField ? setStep(0) : setStep(1); }} sx={{ textTransform: 'none', mr: 'auto' }}>
            {isOpenField ? 'Back to Upload' : 'Back to Mapping'}
          </Button>
        )}
        <Button onClick={handleClose} sx={{ textTransform: 'none' }}>
          {step === 3 ? 'Done' : 'Cancel'}
        </Button>
        {step === 1 && (
          <Button
            variant="contained"
            onClick={applyMappingAndValidate}
            disabled={!columnMapping || Object.values(columnMapping).filter(Boolean).length < 2}
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
