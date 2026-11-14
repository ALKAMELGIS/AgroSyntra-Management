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
  UpdateOutlined as UpdateIcon,
} from '@mui/icons-material';
import * as XLSX from 'xlsx';
import { apiRequest } from '../utils/api';
import { applyOpenFieldSowingDates } from '../utils/openFieldSowingDates';
import { isOpenFieldType } from '../utils/fieldTypeHelpers';
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

const headerBg = 'var(--sheet-header)'; // = theme palette.table.headerBg
const bannerBg = 'var(--grid-band-bg)';
const bannerColor = 'var(--grid-band-fg)';
const altRowBg = 'rgba(31,122,77,0.06)';
const cellBorder = '1px solid #c8c8c8';
const warnBg = '#fff8e1';
const errBg = '#ffebee';
const updateBg = '#e3f2fd';

const hdrStyle = {
  background: 'var(--grid-head-bg)', color: 'var(--grid-head-fg)', fontWeight: 700,
  fontSize: '0.6875rem', padding: '6px 8px', border: cellBorder, whiteSpace: 'nowrap',
};
const cellStyle = { fontSize: '0.6875rem', padding: '5px 8px', border: cellBorder };

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
  { key: 'cropName', label: 'Crop' },
  { key: 'variety', label: 'Variety' },
  { key: 'cropSubClass', label: 'Subclass' },
  { key: 'cropType', label: 'Crop Type' },
  { key: 'breeder', label: 'Breeder' },
  { key: 'lotBatchNo', label: 'Lot/Batch No' },
  { key: 'pmQuantity', label: 'Quantity' },
  { key: 'uom', label: 'UOM' },
  { key: 'traysPerHec', label: 'Trays/Ha' },
  { key: 'ratePerHec', label: 'Rate/Ha' },
  { key: 'transplantDate', label: 'Transplant Date' },
  { key: 'authorizedBy', label: 'Authorized By' },
];

const KEYWORD_MAP = [
  { key: 'seedingDate', keywords: ['(start) date', 'seeding date', 'start date', 'sowing date', 'planting date'] },
  { key: 'fieldName', keywords: ['field id', 'field name', 'field', 'location', 'plot', 'nethse', 'nethouse'] },
  { key: 'segment', keywords: ['segment', 'bay', 'section'] },
  { key: 'totalArea', keywords: ['total area', 'area', 'hectare'] },
  { key: 'cropName', keywords: ['crop name'] },
  { key: 'variety', keywords: ['variety', 'cultivar', 'crop (pm)', 'pm variety'] },
  { key: 'cropSubClass', keywords: ['sub class', 'subclass', 'sub-class'] },
  { key: 'cropType', keywords: ['crop type', 'annual', 'perennial'] },
  { key: 'breeder', keywords: ['breeder', 'director', 'seed company', 'supplier'] },
  { key: 'lotBatchNo', keywords: ['lot', 'batch', 'lot/batch'] },
  { key: 'pmQuantity', keywords: ['pm quantity', 'quantity', 'qty'] },
  { key: 'uom', keywords: ['uom', 'kg/mt'] },
  { key: 'traysPerHec', keywords: ['tray (per', 'trays/ha', 'trays per ha', 'seeding tray'] },
  { key: 'ratePerHec', keywords: ['rate (per', 'rate/ha', 'rate per ha', 'seeding rate'] },
  { key: 'transplantDate', keywords: ['seeding end', 'end date', 'transplant date', 'transplant'] },
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
  if (/^crop\b/.test(norm) && !norm.includes('type') && !norm.includes('sub')) return 'cropName';
  return '';
}

const ANCHOR_KEYWORDS = ['seeding', 'field', 'crop', 'variety', 'transplant', 'planting'];

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

function findSowingRecordId(batches, seedDate, cropId, varietyId, lotBatchNo, breederId) {
  if (!batches?.length || !seedDate) return null;
  const matches = batches.filter((b) => {
    const bd = (b.seedingDate || '').split?.('T')[0] || b.seedingDate || '';
    if (bd !== seedDate) return false;
    if (cropId && b.cropId && b.cropId !== cropId) return false;
    if (varietyId && b.varietyId && b.varietyId !== varietyId) return false;
    if (lotBatchNo && (b.seedBatch || '') !== String(lotBatchNo).trim()) return false;
    if (breederId && b.breederId && b.breederId !== breederId) return false;
    return true;
  });
  if (matches.length === 1) return matches[0].id;
  if (lotBatchNo) {
    const exact = matches.find((b) => (b.seedBatch || '') === String(lotBatchNo).trim());
    if (exact) return exact.id;
  }
  return null;
}

