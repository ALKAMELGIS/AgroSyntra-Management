import { isGreenhouseType, isNethouseType } from './fieldTypeHelpers';
import {
  computeGrowBagDrip,
  computePercentDrain,
  formatDrainPercent,
  growBagDripHeader,
  resolveDripperCount,
  resolveDripTestCount,
  resolveWaterBasedOnDrip,
  toFiniteNumber,
} from './ecphWaterDisplay';

const SHEET_ORDER = ['Nethouse', 'Greenhouse', 'Open Field'];

const NETHOUSE_PREFIX = [
  ['Date', 'Date'],
  ['Field', 'Field'],
  ['Valve', 'Valve'],
  ['Time', 'Time'],
  ['EC In', 'EC In'],
  ['EC Out', 'EC Out'],
  ['pH In', 'pH In'],
  ['pH Out', 'pH Out'],
  ['Drip Volume (ml)', 'Drip Vol'],
  ['Drain Volume (ml)', 'Drain Vol'],
];

const NETHOUSE_SUFFIX = [
  ['% Drain', '% Drain'],
  ['Water/Drip (M³)', 'Water/Drip (M3)'],
  ['Qty Water (M³)', 'Qty Water (M3)'],
  ['Cycle', 'Cycle'],
  ['Total Water', 'Total Water'],
  ['Weather', 'Weather'],
  ['Status', 'Status'],
];

const FARM_PLOT_COLUMNS = [
  ['Date', 'Date'],
  ['Field', 'Field'],
  ['Valve', 'Valve'],
  ['Time', 'Time'],
  ['EC In', 'EC In'],
  ['pH In', 'pH In'],
  ['Drip Volume (ml)', 'Drip Vol'],
  ['Water/Drip (M³)', 'Water/Drip (M3)'],
  ['Qty Water (M³)', 'Qty Water (M3)'],
  ['Cycle', 'Cycle'],
  ['Total Water', 'Total Water'],
  ['Weather', 'Weather'],
  ['Status', 'Status'],
];

/**
 * Show clock times as h:mm AM/PM. Already-AM/PM strings stay as they are;
 * 24-hour values such as 18:00 become 6:00 PM.
 */
export function formatEcphClock(value) {
  if (value == null || value === '') return '';
  const raw = String(value).trim();
  if (!raw) return '';

  const ampmMatch = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap])\.?m\.?\s*$/i);
  if (ampmMatch) {
    const hour = parseInt(ampmMatch[1], 10);
    const minutes = ampmMatch[2];
    const ap = ampmMatch[3].toUpperCase() === 'P' ? 'PM' : 'AM';
    return `${hour}:${minutes} ${ap}`;
  }
  if (/[ap]\.?m\.?/i.test(raw)) return raw.replace(/\s+/g, ' ');

  const clockMatch = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!clockMatch) return raw;
  const hour24 = parseInt(clockMatch[1], 10);
  if (!Number.isFinite(hour24) || hour24 > 23) return raw;
  const minutes = clockMatch[2];
  const ampm = hour24 >= 12 ? 'PM' : 'AM';
  return `${hour24 % 12 || 12}:${minutes} ${ampm}`;
}

export function structureSheetName(fieldType) {
  if (isNethouseType(fieldType)) return 'Nethouse';
  if (isGreenhouseType(fieldType)) return 'Greenhouse';
  return 'Open Field';
}

function pickValue(row, sourceKey) {
  if (row == null) return '';
  const value = row[sourceKey];
  return value == null ? '' : value;
}

function projectOpenFieldRows(rows) {
  return rows.map((row) => {
    const out = {};
    FARM_PLOT_COLUMNS.forEach(([sourceKey, label]) => {
      out[label] = pickValue(row, sourceKey);
    });
    return out;
  });
}

