import { asExportNumber, excelSheetName, formatExportDate, uniqueColumnLabel } from './excelSheetName';

function scoutingCellValue(column, row, field) {
  if (column.kind === 'meta') {
    if (column.key === 'location') return row.location || field.fieldName || '';
    if (column.key === 'crop') return row.cropName || '';
    if (column.key === 'scouting_date') return formatExportDate(row.reportDate);
    return '';
  }
  if (column.kind === 'notes') return row.notes || '';
  const value = row.metrics?.[column.key];
  if (value == null || value === '') return '';
  return asExportNumber(value);
}

export function buildScoutingFieldRows(field) {
  const columns = field?.columns || [];
  const usedHeaders = new Map();
  const labels = columns.map((column) => uniqueColumnLabel(column.header, usedHeaders));
  return (field?.rows || []).map((row) => {
    const out = {};
    columns.forEach((column, i) => {
      out[labels[i]] = scoutingCellValue(column, row, field);
    });
    return out;
  });
}

export function buildScoutingSummarySheets({ visibleFields = [] } = {}) {
  const used = new Set();
  const sheets = [];
  (visibleFields || []).forEach((field) => {
    const rows = buildScoutingFieldRows(field);
    if (!rows.length) return;
    sheets.push({
      sheetName: excelSheetName(field.fieldName || field.fieldId, used),
      rows,
    });
  });
  return sheets;
}
