const FERTILIZER_KG_NAMES = [
  'Phosphoric Acid',
  'Potassium Sulphate',
  'Magnesium Sulphate',
  'MKP',
  'MAP',
  'Ammonium Sulphate',
  'Mix Chelate',
  'Borax',
  'Mn EDTA',
  'Zn EDTA',
  'Sodium Molybdate',
  'Magnesium Nitrate',
  'Potassium Nitrate',
  'Calcium Nitrate',
  'Iron Chelate',
  'Urea',
];

const ANCHORS = ['field id', 'number of valves', 'flow rate', 'water qty', 'frequency', 'daily total'];

const KEYWORD_MAP = [
  { key: 'weekNo', keywords: ['week no', 'week'] },
  { key: 'date', keywords: ['date'] },
  { key: 'stationName', keywords: ['station'] },
  { key: 'system', keywords: ['system'] },
  { key: 'method', keywords: ['method'] },
  { key: 'operator', keywords: ['operator'] },
  { key: 'authorizedBy', keywords: ['authorized'] },
  { key: 'farm', keywords: ['farm'] },
  { key: 'fieldId', keywords: ['field id', 'field'] },
  { key: 'valves', keywords: ['number of valves', 'valves', 'no. of valves'] },
  { key: 'crop', keywords: ['crop'] },
  { key: 'cropStage', keywords: ['crop stage', 'stage'] },
  { key: 'flowRate', keywords: ['flow rate'] },
  { key: 'waterQty', keywords: ['water qty', 'water quantity', 'm3/valve'] },
  { key: 'frequency', keywords: ['frequency', 'freq'] },
  { key: 'dailyTotal', keywords: ['daily total'] },
  { key: 'recipe', keywords: ['recipe'] },
];

export function normalizeHeader(h) {
  return (h || '').toString().trim().toLowerCase().replace(/\s+/g, ' ');
}

export function isInputFileSheet(name) {
  const raw = (name || '').toString();
  const compact = raw.trim().toLowerCase().replace(/[\s_-]+/g, '');
  return compact === 'inputfile' || compact.startsWith('inputfile') || /input\s*file/i.test(raw);
}

export function defaultSelectedSheetNames(sheetNames) {
  const names = sheetNames || [];
  const fieldTabs = names.filter((n) => !isInputFileSheet(n));
  return fieldTabs.length > 0 ? fieldTabs : [...names];
}

export function detectHeaderRow(allRows) {
  const rows = allRows || [];
  for (let i = 0; i < Math.min(15, rows.length); i++) {
    const row = rows[i] || [];
    let hits = 0;
    for (let j = 0; j < row.length; j++) {
      const cell = normalizeHeader(row[j]);
      if (ANCHORS.some((kw) => cell.includes(kw))) hits++;
    }
    if (hits >= 3) return i;
  }
  return null;
}

export function guessKey(headerText) {
  const norm = normalizeHeader(headerText);
  if (!norm) return '';
  for (const { key, keywords } of KEYWORD_MAP) {
    if (keywords.some((kw) => norm.includes(kw))) return key;
  }
  return '';
}

export function autoMapHeaders(headers) {
  const autoMap = {};
  const usedKeys = new Set();
  (headers || []).forEach((h, idx) => {
    const guess = guessKey(h);
    if (guess && !usedKeys.has(guess)) {
      autoMap[idx] = guess;
      usedKeys.add(guess);
    }
  });
  return autoMap;
}

export function isKgPerLiterHeader(header) {
  const norm = normalizeHeader(header);
  return /\bkg\s*\/\s*l/.test(norm) || norm.includes('kg per l');
}

export function isTotalFertilizerHeader(header) {
  const norm = normalizeHeader(header);
  if (!norm || norm.includes('fertilizer name')) return false;
  return norm.includes('total fert');
}

export function matchFertilizerHeader(header) {
  if (!header || isKgPerLiterHeader(header) || isTotalFertilizerHeader(header)) return null;
  const compact = normalizeHeader(header).replace(/\bkg\b/g, '').replace(/[^a-z0-9]/g, '');
  if (!compact) return null;
  for (const name of FERTILIZER_KG_NAMES) {
    const nameCompact = normalizeHeader(name).replace(/[^a-z0-9]/g, '');
    if (compact === nameCompact) return name;
  }
  return null;
}

