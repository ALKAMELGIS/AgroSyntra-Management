/**
 * Excel plantation import: field aliases, cycle grouping, identity match,
 * and which overlapping cycles need an uproot date.
 */

import { parseOccupancyTokens } from './plantingOccupancy';
import { segmentSetsOverlap } from './plantingSegmentOverlap';

export function fieldAliasKey(name) {
  const compact = String(name ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const padded = compact.match(/^([a-z]+)0*([1-9]\d*)$/);
  if (padded) return `${padded[1]}${padded[2]}`;
  return compact;
}

export function matchPlantingImportField(excelName, fields) {
  const raw = String(excelName ?? '').trim();
  if (!raw || !Array.isArray(fields)) return null;
  const lower = raw.toLowerCase();
  const exact = fields.filter((field) => (field.name || '').trim().toLowerCase() === lower);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;

  const key = fieldAliasKey(raw);
  if (!key) return null;
  const aliased = fields.filter((field) => fieldAliasKey(field.name) === key);
  return aliased.length === 1 ? aliased[0] : null;
}

export function plantingIdentityKey(fieldId, date, variety, segment) {
  const tokens = parseOccupancyTokens(segment).join(',');
  return `${fieldId || ''}|${date || ''}|${String(variety || '').trim().toLowerCase()}|${tokens}`;
}

function occupancyDateFromRecord(record, occupancy) {
  const seeding = (record.seeding_date || record.seedingDate || '').toString().split('T')[0];
  if (occupancy === 'occupancy') {
    const transplant = (record.transplant_date || record.transplantDate || '').toString().split('T')[0];
    return transplant || seeding;
  }
  return seeding;
}

export function indexExistingPlantings(records, occupancy = 'seeding') {
  const map = {};
  (records || []).forEach((record) => {
    const fieldId = record.field_id || record.fieldId;
    const date = occupancyDateFromRecord(record, occupancy);
    if (!fieldId || !date) return;
    const variety = record.variety_name || record.varietyName || record.variety || '';
    const key = plantingIdentityKey(fieldId, date, variety, record.segment);
    const status = record.status || record._status || 'active';
    const next = {
      ...record,
      id: record.id || record._serverId,
      status,
    };
    const prev = map[key];
    if (!prev || (prev.status === 'uprooted' && status === 'active')) {
      map[key] = next;
    }
  });
  return map;
}

export function inheritCompanionSegments(rows) {
  const inherited = new Map();
  (rows || []).forEach((row) => {
    const fieldId = row._resolvedFieldId || row.fieldId;
    const date = row._occupancyDate || row._seedDate;
    if (!fieldId || !date) return;
    const key = `${fieldId}|${date}`;
    const segment = String(row.segment || '').trim();
    if (segment && !inherited.has(key)) inherited.set(key, segment);
  });
  return (rows || []).map((row) => {
    const fieldId = row._resolvedFieldId || row.fieldId;
    const date = row._occupancyDate || row._seedDate;
    if (!fieldId || !date || String(row.segment || '').trim()) return row;
    const inheritedSegment = inherited.get(`${fieldId}|${date}`);
    if (!inheritedSegment) return row;
    return { ...row, segment: inheritedSegment, _inheritedSegment: true };
  });
}

function uniqueTokens(rows) {
  const tokens = [];
  (rows || []).forEach((row) => {
    parseOccupancyTokens(row.segment).forEach((token) => {
      if (!tokens.includes(token)) tokens.push(token);
    });
  });
  return tokens;
}

function uniqueSegmentLabels(rows) {
  const labels = [];
  (rows || []).forEach((row) => {
    const label = String(row.segment || '').trim() || 'Entire field';
    if (!labels.includes(label)) labels.push(label);
  });
  return labels;
}

export function isValidImportUprootDate(uprootDate, afterDate, beforeDate) {
  if (!uprootDate) return false;
  if (afterDate && uprootDate < afterDate) return false;
  if (beforeDate && uprootDate >= beforeDate) return false;
  return true;
}

/**
 * Required uproot slots: a later Excel cycle that will be created onto land
 * still occupied by an earlier cycle in this file (or a live matching row).
 * Re-import of rows that already exist is all updates — no slots.
 */
export function requiredImportUprootSlots(rows) {
  const byField = new Map();
  (rows || []).forEach((row, index) => {
    const fieldId = row._resolvedFieldId || row.fieldId;
    const date = row._occupancyDate || row._seedDate;
    if (!fieldId || !date) return;
    if (!byField.has(fieldId)) byField.set(fieldId, []);
    byField.get(fieldId).push({ ...row, _order: index });
  });

  const slots = [];
  for (const [fieldId, fieldRows] of byField) {
    const dates = [...new Set(fieldRows.map((row) => row._occupancyDate || row._seedDate))].sort();
    const cycles = dates.map((date) => {
      const cycleRows = fieldRows.filter((row) => (row._occupancyDate || row._seedDate) === date);
      return {
        fieldId,
        fieldName: cycleRows[0].fieldName || '',
        date,
        rows: cycleRows,
        tokens: uniqueTokens(cycleRows),
        segmentLabels: uniqueSegmentLabels(cycleRows),
        hasCreate: cycleRows.some((row) => !row._isUpdate),
      };
    });

    const live = [];
    cycles.forEach((cycle) => {
      const overlapping = live.filter((prev) => segmentSetsOverlap(prev.tokens, cycle.tokens));
      if (cycle.hasCreate) {
        overlapping.forEach((prev) => {
          slots.push({
            id: `${fieldId}|${prev.date}|${cycle.date}`,
            fieldId,
            fieldName: cycle.fieldName || prev.fieldName,
            afterDate: prev.date,
            beforeDate: cycle.date,
            previousSegments: prev.tokens,
            previousLabels: prev.segmentLabels,
            nextLabels: cycle.segmentLabels,
            required: true,
          });
        });
      }
      overlapping.forEach((prev) => {
        const idx = live.indexOf(prev);
        if (idx >= 0) live.splice(idx, 1);
      });
      live.push(cycle);
    });
  }
  return slots;
}

export function markCompanionSkipOccupancy(rows) {
  const firstCreate = new Map();
  const hasUpdate = new Set();
  (rows || []).forEach((row, index) => {
    const fieldId = row._resolvedFieldId || row.fieldId;
    const date = row._occupancyDate || row._seedDate;
    if (!fieldId || !date) return;
    const key = `${fieldId}|${date}`;
    if (row._isUpdate) hasUpdate.add(key);
    else if (!firstCreate.has(key)) firstCreate.set(key, index);
  });
  return (rows || []).map((row, index) => {
    const fieldId = row._resolvedFieldId || row.fieldId;
    const date = row._occupancyDate || row._seedDate;
    if (!fieldId || !date || row._isUpdate) return { ...row, _skipOccupancy: false };
    const key = `${fieldId}|${date}`;
    const skip = hasUpdate.has(key) || firstCreate.get(key) !== index;
    return { ...row, _skipOccupancy: skip };
  });
}

export function prepareImportRows(rows) {
  const withSegments = inheritCompanionSegments(rows);
  return markCompanionSkipOccupancy(withSegments);
}

export function importUprootsForField(fieldId, slots, dates, extras) {
  const required = (slots || [])
    .filter((slot) => slot.fieldId === fieldId && dates?.[slot.id])
    .map((slot) => ({
      segments: slot.previousSegments.length ? slot.previousSegments : 'ALL',
      uprootDate: dates[slot.id],
      afterDate: slot.afterDate,
      beforeDate: slot.beforeDate,
      reason: 'Imported cycle',
    }));
  const extra = (extras || [])
    .filter((row) => row.fieldId === fieldId && row.uprootDate)
    .map((row) => ({
      segments: 'ALL',
      uprootDate: row.uprootDate,
      reason: 'Imported cycle',
    }));
  return [...required, ...extra];
}

export function missingRequiredUprootDates(slots, dates) {
  return (slots || []).filter((slot) => !isValidImportUprootDate(
    dates?.[slot.id],
    slot.afterDate,
    slot.beforeDate,
  ));
}
