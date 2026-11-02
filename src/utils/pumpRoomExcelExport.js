import { asExportNumber, excelSheetName, uniqueColumnLabel } from './excelSheetName';
import {
  computePumpTotals,
  parsePumpsFromRow,
  pumpCellUsage,
  recordMonthKey,
} from './pumpRoomMath';

const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export function uniquePumpHeaders(labels, pumpCount) {
  const used = new Map();
  return Array.from({ length: pumpCount }, (_, i) => {
    const label = uniqueColumnLabel(labels?.[i] || `Pump ${i + 1}`, used);
    return {
      reading: `${label} Reading`,
      usage: `${label} Usage`,
    };
  });
}

function blankPumpRow(headers) {
  const row = { 'Meter ID': '', 'Usage Area': '', Date: '' };
  headers.forEach((header) => {
    row[header.reading] = '';
    row[header.usage] = '';
  });
  return row;
}

export function sortPumpRecords(records) {
  return [...(records || [])].sort((a, b) => {
    const da = String(a.record_date || '');
    const db = String(b.record_date || '');
    if (da !== db) return da.localeCompare(db);
    return String(a.id || '').localeCompare(String(b.id || ''));
  });
}

export function groupPumpRecordsByMonth(records) {
  const groups = new Map();
  sortPumpRecords(records).forEach((record) => {
    const key = recordMonthKey(record);
    if (!key) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  });
  return groups;
}

export function buildPumpMonthRows(records, { pumpLabels = [], pumpCount = 2 } = {}) {
  const headers = uniquePumpHeaders(pumpLabels, pumpCount);
  const sorted = sortPumpRecords(records);
  const rows = sorted.map((record, idx) => {
    const row = blankPumpRow(headers);
    const pumps = parsePumpsFromRow(record);
    const prev = idx > 0 ? parsePumpsFromRow(sorted[idx - 1]) : [];
    row['Meter ID'] = record.meter_id || '';
    row['Usage Area'] = record.usage_area || '';
    row.Date = String(record.record_date || '').split('T')[0] || '';
    headers.forEach((header, p) => {
      const reading = pumps[p]?.reading;
      row[header.reading] = reading == null ? '' : asExportNumber(reading);
      const usage = pumpCellUsage(pumps[p], prev[p], idx === 0);
      row[header.usage] = usage == null ? '' : asExportNumber(usage);
    });
    return row;
  });
  if (rows.length) {
    const totals = computePumpTotals(sorted, pumpCount);
    const totalRow = blankPumpRow(headers);
    totalRow['Meter ID'] = 'Total';
    headers.forEach((header, p) => {
      totalRow[header.usage] = asExportNumber(totals[p] || 0);
    });
    rows.push(totalRow);
  }
  return rows;
}

export function monthSheetLabel(monthKey) {
  const [year, month] = String(monthKey || '').split('-');
  const label = MONTH_LABELS[Number(month) - 1] || month || 'Month';
  return year ? `${label} ${year}` : label;
}

export function buildPumpExportSheets(records, {
  selectedMonths,
  pumpLabels = [],
  pumpCount = 2,
} = {}) {
  const groups = groupPumpRecordsByMonth(records);
  const months = selectedMonths || [...groups.keys()];
  const used = new Set();
  return months
    .filter((month) => groups.has(month) && groups.get(month).length > 0)
    .sort()
    .map((month) => ({
      sheetName: excelSheetName(monthSheetLabel(month), used),
      rows: buildPumpMonthRows(groups.get(month), { pumpLabels, pumpCount }),
    }));
}

export function pumpExportFilename(kind, year) {
  const part = String(kind || 'pump').replace(/\s+/g, '-');
  return `${part}-${year || 'export'}.xlsx`;
}
