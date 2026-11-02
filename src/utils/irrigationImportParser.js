import * as XLSX from 'xlsx';

const MONTH_NAMES = [
  ['jan', 'january'],
  ['feb', 'february'],
  ['mar', 'march'],
  ['apr', 'april'],
  ['may', 'may'],
  ['jun', 'june'],
  ['jul', 'july'],
  ['aug', 'august'],
  ['sep', 'september'],
  ['oct', 'october'],
  ['nov', 'november'],
  ['dec', 'december'],
];

const SKIP_SHEETS = new Set(['summary', 'sheet', 'sheet1', 'sheet2']);

export function normalizeFieldName(name) {
  return (name || '').toString().trim().toLowerCase()
    .replace(/^pivot[\s\-_]*/i, '')
    .replace(/[\s\-_]+/g, '')
    .replace(/0+(\d)/g, '$1');
}

export function normalizeHeader(h) {
  return (h || '').toString().trim().toLowerCase().replace(/\s+/g, ' ');
}

export function sheetNameToMonth(sheetName) {
  const norm = (sheetName || '').trim().toLowerCase();
  if (!norm) return null;
  for (let i = 0; i < MONTH_NAMES.length; i++) {
    if (MONTH_NAMES[i].some((m) => norm === m || norm.startsWith(m))) {
      return i + 1;
    }
  }
  return null;
}

export function shouldSkipSheet(sheetName) {
  return SKIP_SHEETS.has((sheetName || '').trim().toLowerCase());
}

export function extractYearFromFilename(filename) {
  const m = (filename || '').match(/(?:^|[_\-\s])(20\d{2})(?:\.xlsx?|$)/i)
    || (filename || '').match(/(20\d{2})/);
  return m ? parseInt(m[1], 10) : null;
}

export function excelSerialToDate(serial) {
  if (serial == null || serial === '') return '';
  if (typeof serial === 'string') return parseDateInput(serial);
  if (typeof serial === 'number' && Number.isFinite(serial)) {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const d = new Date(epoch.getTime() + serial * 86400000);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  return '';
}

export function parseDateInput(str) {
  if (str == null || str === '') return '';
  const s = String(str).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmy) {
    const y = dmy[3].length === 2 ? 2000 + parseInt(dmy[3], 10) : parseInt(dmy[3], 10);
    return `${y}-${String(dmy[2]).padStart(2, '0')}-${String(dmy[1]).padStart(2, '0')}`;
  }

  const digits = s.replace(/\D/g, '');
  if (digits.length === 8) {
    const day = digits.slice(0, 2);
    const month = digits.slice(2, 4);
    const year = digits.slice(4, 8);
    return `${year}-${month}-${day}`;
  }

  return '';
}

export function detectIrrigationHeaderRow(rows) {
  for (let i = 0; i < Math.min(20, rows.length); i++) {
    const row = rows[i];
    let hasDate = false;
    let hasFlow = false;
    let hasCycle = false;
    for (let j = 0; j < (row?.length || 0); j++) {
      const norm = normalizeHeader(row[j]);
      if (!norm) continue;
      if (norm.includes('date')) hasDate = true;
      if (norm.includes('flow')) hasFlow = true;
      if (norm.includes('cycle')) hasCycle = true;
    }
    if (hasDate && hasFlow && hasCycle) return i;
  }
  return null;
}

const COLUMN_KEYWORDS = [
  { key: 'date', keywords: ['date'] },
  { key: 'fieldName', keywords: ['field id', 'field'] },
  { key: 'segment', keywords: ['segment'] },
  { key: 'area', keywords: ['area'] },
  { key: 'crop', keywords: ['crop'] },
  { key: 'volume', keywords: ['volume'] },
  { key: 'flow', keywords: ['flow rate', 'flow'] },
  { key: 'cycle', keywords: ['cycle duration', 'cycle'] },
  { key: 'authorizedBy', keywords: ['authorized', 'verified'] },
];

export function detectIrrigationColumns(headerRow) {
  const mapping = {};
  if (!headerRow) return mapping;
  headerRow.forEach((cell, idx) => {
    const norm = normalizeHeader(cell);
    if (!norm) return;
    for (const { key, keywords } of COLUMN_KEYWORDS) {
      if (mapping[key] !== undefined) continue;
      if (keywords.some((kw) => norm.includes(kw))) {
        mapping[key] = idx;
        break;
      }
    }
  });
  return mapping;
}

