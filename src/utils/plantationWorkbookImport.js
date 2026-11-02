import {
  compactMasterName,
  levenshtein,
  matchMasterOption,
  normalizeMasterName,
} from './masterDataFuzzyMatch';
import {
  applySiteDefaults,
  emptyClosingRow,
  emptyOpeningRow,
  excelDateToIso,
} from './plantationWorkbookRows';

export const PLANTATION_IMPORT_COLUMNS = [
  { key: 'requestedDate', label: 'Requested date', aliases: ['requested date', 'requested'] },
  { key: 'siteCode', label: 'Site', aliases: ['site', 'site code'] },
  { key: 'fiscalYear', label: 'Fiscal year', aliases: ['fiscal year', 'fiscal'] },
  { key: 'structureType', label: 'Type of Structure', aliases: ['type of structure', 'structure type', 'structure'] },
  { key: 'farmName', label: 'Farm', aliases: ['farm name', 'farm'] },
  { key: 'fieldId', label: 'Field (GH/NH/Pivot)', aliases: ['field (gh/nh/pivot)', 'gh/nh/pivot', 'field id', 'field'] },
  { key: 'section', label: 'Section /Number', aliases: ['section /number', 'section number', 'section'] },
  { key: 'cropId', label: 'Family Code', aliases: ['family code', 'family', 'crop name', 'crop'] },
  { key: 'varietyId', label: 'Variety Sown Code', aliases: ['variety sown code', 'variety sown', 'variety code', 'variety'] },
  { key: 'plantsOrKg', label: 'No: Plants or Kg', aliases: ['no: plants or kg', 'plants or kg', 'plants'] },
  { key: 'surfaceUnit', label: 'Surface Unit (Area)', aliases: ['surface unit (area)', 'surface unit'] },
  { key: 'surfaceArea', label: 'Surface Area', aliases: ['surface area'] },
  { key: 'budgeted', label: 'Budgeted (Yes/ No)', aliases: ['budgeted (yes/ no)', 'budgeted'] },
  { key: 'remarks', label: 'Remarks', aliases: ['remarks'] },
  { key: 'requestorName', label: 'Requestor', aliases: ['requestor'] },
  { key: 'requestorRole', label: 'Admin / Agronomist / other', aliases: ['admin / agronomist / other', 'requestor role'] },
  { key: 'requestorEndorsed', label: 'Endorsed (Yes / No)', aliases: ['endorsed (yes / no)', 'endorsed'] },
  { key: 'financeEndorsed', label: 'Finance Endorsed', aliases: ['finance endorsed'] },
  { key: 'financeName', label: 'Finance Name', aliases: ['finance name'] },
  { key: 'financeAddedDate', label: 'Added Date', aliases: ['added date'] },
  { key: 'sageCreatedDate', label: 'SAGE Created Date', aliases: ['sage created date'] },
  { key: 'sageCreatedBy', label: 'Created by', aliases: ['created by'] },
  { key: 'plantationCode', label: 'Plantation Code', aliases: ['plantation code'] },
  { key: 'plantationDescription', label: 'Plantation Description', aliases: ['plantation description'] },
  { key: 'closureRequestDate', label: 'Request date', aliases: ['request date'] },
  { key: 'closureRequestBy', label: 'Request by', aliases: ['request by'] },
  { key: 'closureFmEndorsed', label: 'FM Endorsed', aliases: ['fm endorsed'] },
  { key: 'closureFmName', label: 'FM Name', aliases: ['fm name'] },
  { key: 'closureHooEndorsed', label: 'HoO Endorsed', aliases: ['hoo endorsed'] },
  { key: 'closureHooName', label: 'HoO Name', aliases: ['hoo name'] },
  { key: 'closureFinanceEndorsed', label: 'Finance officer Endorsed', aliases: ['finance officer endorsed'] },
  { key: 'closureFinanceName', label: 'Finance officer Name', aliases: ['finance officer name'] },
  { key: 'closedDate', label: 'Closed Date', aliases: ['closed date'] },
  { key: 'sageClosedBy', label: 'SAGE Name', aliases: ['sage name'] },
];

const DATE_KEYS = new Set([
  'requestedDate',
  'financeAddedDate',
  'sageCreatedDate',
  'closureRequestDate',
  'closedDate',
]);

