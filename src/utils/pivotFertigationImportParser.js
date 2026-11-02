import * as XLSX from 'xlsx';
import { excelSerialToDate, normalizeFieldName, normalizeHeader } from './irrigationImportParser';

export function findFertigationSheetName(workbook) {
  const names = workbook.SheetNames || [];
  const exact = names.find((n) => n.trim().toLowerCase() === 'fertilization');
  if (exact) return exact;
  return names.find((n) => n.toLowerCase().includes('fertiliz'));
}

export function detectRc132HeaderRow(rows) {
  for (let i = 0; i < Math.min(25, rows.length); i++) {
    const row = rows[i];
    let hasDate = false;
    let hasField = false;
    let hasFertilizer = false;
    for (let j = 0; j < (row?.length || 0); j++) {
      const norm = normalizeHeader(row[j]);
      if (!norm) continue;
      if (norm.includes('date')) hasDate = true;
      if (norm.includes('field id') || norm === 'field id (pivot, ng/gh)') hasField = true;
      if (norm.includes('fertilizer name')) hasFertilizer = true;
    }
    if (hasDate && hasField && hasFertilizer) return i;
  }
  return null;
}

const COLUMN_KEYWORDS = [
  { key: 'date', keywords: ['date'] },
  { key: 'fieldName', keywords: ['field id'] },
  { key: 'segmentId', keywords: ['segment id'] },
  { key: 'areaHa', keywords: ['total area'] },
  { key: 'crop', keywords: ['crop'] },
  { key: 'fertilizerName', keywords: ['fertilizer name'] },
  { key: 'ratePerHa', keywords: ['rate of fertilizer'] },
  { key: 'totalKg', keywords: ['total fertilizer'] },
  { key: 'qtyTons', keywords: ['qty (tons)', 'qty'] },
  { key: 'operatorName', keywords: ['operator name', 'operator'] },
  { key: 'authorizedBy', keywords: ['authorized', 'verified by'] },
  { key: 'misNo', keywords: ['mis no', 'mis'] },
  { key: 'docNo', keywords: ['doc no', 'doc'] },
];

export function detectRc132Columns(headerRow) {
  const mapping = {};
  if (!headerRow) return mapping;
  for (let j = 0; j < headerRow.length; j++) {
    const norm = normalizeHeader(headerRow[j]);
    if (!norm) continue;
    for (const col of COLUMN_KEYWORDS) {
      if (mapping[col.key] != null) continue;
      if (col.keywords.some((k) => norm.includes(k))) {
        mapping[col.key] = j;
      }
    }
  }
  return mapping;
}

function parseNum(val) {
  if (val == null || val === '') return undefined;
  const n = Number(val);
  return Number.isFinite(n) ? n : undefined;
}

function parseString(val) {
  if (val == null) return '';
  return String(val).trim();
}

function matchFieldId(fieldNameRaw, fields) {
  const raw = parseString(fieldNameRaw);
  if (!raw) return { fieldId: null, error: 'Missing field ID' };

  const normRaw = normalizeFieldName(raw);
  for (const f of fields) {
    if (normalizeFieldName(f.name) === normRaw) return { fieldId: f.id };
    if (String(f.name).trim() === raw) return { fieldId: f.id };
  }

  const num = parseInt(raw.replace(/\D/g, ''), 10);
  if (Number.isFinite(num)) {
    for (const f of fields) {
      const fn = parseInt(String(f.name).replace(/\D/g, ''), 10);
      if (fn === num) return { fieldId: f.id };
    }
  }

  return { fieldId: null, error: `Field "${raw}" not found on site` };
}

function monthFromIsoDate(isoDate) {
  if (!isoDate) return null;
  const m = isoDate.match(/^(\d{4})-(\d{2})-\d{2}$/);
  if (!m) return null;
  return { year: parseInt(m[1], 10), month: parseInt(m[2], 10) };
}

function rowIsEmpty(row, colMap) {
  const dateIdx = colMap.date;
  const fieldIdx = colMap.fieldName;
  const fertIdx = colMap.fertilizerName;
  const hasDate = dateIdx != null && row[dateIdx] != null && row[dateIdx] !== '';
  const hasField = fieldIdx != null && row[fieldIdx] != null && row[fieldIdx] !== '';
  const hasFert = fertIdx != null && row[fertIdx] != null && row[fertIdx] !== '';
  return !hasDate && !hasField && !hasFert;
}

