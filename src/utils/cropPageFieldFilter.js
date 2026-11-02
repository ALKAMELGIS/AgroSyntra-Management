import {
  fieldsForCropPageStructure,
  getAvailableCropPageStructureTabs,
  groupFieldsByStructure,
} from './fieldTypeHelpers';

export function cropPageStructureState(siteFields) {
  const groupedFields = groupFieldsByStructure(siteFields);
  const availableTabs = getAvailableCropPageStructureTabs(groupedFields);
  return {
    groupedFields,
    availableTabs,
    defaultStructureId: availableTabs[0]?.id ?? null,
  };
}

export function structureFieldIdSet(groupedFields, structureId) {
  return new Set(fieldsForCropPageStructure(groupedFields, structureId).map((f) => f.id));
}

export function filterHistoryRows(rows, { structureFieldIds, fieldId }) {
  return (rows || []).filter((row) => {
    if (fieldId && row.field_id !== fieldId) return false;
    if (structureFieldIds && !structureFieldIds.has(row.field_id)) return false;
    return true;
  });
}

export function filterGapRows(gaps, { structureFieldIds, fieldId }) {
  return (gaps || []).filter((gap) => {
    if (fieldId && gap.field_id !== fieldId) return false;
    if (structureFieldIds && !structureFieldIds.has(gap.field_id)) return false;
    return true;
  });
}

export function fieldsMissingRotation(siteFields, history, { structureFieldIds, fieldId }) {
  const scoped = (siteFields || []).filter((field) => {
    if (fieldId && field.id !== fieldId) return false;
    if (structureFieldIds && !structureFieldIds.has(field.id)) return false;
    return true;
  });
  const withHistory = new Set((history || []).map((row) => row.field_id));
  return scoped.filter((field) => !withHistory.has(field.id));
}

export function plantingRowVisible(row, { structureFieldIds, fieldId }) {
  if (row?._dirty) return true;
  if (!row?.fieldId) return !fieldId;
  if (fieldId) return row.fieldId === fieldId;
  return !structureFieldIds || structureFieldIds.has(row.fieldId);
}

export function workbookRowVisible(row, { structureFieldIds, fieldId }) {
  if (row?._dirty) return true;
  if (!row?.fieldId) return !fieldId;
  if (fieldId) return row.fieldId === fieldId;
  return !structureFieldIds || structureFieldIds.has(row.fieldId);
}

export function filterAvailabilityRows(rows, { structureFieldIds, fieldId }) {
  return (rows || []).filter((row) => {
    if (fieldId && row.field_id !== fieldId) return false;
    if (structureFieldIds && !structureFieldIds.has(row.field_id)) return false;
    return true;
  });
}

export function occupancyForPickerFields(occupancyByField, pickerFields, fieldId) {
  const allowed = new Set(
    fieldId
      ? [fieldId]
      : (pickerFields || []).map((field) => field.id),
  );
  return Object.fromEntries(
    Object.entries(occupancyByField || {}).filter(([id]) => allowed.has(id)),
  );
}
