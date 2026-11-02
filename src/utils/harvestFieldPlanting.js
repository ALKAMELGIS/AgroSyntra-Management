function asId(value) {
  return value == null || value === '' ? '' : String(value);
}

function fieldIdOf(row) {
  return asId(row?.field_id || row?.fieldId);
}

function cropIdOf(row) {
  return asId(row?.crop_id || row?.cropId);
}

function isOpenRotation(row) {
  const end = row?.end_date ?? row?.endDate;
  return end == null || end === '';
}

function cropNameOf(row) {
  const name = row?.crop_name || row?.cropName || row?.currentCrop || row?.current_crop;
  if (name && typeof name === 'object') return name.name || '';
  return name || '';
}

function varietyNameOf(row) {
  return (row?.variety_name || row?.varietyName || row?.variety || '').trim();
}

function addCrop(cropsById, id, name) {
  const cropId = asId(id);
  if (!cropId) return;
  const existing = cropsById.get(cropId);
  const label = name || existing?.name || '';
  if (!existing || (label && !existing.name)) {
    cropsById.set(cropId, { id: cropId, name: label });
  }
}

function addVariety(varietiesByCropId, cropId, varietyName) {
  const name = String(varietyName || '').trim();
  const id = asId(cropId);
  if (!id || !name) return;
  if (!varietiesByCropId.has(id)) varietiesByCropId.set(id, new Map());
  const byName = varietiesByCropId.get(id);
  const key = name.toLowerCase();
  if (!byName.has(key)) byName.set(key, name);
}

/**
 * Crops and varieties currently planted on a field (open crop history +
 * planting records for those crops). Falls back to the field's current crop.
 */
export function plantedCropsAndVarietiesForField(field, cropHistory = [], plantingRecords = []) {
  const fieldId = asId(field?.id);
  const cropsById = new Map();
  const varietiesByCropId = new Map();
  const fieldCropId = asId(field?.currentCropId || field?.current_crop_id);

  const openHistory = (cropHistory || []).filter(
    (row) => fieldIdOf(row) === fieldId && isOpenRotation(row),
  );

  if (openHistory.length > 0) {
    for (const row of openHistory) {
      addCrop(cropsById, cropIdOf(row), cropNameOf(row));
      addVariety(varietiesByCropId, cropIdOf(row), varietyNameOf(row));
    }
  } else {
    addCrop(cropsById, fieldCropId, cropNameOf(field));
  }

  const currentCropIds = new Set(cropsById.keys());
  if (fieldCropId) currentCropIds.add(fieldCropId);

  const defaultCropId = fieldCropId || [...cropsById.keys()][0] || '';

  for (const row of plantingRecords || []) {
    if (fieldIdOf(row) !== fieldId) continue;
    const cropId = cropIdOf(row) || defaultCropId;
    if (!cropId || !currentCropIds.has(cropId)) continue;
    addCrop(cropsById, cropId, cropNameOf(row));
    addVariety(varietiesByCropId, cropId, varietyNameOf(row));
  }

  addVariety(varietiesByCropId, defaultCropId || fieldCropId, varietyNameOf(field));

  const varietiesByCrop = {};
  for (const [cropId, byName] of varietiesByCropId) {
    varietiesByCrop[cropId] = [...byName.values()];
  }

  return {
    crops: [...cropsById.values()],
    varietiesByCrop,
  };
}

export function uniqueVarietiesOnField(planted) {
  const seen = new Map();
  for (const list of Object.values(planted?.varietiesByCrop || {})) {
    for (const name of list || []) {
      const key = String(name).toLowerCase();
      if (!seen.has(key)) seen.set(key, name);
    }
  }
  return [...seen.values()];
}

export function defaultPlantedCropId(planted, preferredCropId) {
  const crops = planted?.crops || [];
  if (crops.length === 1) return crops[0].id;
  const preferred = asId(preferredCropId);
  if (preferred && crops.some((crop) => crop.id === preferred)) return preferred;
  return '';
}

/** Auto-fill only when the field has a single planted variety. */
export function defaultPlantedVariety(planted) {
  const unique = uniqueVarietiesOnField(planted);
  return unique.length === 1 ? unique[0] : '';
}

export function varietiesForPlantedCrop(planted, cropId) {
  const id = asId(cropId);
  if (id) return planted?.varietiesByCrop?.[id] || [];
  const crops = planted?.crops || [];
  if (crops.length === 1) return planted?.varietiesByCrop?.[crops[0].id] || [];
  return uniqueVarietiesOnField(planted);
}