function parseKg(val) {
  if (val == null || val === '') return null;
  const n = Number(String(val).toString().replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

export function collectExcelFertilizers(cells, headers, columnMapping) {
  const fertilizers = {};
  let excelTotal = null;
  const mappedKeys = columnMapping || {};
  (headers || []).forEach((h, idx) => {
    const mapped = mappedKeys[idx] ?? mappedKeys[String(idx)];
    if (mapped) return;
    if (isTotalFertilizerHeader(h)) {
      const n = parseKg(cells?.[idx]);
      if (n != null && n > 0) excelTotal = n;
      return;
    }
    const fertName = matchFertilizerHeader(h);
    if (!fertName) return;
    const n = parseKg(cells?.[idx]);
    if (n != null && n > 0) fertilizers[fertName] = n;
  });
  const names = Object.keys(fertilizers);
  if (names.length === 0 && excelTotal == null) return { fertilizers: undefined, totalFertilizer: undefined };
  const totalFertilizer = excelTotal != null
    ? excelTotal
    : names.reduce((sum, name) => sum + fertilizers[name], 0);
  return {
    fertilizers: names.length > 0 ? fertilizers : undefined,
    totalFertilizer: totalFertilizer > 0 ? totalFertilizer : undefined,
  };
}

export function extractSheetData(allRows) {
  const headerIdx = detectHeaderRow(allRows);
  if (headerIdx === null) return null;
  const headerRow = allRows[headerIdx] || [];
  let maxCols = headerRow.length;
  for (let i = headerIdx + 1; i < allRows.length; i++) {
    maxCols = Math.max(maxCols, (allRows[i] || []).length);
  }
  const headers = Array.from({ length: maxCols }, (_, i) => (headerRow[i] || '').toString().trim());
  const rows = [];
  for (let i = headerIdx + 1; i < allRows.length; i++) {
    const rawRow = allRows[i] || [];
    if (rawRow.some((c) => c !== '')) rows.push({ cells: rawRow, _rowNum: i + 1 });
  }
  return { headerIdx, headers, rows };
}

export function headersMismatch(baseHeaders, otherHeaders) {
  const a = baseHeaders || [];
  const b = otherHeaders || [];
  if (a.length !== b.length) return true;
  return a.some((h, i) => normalizeHeader(h) !== normalizeHeader(b[i]));
}

export function mismatchSheetNames(sheetInfos, selectedNames) {
  const selected = (sheetInfos || []).filter((s) => selectedNames.includes(s.name));
  if (selected.length < 2) return [];
  const base = selected[0];
  return selected.slice(1).filter((s) => headersMismatch(base.headers, s.headers)).map((s) => s.name);
}

function filterRowsWithFieldId(rows, columnMapping) {
  const fieldCol = Object.keys(columnMapping || {}).find((k) => columnMapping[k] === 'fieldId');
  if (fieldCol === undefined) return rows;
  const idx = parseInt(fieldCol, 10);
  return rows.filter((r) => r.cells[idx] !== '');
}

export function concatSelectedSheets(sheetInfos, selectedNames, columnMapping) {
  const ordered = (sheetInfos || []).filter((s) => selectedNames.includes(s.name));
  const rows = [];
  for (const sheet of ordered) {
    const tagged = (sheet.rows || []).map((r) => ({ ...r, _sheet: sheet.name }));
    rows.push(...filterRowsWithFieldId(tagged, columnMapping));
  }
  return rows;
}

export function excelSerialToDate(serial) {
  if (!serial || typeof serial === 'string') return serial || '';
  const epoch = new Date(Date.UTC(1899, 11, 30));
  const d = new Date(epoch.getTime() + serial * 86400000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function applyColumnMapping(rawDataRows, columnMapping, headers = []) {
  const rows = [];
  let prevDate = '';
  let prevWeek = '';
  let prevSheet;

  for (const { cells, _rowNum, _sheet } of rawDataRows || []) {
    if (_sheet !== prevSheet) {
      prevDate = '';
      prevWeek = '';
      prevSheet = _sheet;
    }

    const row = { _rowNum, _sheet };
    Object.entries(columnMapping || {}).forEach(([hIdxStr, key]) => {
      if (!key) return;
      const hIdx = parseInt(hIdxStr, 10);
      let val = cells[hIdx];
      if (key === 'date' && typeof val === 'number') val = excelSerialToDate(val);
      row[key] = val;
    });

    const excelKg = collectExcelFertilizers(cells, headers, columnMapping);
    if (excelKg.fertilizers) row.fertilizers = excelKg.fertilizers;
    if (excelKg.totalFertilizer != null) row.totalFertilizer = excelKg.totalFertilizer;

    if (row.date) prevDate = row.date;
    else row.date = prevDate;

    if (row.weekNo) prevWeek = row.weekNo;
    else row.weekNo = prevWeek;

    if (!row.fieldId && !row.date) continue;
    rows.push(row);
  }

  return rows;
}