export function extractYearFromInfoRow(rows) {
  for (let i = 0; i < Math.min(12, rows.length); i++) {
    const row = rows[i];
    for (let j = 0; j < (row?.length || 0); j++) {
      const norm = normalizeHeader(row[j]);
      if (!norm.includes('month') || !norm.includes('year')) continue;
      for (let k = j + 1; k < row.length; k++) {
        const val = (row[k] || '').toString().trim();
        const ym = val.match(/(20\d{2})/);
        if (ym) return parseInt(ym[1], 10);
      }
    }
  }
  return null;
}

export function buildFieldLookup(fields) {
  const m = {};
  fields.forEach((f) => {
    m[normalizeFieldName(f.name)] = f;
    m[(f.name || '').trim().toLowerCase()] = f;
    const numMatch = (f.name || '').match(/(\d+)/);
    if (numMatch) {
      m[normalizeFieldName(numMatch[1])] = f;
      m[`pivot${numMatch[1]}`] = f;
      m[`pivot-${numMatch[1]}`] = f;
    }
  });
  return m;
}

export function resolveField(fieldLookup, rawName) {
  const s = (rawName ?? '').toString().trim();
  if (!s) return null;
  return fieldLookup[normalizeFieldName(s)]
    || fieldLookup[s.toLowerCase()]
    || null;
}

/**
 * Greenhouse token so A01, GH A1, GH-A01, and GHA1 are the same house.
 * Pivot names are not greenhouse codes.
 */
export function greenhouseFieldKey(raw) {
  const compact = String(raw || '').trim().toLowerCase().replace(/[\s\-_]+/g, '');
  if (!compact || compact.startsWith('pivot')) return null;
  const gh = compact.match(/^gh([a-z]+)0*([0-9]+)$/);
  if (gh) return `${gh[1]}${parseInt(gh[2], 10)}`;
  const house = compact.match(/^([a-z]+)0*([0-9]+)$/);
  if (!house) return null;
  return `${house[1]}${parseInt(house[2], 10)}`;
}

function isPivotLikeFieldName(name) {
  const n = String(name || '').trim();
  if (/^pivot\b/i.test(n)) return true;
  return /^\d+$/.test(n);
}

/** Match a harvest field by greenhouse name, exact name, or numeric pivot ID (e.g. "6" → "Pivot 6"). */
export function resolveHarvestField(fields, rawName) {
  const raw = (rawName ?? '').toString().trim();
  if (!raw || !Array.isArray(fields) || fields.length === 0) return null;

  const rawNorm = normalizeFieldName(raw);
  const rawLower = raw.toLowerCase();
  const exact = fields.filter((f) => {
    const n = (f.name || '').trim();
    return n.toLowerCase() === rawLower || normalizeFieldName(n) === rawNorm;
  });
  if (exact.length === 1) return exact[0];

  const ghKey = greenhouseFieldKey(raw);
  if (ghKey) {
    const hits = fields.filter((f) => greenhouseFieldKey(f.name) === ghKey && !isPivotLikeFieldName(f.name));
    if (hits.length === 1) return hits[0];
    return null;
  }

  if (/^pivot/i.test(raw) || /^\d+$/.test(rawNorm)) {
    const num = parseInt(String(raw).replace(/\D/g, ''), 10);
    if (!Number.isFinite(num)) return null;
    const hits = fields.filter((f) => {
      if (!isPivotLikeFieldName(f.name)) return false;
      return parseInt(String(f.name).replace(/\D/g, ''), 10) === num;
    });
    if (hits.length === 1) return hits[0];
  }

  return null;
}

