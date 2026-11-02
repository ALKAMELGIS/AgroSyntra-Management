import * as XLSX from 'xlsx';
import {
  excelDateToIso,
  emptyLocationCell,
  isoWeekNumber,
  matchExcelLabelToLocation,
  matchExcelLabelToStructure,
  RC108_STRUCTURE_ORDER,
} from './rc108Locations';

function normHeader(h) {
  return String(h || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function isLocationId(h) {
  return normHeader(h) === 'location id';
}

function detectHeaderRows(rows) {
  const limit = Math.min(rows.length, 25);
  for (let r = 0; r < limit; r += 1) {
    const joined = (rows[r] || []).map(normHeader).join(' | ');
    if (joined.includes('week no') && joined.includes('date')) {
      return { head1: r, head2: r + 1 };
    }
  }
  return null;
}

export function detectRc108FieldBlocks(head1, head2) {
  const blocks = [];
  for (let c = 6; c < (head1 || []).length; c += 1) {
    const name = String(head1[c] || '').trim();
    if (!name || isLocationId(name)) continue;
    const h2 = normHeader(head2?.[c]);
    const start = h2.includes('frequency') ? c - 1 : c;
    blocks.push({
      label: name.replace(/\s+/g, ' ').trim(),
      start,
    });
  }
  return blocks;
}

function numOrEmpty(v) {
  if (v == null || v === '') return '';
  const n = Number(v);
  return Number.isFinite(n) ? n : String(v);
}

export function expandSheetRef(ws) {
  if (!ws || typeof ws !== 'object') return ws;
  let maxR = 0;
  let maxC = 0;
  Object.keys(ws).forEach((k) => {
    if (k[0] === '!') return;
    const addr = XLSX.utils.decode_cell(k);
    if (addr.r > maxR) maxR = addr.r;
    if (addr.c > maxC) maxC = addr.c;
  });
  const existing = ws['!ref']
    ? XLSX.utils.decode_range(ws['!ref'])
    : { s: { r: 0, c: 0 }, e: { r: 0, c: 0 } };
  ws['!ref'] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: {
      r: Math.max(existing.e.r, maxR),
      c: Math.max(existing.e.c, maxC),
    },
  });
  return ws;
}

export function parseRc108Workbook(buffer, filename) {
  const wb = XLSX.read(buffer, { type: buffer instanceof ArrayBuffer ? 'array' : 'binary', cellDates: false });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return { error: 'Workbook has no sheets', days: [], locations: [] };
  const ws = expandSheetRef(wb.Sheets[sheetName]);
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
  const heads = detectHeaderRows(rows);
  if (!heads) {
    return { error: 'Could not find RC-108 header (Week No / Date)', days: [], locations: [], filename };
  }
  const head1 = rows[heads.head1] || [];
  const head2 = rows[heads.head2] || [];
  const blocks = detectRc108FieldBlocks(head1, head2);
  if (blocks.length === 0) {
    return { error: 'No location columns found', days: [], locations: [], filename };
  }

  const days = [];
  for (let r = heads.head2 + 1; r < rows.length; r += 1) {
    const row = rows[r] || [];
    const date = excelDateToIso(row[1]);
    if (!date) continue;
    const cells = {};
    blocks.forEach((b) => {
      const waterQty = numOrEmpty(row[b.start]);
      const frequency = numOrEmpty(row[b.start + 1]);
      const fertilizerType = row[b.start + 3] == null ? '' : String(row[b.start + 3]).trim();
      const fertilizerQty = numOrEmpty(row[b.start + 4]);
      if (waterQty === '' && frequency === '' && !fertilizerType && fertilizerQty === '') return;
      cells[b.label] = {
        waterQty,
        frequency,
        fertilizerType,
        fertilizerQty,
      };
    });
    days.push({
      weekNo: row[0] == null || row[0] === '' ? isoWeekNumber(date) : String(row[0]),
      date,
      method: row[2] ? String(row[2]).trim() : 'Drip',
      flowRate: numOrEmpty(row[3]),
      operatorName: row[4] ? String(row[4]).trim() : '',
      authorizedBy: row[5] ? String(row[5]).trim() : '',
      cells,
    });
  }

  return {
    filename,
    sheetName,
    locations: blocks.map((b) => b.label),
    days,
  };
}

