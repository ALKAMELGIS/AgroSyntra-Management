import { useState, useRef, useCallback, useMemo } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Box, Typography,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  CircularProgress, Chip, Alert, Stepper, Step, StepLabel,
  MenuItem, Select, FormControl,
} from '@mui/material';
import {
  CloudUpload as UploadIcon,
  CheckCircleOutline as OkIcon,
  WarningAmberOutlined as WarnIcon,
  ErrorOutline as ErrIcon,
  FileDownloadOutlined as ImportIcon,
  Update as UpdateIcon,
} from '@mui/icons-material';
import * as XLSX from 'xlsx';
import { apiRequest } from '../utils/api';
import ImportCycleUprootFields from './planting/ImportCycleUprootFields';
import {
  indexExistingPlantings,
  inheritCompanionSegments,
  importUprootsForField,
  markCompanionSkipOccupancy,
  matchPlantingImportField,
  missingRequiredUprootDates,
  plantingIdentityKey,
  requiredImportUprootSlots,
} from '../utils/importUprootDates';

const headerBg = '#1d5a3c'; // = theme palette.table.headerBg
const bannerBg = '#1f7a4d';
const bannerColor = '#fff';
const altRowBg = 'rgba(31,122,77,0.06)';
const cellBorder = '1px solid #c8c8c8';
const warnBg = '#fff8e1';
const errBg = '#ffebee';
const updateBg = '#e3f2fd';

const hdrStyle = {
  background: headerBg, color: '#fff', fontWeight: 700,
  fontSize: '0.72rem', padding: '6px 8px', border: cellBorder, whiteSpace: 'nowrap',
};
const cellStyle = { fontSize: '0.72rem', padding: '5px 8px', border: cellBorder };

const steps = ['Upload Excel', 'Map Columns', 'Review & Validate', 'Import Results'];

