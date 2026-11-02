/** RC-108 location order from the 2025–2026 workbook. */

export const RC108_LOCATION_ORDER = [
  'NH 1', 'NH 2', 'NH 3', 'NH 4', 'NH 5', 'NH 6', 'NH 7', 'NH 8', 'NH 9',
  'NH 13', 'NH 14', 'NH 15', 'NH 20', 'NH 21', 'NH 22',
  'BL 2 (V6-V10)', 'BL 3 (V6-V10)', 'BL 4 (V6-V10)', 'BL 5 (V6-V10)',
  'BL 6 (V2-V5)', 'BL 6 (V6-V10)', 'BL 7 (V2-V5)', 'BL 7 (V6-V10)',
];

export function normalizeLocationKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/location id/g, '')
    .replace(/[()]/g, ' ')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/\s*-\s*/g, '-')
    .replace(/\bv\s*/g, 'v')
    .trim();
}

export function parseValveRange(label) {
  const m = String(label || '').match(/\(\s*(v?\s*\d+\s*-\s*v?\s*\d+)\s*\)/i);
  if (!m) return '';
  return m[1].replace(/\s+/g, '').toUpperCase().replace(/V(\d+)/g, 'V$1');
}

export function compactLocationKey(name) {
  return normalizeLocationKey(name).replace(/[\s-]/g, '');
}

function locationValve(loc) {
  return (loc?.valveRange || parseValveRange(loc?.label) || '').toUpperCase();
}

function valvesAgree(excelLabel, loc) {
  const excelValve = (parseValveRange(excelLabel) || '').toUpperCase();
  const locValve = locationValve(loc);
  if (!excelValve && !locValve) return true;
  if (excelValve && locValve) return excelValve === locValve;
  return false;
}

function plotCodeKey(label) {
  if (parseValveRange(label)) return '';
  const compact = compactLocationKey(label);
  const m = compact.match(/^([a-z]+)0*(\d+)$/);
  return m ? `${m[1]}${Number(m[2])}` : '';
}

/** Map an Excel house/plot header onto one grid location. Valve-range labels never match plot-only names. */
export function matchExcelLabelToLocation(excelLabel, locations) {
  const list = (locations || []).filter((loc) => valvesAgree(excelLabel, loc));
  if (list.length === 0) return null;
  const key = normalizeLocationKey(excelLabel);
  const compact = compactLocationKey(excelLabel);
  const exact = list.find((l) => normalizeLocationKey(l.label) === key);
  if (exact) return exact;
  const compactHit = list.find((l) => compactLocationKey(l.label) === compact);
  if (compactHit) return compactHit;
  const plot = plotCodeKey(excelLabel);
  if (plot) {
    const plotHit = list.find((l) => plotCodeKey(l.label) === plot);
    if (plotHit) return plotHit;
  }
  const nh = key.match(/^nh\s*0*(\d+)$/);
  if (nh && !parseValveRange(excelLabel)) {
    return list.find((l) => {
      const n = normalizeLocationKey(l.label).match(/^nh[\s-]*0*(\d+)/);
      return n && n[1] === nh[1];
    }) || null;
  }
  return null;
}

export const RC108_STRUCTURE_ORDER = ['nethouse', 'greenhouse', 'openfield'];

export function matchExcelLabelToStructure(excelLabel, structureLocations) {
  const groups = structureLocations || {};
  for (let i = 0; i < RC108_STRUCTURE_ORDER.length; i += 1) {
    const structure = RC108_STRUCTURE_ORDER[i];
    const loc = matchExcelLabelToLocation(excelLabel, groups[structure] || []);
    if (loc) return { structure, loc };
  }
  return null;
}

export function entriesForLocations(entries, locations) {
  const labels = new Set((locations || []).map((l) => l.label));
  const fieldIds = new Set((locations || []).map((l) => l.fieldId).filter(Boolean));
  return (entries || []).filter((e) => (
    labels.has(e.locationLabel)
    || (e.fieldId && fieldIds.has(e.fieldId))
  ));
}

