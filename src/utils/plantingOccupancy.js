/**
 * Occupancy + uproot helpers for the seeding screens.
 *
 * Segment parsing here follows the backend tokenizer closely enough to detect
 * overlap and to POST what uprootSchema accepts. It does not invent valves.
 */

import { canonicalRangeToken, occupancyTokensOverlap } from './plantingSegmentOverlap';

export const ALL_SEGMENTS = 'ALL';

export const PLANTING_OCCUPANCY_SOURCE = {
  OPEN_FIELD: 'openField',
  PLANTING_RECORDS: 'plantingRecords',
};

const SOURCE_PATHS = {
  [PLANTING_OCCUPANCY_SOURCE.OPEN_FIELD]: {
    occupancy: '/open-field-planting/occupancy',
    uproot: '/open-field-planting/uproot',
  },
  [PLANTING_OCCUPANCY_SOURCE.PLANTING_RECORDS]: {
    occupancy: '/planting-records/occupancy',
    uproot: '/planting-records/uproot',
  },
};

const SEPARATOR = /[,&]+/;
const ALL_PATTERN = /^(?:all|all segments|\*)$/i;
const BAY_PATTERN = /^(?:b|bay)[-\s]*(\d+)$/i;
const VALVE_PATTERN = /^(?:v|valve)[-\s]*(\d+)$/i;
const SPOT_PATTERN = /^(?:s|spot)[-\s]*(\d*)$/i;

export function canonicalizeOccupancyToken(raw) {
  const trimmed = String(raw ?? '').trim().replace(/\s+/g, ' ');
  if (!trimmed) return '';
  if (ALL_PATTERN.test(trimmed)) return ALL_SEGMENTS;

  const bay = trimmed.match(BAY_PATTERN);
  if (bay) return `B${Number(bay[1])}`;

  const valve = trimmed.match(VALVE_PATTERN);
  if (valve) return `V${Number(valve[1])}`;

  const spot = trimmed.match(SPOT_PATTERN);
  if (spot) return spot[1] ? `S${Number(spot[1])}` : 'S';

  const range = canonicalRangeToken(trimmed);
  if (range) return range;

  return trimmed;
}

export function parseOccupancyTokens(segment) {
  const tokens = [];
  for (const part of String(segment ?? '').split(SEPARATOR)) {
    const token = canonicalizeOccupancyToken(part);
    if (!token) continue;
    if (token === ALL_SEGMENTS) return [ALL_SEGMENTS];
    if (!tokens.includes(token)) tokens.push(token);
  }
  return tokens;
}

