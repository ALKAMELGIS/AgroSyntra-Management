import { compactMasterName, levenshtein } from './masterDataFuzzyMatch';

const NURSERY_COMPACT = 'nursery';

export function looksLikeNurseryFieldId(raw) {
  const compact = compactMasterName(raw);
  if (!compact) return false;
  if (compact === NURSERY_COMPACT) return true;
  if (compact.length < 5) return false;
  return levenshtein(compact, NURSERY_COMPACT) <= 2;
}

export function excelFieldMatchKey(raw) {
  return compactMasterName(raw);
}

/**
 * Copy a Review-step field pick onto every row with the same Excel Field ID.
 * `GH 03`, `GH 03 `, and `gh-03` are treated as one group; `GH 3` stays separate.
 *
 * @param {object[]} rows
 * @param {unknown} excelField
 * @param {string | null} pickedFieldId
 * @returns {object[]}
 */
export function applyFieldPickToExcelValue(rows, excelField, pickedFieldId) {
  const key = excelFieldMatchKey(excelField);
  if (!key || !Array.isArray(rows)) return rows;
  const nextId = pickedFieldId || null;
  return rows.map((row) => (
    excelFieldMatchKey(row.fieldId) === key
      ? { ...row, _pickedFieldId: nextId }
      : row
  ));
}

function findFieldByKey(fields, fieldKey) {
  if (!fieldKey || !Array.isArray(fields)) return null;
  const lower = fieldKey.toLowerCase();
  return fields.find((f) => f.id === fieldKey || (f.name || '').trim().toLowerCase() === lower) || null;
}

function fieldById(lists, id) {
  if (!id) return null;
  for (const list of lists) {
    const hit = (list || []).find((f) => f.id === id);
    if (hit) return hit;
  }
  return null;
}

/**
 * Resolve an Excel Field ID against site fields and Crop Rotation nursery fields.
 *
 * @param {{
 *   excelField: unknown,
 *   fields?: { id: string, name?: string }[],
 *   nurseryFields?: { id: string, name?: string }[],
 *   pickedFieldId?: string | null,
 * }} args
 * @returns {{
 *   field: { id: string, name?: string } | null,
 *   source: 'picked' | 'exact' | 'nursery' | null,
 *   needsPick: boolean,
 *   warning: string | null,
 *   error: string | null,
 * }}
 */
export function resolveImportField({
  excelField,
  fields = [],
  nurseryFields = [],
  pickedFieldId = null,
}) {
  const fieldKey = (excelField || '').toString().trim();
  if (!fieldKey) {
    return { field: null, source: null, needsPick: false, warning: null, error: 'Missing Field ID' };
  }

  if (pickedFieldId) {
    const picked = fieldById([fields, nurseryFields], pickedFieldId);
    if (picked) {
      return { field: picked, source: 'picked', needsPick: false, warning: null, error: null };
    }
  }

  const exact = findFieldByKey(fields, fieldKey);
  if (exact) {
    return { field: exact, source: 'exact', needsPick: false, warning: null, error: null };
  }

  const nurseries = Array.isArray(nurseryFields) ? nurseryFields.filter((n) => n && n.id) : [];
  const alias = looksLikeNurseryFieldId(fieldKey);

  if (alias) {
    if (nurseries.length === 1) {
      return {
        field: nurseries[0],
        source: 'nursery',
        needsPick: false,
        warning: `Excel "${fieldKey}" → ${nurseries[0].name} (nursery)`,
        error: null,
      };
    }
    if (nurseries.length === 0) {
      return {
        field: null,
        source: null,
        needsPick: true,
        warning: null,
        error: `No Crop Rotation nursery designated — pick a field for "${fieldKey}"`,
      };
    }
    return {
      field: null,
      source: null,
      needsPick: true,
      warning: null,
      error: `Several nursery fields — pick which one Excel "${fieldKey}" means`,
    };
  }

  return {
    field: null,
    source: null,
    needsPick: true,
    warning: null,
    error: `Field "${fieldKey}" not found — pick a field`,
  };
}