export function defaultRc108Assignments(excelLabels, structureLocations) {
  const assignments = {};
  (excelLabels || []).forEach((label) => {
    const hit = matchExcelLabelToStructure(label, structureLocations);
    assignments[label] = hit
      ? { structure: hit.structure, locLabel: hit.loc.label }
      : null;
  });
  return assignments;
}

export function remapImportedDays(importedDays, structureLocations, assignments) {
  const locByExcel = new Map();
  const matched = { nethouse: new Set(), greenhouse: new Set(), openfield: new Set() };
  const unmatched = [];
  const labels = new Set();
  (importedDays || []).forEach((day) => {
    Object.keys(day.cells || {}).forEach((k) => labels.add(k));
  });
  if (assignments) {
    Object.keys(assignments).forEach((k) => labels.add(k));
  }
  labels.forEach((excelLabel) => {
    if (assignments) {
      const a = assignments[excelLabel];
      if (!a?.structure || !a?.locLabel) {
        unmatched.push(excelLabel);
        return;
      }
      const loc = (structureLocations?.[a.structure] || []).find((l) => l.label === a.locLabel);
      if (!loc) {
        unmatched.push(excelLabel);
        return;
      }
      locByExcel.set(excelLabel, { structure: a.structure, loc });
      matched[a.structure].add(loc.label);
      return;
    }
    const hit = matchExcelLabelToStructure(excelLabel, structureLocations);
    if (!hit) {
      unmatched.push(excelLabel);
      return;
    }
    locByExcel.set(excelLabel, hit);
    matched[hit.structure].add(hit.loc.label);
  });

  const days = (importedDays || []).map((day) => {
    const cells = {};
    Object.entries(day.cells || {}).forEach(([label, cell]) => {
      const hit = locByExcel.get(label);
      if (!hit) return;
      cells[hit.loc.label] = cell;
    });
    return { ...day, cells };
  });

  const matchedLocations = [];
  RC108_STRUCTURE_ORDER.forEach((structure) => {
    (structureLocations?.[structure] || []).forEach((loc) => {
      if (matched[structure].has(loc.label)) matchedLocations.push(loc);
    });
  });

  return {
    days,
    matchedLocations,
    counts: {
      nethouse: matched.nethouse.size,
      greenhouse: matched.greenhouse.size,
      openfield: matched.openfield.size,
      unmatched: unmatched.length,
    },
    unmatched,
  };
}

export function mergeImportedDays(existingRows, importedDays, locations) {
  const byDate = new Map();
  existingRows.forEach((row) => {
    if (row.date) byDate.set(row.date, row);
  });
  importedDays.forEach((day) => {
    const prev = byDate.get(day.date);
    const cells = { ...(prev?.cells || {}) };
    locations.forEach((loc) => {
      if (!cells[loc.label]) cells[loc.label] = emptyLocationCell();
    });
    Object.entries(day.cells || {}).forEach(([label, cell]) => {
      const loc = matchExcelLabelToLocation(label, locations)
        || locations.find((l) => l.label === label);
      if (!loc) return;
      cells[loc.label] = { ...emptyLocationCell(), ...cell };
    });
    byDate.set(day.date, {
      _key: prev?._key || `imp-${day.date}-${Math.random()}`,
      _dirty: true,
      weekNo: day.weekNo || prev?.weekNo || isoWeekNumber(day.date),
      date: day.date,
      method: day.method || prev?.method || 'Drip',
      flowRate: day.flowRate === '' ? (prev?.flowRate || '') : day.flowRate,
      operatorName: day.operatorName || prev?.operatorName || '',
      authorizedBy: day.authorizedBy || prev?.authorizedBy || '',
      cells,
    });
  });
  return [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
}
