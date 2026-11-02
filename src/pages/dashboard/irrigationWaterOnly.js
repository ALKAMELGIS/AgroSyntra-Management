import { toIsoDate } from './dashboardUtils';

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function addTotals(into, water, cycles) {
  const next = into || { water: 0, cycles: 0 };
  next.water += water;
  next.cycles += cycles;
  return next;
}

function normalizeName(value) {
  return String(value || '').trim().toLowerCase();
}

export function hasCombinedFertilizer(entry) {
  const type = entry?.fertilizerType ?? entry?.fertilizer_type;
  if (type && String(type).trim()) return true;
  const qty = entry?.fertilizerQty ?? entry?.fertilizer_qty;
  if (qty === '' || qty == null) return false;
  return Number.isFinite(Number(qty));
}

/** Index fertigation Daily Total (m³) and frequency by date + field. */
export function indexFertigationByHouseDate(fertigationEntries, allFields = []) {
  const byId = {};
  const byName = {};
  const fieldNameById = Object.fromEntries(
    (allFields || []).filter((f) => f?.id && f?.name).map((f) => [f.id, f.name]),
  );

  (fertigationEntries || []).forEach((f) => {
    const date = toIsoDate(f.date);
    if (!date) return;
    const water = toNum(f.dailyWater ?? f.daily_water);
    const cycles = toNum(f.frequency);
    const fieldId = f.fieldId || f.field_id;
    if (fieldId) {
      if (!byId[date]) byId[date] = {};
      byId[date][fieldId] = addTotals(byId[date][fieldId], water, cycles);
    }
    const name = normalizeName(f.fieldName || f.field_name || fieldNameById[fieldId]);
    if (name) {
      if (!byName[date]) byName[date] = {};
      byName[date][name] = addTotals(byName[date][name], water, cycles);
    }
  });

  return { byId, byName };
}

export function lookupFertigationTotals(index, irrigationRow, allFields = []) {
  const date = toIsoDate(irrigationRow?.date);
  if (!date || !index) return { water: 0, cycles: 0 };
  const fieldId = irrigationRow.fieldId || irrigationRow.field_id;
  if (fieldId && index.byId[date]?.[fieldId]) return index.byId[date][fieldId];
  const loc = normalizeName(irrigationRow.locationLabel || irrigationRow.location_label);
  if (loc && index.byName[date]?.[loc]) return index.byName[date][loc];
  const named = (allFields || []).find((f) => normalizeName(f.name) === loc);
  if (named?.id && index.byId[date]?.[named.id]) return index.byId[date][named.id];
  return { water: 0, cycles: 0 };
}

/** Leftover irrigation after subtracting matching fertigation Daily Total and frequency. */
export function waterOnlyRemainder(irrigationRow, fertigationIndex, allFields = []) {
  if (hasCombinedFertilizer(irrigationRow)) {
    return { dailyWater: 0, frequency: 0 };
  }
  const fert = lookupFertigationTotals(fertigationIndex, irrigationRow, allFields);
  return {
    dailyWater: Math.max(0, toNum(irrigationRow.dailyWater ?? irrigationRow.daily_water) - fert.water),
    frequency: Math.max(0, toNum(irrigationRow.frequency) - fert.cycles),
  };
}
