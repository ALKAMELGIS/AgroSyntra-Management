import { normalizeHeader } from './irrigationImportParser';

export const HARVEST_COLUMN_KEYWORDS = [
  { key: 'cutNumber', keywords: ['cut number', 'cut no'] },
  { key: 'balingDate', keywords: ['baling date'] },
  { key: 'totalBales', keywords: ['bails harvested', 'bales harvested', 'number of bail', 'total number of bail'] },
  { key: 'bundles', keywords: ['bundles'] },
  { key: 'balesDispatched', keywords: ['bales dispatched', 'bales dispatch'] },
  { key: 'date', keywords: ['date of harvest', 'harvest date', 'date'] },
  { key: 'startTime', keywords: ['time started', 'start time', 'start'] },
  { key: 'endTime', keywords: ['end time', 'end'] },
  { key: 'weekNumber', keywords: ['week number', 'week no'] },
  { key: 'shiftNumber', keywords: ['shift no', 'shift number', 'shift'] },
  { key: 'batchNumber', keywords: ['batch no', 'batch number', 'receipt', 'batch'] },
  { key: 'product', keywords: ['product name', 'product', 'crop'] },
  { key: 'variety', keywords: ['variety'] },
  { key: 'fieldName', keywords: ['field name', 'field id', 'field'] },
  { key: 'segment', keywords: ['segment', 'valve'] },
  { key: 'area', keywords: ['harvested area', 'area (in ha)', 'area'] },
  { key: 'quantity', keywords: ['quantity harvested  (kg)', 'quantity harvested (kg)', 'quantity', 'qty'] },
  { key: 'packhouse', keywords: ['packhouse', 'pack house'] },
  { key: 'authorizedBy', keywords: ['authorized', 'auth', 'verified by'] },
];

export function shouldSkipHarvestSheet(sheetName) {
  return String(sheetName || '').trim().toLowerCase().startsWith('summary');
}

export function cellToWeekNumber(val) {
  if (val == null || val === '') return '';
  const text = String(val).trim();
  if (!text) return '';
  return text.length > 20 ? text.slice(0, 20) : text;
}

function dateCellHasValue(dateCell) {
  if (dateCell == null || dateCell === '') return false;
  if (typeof dateCell === 'number' && dateCell <= 0) return false;
  const text = String(dateCell).trim();
  return Boolean(text) && text !== '0';
}

export function harvestRowHasSubstance({ dateCell, quantity, variety, product, fieldName }) {
  if (dateCellHasValue(dateCell)) return true;
  if (Number(quantity) > 0) return true;
  if (String(variety || '').trim()) return true;
  if (String(product || '').trim()) return true;
  if (String(fieldName || '').trim()) return true;
  return false;
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

export function parseDateValue(val) {
  if (val == null || val === '') return '';
  if (typeof val === 'number') return excelSerialToDate(val);
  const text = String(val).trim();
  const dmy = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (dmy) {
    const y = dmy[3].length === 2 ? 2000 + parseInt(dmy[3], 10) : parseInt(dmy[3], 10);
    return `${y}-${String(parseInt(dmy[2], 10)).padStart(2, '0')}-${String(parseInt(dmy[1], 10)).padStart(2, '0')}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  return text;
}

export function excelFractionToTime(frac) {
  if (!frac && frac !== 0) return '';
  if (typeof frac === 'string') return frac;
  const totalMinutes = Math.round(frac * 24 * 60);
  const h = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
  const m = String(totalMinutes % 60).padStart(2, '0');
  return `${h}:${m}`;
}

export function detectHarvestColumns(headerRow) {
  const mapping = {};
  if (!headerRow) return mapping;
  headerRow.forEach((cell, idx) => {
    const norm = normalizeHeader(cell);
    if (!norm) return;
    for (const { key, keywords } of HARVEST_COLUMN_KEYWORDS) {
      if (mapping[key] !== undefined) continue;
      if (key === 'date' && norm.includes('baling')) continue;
      if (key === 'startTime' && norm.includes('end')) continue;
      if (keywords.some((kw) => norm.includes(kw))) {
        mapping[key] = idx;
        break;
      }
    }
  });
  return mapping;
}

export function detectHarvestHeaderRow(rows) {
  for (let i = 0; i < Math.min(25, rows.length); i += 1) {
    const row = rows[i];
    let hits = 0;
    for (let j = 0; j < (row?.length || 0); j += 1) {
      const norm = normalizeHeader(row[j]);
      if (['date', 'quantity', 'qty', 'variety', 'product', 'batch', 'cut', 'bail', 'field', 'segment'].some((kw) => norm.includes(kw))) {
        hits += 1;
      }
    }
    if (hits >= 3) return i;
  }
  return null;
}

function cellText(raw, index) {
  if (index === undefined) return '';
  const val = raw[index];
  if (val == null || val === '') return '';
  return String(val).trim();
}

export function parseHarvestDataRows(allRows, headerIdx, columns, { isPivotHarvest = false } = {}) {
  const rows = [];
  let prevDate = '';
  const hasFieldNameCol = columns.fieldName !== undefined;

  for (let i = headerIdx + 1; i < allRows.length; i += 1) {
    const raw = allRows[i] || [];
    if (!raw.some((c) => c !== '')) continue;

    const dateCell = columns.date !== undefined ? raw[columns.date] : '';
    let date = parseDateValue(dateCell);
    if (date) prevDate = date;
    else date = prevDate;

    let startTime = columns.startTime !== undefined ? raw[columns.startTime] : '';
    if (typeof startTime === 'number') startTime = excelFractionToTime(startTime);

    let endTime = columns.endTime !== undefined ? raw[columns.endTime] : '';
    if (typeof endTime === 'number') endTime = excelFractionToTime(endTime);

    const quantity = columns.quantity !== undefined ? parseFloat(raw[columns.quantity]) || 0 : 0;
    const variety = cellText(raw, columns.variety);
    const product = cellText(raw, columns.product);
    const fieldName = hasFieldNameCol ? cellText(raw, columns.fieldName) : '';

    if (!harvestRowHasSubstance({ dateCell, quantity, variety, product, fieldName })) continue;
    if (isPivotHarvest && !quantity && !date && !fieldName) continue;

    let balingDate = columns.balingDate !== undefined ? raw[columns.balingDate] : '';
    balingDate = balingDate ? parseDateValue(balingDate) : '';

    rows.push({
      date,
      startTime: startTime || '',
      endTime: endTime || '',
      weekNumber: columns.weekNumber !== undefined ? cellToWeekNumber(raw[columns.weekNumber]) : '',
      shiftNumber: cellText(raw, columns.shiftNumber),
      batchNumber: cellText(raw, columns.batchNumber),
      product,
      variety,
      fieldName,
      segment: cellText(raw, columns.segment),
      area: columns.area !== undefined ? parseFloat(raw[columns.area]) || 0 : 0,
      quantity,
      packhouse: cellText(raw, columns.packhouse),
      authorizedBy: cellText(raw, columns.authorizedBy),
      cutNumber: cellText(raw, columns.cutNumber),
      balingDate,
      totalBales: cellText(raw, columns.totalBales),
      bundles: cellText(raw, columns.bundles),
      balesDispatched: cellText(raw, columns.balesDispatched),
    });
  }

  return rows;
}