export function parseRc132Workbook(workbook, { fields = [] } = {}) {
  const sheetName = findFertigationSheetName(workbook);
  if (!sheetName) {
    return { detectedYears: [], error: 'No Fertilization sheet found' };
  }

  const ws = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const headerIdx = detectRc132HeaderRow(rows);
  if (headerIdx == null) {
    return { detectedYears: [], error: 'Could not detect RC-132 header row' };
  }

  const colMap = detectRc132Columns(rows[headerIdx]);
  if (colMap.date == null || colMap.fieldName == null || colMap.fertilizerName == null) {
    return { detectedYears: [], error: 'Missing required columns (Date, Field ID, Fertilizer Name)' };
  }

  const detectedYears = new Set();
  const parsedRows = [];
  const importableRecords = [];
  const fertilizerNameSet = new Set();

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || rowIsEmpty(row, colMap)) continue;

    const errors = [];
    const warnings = [];

    const dateRaw = row[colMap.date];
    const isoDate = excelSerialToDate(dateRaw);
    if (!isoDate) errors.push('Invalid date');

    const ym = monthFromIsoDate(isoDate);
    if (ym) detectedYears.add(ym.year);

    const { fieldId, error: fieldErr } = matchFieldId(row[colMap.fieldName], fields);
    if (fieldErr) errors.push(fieldErr);

    const fertilizerName = parseString(row[colMap.fertilizerName]);
    if (!fertilizerName) errors.push('Missing fertilizer name');
    else fertilizerNameSet.add(fertilizerName);

    const segmentId = colMap.segmentId != null ? parseString(row[colMap.segmentId]) : '';
    const areaHa = colMap.areaHa != null ? parseNum(row[colMap.areaHa]) : undefined;
    const crop = colMap.crop != null ? parseString(row[colMap.crop]) : '';
    const totalKg = colMap.totalKg != null ? parseNum(row[colMap.totalKg]) : undefined;
    const operatorName = colMap.operatorName != null ? parseString(row[colMap.operatorName]) : '';
    const authorizedBy = colMap.authorizedBy != null ? parseString(row[colMap.authorizedBy]) : '';
    const misNo = colMap.misNo != null ? parseString(row[colMap.misNo]) : '';
    const docNo = colMap.docNo != null ? parseString(row[colMap.docNo]) : '';

    if (!totalKg && totalKg !== 0) warnings.push('No total kg value');

    const parsed = {
      excelRow: i + 1,
      date: isoDate,
      fieldId,
      segmentId: segmentId || undefined,
      areaHa,
      crop: crop || undefined,
      fertilizerName,
      totalKg,
      operatorName: operatorName || undefined,
      authorizedBy: authorizedBy || undefined,
      misNo: misNo || undefined,
      docNo: docNo || undefined,
      year: ym?.year,
      month: ym?.month,
      _errors: errors,
      _warnings: warnings,
    };

    parsedRows.push(parsed);

    if (fieldId && fertilizerName && isoDate && errors.length === 0) {
      importableRecords.push({
        fieldId,
        date: isoDate,
        segmentId: segmentId || undefined,
        areaHa,
        crop: crop || undefined,
        fertilizerName,
        totalKg,
        operatorName: operatorName || undefined,
        authorizedBy: authorizedBy || undefined,
        misNo: misNo || undefined,
        docNo: docNo || undefined,
      });
    }
  }

  const years = [...detectedYears].sort();
  const uniqueFertilizerNames = [...fertilizerNameSet].sort((a, b) => a.localeCompare(b));

  const okCount = parsedRows.filter((r) => r._errors.length === 0).length;
  const errCount = parsedRows.filter((r) => r._errors.length > 0).length;
  const warnCount = parsedRows.filter((r) => r._warnings.length > 0 && r._errors.length === 0).length;

  return {
    sheetName,
    detectedYears: years,
    uniqueFertilizerNames,
    importableRecords,
    allRows: parsedRows,
    okCount,
    warnCount,
    errCount,
  };
}