export function locationSortIndex(label) {
  const key = normalizeLocationKey(label);
  const idx = RC108_LOCATION_ORDER.findIndex((n) => normalizeLocationKey(n) === key);
  return idx >= 0 ? idx : 1000 + String(label || '').localeCompare(String(label));
}

export function matchFieldToLocation(fields, label) {
  const key = normalizeLocationKey(label);
  const compact = key.replace(/[\s-]/g, '');
  const list = fields || [];
  const exact = list.find((f) => normalizeLocationKey(f.name) === key);
  if (exact) return exact;
  const compactMatch = list.find((f) => normalizeLocationKey(f.name).replace(/[\s-]/g, '') === compact);
  if (compactMatch) return compactMatch;
  const nh = key.match(/^nh\s*0*(\d+)/);
  if (nh) {
    return list.find((f) => {
      const n = normalizeLocationKey(f.name).match(/^nh[\s-]*0*(\d+)/);
      return n && n[1] === nh[1];
    }) || null;
  }
  const bl = key.match(/^bl\s*0*(\d+)/);
  if (bl) {
    return list.find((f) => {
      const n = normalizeLocationKey(f.name).match(/^bl[\s-]*0*(\d+)/);
      return n && n[1] === bl[1];
    }) || null;
  }
  return null;
}

export function orderLocations(fields, options = {}) {
  const useExcelOrder = options.useExcelOrder !== false;
  if (!useExcelOrder) {
    return (fields || []).map((f) => ({
      label: f.name,
      fieldId: f.id,
      valveRange: '',
    }));
  }
  const usedFieldKeys = new Set();
  const ordered = [];
  RC108_LOCATION_ORDER.forEach((label) => {
    const field = matchFieldToLocation(fields, label);
    if (!field) return;
    const valveRange = parseValveRange(label) || '';
    const key = `${field.id}:${valveRange}`;
    if (usedFieldKeys.has(key)) return;
    usedFieldKeys.add(key);
    ordered.push({
      label,
      fieldId: field.id,
      valveRange,
    });
  });
  (fields || []).forEach((f) => {
    if (ordered.some((loc) => loc.fieldId === f.id)) return;
    ordered.push({
      label: f.name,
      fieldId: f.id,
      valveRange: '',
    });
  });
  return ordered;
}

export function emptyLocationCell() {
  return {
    waterQty: '',
    frequency: '',
    fertilizerType: '',
    fertilizerQty: '',
  };
}

export function dailyTotal(cell) {
  const w = Number(cell?.waterQty);
  const f = Number(cell?.frequency);
  if (!Number.isFinite(w) || !Number.isFinite(f) || (w === 0 && f === 0)) {
    if (cell?.waterQty === '' && cell?.frequency === '') return '';
  }
  if (!Number.isFinite(w) || !Number.isFinite(f)) return '';
  const v = w * f;
  if (!Number.isFinite(v)) return '';
  return Number(Number(v.toFixed(4)).toString());
}

export function isoWeekNumber(dateStr) {
  if (!dateStr) return '';
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return String(1 + Math.round(((d - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7));
}

export function excelDateToIso(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'number' && Number.isFinite(value)) {
    const epoch = Date.UTC(1899, 11, 30);
    const d = new Date(epoch + Math.round(value) * 86400000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const d = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  }
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const dmy = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (dmy) {
    const y = dmy[3].length === 2 ? 2000 + parseInt(dmy[3], 10) : parseInt(dmy[3], 10);
    const a = parseInt(dmy[1], 10);
    const b = parseInt(dmy[2], 10);
    if (a > 12) {
      return `${y}-${String(b).padStart(2, '0')}-${String(a).padStart(2, '0')}`;
    }
    return `${y}-${String(b).padStart(2, '0')}-${String(a).padStart(2, '0')}`;
  }
  return '';
}