function excelSerialToDate(serial) {
  if (!serial || typeof serial === 'string') return serial || '';
  if (typeof serial !== 'number') return String(serial);
  const epoch = new Date(Date.UTC(1899, 11, 30));
  const d = new Date(epoch.getTime() + serial * 86400000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseFlexDate(str) {
  if (!str) return '';
  if (typeof str === 'number') return excelSerialToDate(str);
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  const parts = str.match(/(\d{1,2})[-\/](\w{3,})[-\/](\d{2,4})/);
  if (parts) {
    const months = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
    const mon = months[parts[2].toLowerCase().slice(0, 3)];
    if (mon) {
      let yr = parts[3].length === 2 ? `20${parts[3]}` : parts[3];
      return `${yr}-${mon}-${parts[1].padStart(2, '0')}`;
    }
  }
  return '';
}

const TEMPLATE_FIELDS = [
  { key: 'seedingDate', label: 'Seeding Date' },
  { key: 'fieldName', label: 'Field' },
  { key: 'segment', label: 'Segment' },
  { key: 'totalArea', label: 'Total Area' },
  { key: 'cropName', label: 'Crop Name' },
  { key: 'variety', label: 'Variety' },
  { key: 'cropType', label: 'Crop Type' },
  { key: 'breeder', label: 'Breeder' },
  { key: 'lotBatchNo', label: 'Lot/Batch No' },
  { key: 'quantity', label: 'Quantity' },
  { key: 'uom', label: 'UOM' },
  { key: 'authorizedBy', label: 'Authorized By' },
];

const KEYWORD_MAP = [
  { key: 'seedingDate', keywords: ['seeding date', 'start date', 'sowing date', 'planting date', '(start) date'] },
  { key: 'fieldName', keywords: ['field id', 'field name', 'field', 'location', 'plot'] },
  { key: 'segment', keywords: ['segment', 'bay', 'section'] },
  { key: 'totalArea', keywords: ['total area', 'area', 'hectare'] },
  { key: 'cropName', keywords: ['crop name', 'crop'] },
  { key: 'variety', keywords: ['variety', 'cultivar'] },
  { key: 'cropType', keywords: ['crop type', 'type', 'annual', 'perennial'] },
  { key: 'breeder', keywords: ['breeder', 'pm breeder', 'seed company', 'supplier'] },
  { key: 'lotBatchNo', keywords: ['lot', 'batch', 'lot/batch'] },
  { key: 'quantity', keywords: ['quantity', 'qty'] },
  { key: 'uom', keywords: ['uom', 'unit', 'kg/mt'] },
  { key: 'authorizedBy', keywords: ['authorized', 'approved', 'verified'] },
];

function normalizeHeader(h) {
  return (h || '').toString().trim().toLowerCase().replace(/\s+/g, ' ');
}

function guessFieldKey(headerText) {
  const norm = normalizeHeader(headerText);
  if (!norm) return '';
  for (const { key, keywords } of KEYWORD_MAP) {
    if (keywords.some(kw => norm.includes(kw))) return key;
  }
  if (/^crop\b/.test(norm) && !norm.includes('type')) return 'cropName';
  return '';
}

const ANCHOR_KEYWORDS = ['seeding', 'field', 'crop', 'variety', 'planting'];

function detectHeaderRow(allRows) {
  for (let i = 0; i < Math.min(20, allRows.length); i++) {
    const row = allRows[i];
    let anchorHits = 0;
    for (let j = 0; j < row.length; j++) {
      const cell = normalizeHeader(row[j]);
      if (ANCHOR_KEYWORDS.some(kw => cell.includes(kw))) anchorHits++;
    }
    if (anchorHits >= 2) {
      const firstNonEmpty = row.findIndex(c => c !== '' && c != null);
      return { headerIdx: i, colOffset: firstNonEmpty > 0 ? firstNonEmpty : 0 };
    }
  }
  return null;
}

export default function OpenFieldImporter({
  open, onClose, fields = [], crops = [], allVarietiesByCrop = {},
  existingRecords = [], breeders = [], siteId, onImportComplete,
}) {
  const [step, setStep] = useState(0);
  const [validatedRows, setValidatedRows] = useState([]);
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState(null);
  const [parseError, setParseError] = useState(null);
  const fileRef = useRef(null);

  const [sheetChoices, setSheetChoices] = useState([]);
  const [workbookRef, setWorkbookRef] = useState(null);

  const [excelHeaders, setExcelHeaders] = useState([]);
  const [columnMapping, setColumnMapping] = useState({});
  const [rawDataRows, setRawDataRows] = useState([]);
  const [colOffset, setColOffset] = useState(0);
  const [sampleRows, setSampleRows] = useState([]);
  const [uprootSlots, setUprootSlots] = useState([]);
  const [uprootDates, setUprootDates] = useState({});
  const [extraUproots, setExtraUproots] = useState([]);

  const breederLookup = useMemo(() => {
    const m = {};
    breeders.forEach(b => {
      if (b.name) m[b.name.toLowerCase().trim()] = b;
    });
    return m;
  }, [breeders]);

  const existingByKey = useMemo(
    () => indexExistingPlantings(existingRecords, 'seeding'),
    [existingRecords],
  );

  const resolveCrop = useCallback((cropNameRaw) => {
    if (!cropNameRaw) return null;
    const str = cropNameRaw.toLowerCase().trim();
    for (const c of crops) {
      const crop = typeof c === 'object' ? c : { name: c, id: null };
      if (!crop.name) continue;
      if (str === crop.name.toLowerCase().trim()) return crop;
    }
    return null;
  }, [crops]);

  const resolveVariety = useCallback((cropId, varietyRaw) => {
    if (!cropId || !varietyRaw) return null;
    const vStr = varietyRaw.toLowerCase().trim();
    const cvs = allVarietiesByCrop[cropId] || [];
    return cvs.find(v => v.name && (
      vStr === v.name.toLowerCase() || vStr.includes(v.name.toLowerCase()) || v.name.toLowerCase().includes(vStr)
    )) || null;
  }, [allVarietiesByCrop]);

  const validateRows = useCallback((rows) => {
    let prevSeedingDate = '';
    let prevCropName = '';
    let prevVariety = '';
    let prevFieldName = '';
    let prevBreeder = '';
    let prevLotBatchNo = '';
    let prevCropType = '';
    let prevTotalArea = '';

    return rows.map(row => {
      const warnings = [];
      const errors = [];
      let resolvedFieldId = null;
      let resolvedCropId = null;
      let needsVarietyCreation = false;
      let needsCropCreation = false;
      let isUpdate = false;
      let existingId = null;

      const effectiveSeedingDate = row.seedingDate || prevSeedingDate;
      const effectiveCropName = row.cropName || prevCropName;
      const effectiveVariety = row.variety || prevVariety;
      const effectiveFieldName = row.fieldName || prevFieldName;
      const effectiveBreeder = row.breeder || prevBreeder;
      const effectiveLotBatchNo = row.lotBatchNo || prevLotBatchNo;
      const effectiveCropType = row.cropType || prevCropType;
      const effectiveTotalArea = row.totalArea || prevTotalArea;

      if (row.seedingDate) prevSeedingDate = row.seedingDate;
      if (row.cropName) {
        prevCropName = row.cropName;
        if (row.breeder) prevBreeder = row.breeder; else prevBreeder = '';
        if (row.lotBatchNo) prevLotBatchNo = row.lotBatchNo; else prevLotBatchNo = '';
        if (row.cropType) prevCropType = row.cropType; else prevCropType = '';
      } else {
        if (row.breeder) prevBreeder = row.breeder;
        if (row.lotBatchNo) prevLotBatchNo = row.lotBatchNo;
        if (row.cropType) prevCropType = row.cropType;
      }
      if (row.totalArea) prevTotalArea = row.totalArea;
      if (row.variety) prevVariety = row.variety;
      if (row.fieldName) prevFieldName = row.fieldName;

      let resolvedCropName = effectiveCropName;
      let resolvedVarietyId = null;
      let resolvedVarietyName = effectiveVariety;

      const seedDate = parseFlexDate(effectiveSeedingDate);
      if (!seedDate) {
        errors.push('Missing Seeding Date');
      }

      const field = matchPlantingImportField(effectiveFieldName, fields);
      if (!String(effectiveFieldName || '').trim()) {
        warnings.push('No field specified');
      } else if (!field) {
        errors.push(`Field "${effectiveFieldName}" not found`);
      } else {
        resolvedFieldId = field.id;
      }

      if (resolvedCropName) {
        const crop = resolveCrop(resolvedCropName);
        if (crop) {
          resolvedCropId = crop.id;
          resolvedCropName = crop.name;
        } else {
          needsCropCreation = true;
          warnings.push(`Crop "${resolvedCropName}" will be created`);
        }
      }

      if (resolvedCropId && resolvedVarietyName) {
        const variety = resolveVariety(resolvedCropId, resolvedVarietyName);
        if (variety) {
          resolvedVarietyId = variety.id;
          resolvedVarietyName = variety.name;
        } else {
          needsVarietyCreation = true;
          warnings.push(`Variety "${resolvedVarietyName}" will be created`);
        }
      } else if (needsCropCreation && resolvedVarietyName) {
        needsVarietyCreation = true;
        warnings.push(`Variety "${resolvedVarietyName}" will be created`);
      }

      let resolvedBreederId = null;
      let needsBreederCreation = false;
      const breederName = (effectiveBreeder || '').trim();
      if (breederName) {
        const existing = breederLookup[breederName.toLowerCase()];
        if (existing) {
          resolvedBreederId = existing.id;
        } else {
          needsBreederCreation = true;
          warnings.push(`Breeder "${breederName}" will be created`);
        }
      }

      const status = errors.length > 0 ? 'error' : warnings.length > 0 ? 'warning' : 'ok';

      return {
        ...row,
        seedingDate: effectiveSeedingDate,
        fieldName: effectiveFieldName,
        cropName: effectiveCropName,
        variety: effectiveVariety,
        breeder: effectiveBreeder,
        lotBatchNo: effectiveLotBatchNo,
        quantity: row.quantity || '',
        uom: row.uom || '',
        cropType: effectiveCropType,
        totalArea: effectiveTotalArea,
        _seedDate: seedDate,
        _occupancyDate: seedDate,
        _resolvedFieldId: resolvedFieldId,
        _resolvedCropId: resolvedCropId,
        _resolvedCropName: resolvedCropName,
        _resolvedVarietyId: resolvedVarietyId,
        _resolvedVarietyName: resolvedVarietyName,
        _needsVarietyCreation: needsVarietyCreation,
        _needsCropCreation: needsCropCreation,
        _resolvedBreederId: resolvedBreederId,
        _needsBreederCreation: needsBreederCreation,
        _isUpdate: isUpdate,
        _existingId: existingId,
        _status: status,
        _warnings: warnings,
        _errors: errors,
      };
    });
  }, [fields, resolveCrop, resolveVariety, breederLookup]);

  const reset = useCallback(() => {
    setStep(0);
    setValidatedRows([]);
    setImporting(false);
    setImportResults(null);
    setParseError(null);
    setExcelHeaders([]);
    setColumnMapping({});
    setRawDataRows([]);
    setSampleRows([]);
    setSheetChoices([]);
    setWorkbookRef(null);
    setUprootSlots([]);
    setUprootDates({});
    setExtraUproots([]);
  }, []);

  const handleClose = () => { reset(); onClose(); };

  const parseSheet = useCallback((workbook, sheetName) => {
    const ws = workbook.Sheets[sheetName];
    const allRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
    if (allRows.length < 2) {
      setParseError('Sheet appears empty or has no data rows.');
      return;
    }

    const detected = detectHeaderRow(allRows);
    if (!detected) {
      setParseError('Could not detect a header row. Make sure the sheet has headers like "Seeding Date", "Field", "Crop", etc.');
      return;
    }

    const { headerIdx, colOffset: off } = detected;
    setColOffset(off);

    const headerCells = allRows[headerIdx].slice(off).filter(c => c !== '' && c != null);
    setExcelHeaders(headerCells.map(h => String(h).trim()));

    const mapping = {};
    const usedKeys = new Set();
    headerCells.forEach((h, i) => {
      const guess = guessFieldKey(h);
      if (guess && !usedKeys.has(guess)) {
        mapping[i] = guess;
        usedKeys.add(guess);
      }
    });
    setColumnMapping(mapping);

    const dataRows = allRows.slice(headerIdx + 1)
      .filter(r => r.some(c => c !== '' && c != null))
      .map((cells, idx) => ({ cells: cells.slice(off), _rowNum: headerIdx + 2 + idx }));
    setRawDataRows(dataRows);
    setSampleRows(dataRows.slice(0, 5));
    setParseError(null);
    setStep(1);
  }, []);

  const handleFileUpload = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const workbook = XLSX.read(evt.target.result, { type: 'array', raw: true });
        const dataSheets = workbook.SheetNames.filter(n => {
          const ws = workbook.Sheets[n];
          const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
          return rows.length > 1;
        });

        if (dataSheets.length === 0) {
          setParseError('No data sheets found in file.');
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

  const applyMappingAndValidate = useCallback(() => {
    const mapped = rawDataRows.map(({ cells, _rowNum }) => {
      const row = {};
      excelHeaders.forEach((_, hIdx) => {
        const key = columnMapping[hIdx];
        if (!key) return;
        let val = cells[hIdx];
        if (key === 'seedingDate' && typeof val === 'number') {
          val = excelSerialToDate(val);
        }
        row[key] = val != null ? String(val).trim() : '';
      });
      row._rowNum = _rowNum;
      return row;
    });

    const withData = mapped.filter(r => r.seedingDate || r.fieldName || r.cropName);
    if (withData.length === 0) {
      setParseError('No valid rows found. Make sure "Seeding Date" or "Field" column is mapped.');
      return;
    }

    const validated = validateRows(withData);
    const inherited = inheritCompanionSegments(validated.map((row) => ({
      ...row,
      _occupancyDate: row._seedDate,
    })));
    const matched = inherited.map((row) => {
      const key = plantingIdentityKey(
        row._resolvedFieldId,
        row._seedDate,
        row._resolvedVarietyName,
        row.segment,
      );
      const existing = existingByKey[key];
      if (existing) {
        return {
          ...row,
          _isUpdate: true,
          _existingId: existing.id || existing._serverId,
        };
      }
      return { ...row, _isUpdate: false, _existingId: null };
    });
    const prepared = markCompanionSkipOccupancy(matched);
    setValidatedRows(prepared);
    setUprootSlots(requiredImportUprootSlots(prepared));
    setUprootDates({});
    setExtraUproots([]);
    setStep(2);
  }, [rawDataRows, excelHeaders, columnMapping, validateRows, existingByKey]);

  const importableRows = useMemo(
    () => validatedRows.filter(r => r._status !== 'error'),
    [validatedRows]
  );

  const counts = useMemo(() => {
    const ok = validatedRows.filter(r => r._status === 'ok' && !r._isUpdate).length;
    const updates = validatedRows.filter(r => r._isUpdate && r._status !== 'error').length;
    const warn = validatedRows.filter(r => r._status === 'warning' && !r._isUpdate).length;
    const err = validatedRows.filter(r => r._status === 'error').length;
    return { ok, updates, warn, err, total: validatedRows.length };
  }, [validatedRows]);

  const handleImport = useCallback(async () => {
    if (missingRequiredUprootDates(uprootSlots, uprootDates).length) {
      setParseError('Enter an uproot date for each overlapping cycle.');
      return;
    }
    setParseError(null);
    setImporting(true);
    const results = { created: 0, updated: 0, cropsCreated: 0, varietiesCreated: 0, breedersCreated: 0, failed: 0, errors: [] };
    const cropCache = {};
    const varietyCache = {};
    const breederCache = {};
    const resolved = [];

    for (const row of importableRows) {
      try {
        let cropId = row._resolvedCropId;
        let varietyId = row._resolvedVarietyId;
        let breederId = row._resolvedBreederId;

        if (row._needsBreederCreation && row.breeder) {
          const bKey = row.breeder.toLowerCase().trim();
          if (breederCache[bKey]) {
            breederId = breederCache[bKey];
          } else {
            const created = await apiRequest('/breeders', {
              method: 'POST',
              body: JSON.stringify({ name: row.breeder.trim() }),
            });
            breederId = created.id || (created.data && created.data.id);
            breederCache[bKey] = breederId;
            results.breedersCreated++;
          }
        }

        if (row._needsCropCreation && row._resolvedCropName) {
          const cropKey = row._resolvedCropName.toLowerCase().trim();
          if (cropCache[cropKey]) {
            cropId = cropCache[cropKey];
          } else {
            const created = await apiRequest('/crops', {
              method: 'POST',
              body: JSON.stringify({ name: row._resolvedCropName }),
            });
            cropId = created.id || (created.data && created.data.id);
            cropCache[cropKey] = cropId;
            results.cropsCreated++;
          }
        }

        if (row._needsVarietyCreation && cropId && row._resolvedVarietyName) {
          const cacheKey = `${cropId}|${row._resolvedVarietyName.toLowerCase()}`;
          if (varietyCache[cacheKey]) {
            varietyId = varietyCache[cacheKey];
          } else {
            const created = await apiRequest(`/crops/${cropId}/varieties`, {
              method: 'POST',
              body: JSON.stringify({ name: row._resolvedVarietyName, breederId: breederId || undefined }),
            });
            varietyId = created.id || (created.data && created.data.id);
            varietyCache[cacheKey] = varietyId;
            results.varietiesCreated++;
          }
        }

        resolved.push({
          ...row,
          payload: {
            seedingDate: row._seedDate,
            fieldId: row._resolvedFieldId || null,
            segment: row.segment || null,
            totalArea: row.totalArea || null,
            cropId: cropId || null,
            varietyId: varietyId || null,
            cropType: row.cropType || 'Annual',
            breederId: breederId || null,
            lotBatchNo: row.lotBatchNo || null,
            quantity: row.quantity || null,
            uom: row.uom || null,
            authorizedBy: row.authorizedBy || null,
            existingId: row._isUpdate ? row._existingId : null,
            skipOccupancy: Boolean(row._skipOccupancy),
          },
        });
      } catch (err) {
        results.failed++;
        results.errors.push(`Row ${row._rowNum}: ${err.message || 'Failed'}`);
      }
    }

    const byField = new Map();
    const noField = [];
    resolved.forEach((row) => {
      const fieldId = row._resolvedFieldId;
      if (!fieldId) {
        noField.push(row);
        return;
      }
      if (!byField.has(fieldId)) byField.set(fieldId, []);
      byField.get(fieldId).push(row);
    });

    for (const [fieldId, group] of byField) {
      try {
        const summary = await apiRequest('/open-field-planting/import-cycles', {
          method: 'POST',
          body: JSON.stringify({
            fieldId,
            uproots: importUprootsForField(fieldId, uprootSlots, uprootDates, extraUproots),
            entries: group.map((row) => row.payload),
          }),
        });
        results.created += summary?.created || 0;
        results.updated += summary?.updated || 0;
      } catch (err) {
        results.failed += group.length;
        results.errors.push(`${group[0].fieldName || fieldId}: ${err.message || 'Failed'}`);
      }
    }

    for (const row of noField) {
      try {
        if (row.payload.existingId) {
          await apiRequest(`/open-field-planting/${row.payload.existingId}`, {
            method: 'PUT',
            body: JSON.stringify(row.payload),
          });
          results.updated++;
        } else {
          await apiRequest('/open-field-planting/bulk', {
            method: 'POST',
            body: JSON.stringify({ entries: [row.payload] }),
          });
          results.created++;
        }
      } catch (err) {
        results.failed++;
        results.errors.push(`Row ${row._rowNum}: ${err.message || 'Failed'}`);
      }
    }

    if ((results.created > 0 || results.updated > 0) && siteId) {
      try {
        await apiRequest(`/open-field-planting/sync-fields?site_id=${siteId}`, { method: 'POST' });
      } catch (_) { /* non-critical */ }
    }

    setImportResults(results);
    setImporting(false);
    setStep(3);
    if ((results.created > 0 || results.updated > 0) && onImportComplete) {
      onImportComplete();
    }
  }, [importableRows, siteId, onImportComplete, uprootSlots, uprootDates, extraUproots]);

  const renderStep0 = () => (
    <Box sx={{ textAlign: 'center', py: 4 }}>
      <UploadIcon sx={{ fontSize: 48, color: 'primary.main', mb: 2 }} />
      <Typography variant="h6" gutterBottom>Upload Open Field Seeding Excel</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Select an .xlsx or .xls file with open field seeding/planting data.
      </Typography>
      <Button variant="contained" component="label" startIcon={<UploadIcon />}>
        Choose File
        <input type="file" hidden accept=".xlsx,.xls" ref={fileRef} onChange={handleFileUpload} />
      </Button>
      {sheetChoices.length > 1 && (
        <Box sx={{ mt: 3 }}>
          <Typography variant="body2" sx={{ mb: 1 }}>Multiple sheets detected. Select one:</Typography>
          {sheetChoices.map(name => (
            <Button key={name} variant="outlined" sx={{ m: 0.5 }}
              onClick={() => { parseSheet(workbookRef, name); setSheetChoices([]); }}>
              {name}
            </Button>
          ))}
        </Box>
      )}
      {parseError && <Alert severity="error" sx={{ mt: 2 }}>{parseError}</Alert>}
    </Box>
  );

  const renderStep1 = () => (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        Map Excel columns to fields. {excelHeaders.length} columns detected.
      </Typography>
      <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 400 }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={hdrStyle}>Excel Column</TableCell>
              <TableCell sx={hdrStyle}>Maps To</TableCell>
              <TableCell sx={hdrStyle}>Sample Data</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {excelHeaders.map((h, idx) => (
              <TableRow key={idx} sx={{ bgcolor: idx % 2 ? altRowBg : 'inherit' }}>
                <TableCell sx={cellStyle}><strong>{h}</strong></TableCell>
                <TableCell sx={cellStyle}>
                  <FormControl size="small" sx={{ minWidth: 140 }}>
                    <Select
                      value={columnMapping[idx] || ''}
                      onChange={(e) => setColumnMapping(prev => ({ ...prev, [idx]: e.target.value }))}
                      displayEmpty size="small"
                      sx={{ fontSize: '0.75rem' }}
                    >
                      <MenuItem value="" sx={{ fontSize: '0.75rem' }}><em>-- skip --</em></MenuItem>
                      {TEMPLATE_FIELDS.map(tf => (
                        <MenuItem key={tf.key} value={tf.key} sx={{ fontSize: '0.75rem' }}>{tf.label}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </TableCell>
                <TableCell sx={{ ...cellStyle, color: 'text.secondary', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {sampleRows.slice(0, 3).map(r => String(r.cells[idx] ?? '')).filter(Boolean).join(' | ') || '-'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {parseError && <Alert severity="error" sx={{ mt: 2 }}>{parseError}</Alert>}
    </Box>
  );

  const renderStep2 = () => (
    <Box>
      <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <Chip icon={<OkIcon />} label={`Ready: ${counts.ok}`} color="success" variant="outlined" />
        {counts.updates > 0 && <Chip icon={<UpdateIcon />} label={`Will Update: ${counts.updates}`} color="info" variant="outlined" />}
        {counts.warn > 0 && <Chip icon={<WarnIcon />} label={`Warnings: ${counts.warn}`} color="warning" variant="outlined" />}
        {counts.err > 0 && <Chip icon={<ErrIcon />} label={`Errors: ${counts.err}`} color="error" variant="outlined" />}
        <Typography variant="body2" sx={{ alignSelf: 'center', ml: 'auto' }}>
          {importableRows.length} of {counts.total} rows will be imported
        </Typography>
      </Box>

      <ImportCycleUprootFields
        slots={uprootSlots}
        dates={uprootDates}
        onDateChange={(id, value) => setUprootDates((prev) => ({ ...prev, [id]: value }))}
        extras={extraUproots}
        onAddExtra={() => {
          const fieldId = uprootSlots[0]?.fieldId || importableRows.find((row) => row._resolvedFieldId)?._resolvedFieldId;
          const fieldName = uprootSlots[0]?.fieldName
            || importableRows.find((row) => row._resolvedFieldId === fieldId)?.fieldName
            || '';
          if (!fieldId) return;
          setExtraUproots((prev) => [...prev, {
            id: `extra-${Date.now()}`,
            fieldId,
            fieldName,
            uprootDate: '',
          }]);
        }}
        onExtraChange={(id, patch) => setExtraUproots((prev) => prev.map((row) => (
          row.id === id ? { ...row, ...patch } : row
        )))}
        onRemoveExtra={(id) => setExtraUproots((prev) => prev.filter((row) => row.id !== id))}
      />
      {parseError && <Alert severity="error" sx={{ mb: 2 }}>{parseError}</Alert>}

      <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 380 }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={hdrStyle}>#</TableCell>
              <TableCell sx={hdrStyle}>Status</TableCell>
              <TableCell sx={hdrStyle}>Date</TableCell>
              <TableCell sx={hdrStyle}>Field</TableCell>
              <TableCell sx={hdrStyle}>Crop</TableCell>
              <TableCell sx={hdrStyle}>Variety</TableCell>
              <TableCell sx={hdrStyle}>Breeder</TableCell>
              <TableCell sx={hdrStyle}>Notes</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {validatedRows.map((row, idx) => {
              const bgColor = row._status === 'error' ? errBg : row._isUpdate ? updateBg : row._status === 'warning' ? warnBg : (idx % 2 ? altRowBg : 'inherit');
              return (
                <TableRow key={idx} sx={{ bgcolor: bgColor }}>
                  <TableCell sx={cellStyle}>{row._rowNum}</TableCell>
                  <TableCell sx={cellStyle}>
                    {row._status === 'ok' && !row._isUpdate && <OkIcon sx={{ fontSize: 16, color: 'success.main' }} />}
                    {row._isUpdate && <UpdateIcon sx={{ fontSize: 16, color: 'info.main' }} />}
                    {row._status === 'warning' && !row._isUpdate && <WarnIcon sx={{ fontSize: 16, color: 'warning.main' }} />}
                    {row._status === 'error' && <ErrIcon sx={{ fontSize: 16, color: 'error.main' }} />}
                  </TableCell>
                  <TableCell sx={cellStyle}>{row._seedDate || '-'}</TableCell>
                  <TableCell sx={cellStyle}>{row.fieldName || '-'}</TableCell>
                  <TableCell sx={cellStyle}>{row.cropName || '-'}</TableCell>
                  <TableCell sx={cellStyle}>{row.variety || '-'}</TableCell>
                  <TableCell sx={cellStyle}>{row.breeder || '-'}</TableCell>
                  <TableCell sx={{ ...cellStyle, maxWidth: 200 }}>
                    {[...row._warnings, ...row._errors].map((msg, mi) => (
                      <Typography key={mi} variant="caption" display="block" color={row._errors.includes(msg) ? 'error' : 'warning.main'}>
                        {msg}
                      </Typography>
                    ))}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );

  const renderStep3 = () => {
    if (!importResults) return null;
    return (
      <Box sx={{ py: 2 }}>
        <Alert severity={importResults.failed > 0 ? 'warning' : 'success'} sx={{ mb: 2 }}>
          Import complete!
        </Alert>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2 }}>
          {importResults.created > 0 && <Chip label={`${importResults.created} created`} color="success" />}
          {importResults.updated > 0 && <Chip label={`${importResults.updated} updated`} color="info" />}
          {importResults.cropsCreated > 0 && <Chip label={`${importResults.cropsCreated} crops created`} color="secondary" />}
          {importResults.varietiesCreated > 0 && <Chip label={`${importResults.varietiesCreated} varieties created`} color="secondary" />}
          {importResults.breedersCreated > 0 && <Chip label={`${importResults.breedersCreated} breeders created`} color="secondary" />}
          {importResults.failed > 0 && <Chip label={`${importResults.failed} failed`} color="error" />}
        </Box>
        {importResults.errors.length > 0 && (
          <Alert severity="error" sx={{ maxHeight: 150, overflow: 'auto' }}>
            {importResults.errors.map((e, i) => <div key={i}>{e}</div>)}
          </Alert>
        )}
      </Box>
    );
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="lg" fullWidth>
      <DialogTitle sx={{ bgcolor: bannerBg, color: bannerColor, fontWeight: 700 }}>
        Import Open Field Seeding Records
      </DialogTitle>
      <DialogContent sx={{ minHeight: 400 }}>
        <Stepper activeStep={step} sx={{ my: 2 }}>
          {steps.map((label) => (
            <Step key={label}><StepLabel>{label}</StepLabel></Step>
          ))}
        </Stepper>
        {step === 0 && renderStep0()}
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        {step < 3 && <Button onClick={handleClose}>Cancel</Button>}
        {step === 1 && (
          <>
            <Button onClick={() => setStep(0)}>Back</Button>
            <Button variant="contained" onClick={applyMappingAndValidate}>Validate</Button>
          </>
        )}
        {step === 2 && (
          <>
            <Button onClick={() => setStep(1)}>Back</Button>
            <Button variant="contained" color="primary" onClick={handleImport}
              disabled={importing || importableRows.length === 0 || missingRequiredUprootDates(uprootSlots, uprootDates).length > 0}
              startIcon={importing ? <CircularProgress size={16} color="inherit" /> : <ImportIcon />}>
              {importing ? 'Importing...' : `Import ${importableRows.length} Rows`}
            </Button>
          </>
        )}
        {step === 3 && <Button variant="contained" onClick={handleClose}>Done</Button>}
      </DialogActions>
    </Dialog>
  );
}