/** Local calendar date as YYYY-MM-DD, not UTC. */
export function todayYmd(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function uniqueFieldIdsFromRows(rows) {
  return [...new Set((rows || []).map((r) => r.fieldId).filter(Boolean))];
}

/**
 * Body `segments` for POST /uproot: the ALL sentinel or a token array.
 * Returns null when the picker is empty.
 */
export function segmentsPayloadFromSelector(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const tokens = parseOccupancyTokens(trimmed);
  if (!tokens.length) return null;
  if (tokens.length === 1 && tokens[0] === ALL_SEGMENTS) return ALL_SEGMENTS;
  return tokens;
}

/**
 * Same rule as backend conflictingSegments: ALL on either side means the
 * occupied set is the conflict.
 */
export function conflictingOccupancyTokens(requestedSegment, occupied) {
  const occupiedTokens = occupied || [];
  if (!occupiedTokens.length) return [];

  const requestedTokens = parseOccupancyTokens(requestedSegment);
  if (!requestedTokens.length) return [];

  if (requestedTokens.includes(ALL_SEGMENTS) || occupiedTokens.includes(ALL_SEGMENTS)) {
    return [...occupiedTokens];
  }
  return occupiedTokens.filter((occupiedToken) => (
    requestedTokens.some((requestedToken) => occupancyTokensOverlap(requestedToken, occupiedToken))
  ));
}

export function draftOccupancyOverlaps(rows, occupancyByField) {
  return (rows || [])
    .filter((r) => r._isNew && r.fieldId && r.segment)
    .map((r) => {
      const occupancy = occupancyByField?.[r.fieldId];
      const occupied = occupancy?.occupied || [];
      const conflicts = conflictingOccupancyTokens(r.segment, occupied);
      if (!conflicts.length) return null;
      return {
        key: r._key,
        fieldId: r.fieldId,
        segment: r.segment,
        conflicts,
        cropLabel: formatOccupancyCrops(occupancy?.rows),
      };
    })
    .filter(Boolean);
}

export function formatOverlapWarning(conflicts, cropLabel) {
  const crop = cropLabel ? ` (${cropLabel})` : '';
  return `Already occupied${crop}: ${conflicts.join(', ')}. Uproot first, or seed only the free segments. Same-day uproot then sow is allowed.`;
}

export function formatOccupancyCrops(rows) {
  if (!rows?.length) return '';
  const seen = new Set();
  const parts = [];
  for (const r of rows) {
    const crop = r.cropName || 'Crop';
    const variety = r.varietyName || '';
    const key = `${crop}||${variety}`;
    if (seen.has(key)) continue;
    seen.add(key);
    parts.push(variety ? `${crop} (${variety})` : crop);
  }
  return parts.join('; ');
}

export function formatOccupiedSegments(occupied) {
  const tokens = occupied || [];
  if (!tokens.length) return '';
  const concrete = tokens.filter((t) => t && t !== ALL_SEGMENTS);
  if (!concrete.length) return 'Entire field';
  return concrete.join(', ');
}

export function occupancyFieldLines(occupancyByField, fields) {
  const nameOf = (id) => (fields || []).find((f) => f.id === id)?.name || id;
  return Object.values(occupancyByField || {})
    .filter((o) => (o.rows && o.rows.length > 0) || (o.occupied && o.occupied.length > 0))
    .map((o) => ({
      fieldId: o.fieldId,
      fieldName: nameOf(o.fieldId),
      cropLabel: formatOccupancyCrops(o.rows),
      segmentsLabel: formatOccupiedSegments(o.occupied),
      occupied: o.occupied || [],
      rows: o.rows || [],
    }))
    .sort((a, b) => String(a.fieldName).localeCompare(String(b.fieldName)));
}

function occupancyStartYmd(value) {
  if (value == null || value === '') return null;
  return String(value).slice(0, 10);
}

/** One table row per live planting occupancy row (Current sheet). */
export function occupancySheetRows(occupancyByField, fields) {
  const byId = new Map((fields || []).map((field) => [field.id, field]));
  const rows = [];
  for (const occ of Object.values(occupancyByField || {})) {
    const plantingRows = occ.rows || [];
    const occupied = occ.occupied || [];
    if (!plantingRows.length && !occupied.length) continue;
    const field = byId.get(occ.fieldId);
    const fieldName = field?.name || occ.fieldId;
    const farmAreaName = field?.farmAreaName || '';
    if (!plantingRows.length) {
      rows.push({
        key: occ.fieldId,
        fieldId: occ.fieldId,
        fieldName,
        farmAreaName,
        cropName: '',
        varietyName: '',
        segmentsLabel: formatOccupiedSegments(occupied),
        occupancyStart: null,
      });
      continue;
    }
    plantingRows.forEach((planting, index) => {
      rows.push({
        key: planting.id || `${occ.fieldId}-${index}`,
        fieldId: occ.fieldId,
        fieldName,
        farmAreaName,
        cropName: planting.cropName || planting.crop_name || '',
        varietyName: planting.varietyName || planting.variety_name || '',
        segmentsLabel: formatOccupiedSegments(
          planting.segmentTokens || planting.segment_tokens || parseOccupancyTokens(planting.segment),
        ),
        occupancyStart: occupancyStartYmd(planting.occupancyStart || planting.occupancy_start),
      });
    });
  }
  return rows.sort((a, b) => {
    const byField = String(a.fieldName).localeCompare(String(b.fieldName));
    if (byField !== 0) return byField;
    return String(a.segmentsLabel).localeCompare(String(b.segmentsLabel));
  });
}

/**
 * Tokens the uproot picker may offer. ALL is handled by the selector checkbox,
 * not as a chip, and nothing is invented.
 */
export function occupancyTokensForPicker(occupancy) {
  const fromOccupied = (occupancy?.occupied || []).filter((t) => t && t !== ALL_SEGMENTS);
  if (fromOccupied.length) return [...new Set(fromOccupied)];
  return [...new Set(
    (occupancy?.rows || [])
      .flatMap((r) => r.segmentTokens || parseOccupancyTokens(r.segment))
      .filter((t) => t && t !== ALL_SEGMENTS),
  )];
}

export function classifyAllowedTokens(tokens) {
  const valves = [];
  const bays = [];
  const extras = [];
  let spots = false;
  for (const raw of tokens || []) {
    const t = String(raw || '').trim();
    if (!t || t === ALL_SEGMENTS) continue;
    const valve = t.match(/^V(\d+)$/i);
    if (valve) {
      valves.push(Number(valve[1]));
      continue;
    }
    const bay = t.match(/^B(\d+)$/i);
    if (bay) {
      bays.push(Number(bay[1]));
      continue;
    }
    if (/^S$/i.test(t)) {
      spots = true;
      continue;
    }
    extras.push(t);
  }
  const uniqSortNums = (arr) => [...new Set(arr)].sort((a, b) => a - b);
  return {
    valves: uniqSortNums(valves),
    bays: uniqSortNums(bays),
    extras: [...new Set(extras)],
    spots,
  };
}

export function formatUprootSummary(summary) {
  const uprooted = summary?.segmentsUprooted || [];
  const remaining = summary?.segmentsRemaining || [];
  const total = new Set([...uprooted, ...remaining]).size;

  if (summary?.fieldCleared) {
    if (uprooted.length) {
      return `Field cleared. Uprooted ${uprooted.join(', ')}.`;
    }
    return 'Field cleared.';
  }

  if (uprooted.length && remaining.length && total) {
    return `${uprooted.length} of ${total} segments uprooted; ${remaining.join(', ')} still growing.`;
  }
  if (uprooted.length) {
    return `Uprooted ${uprooted.join(', ')}.`;
  }
  return 'Uproot complete.';
}

export function formatUprootNotFoundWarning(summary) {
  const missing = summary?.segmentsNotFound || [];
  if (!missing.length) return null;
  return `Nothing was growing on ${missing.join(', ')}.`;
}

export async function fetchFieldOccupancy(requestFn, source, fieldId) {
  const paths = SOURCE_PATHS[source];
  if (!paths || !fieldId) {
    return { fieldId, occupied: [], rows: [] };
  }
  const data = await requestFn(`${paths.occupancy}?field_id=${encodeURIComponent(fieldId)}`);
  return data || { fieldId, occupied: [], rows: [] };
}

export async function fetchOccupancyMap(requestFn, source, fieldIds) {
  const unique = [...new Set((fieldIds || []).filter(Boolean))];
  const entries = await Promise.all(unique.map(async (id) => {
    try {
      return [id, await fetchFieldOccupancy(requestFn, source, id)];
    } catch {
      return [id, { fieldId: id, occupied: [], rows: [] }];
    }
  }));
  return Object.fromEntries(entries);
}

export async function postUproot(requestFn, source, body) {
  const paths = SOURCE_PATHS[source];
  return requestFn(paths.uproot, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
