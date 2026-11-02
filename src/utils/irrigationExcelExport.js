import { dailyTotal, entriesForLocations, isoWeekNumber, RC108_STRUCTURE_ORDER } from './rc108Locations';
import { asExportNumber, excelSheetName, uniqueColumnLabel } from './excelSheetName';

export const RC108_STRUCTURE_LABELS = {
  nethouse: 'Nethouse',
  greenhouse: 'Greenhouse',
  openfield: 'Open Field',
};

const EMPTY_CELL = {
  waterQty: '',
  frequency: '',
  fertilizerType: '',
  fertilizerQty: '',
};

export function uniqueLocationHeaders(locations) {
  const used = new Map();
  return (locations || []).map((loc) => {
    const label = uniqueColumnLabel(loc.label, used);
    return {
      loc,
      label,
      keys: {
        waterQty: `${label} Water Qty`,
        frequency: `${label} Freq`,
        dailyM3: `${label} Daily m3`,
        fertilizerType: `${label} Fert. Type`,
        fertilizerQty: `${label} Fert. Qty`,
      },
    };
  });
}

function blankRow(headers) {
  const row = {
    'Week No': '',
    Date: '',
    Method: '',
    'Flow (m3)': '',
    'Operator Name': '',
    Authorized: '',
  };
  headers.forEach((header) => {
    Object.values(header.keys).forEach((key) => {
      row[key] = '';
    });
  });
  return row;
}

function matchLocation(locations, entry) {
  return (locations || []).find((l) => l.label === entry.locationLabel)
    || (locations || []).find((l) => (
      l.fieldId && l.fieldId === entry.fieldId && (l.valveRange || '') === (entry.valveRange || '')
    ));
}

export function groupRc108EntriesByDate(entries, locations) {
  const byDate = new Map();
  (entries || []).forEach((entry) => {
    const date = (entry.date || '').split('T')[0];
    if (!date) return;
    if (!byDate.has(date)) {
      const cells = {};
      (locations || []).forEach((loc) => { cells[loc.label] = { ...EMPTY_CELL }; });
      byDate.set(date, {
        weekNo: entry.weekNumber != null ? String(entry.weekNumber) : isoWeekNumber(date),
        date,
        method: entry.method || 'Drip',
        flowRate: entry.flowRateM3 ?? '',
        operatorName: entry.operatorName || '',
        authorizedBy: entry.authorizedBy || '',
        cells,
      });
    }
    const row = byDate.get(date);
    const loc = matchLocation(locations, entry);
    const key = loc?.label || entry.locationLabel;
    if (!row.cells[key]) row.cells[key] = { ...EMPTY_CELL };
    row.cells[key] = {
      waterQty: entry.waterQtyM3 ?? '',
      frequency: entry.frequency ?? '',
      fertilizerType: entry.fertilizerType || '',
      fertilizerQty: entry.fertilizerQty ?? '',
    };
  });
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function buildRc108SheetRows(entries, locations) {
  const headers = uniqueLocationHeaders(locations);
  return groupRc108EntriesByDate(entries, locations).map((day) => {
    const row = blankRow(headers);
    row['Week No'] = asExportNumber(day.weekNo);
    row.Date = day.date || '';
    row.Method = day.method || '';
    row['Flow (m3)'] = asExportNumber(day.flowRate);
    row['Operator Name'] = day.operatorName || '';
    row.Authorized = day.authorizedBy || '';
    headers.forEach((header) => {
      const cell = day.cells[header.loc.label] || EMPTY_CELL;
      row[header.keys.waterQty] = asExportNumber(cell.waterQty);
      row[header.keys.frequency] = asExportNumber(cell.frequency);
      row[header.keys.dailyM3] = asExportNumber(dailyTotal(cell));
      row[header.keys.fertilizerType] = cell.fertilizerType || '';
      row[header.keys.fertilizerQty] = asExportNumber(cell.fertilizerQty);
    });
    return row;
  });
}

export function buildRc108ExportSheets({ entries, structureLocations, selectedStructures } = {}) {
  const used = new Set();
  const selected = new Set(selectedStructures || RC108_STRUCTURE_ORDER);
  const sheets = [];
  RC108_STRUCTURE_ORDER.forEach((structure) => {
    if (!selected.has(structure)) return;
    const locations = structureLocations?.[structure] || [];
    if (!locations.length) return;
    const rows = buildRc108SheetRows(entriesForLocations(entries, locations), locations);
    if (!rows.length) return;
    const label = RC108_STRUCTURE_LABELS[structure] || structure;
    sheets.push({
      sheetName: excelSheetName(label, used),
      title: `IRRIGATION RECORD — ${label}`,
      freezeCols: 6,
      rows,
    });
  });
  return sheets;
}

export function irrigationDripFilename(year) {
  return `Irrigation-Drip-${year || 'export'}.xlsx`;
}