const CORE_MAP_KEYS = new Set(['requestedDate', 'fieldId', 'cropId', 'varietyId']);

function cellText(value) {
  if (value == null || value === '') return '';
  return String(value).trim();
}

export function classifyWorkbookSheet(name) {
  const n = String(name || '');
  if (/opening/i.test(n)) return 'opening';
  if (/closing/i.test(n)) return 'closing';
  return 'skip';
}

export function headerScoreForAlias(header, alias) {
  const h = normalizeMasterName(header);
  const a = normalizeMasterName(alias);
  if (!h || !a) return 0;
  if (h === a) return 100 + a.length;
  const hc = compactMasterName(header);
  const ac = compactMasterName(alias);
  if (hc && ac && hc === ac) return 90 + a.length;
  const dist = Math.min(levenshtein(h, a), levenshtein(hc, ac));
  if (dist <= 1) return 70 + a.length;
  return 0;
}

export function bestKeyForHeader(header) {
  let best = null;
  PLANTATION_IMPORT_COLUMNS.forEach((col) => {
    col.aliases.forEach((alias) => {
      const score = headerScoreForAlias(header, alias);
      if (score <= 0) return;
      if (!best || score > best.score) best = { key: col.key, score };
    });
  });
  return best;
}

export function detectPlantationHeaderRow(raw) {
  const limit = Math.min(40, raw?.length || 0);
  for (let i = 0; i < limit; i += 1) {
    const row = raw[i] || [];
    const keys = new Set();
    row.forEach((cell) => {
      const hit = bestKeyForHeader(cell);
      if (hit) keys.add(hit.key);
    });
    const hasCore = ['requestedDate', 'fieldId', 'cropId', 'varietyId'].some((k) => keys.has(k));
    if (keys.size >= 2 && hasCore) return i;
  }
  return -1;
}

export function guessPlantationColumnMapping(headerRow) {
  const used = new Map();
  (headerRow || []).forEach((cell, col) => {
    const hit = bestKeyForHeader(cell);
    if (!hit) return;
    const prev = used.get(hit.key);
    if (!prev || hit.score > prev.score) used.set(hit.key, { col, score: hit.score });
  });
  const mapping = {};
  used.forEach((info, key) => {
    mapping[info.col] = key;
  });
  return mapping;
}

export function mappingHasCoreColumns(mapping) {
  return Object.values(mapping || {}).some((key) => CORE_MAP_KEYS.has(key));
}

export function applyPlantationColumnMapping(cells, mapping) {
  const out = {};
  Object.entries(mapping || {}).forEach(([col, key]) => {
    if (!key) return;
    const raw = cells?.[Number(col)];
    out[key] = DATE_KEYS.has(key) ? excelDateToIso(raw) : (raw == null ? '' : raw);
  });
  return out;
}

export function isEmptyMappedRow(mapped) {
  const keys = ['requestedDate', 'fieldId', 'cropId', 'varietyId', 'plantationCode', 'plantsOrKg'];
  return keys.every((k) => cellText(mapped?.[k]) === '');
}

export function cropMatchFromSheetName(sheetName, crops) {
  const base = String(sheetName || '')
    .replace(/[-_\s]*(opening|closing).*$/i, '')
    .trim();
  if (!base) return null;
  const options = (crops || []).map((c) => ({ id: c.id || c.value, name: c.name || c.label }));
  return matchMasterOption(base, options);
}

export function toMasterOptions(list, idKey = 'id', nameKey = 'name') {
  return (list || []).map((item) => ({
    id: item[idKey] ?? item.value,
    name: item[nameKey] ?? item.label,
  })).filter((o) => o.id && o.name);
}

export function fieldRecordId(field) {
  return field?.id || field?.value || '';
}

/**
 * Site-scoped fields plus pickerFields. Picker rows stay even when the
 * allFields siteId filter yielded [] (missing siteId on the tree).
 */
export function unionPlantationImportFields(filteredFields, pickerFields) {
  const byId = new Map();
  (filteredFields || []).forEach((f) => {
    const id = fieldRecordId(f);
    if (id) byId.set(id, f);
  });
  (pickerFields || []).forEach((f) => {
    const id = fieldRecordId(f);
    if (id) byId.set(id, f);
  });
  return Array.from(byId.values());
}