function parseNum(val) {
  if (val == null || val === '') return null;
  const n = parseFloat(String(val).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function rowKey(date, fieldId, segmentId) {
  return `${date}|${fieldId}|${(segmentId || '').trim().toLowerCase()}`;
}

function isTotalRow(raw, columns) {
  const dateCell = normalizeHeader(columns.date !== undefined ? raw[columns.date] : raw[0]);
  const fieldCell = normalizeHeader(
    columns.fieldName !== undefined ? raw[columns.fieldName] : raw[1]
  );
  return dateCell === 'total' || fieldCell === 'total';
}

export function parseMonthSheetRows(allRows, fieldLookup) {
  const headerIdx = detectIrrigationHeaderRow(allRows);
  if (headerIdx === null) {
    return { headerIdx: null, columns: {}, rows: [], error: 'No header row detected' };
  }

  const columns = detectIrrigationColumns(allRows[headerIdx]);
  const rows = [];
  const seenKeys = new Set();

  for (let i = headerIdx + 1; i < allRows.length; i++) {
    const raw = allRows[i];
    if (!raw || !raw.length) continue;

    if (isTotalRow(raw, columns)) continue;

    const hasData = raw.some((c) => c !== '' && c != null);
    if (!hasData) continue;

    let date = columns.date !== undefined ? raw[columns.date] : raw[0];
    if (typeof date === 'number') date = excelSerialToDate(date);
    else date = parseDateInput(date);

    const fieldRaw = columns.fieldName !== undefined ? raw[columns.fieldName] : raw[1];
    const fieldName = (fieldRaw ?? '').toString().trim();
    if (!date && !fieldName) continue;

    const segment = columns.segment !== undefined
      ? (raw[columns.segment] ?? '').toString().trim()
      : (raw[2] ?? '').toString().trim();

    const area = columns.area !== undefined ? parseNum(raw[columns.area]) : parseNum(raw[3]);
    const crop = columns.crop !== undefined
      ? (raw[columns.crop] ?? '').toString().trim()
      : (raw[4] ?? '').toString().trim();
    const excelVolume = columns.volume !== undefined ? parseNum(raw[columns.volume]) : parseNum(raw[5]);
    const flowRate = columns.flow !== undefined ? parseNum(raw[columns.flow]) : parseNum(raw[6]);
    const cycleDuration = columns.cycle !== undefined ? parseNum(raw[columns.cycle]) : parseNum(raw[7]);
    const authorizedBy = columns.authorizedBy !== undefined
      ? (raw[columns.authorizedBy] ?? '').toString().trim()
      : (raw[8] ?? '').toString().trim();

    const field = resolveField(fieldLookup, fieldName);
    const computedVolume = flowRate != null && cycleDuration != null ? flowRate * cycleDuration : null;

    const errors = [];
    const warnings = [];
    if (!date) errors.push('Missing or invalid date');
    if (!fieldName) errors.push('Missing field ID');
    else if (!field) errors.push(`Unknown pivot field: "${fieldName}"`);
    if (flowRate == null) errors.push('Missing flow rate');
    if (cycleDuration == null) errors.push('Missing cycle duration');
    if (excelVolume != null && computedVolume != null && Math.abs(excelVolume - computedVolume) > 0.5) {
      warnings.push(`Volume ${excelVolume} != flow x duration ${computedVolume}`);
    }

    const key = field && date ? rowKey(date, field.id, segment) : null;
    const isDuplicate = !!(key && seenKeys.has(key));
    if (isDuplicate) {
      warnings.push('Duplicate row in Excel (skipped)');
    } else if (key) {
      seenKeys.add(key);
    }

    if (!isDuplicate) {
      rows.push({
        date,
        fieldName,
        fieldId: field?.id || null,
        segmentId: segment || undefined,
        areaHa: area ?? undefined,
        crop: crop || undefined,
        flowRateM3Hr: flowRate ?? undefined,
        cycleDurationHr: cycleDuration ?? undefined,
        excelVolume,
        computedVolume,
        authorizedBy: authorizedBy || undefined,
        _errors: errors,
        _warnings: warnings,
      });
    }
  }

  return { headerIdx, columns, rows, error: null };
}

export function parseIrrigationWorkbook(workbook, { fields = [], yearHint = null, filename = '' } = {}) {
  const fieldLookup = buildFieldLookup(fields);
  const detectedYear = extractYearFromFilename(filename) || yearHint;
  const sheets = [];

  for (const sheetName of workbook.SheetNames) {
    if (shouldSkipSheet(sheetName)) continue;

    const month = sheetNameToMonth(sheetName);
    if (!month) continue;

    const ws = workbook.Sheets[sheetName];
    const allRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    const sheetYear = extractYearFromInfoRow(allRows) || detectedYear;
    const parsed = parseMonthSheetRows(allRows, fieldLookup);

    let okCount = 0;
    let warnCount = 0;
    let errCount = 0;
    parsed.rows.forEach((row) => {
      if (row._errors.length > 0) errCount++;
      else if (row._warnings.length > 0) warnCount++;
      else okCount++;
    });

    sheets.push({
      sheetName,
      month,
      year: sheetYear,
      mode: 'merge',
      ...parsed,
      okCount,
      warnCount,
      errCount,
    });
  }

  sheets.sort((a, b) => a.month - b.month);
  return { sheets, year: sheets.find((s) => s.year)?.year || detectedYear };
}