function projectNethouseRows(rows) {
  const header = growBagDripHeader((rows || []).map((row) => row._dripTestCount));
  return rows.map((row) => {
    const out = {};
    NETHOUSE_PREFIX.forEach(([sourceKey, label]) => {
      out[label] = pickValue(row, sourceKey);
    });
    out[header] = pickValue(row, 'N Drip Volume (ml)');
    NETHOUSE_SUFFIX.forEach(([sourceKey, label]) => {
      out[label] = pickValue(row, sourceKey);
    });
    return out;
  });
}

export function mapEcphEntriesToExcelRows(entries, { fieldInfoMap = {}, masterData } = {}) {
  const rows = [];

  (entries || []).forEach((entry) => {
    const fieldInfo = fieldInfoMap[entry.fieldId] || {};
    const dripperCount = resolveDripperCount(entry, fieldInfo, masterData);
    const dripTestCount = resolveDripTestCount(entry, fieldInfo, masterData);
    const valves = entry.valveReadings || entry.valves || [];
    const weather = entry.weatherCondition || entry.weather || '';
    const status = entry.irrigationStatus || entry.status || '';
    const field = entry.fieldName || fieldInfo.name || entry.fieldId || '';
    const fieldType = fieldInfo.type || entry.fieldType || '';

    const pushValve = (valve) => {
      const v = valve || {};
      const drip = v.dripVolume ?? '';
      const drain = v.drainVolume ?? v.drain ?? '';
      const nDrip = computeGrowBagDrip(drip, dripTestCount);
      const storedPct = toFiniteNumber(v.percentDrain);
      const percentDrain = storedPct != null
        ? storedPct
        : computePercentDrain(drain, nDrip);
      const qty = v.qtyOfWater ?? entry.qtyOfWater ?? '';
      const cycle = v.cycle ?? entry.cycle ?? '';
      const qtyN = parseFloat(qty) || 0;
      const cycN = parseFloat(cycle) || 0;
      const computedTotal = qtyN > 0 && cycN > 0 ? (qtyN * cycN).toFixed(3) : '';
      const waterDrip = resolveWaterBasedOnDrip(v, entry, dripperCount);

      rows.push({
        Date: entry.date || '',
        Time: formatEcphClock(entry.time || v.time || ''),
        Field: field,
        Valve: v.valveNumber ?? '-',
        'EC In': v.ecIn ?? '',
        'EC Out': v.ecOut ?? v.ec ?? '',
        'pH In': v.phIn ?? '',
        'pH Out': v.phOut ?? v.ph ?? '',
        'Drip Volume (ml)': drip,
        'Drain Volume (ml)': drain,
        'N Drip Volume (ml)': nDrip != null ? nDrip : '',
        '% Drain': formatDrainPercent(percentDrain),
        'Water/Drip (M³)': waterDrip != null ? waterDrip.toFixed(3) : '',
        'Qty Water (M³)': qty,
        Cycle: cycle,
        'Total Water': v.totalWaterQty ?? entry.totalWaterQty ?? computedTotal,
        Weather: weather,
        Status: status,
        _fieldType: fieldType,
        _dripTestCount: dripTestCount,
      });
    };

    if (valves.length === 0) pushValve({});
    else valves.forEach(pushValve);
  });

  return rows;
}

export function toEcphExportSheets(excelRows) {
  const buckets = { Nethouse: [], Greenhouse: [], 'Open Field': [] };
  (excelRows || []).forEach((row) => {
    buckets[structureSheetName(row._fieldType)].push(row);
  });
  return SHEET_ORDER
    .filter((sheetName) => buckets[sheetName].length > 0)
    .map((sheetName) => ({
      sheetName,
      rows: sheetName === 'Open Field'
        ? projectOpenFieldRows(buckets[sheetName])
        : projectNethouseRows(buckets[sheetName]),
    }));
}

export function buildEcphExcelSheets(entries, ctx = {}) {
  return toEcphExportSheets(mapEcphEntriesToExcelRows(entries, ctx));
}