export function matchFieldId(excelText, fields) {
  return matchMasterOption(excelText, toMasterOptions(fields));
}

export function cropWillCreate(row) {
  return Boolean(row?.excelFamily) && !row?.cropId;
}

export function varietyWillCreate(row) {
  return Boolean(row?.excelVariety) && !row?.varietyId && Boolean(row?.cropId || row?.excelFamily);
}

export function varietyMissingCrop(row) {
  return Boolean(row?.excelVariety) && !row?.varietyId && !row?.cropId && !row?.excelFamily;
}

function previewRowStatus(row) {
  if (row.fieldNeedsPick || varietyMissingCrop(row)) return 'unmatched';
  if (
    cropWillCreate(row)
    || varietyWillCreate(row)
    || row.fieldConfidence === 'close'
    || row.cropConfidence === 'close'
    || row.varietyConfidence === 'close'
    || row.cropSource === 'tab'
  ) return 'review';
  return 'matched';
}

export function withPreviewStatus(row) {
  const next = { ...row };
  next.fieldNeedsPick = Boolean(next.excelField) && !next.fieldId;
  next.cropNeedsPick = Boolean(next.excelFamily) && !next.cropId;
  next.varietyNeedsPick = Boolean(next.excelVariety) && !next.varietyId;
  next.status = previewRowStatus(next);
  return next;
}

/**
 * Fill Field on rows that still have no pick. Does not overwrite a manual (or
 * earlier auto) choice once fieldId is set.
 */
export function rematchPreviewFields(previewRows, fields) {
  if (!Array.isArray(previewRows) || !previewRows.length || !fields?.length) return previewRows;
  let changed = false;
  const next = previewRows.map((row) => {
    if (row.fieldId || !row.excelField) return row;
    const hit = matchFieldId(row.excelField, fields);
    if (!hit) return row;
    changed = true;
    return withPreviewStatus({
      ...row,
      fieldId: hit.id,
      fieldConfidence: hit.confidence,
    });
  });
  return changed ? next : previewRows;
}

export function matchCropId(excelText, crops) {
  return matchMasterOption(excelText, toMasterOptions(crops));
}

export function matchVarietyId(excelText, cropId, getVarieties) {
  if (!excelText || !cropId) return null;
  const list = typeof getVarieties === 'function' ? (getVarieties(cropId) || []) : [];
  return matchMasterOption(excelText, toMasterOptions(list));
}

function strVal(v) {
  if (v == null || v === '') return '';
  return String(v);
}

function mappedToGridRow(mapped, sheetKind, siteMeta, index) {
  const base = sheetKind === 'closing'
    ? applySiteDefaults(emptyClosingRow(), siteMeta)
    : applySiteDefaults(emptyOpeningRow(), siteMeta);
  base._key = `import-${sheetKind}-${index}`;
  base._dirty = true;
  base._isNew = true;

  const skipNameKeys = new Set(['fieldId', 'cropId', 'varietyId']);
  const copyKeys = sheetKind === 'closing'
    ? Object.keys(emptyClosingRow())
    : Object.keys(emptyOpeningRow());
  copyKeys.forEach((key) => {
    if (key.startsWith('_') || skipNameKeys.has(key)) return;
    if (mapped[key] == null || mapped[key] === '') return;
    if (DATE_KEYS.has(key)) {
      base[key] = excelDateToIso(mapped[key]);
      return;
    }
    base[key] = strVal(mapped[key]);
  });
  return base;
}

/**
 * Family Code column wins when it matches. Tab name is fallback only when family is blank.
 */
export function resolveCropForImport({ excelFamily, sheetName, crops }) {
  const fromCell = matchCropId(excelFamily, crops);
  if (fromCell) return { ...fromCell, source: 'column' };
  if (cellText(excelFamily)) return null;
  const fromTab = cropMatchFromSheetName(sheetName, crops);
  if (fromTab) return { ...fromTab, source: 'tab', confidence: fromTab.confidence };
  return null;
}

