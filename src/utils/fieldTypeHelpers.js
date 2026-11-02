export function isPivotType(type) {
  if (!type) return false;
  return type.toLowerCase() === 'pivot';
}

export function isNethouseType(type) {
  if (!type) return false;
  const t = type.toLowerCase().replace(/\s+/g, ' ').trim();
  return t === 'nethouse' || t === 'net house';
}

export function isGreenhouseType(type) {
  if (!type) return false;
  return type.toLowerCase() === 'greenhouse';
}

export function isOpenFieldType(type) {
  if (!type) return false;
  const t = type.toLowerCase();
  return t === 'open field' || t === 'farm plots';
}

export function groupFieldsByStructure(fields) {
  const pivot = [];
  const nethouse = [];
  const greenhouse = [];
  const openField = [];
  const other = [];

  for (const f of fields || []) {
    if (isPivotType(f.type)) pivot.push(f);
    else if (isNethouseType(f.type)) nethouse.push(f);
    else if (isGreenhouseType(f.type)) greenhouse.push(f);
    else if (isOpenFieldType(f.type)) openField.push(f);
    else other.push(f);
  }

  return { pivot, nethouse, greenhouse, openField, other };
}

export const IRRIGATION_STRUCTURES = [
  { id: 'pivot', label: 'Pivots' },
  { id: 'nethouse', label: 'Nethouse' },
  { id: 'greenhouse', label: 'Greenhouse' },
  { id: 'openfield', label: 'Open Field' },
];

/** Crop Rotation / Planting / Workbook only. Do not reuse on irrigation or fertigation. */
export const CROP_PAGE_STRUCTURES = [
  { id: 'nethouse', label: 'Nethouse' },
  { id: 'greenhouse', label: 'Greenhouse' },
  { id: 'openfield', label: 'Open Field' },
  { id: 'pivot', label: 'Pivots' },
  { id: 'other', label: 'Other' },
];

const STRUCTURE_FIELD_KEYS = {
  pivot: 'pivot',
  nethouse: 'nethouse',
  greenhouse: 'greenhouse',
  openfield: 'openField',
};

const CROP_PAGE_STRUCTURE_FIELD_KEYS = {
  ...STRUCTURE_FIELD_KEYS,
  other: 'other',
};

export function getSiteFieldsFromMasterData(countries, siteId) {
  if (!siteId) return [];
  const fields = [];
  for (const country of countries || []) {
    for (const site of country.sites || []) {
      if (site.id !== siteId) continue;
      for (const area of site.farmAreas || []) {
        for (const field of area.fields || []) {
          fields.push({ ...field, farmAreaName: area.name, farmAreaId: area.id });
        }
      }
    }
  }
  fields.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true }));
  return fields;
}

export function getAvailableStructureTabs(groupedFields) {
  return IRRIGATION_STRUCTURES.filter((structure) => {
    const key = STRUCTURE_FIELD_KEYS[structure.id];
    const list = groupedFields?.[key];
    return Array.isArray(list) && list.length > 0;
  });
}

export function getAvailableCropPageStructureTabs(groupedFields) {
  return CROP_PAGE_STRUCTURES.filter((structure) => {
    const key = CROP_PAGE_STRUCTURE_FIELD_KEYS[structure.id];
    const list = groupedFields?.[key];
    return Array.isArray(list) && list.length > 0;
  });
}

export function fieldsForCropPageStructure(groupedFields, structureId) {
  const key = CROP_PAGE_STRUCTURE_FIELD_KEYS[structureId];
  const list = groupedFields?.[key];
  return Array.isArray(list) ? list : [];
}

export function getDefaultStructureId(availableTabs) {
  return availableTabs[0]?.id ?? null;
}

export function isStructureAvailable(structureId, availableTabs) {
  return availableTabs.some((tab) => tab.id === structureId);
}