export default function PlantingImporter({
  open, onClose, fields = [], crops = [], allVarietiesByCrop = {},
  existingRecords = [], breeders = [], siteId, onImportComplete,
  transplantOnly = false,
  nurserySowingBatches = [],
  dialogTitle,
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

  const fieldLookup = useMemo(() => {
    const m = {};
    fields.forEach(f => {
      const nameKey = (f.name || '').trim().toLowerCase();
      if (nameKey) m[nameKey] = f;
      const normalized = nameKey.replace(/[-\s]+/g, '');
      if (normalized) m[normalized] = f;
      if (f.id) m[f.id] = f;
    });
    return m;
  }, [fields]);

  const cropLookup = useMemo(() => {
    const m = {};
    crops.forEach(c => {
      const crop = typeof c === 'object' ? c : { name: c, id: null };
      if (crop.name) m[crop.name.toLowerCase().trim()] = crop;
    });
    return m;
  }, [crops]);

  const breederLookup = useMemo(() => {
    const m = {};
    breeders.forEach(b => {
      if (b.name) m[b.name.toLowerCase().trim()] = b;
    });
    return m;
  }, [breeders]);

  const existingByKey = useMemo(
    () => indexExistingPlantings(existingRecords, 'occupancy'),
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
    let prevCropName = '';
    let prevVariety = '';
    let prevFieldName = '';
    let prevBreeder = '';
    let prevLotBatchNo = '';
    let prevPmQuantity = '';
    let prevUom = '';
    let prevCropSubClass = '';
    let prevCropType = '';
    let prevTotalArea = '';
    let prevTraysPerHec = '';
    let prevRatePerHec = '';

    return rows.map(row => {
      const warnings = [];
      const errors = [];
      let resolvedFieldId = null;
      let resolvedCropId = null;
      let needsVarietyCreation = false;
      let needsCropCreation = false;
      let isUpdate = false;
      let existingId = null;

      const effectiveCropName = row.cropName || prevCropName;
      const effectiveVariety = row.variety || prevVariety;
      const effectiveFieldName = row.fieldName || prevFieldName;
      const effectiveBreeder = row.breeder || prevBreeder;
      const effectiveLotBatchNo = row.lotBatchNo || prevLotBatchNo;
      const effectivePmQuantity = row.pmQuantity || prevPmQuantity;
      const effectiveUom = row.uom || prevUom;
      const effectiveCropSubClass = row.cropSubClass || prevCropSubClass;
      const effectiveCropType = row.cropType || prevCropType;
      const allAreaFieldsEmpty = !row.totalArea && !row.traysPerHec && !row.ratePerHec;
      const effectiveTotalArea = row.totalArea || (allAreaFieldsEmpty ? prevTotalArea : '');
      const effectiveTraysPerHec = row.traysPerHec || (allAreaFieldsEmpty ? prevTraysPerHec : '');
      const effectiveRatePerHec = row.ratePerHec || (allAreaFieldsEmpty ? prevRatePerHec : '');

      if (row.cropName) {
        prevCropName = row.cropName;
        if (row.breeder) prevBreeder = row.breeder; else prevBreeder = '';
        if (row.lotBatchNo) prevLotBatchNo = row.lotBatchNo; else prevLotBatchNo = '';
        if (row.pmQuantity) prevPmQuantity = row.pmQuantity; else prevPmQuantity = '';
        if (row.uom) prevUom = row.uom; else prevUom = '';
        if (row.cropSubClass) prevCropSubClass = row.cropSubClass; else prevCropSubClass = '';
        if (row.cropType) prevCropType = row.cropType; else prevCropType = '';
      } else {
        if (row.breeder) prevBreeder = row.breeder;
        if (row.lotBatchNo) prevLotBatchNo = row.lotBatchNo;
        if (row.pmQuantity) prevPmQuantity = row.pmQuantity;
        if (row.uom) prevUom = row.uom;
        if (row.cropSubClass) prevCropSubClass = row.cropSubClass;
        if (row.cropType) prevCropType = row.cropType;
      }
      if (row.totalArea) prevTotalArea = row.totalArea;
      if (row.traysPerHec) prevTraysPerHec = row.traysPerHec;
      if (row.ratePerHec) prevRatePerHec = row.ratePerHec;
      if (row.variety) prevVariety = row.variety;
      if (row.fieldName) prevFieldName = row.fieldName;

      let resolvedCropName = effectiveCropName;
      let resolvedVarietyId = null;
      let resolvedVarietyName = effectiveVariety;

      const seedDate = parseFlexDate(row.seedingDate);
      if (!seedDate) {
        errors.push('Missing Seeding Date');
      }

      const field = matchPlantingImportField(effectiveFieldName, fields);
      if (!String(effectiveFieldName || '').trim()) {
        if (transplantOnly) {
          errors.push('Field is required for transplant import');
        } else {
          warnings.push('No field specified');
        }
      } else if (!field) {
        errors.push(`Field "${effectiveFieldName}" not found`);
      } else {
        resolvedFieldId = field.id;
      }

      const transplantDateParsed = (() => {
        const parsed = parseFlexDate(row.transplantDate);
        if (field && isOpenFieldType(field.type) && seedDate) {
          return seedDate;
        }
        return parsed;
      })();
      if (transplantOnly && !transplantDateParsed) {
        errors.push('Missing Transplant Date');
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

      let matchedSowingId = null;
      if (transplantOnly && seedDate && (resolvedCropId || resolvedCropName)) {
        matchedSowingId = findSowingRecordId(
          nurserySowingBatches,
          seedDate,
          resolvedCropId,
          resolvedVarietyId,
          effectiveLotBatchNo,
          resolvedBreederId
        );
        if (!matchedSowingId && nurserySowingBatches.length > 0) {
          warnings.push('No matching nursery sowing batch (record will save without batch link)');
        }
      }

      const status = errors.length > 0 ? 'error' : warnings.length > 0 ? 'warning' : 'ok';

      return {
        ...row,
        fieldName: effectiveFieldName,
        cropName: effectiveCropName,
        variety: effectiveVariety,
        breeder: effectiveBreeder,
        lotBatchNo: effectiveLotBatchNo,
        pmQuantity: effectivePmQuantity,
        uom: effectiveUom,
        cropSubClass: effectiveCropSubClass,
        cropType: effectiveCropType,
        totalArea: effectiveTotalArea,
        traysPerHec: effectiveTraysPerHec,
        ratePerHec: effectiveRatePerHec,
        _seedDate: seedDate,
        _occupancyDate: transplantDateParsed || seedDate,
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
        _matchedSowingRecordId: matchedSowingId,
        transplantDate: transplantDateParsed || row.transplantDate,
      };
    });
  }, [fields, resolveCrop, resolveVariety, breederLookup, transplantOnly, nurserySowingBatches]);

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
        if ((key === 'seedingDate' || key === 'transplantDate') && typeof val === 'number') {
          val = excelSerialToDate(val);
        }
        row[key] = val != null ? String(val).trim() : '';
      });
      row._rowNum = _rowNum;
      return row;
    });

    const withData = mapped.filter((r) => {
      if (transplantOnly) {
        return r.fieldName || r.transplantDate || r.seedingDate;
      }
      return r.seedingDate || r.fieldName || r.cropName;
    });
    if (withData.length === 0) {
      setParseError(transplantOnly
        ? 'No valid rows found. Map Field and Transplant Date (or Seeding Date) columns.'
        : 'No valid rows found. Make sure "Seeding Date" or "Field" column is mapped.');
      return;
    }

    const validated = validateRows(withData);
    const inherited = inheritCompanionSegments(validated);
    const matched = inherited.map((row) => {
      const key = plantingIdentityKey(
        row._resolvedFieldId,
        row._occupancyDate || row._seedDate,
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
  }, [rawDataRows, excelHeaders, columnMapping, validateRows, transplantOnly, existingByKey]);

  const importableRows = useMemo(() => {
    let rows = validatedRows.filter((r) => r._status !== 'error');
    if (transplantOnly) {
      rows = rows.filter((r) => r._resolvedFieldId && parseFlexDate(r.transplantDate));
    }
    return rows;
  }, [validatedRows, transplantOnly]);

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
              body: JSON.stringify({ name: row._resolvedVarietyName }),
            });
            varietyId = created.id || (created.data && created.data.id);
            varietyCache[cacheKey] = varietyId;
            results.varietiesCreated++;
          }
        }

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

        const payload = {
          seedingDate: row._seedDate,
          fieldId: row._resolvedFieldId || null,
          segment: row.segment || null,
          totalArea: row.totalArea || null,
          cropId: cropId || null,
          varietyId: varietyId || null,
          cropSubClass: row.cropSubClass || null,
          cropType: row.cropType || 'Annual',
          breeder: row.breeder || null,
          breederId: breederId || null,
          lotBatchNo: row.lotBatchNo || null,
          pmQuantity: row.pmQuantity || null,
          uom: row.uom || null,
          traysPerHec: row.traysPerHec || null,
          ratePerHec: row.ratePerHec || null,
          transplantDate: (() => {
            const parsed = parseFlexDate(row.transplantDate);
            const field = fieldLookup[row._resolvedFieldId];
            if (field && isOpenFieldType(field.type) && row._seedDate) {
              return applyOpenFieldSowingDates(field.type, row._seedDate, parsed, 'seedingDate').transplantDate;
            }
            return parsed || null;
          })(),
          authorizedBy: row.authorizedBy || null,
          ...((transplantOnly || nurserySowingBatches?.length) ? {
            sowingRecordId: row._matchedSowingRecordId
              || findSowingRecordId(
                nurserySowingBatches,
                row._seedDate,
                cropId,
                varietyId,
                row.lotBatchNo,
                breederId
              )
              || null,
          } : {}),
          existingId: row._isUpdate ? row._existingId : null,
          skipOccupancy: Boolean(row._skipOccupancy),
        };
        resolved.push({ ...row, payload });
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
        const summary = await apiRequest('/planting-records/import-cycles', {
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
          await apiRequest(`/planting-records/${row.payload.existingId}`, {
            method: 'PUT',
            body: JSON.stringify(row.payload),
          });
          results.updated++;
        } else {
          await apiRequest('/planting-records/bulk', {
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
        await apiRequest(`/planting-records/sync-fields?site_id=${siteId}`, { method: 'POST' });
      } catch (_) { /* non-critical */ }
    }

    setImportResults(results);
    setImporting(false);
    setStep(3);
    if ((results.created > 0 || results.updated > 0) && onImportComplete) {
      onImportComplete();
    }
  }, [importableRows, siteId, onImportComplete, transplantOnly, nurserySowingBatches, fieldLookup, uprootSlots, uprootDates, extraUproots]);

  const renderStep0 = () => (
    <Box sx={{ textAlign: 'center', py: 4 }}>
      <UploadIcon sx={{ fontSize: 48, color: 'primary.main', mb: 2 }} />
      <Typography variant="h6" gutterBottom>
        {transplantOnly ? 'Upload Transplant Excel File' : 'Upload Planting Excel File'}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        {transplantOnly
          ? 'Use the same planting/transplant workbook. Rows need Field and Transplant Date; nursery sowing batches are linked when seed date, crop, variety, and lot match.'
          : 'Select an .xlsx or .xls file with planting/seeding data.'}
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
        Map Excel columns to planting fields. {excelHeaders.length} columns detected.
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
              <TableCell sx={hdrStyle}>Seeding Date</TableCell>
              <TableCell sx={hdrStyle}>Field</TableCell>
              <TableCell sx={hdrStyle}>Crop</TableCell>
              <TableCell sx={hdrStyle}>Variety</TableCell>
              <TableCell sx={hdrStyle}>Notes</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {validatedRows.map((row, idx) => {
              const bg = row._status === 'error' ? errBg
                : row._isUpdate ? updateBg
                : row._status === 'warning' ? warnBg
                : idx % 2 ? altRowBg : 'inherit';
              return (
                <TableRow key={idx} sx={{ bgcolor: bg }}>
                  <TableCell sx={cellStyle}>{row._rowNum}</TableCell>
                  <TableCell sx={cellStyle}>
                    {row._isUpdate && row._status !== 'error' ? (
                      <Tooltip title="Will update existing record"><UpdateIcon fontSize="small" color="info" /></Tooltip>
                    ) : row._status === 'ok' ? (
                      <OkIcon fontSize="small" color="success" />
                    ) : row._status === 'warning' ? (
                      <WarnIcon fontSize="small" color="warning" />
                    ) : (
                      <ErrIcon fontSize="small" color="error" />
                    )}
                  </TableCell>
                  <TableCell sx={cellStyle}>{row._seedDate || row.seedingDate}</TableCell>
                  <TableCell sx={cellStyle}>{row.fieldName}</TableCell>
                  <TableCell sx={cellStyle}>{row._resolvedCropName || row.cropName}</TableCell>
                  <TableCell sx={cellStyle}>
                    {row._resolvedVarietyName || row.variety}
                    {row._needsVarietyCreation && <Chip label="new" size="small" color="info" sx={{ ml: 0.5, height: 16, fontSize: '0.6875rem' }} />}
                  </TableCell>
                  <TableCell sx={{ ...cellStyle, maxWidth: 200 }}>
                    {[...row._errors, ...row._warnings].join('; ')}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );

  const renderStep3 = () => (
    <Box sx={{ textAlign: 'center', py: 3 }}>
      {importResults && (
        <>
          <Typography variant="h6" gutterBottom>Import Complete</Typography>
          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', mb: 2, flexWrap: 'wrap' }}>
            {importResults.created > 0 && <Chip label={`Created: ${importResults.created}`} color="success" />}
            {importResults.updated > 0 && <Chip label={`Updated: ${importResults.updated}`} color="info" />}
            {importResults.cropsCreated > 0 && <Chip label={`Crops Created: ${importResults.cropsCreated}`} color="primary" />}
            {importResults.varietiesCreated > 0 && <Chip label={`Varieties Created: ${importResults.varietiesCreated}`} color="secondary" />}
            {importResults.breedersCreated > 0 && <Chip label={`Breeders Created: ${importResults.breedersCreated}`} color="default" />}
            {importResults.failed > 0 && <Chip label={`Failed: ${importResults.failed}`} color="error" />}
          </Box>
          {importResults.errors.length > 0 && (
            <Alert severity="error" sx={{ textAlign: 'left', mt: 2 }}>
              <Box component="ul" sx={{ m: 0, pl: 2 }}>
                {importResults.errors.map((e, i) => <li key={i}>{e}</li>)}
              </Box>
            </Alert>
          )}
        </>
      )}
    </Box>
  );

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="lg" fullWidth PaperProps={{ sx: { minHeight: '60vh' } }}>
      <DialogTitle sx={{ background: bannerBg, color: bannerColor, py: 1.5, fontSize: '1rem' }}>
        {dialogTitle || (transplantOnly ? 'Import Nursery Transplant Data' : 'Import Planting & Transplant Data')}
      </DialogTitle>
      <DialogContent sx={{ pt: 3, pb: 1 }}>
        <Stepper activeStep={step} sx={{ mb: 3 }} alternativeLabel>
          {steps.map(label => <Step key={label}><StepLabel>{label}</StepLabel></Step>)}
        </Stepper>

        {step === 0 && renderStep0()}
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        {step === 1 && (
          <Button onClick={() => { reset(); }} color="inherit">Back</Button>
        )}
        {step === 2 && (
          <Button onClick={() => setStep(1)} color="inherit">Back</Button>
        )}
        <Box sx={{ flex: 1 }} />
        {step === 1 && (
          <Button variant="contained" onClick={applyMappingAndValidate}
            disabled={transplantOnly
              ? !Object.values(columnMapping).includes('fieldName')
                || (!Object.values(columnMapping).includes('transplantDate')
                  && !Object.values(columnMapping).includes('seedingDate'))
              : !Object.values(columnMapping).includes('seedingDate')}>
            Validate
          </Button>
        )}
        {step === 2 && (
          <Button variant="contained" onClick={handleImport}
            disabled={importing || importableRows.length === 0 || missingRequiredUprootDates(uprootSlots, uprootDates).length > 0}
            startIcon={importing ? <CircularProgress size={16} color="inherit" /> : <ImportIcon />}>
            {importing ? 'Importing...' : `Import ${importableRows.length} Row(s)`}
          </Button>
        )}
        {step === 3 && (
          <Button variant="contained" onClick={handleClose}>Done</Button>
        )}
        {step < 3 && step !== 1 && step !== 2 && (
          <Button onClick={handleClose} color="inherit">Cancel</Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