export function buildPlantationPreviewRow({
  mapped,
  sheetKind,
  sheetName,
  siteMeta,
  fields,
  crops,
  getVarieties,
  index = 0,
}) {
  const excelField = cellText(mapped.fieldId);
  const excelFamily = cellText(mapped.cropId);
  const excelVariety = cellText(mapped.varietyId);
  const row = mappedToGridRow(mapped, sheetKind, siteMeta, index);

  const fieldMatch = matchFieldId(excelField, fields);
  const cropMatch = resolveCropForImport({ excelFamily, sheetName, crops });
  const varietyMatch = matchVarietyId(excelVariety, cropMatch?.id, getVarieties);

  row.fieldId = fieldMatch?.id || '';
  row.cropId = cropMatch?.id || '';
  row.varietyId = varietyMatch?.id || '';

  return withPreviewStatus({
    ...row,
    sheetKind,
    sheetName,
    excelField,
    excelFamily,
    excelVariety,
    fieldConfidence: fieldMatch?.confidence || null,
    cropConfidence: cropMatch?.confidence || null,
    varietyConfidence: varietyMatch?.confidence || null,
    cropSource: cropMatch?.source || null,
  });
}

export function parseMappedSheetRows(raw, headerIdx, mapping) {
  const start = headerIdx >= 0 ? headerIdx + 1 : 0;
  const rows = [];
  for (let i = start; i < (raw?.length || 0); i += 1) {
    const cells = raw[i];
    if (!cells || !cells.some((c) => c !== '' && c != null)) continue;
    const mapped = applyPlantationColumnMapping(cells, mapping);
    if (isEmptyMappedRow(mapped)) continue;
    rows.push({ excelRow: i + 1, mapped });
  }
  return rows;
}

export function previewBlocksConfirm(row) {
  return Boolean(row?.fieldNeedsPick || varietyMissingCrop(row));
}

export function canConfirmPlantationImport(previewRows) {
  if (!Array.isArray(previewRows) || previewRows.length === 0) return false;
  return previewRows.every((row) => !previewBlocksConfirm(row));
}

export function collectImportMasterCreates(previewRows) {
  const crops = [];
  const cropKeys = new Set();
  const varieties = [];
  const varietyKeys = new Set();

  (previewRows || []).forEach((row) => {
    if (!cropWillCreate(row)) return;
    const key = normalizeMasterName(row.excelFamily);
    if (!key || cropKeys.has(key)) return;
    cropKeys.add(key);
    crops.push(row.excelFamily.trim());
  });

  (previewRows || []).forEach((row) => {
    if (!varietyWillCreate(row)) return;
    const cropKey = row.cropId || `new:${normalizeMasterName(row.excelFamily)}`;
    const varKey = `${cropKey}::${normalizeMasterName(row.excelVariety)}`;
    if (!normalizeMasterName(row.excelVariety) || varietyKeys.has(varKey)) return;
    varietyKeys.add(varKey);
    varieties.push({
      cropId: row.cropId || null,
      cropName: row.cropId ? null : String(row.excelFamily).trim(),
      name: String(row.excelVariety).trim(),
    });
  });

  return { crops, varieties };
}

export function applyCreatedMasterIds(previewRows, cropIdsByName = {}, varietyIdsByCropAndName = {}) {
  return (previewRows || []).map((row) => {
    const next = { ...row };
    if (!next.cropId && next.excelFamily) {
      const id = cropIdsByName[normalizeMasterName(next.excelFamily)];
      if (id) next.cropId = id;
    }
    if (!next.varietyId && next.excelVariety && next.cropId) {
      const id = varietyIdsByCropAndName[`${next.cropId}::${normalizeMasterName(next.excelVariety)}`];
      if (id) next.varietyId = id;
    }
    return withPreviewStatus(next);
  });
}

export function inspectPlantationSheet(name, raw) {
  const kind = classifyWorkbookSheet(name);
  if (kind === 'skip') return null;
  const headerIdx = detectPlantationHeaderRow(raw);
  if (headerIdx < 0) {
    return {
      name,
      kind,
      headerIdx: -1,
      headers: [],
      mapping: {},
      error: `Could not find a header row on "${name}".`,
    };
  }
  const headers = (raw[headerIdx] || []).map((c) => (c == null ? '' : String(c)));
  const mapping = guessPlantationColumnMapping(raw[headerIdx]);
  return {
    name,
    kind,
    headerIdx,
    headers,
    mapping,
    sampleRows: (raw.slice(headerIdx + 1, headerIdx + 4) || []),
    error: mappingHasCoreColumns(mapping) ? '' : `No Field / Family Code / Variety / date columns recognized on "${name}".`,
  };
}
