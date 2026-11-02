import { waterQtyPerValve } from './fertigationWaterQty';
import { buildTemplateExportSheets, listSiteTemplatesByCategory } from './templateExcel';

export const FALLBACK_FERTIGATION_COLUMNS = [
  { key: 'date', label: 'Date' },
  { key: 'fieldName', label: 'Field' },
  { key: 'currentCrop', label: 'Crop' },
  { key: 'recipeId', label: 'Recipe' },
  { key: 'operatorName', label: 'Operator' },
  { key: 'valves', label: 'Valves' },
  { key: 'flowRate', label: 'Flow Rate (m3/hr)' },
  { key: 'waterQty', label: 'Water Qty (M3/Valve)' },
  { key: 'frequency', label: 'Frequency' },
  { key: 'dailyTotal', label: 'Daily Total (m3)' },
  { key: 'totalFertilizer', label: 'Total Fert (kg)' },
];

export function fertigationGetters({ getFieldLabel, getRecipeName, getCrop } = {}) {
  const fieldOf = (entry) => (getFieldLabel ? getFieldLabel(entry) : (entry.fieldName || entry.field || entry.fieldId || ''));
  const recipeOf = (entry) => (getRecipeName ? getRecipeName(entry) : (entry.recipeName || entry.recipe_name || ''));
  const cropOf = (entry) => (getCrop ? getCrop(entry) : (entry.cropName || entry.currentCrop || entry.crop || ''));
  return {
    date: (entry) => (entry.date || '').split('T')[0] || entry.date || '',
    fieldName: fieldOf,
    field: fieldOf,
    fieldId: fieldOf,
    currentCrop: cropOf,
    recipeId: recipeOf,
    recipeName: recipeOf,
    valves: (entry) => entry.valvesCount ?? '',
    valvesCount: (entry) => entry.valvesCount ?? '',
    flowRate: (entry) => entry.flowRate ?? '',
    waterQty: (entry) => waterQtyPerValve(entry),
    frequency: (entry) => entry.frequency ?? '',
    dailyTotal: (entry) => entry.dailyWater ?? '',
    dailyWater: (entry) => entry.dailyWater ?? '',
    totalFertilizer: (entry) => entry.totalFertilizer ?? '',
    operatorName: (entry) => entry.operatorName || entry.operator_name || '',
    weekNumber: (entry) => entry.weekNumber ?? '',
  };
}

export function fertilizerExtraColumns(entries) {
  const names = [...new Set(
    (entries || []).flatMap((entry) => Object.keys(entry.fertilizers || {})),
  )].sort();
  if (names.length === 0) return null;
  return (entry) => {
    const extra = {};
    names.forEach((name) => {
      extra[name] = entry.fertilizers?.[name] ?? '';
    });
    return extra;
  };
}

export async function buildFertigationExcelSheets(entries, ctx = {}) {
  const templates = ctx.templates || await listSiteTemplatesByCategory(ctx.siteId, 'fertigation');
  return buildTemplateExportSheets({
    entries,
    templates,
    getters: fertigationGetters(ctx),
    fallbackColumns: FALLBACK_FERTIGATION_COLUMNS,
    extraColumnsForRow: ctx.includeFertilizers ? fertilizerExtraColumns(entries) : null,
    defaultSheetName: ctx.defaultSheetName || 'Fertigation',
  });
}
