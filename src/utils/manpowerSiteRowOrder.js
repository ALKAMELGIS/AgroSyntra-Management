import { WORKERS_COUNT_BLANK_CROP } from './manpowerDetailPivotConstants';

export function cropNamesEqual(a, b) {
  return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
}

/**
 * Crop UUID from the catalog, then farm-area assignments (site first).
 * Seeded Reference groups can come from fields/planting, not only farm-area crops.
 */
export function findCropIdByNameInMasterData(masterData, cropName, siteId) {
  if (!cropName || !masterData) return null;

  const fromCatalog = (masterData.crops || []).find((crop) => cropNamesEqual(crop?.name, cropName));
  if (fromCatalog?.id) return fromCatalog.id;

  const walk = (requireSite) => {
    for (const country of masterData.countries || []) {
      for (const site of country.sites || []) {
        if (requireSite && site.id !== siteId) continue;
        for (const farmArea of site.farmAreas || []) {
          for (const crop of farmArea.crops || []) {
            if (cropNamesEqual(crop?.name, cropName) && crop.id) return crop.id;
          }
        }
      }
    }
    return null;
  };

  return walk(true) || walk(false);
}

/** @typedef {'crop' | 'variety'} WorkersCountGroupBy */

/**
 * Crop names assigned to farm areas at a site (from master data).
 * @param {object} masterData
 * @param {string} siteId
 */
export function getSiteCropNamesFromMasterData(masterData, siteId) {
  if (!siteId || !masterData?.countries) return [];
  const crops = new Set();
  for (const country of masterData.countries) {
    for (const site of country.sites || []) {
      if (site.id !== siteId) continue;
      for (const farmArea of site.farmAreas || []) {
        for (const crop of farmArea.crops || []) {
          if (crop?.name) crops.add(crop.name);
        }
      }
    }
  }
  return [...crops].sort((a, b) => a.localeCompare(b));
}

/**
 * @param {WorkersCountGroupBy} groupBy
 * @param {Array<{ crop?: string, variety?: string }>} cells
 */
export function dataRowKeysFromCells(cells, groupBy) {
  const keys = new Set();
  for (const cell of cells || []) {
    const key = groupBy === 'variety'
      ? (cell.variety || cell.crop || 'No Variety')
      : (cell.crop || 'No Crop');
    if (key && key !== WORKERS_COUNT_BLANK_CROP) keys.add(key);
  }
  return keys;
}

/**
 * Site-scoped row order for activity grid and daily/till summaries.
 * @param {{
 *   groupBy: WorkersCountGroupBy,
 *   siteCrops?: string[],
 *   siteVarieties?: string[],
 *   pivotCrops?: string[],
 *   pivotVarieties?: string[],
 *   cells?: Array<{ crop?: string, variety?: string }>,
 * }} opts
 */
export function buildWorkersCountRowOrder(opts) {
  const {
    groupBy,
    siteCrops = [],
    siteVarieties = [],
    pivotCrops = [],
    pivotVarieties = [],
    cells = [],
  } = opts;

  const dataKeys = dataRowKeysFromCells(cells, groupBy);
  let template = (groupBy === 'variety' ? siteVarieties : siteCrops)
    .filter(Boolean)
    .slice()
    .sort((a, b) => a.localeCompare(b));

  if (!template.length) {
    const pivotFallback = (groupBy === 'variety' ? pivotVarieties : pivotCrops)
      .filter(Boolean)
      .slice()
      .sort((a, b) => a.localeCompare(b));
    if (pivotFallback.length) {
      template = pivotFallback;
    } else {
      template = [...dataKeys].filter((k) => k && k !== 'General').sort((a, b) => a.localeCompare(b));
    }
  }

  if (!template.length && !dataKeys.size) return [];

  const rows = ['General'];
  const seen = new Set(['General']);

  for (const label of template) {
    if (!label || label === 'General' || seen.has(label)) continue;
    rows.push(label);
    seen.add(label);
  }

  for (const extra of [...dataKeys].filter((k) => !seen.has(k)).sort((a, b) => a.localeCompare(b))) {
    rows.push(extra);
    seen.add(extra);
  }

  return rows;
}

/** @param {WorkersCountGroupBy} groupBy */
export function rowLabelHeader(groupBy) {
  return groupBy === 'variety' ? 'Variety' : 'Crop';
}
