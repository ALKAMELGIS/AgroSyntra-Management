import { buildTemplateExportSheets, listSiteTemplatesByCategory } from './templateExcel';

export const FALLBACK_HARVEST_COLUMNS = [
  { key: 'date', label: 'Date' },
  { key: 'fieldName', label: 'Field' },
  { key: 'currentCrop', label: 'Current Crop' },
  { key: 'variety', label: 'Variety' },
  { key: 'quantity', label: 'Quantity (kg)' },
  { key: 'grade', label: 'Grade' },
  { key: 'notes', label: 'Notes' },
];

export const FALLBACK_HARVEST_ENTRY_COLUMNS = [
  { key: 'date', label: 'Date' },
  { key: 'startTime', label: 'Start Time' },
  { key: 'endTime', label: 'End Time' },
  { key: 'shiftNumber', label: 'Shift No' },
  { key: 'weekNumber', label: 'Week Number' },
  { key: 'batchNumber', label: 'Batch No' },
  { key: 'product', label: 'Product' },
  { key: 'variety', label: 'Variety' },
  { key: 'fieldName', label: 'Field' },
  { key: 'segmentId', label: 'Segment' },
  { key: 'harvestedAreaHa', label: 'Area (Ha)' },
  { key: 'quantity', label: 'Qty (Kg)' },
  { key: 'packhouse', label: 'Packhouse' },
  { key: 'authorizedBy', label: 'Auth. By' },
];

export function flattenHarvestEntries(entries, fieldInfoMap = {}) {
  const rows = [];
  (entries || []).forEach((entry) => {
    const fieldInfo = fieldInfoMap[entry.fieldId] || {};
    const fieldLabel = entry.fieldName || fieldInfo.name || entry.fieldId;
    const currentCrop = fieldInfo.currentCrop || entry.currentCrop || entry.cropName || '';
    const varieties = entry.varieties?.length ? entry.varieties : [{}];
    varieties.forEach((variety) => {
      rows.push({
        date: entry.date,
        harvestDate: entry.date,
        fieldId: entry.fieldId,
        fieldName: fieldLabel,
        currentCrop,
        cropName: entry.cropName || currentCrop,
        product: entry.cropName || currentCrop,
        variety: variety.variety || entry.varietyName || '',
        quantity: variety.quantity ?? entry.totalQuantity ?? '',
        grade: variety.grade || '',
        notes: entry.notes || '',
        totalQuantity: entry.totalQuantity ?? '',
        startTime: entry.startTime || '',
        endTime: entry.endTime || '',
        shiftNumber: entry.shiftNumber || '',
        weekNumber: entry.weekNumber || '',
        batchNumber: entry.batchNumber || '',
        segmentId: entry.segmentId || '',
        harvestedAreaHa: entry.harvestedAreaHa ?? '',
        packhouse: entry.packhouse || '',
        authorizedBy: entry.authorizedBy || '',
        templateId: entry.templateId || entry.template_id,
      });
    });
  });
  return rows;
}

export function harvestGetters() {
  return {
    date: (row) => (row.date || '').split('T')[0] || row.date || '',
    harvestDate: (row) => (row.harvestDate || row.date || '').split('T')[0] || '',
    fieldName: (row) => row.fieldName || '',
    field: (row) => row.fieldName || '',
    fieldId: (row) => row.fieldName || '',
    currentCrop: (row) => row.currentCrop || row.cropName || '',
    cropName: (row) => row.cropName || row.currentCrop || '',
    product: (row) => row.product || row.cropName || row.currentCrop || '',
    variety: (row) => row.variety || '',
    quantity: (row) => row.quantity ?? '',
    grade: (row) => row.grade || '',
    notes: (row) => row.notes || '',
    totalQuantity: (row) => row.totalQuantity ?? '',
    startTime: (row) => row.startTime || '',
    endTime: (row) => row.endTime || '',
    shiftNumber: (row) => row.shiftNumber || '',
    weekNumber: (row) => row.weekNumber || '',
    batchNumber: (row) => row.batchNumber || '',
    segmentId: (row) => row.segmentId || '',
    harvestedAreaHa: (row) => row.harvestedAreaHa ?? '',
    packhouse: (row) => row.packhouse || '',
    authorizedBy: (row) => row.authorizedBy || '',
  };
}

export async function buildHarvestExcelSheets(entries, ctx = {}) {
  const entryMode = ctx.variant === 'entry';
  const templates = entryMode
    ? []
    : (ctx.templates || await listSiteTemplatesByCategory(ctx.siteId, 'harvest'));
  return buildTemplateExportSheets({
    entries: flattenHarvestEntries(entries, ctx.fieldInfoMap),
    templates,
    getters: harvestGetters(),
    fallbackColumns: ctx.fallbackColumns || (entryMode ? FALLBACK_HARVEST_ENTRY_COLUMNS : FALLBACK_HARVEST_COLUMNS),
    defaultSheetName: ctx.defaultSheetName || 'Harvest',
  });
}
