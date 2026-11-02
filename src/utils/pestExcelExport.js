import { mapEntryToTemplateRow, templateColumns, safeSheetName } from './templateExcel';
import { formatPercentSeen } from './percentSeen';

export const APPLICATION_RECORDS_COLUMNS = [
  { key: 'cropName', label: 'Crop' },
  { key: 'variety', label: 'Variety' },
  { key: 'fieldId', label: 'Field ID' },
  { key: 'segmentId', label: 'Segment' },
  { key: 'scoutingDate', label: 'Scouting Date' },
  { key: 'justification', label: 'Justification' },
  { key: 'percentSeen', label: '% Seen' },
  { key: 'applicationDate', label: 'App. Date' },
  { key: 'applicationStartTime', label: 'Start' },
  { key: 'applicationEndTime', label: 'End' },
  { key: 'productId', label: 'Name of PPP' },
  { key: 'activeIngredient', label: 'Active Ingredient' },
  { key: 'dosage', label: 'Dose/L' },
  { key: 'ratePerHa', label: 'Rate/Ha' },
  { key: 'unitPrice', label: 'Unit Price' },
  { key: 'cost', label: 'Cost' },
  { key: 'uom', label: 'UoM' },
  { key: 'totalQuantityApplied', label: 'Total Qty' },
  { key: 'machineryUsed', label: 'Machinery' },
  { key: 'phiDays', label: 'PHI' },
  { key: 'clearToHarvestDate', label: 'Clear Date' },
  { key: 'weatherConditions', label: 'Weather' },
  { key: 'operatorName', label: 'Operator' },
  { key: 'verifiedBy', label: 'Verified By' },
  { key: 'approvalStatus', label: 'Status' },
];

function formatDay(value) {
  if (value == null || value === '') return '';
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(raw) && !raw.includes('T')) {
    const [y, m, d] = raw.split('-');
    return `${d}/${m}/${y}`;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString('en-GB');
}

function formatClearDate(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'string' && !value.includes('T') && Number.isNaN(Date.parse(value))) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const day = date.toLocaleDateString('en-GB');
  if (date.getHours() || date.getMinutes()) {
    return `${day}, ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }
  return day;
}

function pick(app, ...keys) {
  for (const key of keys) {
    const value = app?.[key];
    if (value != null && value !== '') return value;
  }
  return '';
}

export function pestJustification(app) {
  return pick(app, 'justification', 'target_pest', 'targetPest');
}

export function pestGetters({ fieldById = {}, productById = {} } = {}) {
  return {
    cropName: (app) => pick(app, 'crop_name', 'field_crop_name', 'cropName'),
    variety: (app) => pick(app, 'variety'),
    fieldId: (app) => pick(app, 'field_name', 'fieldId_display')
      || fieldById[app.field_id || app.fieldId]?.name
      || '',
    fieldName: (app) => pick(app, 'field_name', 'fieldId_display')
      || fieldById[app.field_id || app.fieldId]?.name
      || '',
    segmentId: (app) => {
      const segment = pick(app, 'segment_id', 'segmentId');
      return segment === 'ALL' ? 'Entire Field' : segment;
    },
    scoutingDate: (app) => formatDay(pick(app, 'scouting_date', 'scoutingDate')),
    justification: (app) => pestJustification(app),
    percentSeen: (app) => formatPercentSeen(pick(app, 'percent_seen', 'percentSeen')),
    applicationDate: (app) => formatDay(pick(app, 'application_date', 'applicationDate')),
    applicationStartTime: (app) => pick(app, 'application_start_time', 'applicationStartTime'),
    applicationEndTime: (app) => pick(app, 'application_end_time', 'applicationEndTime'),
    productId: (app) => pick(app, 'product_name', 'productId_display')
      || productById[app.product_id || app.productId]?.name
      || '',
    activeIngredient: (app) => pick(app, 'active_ingredient', 'product_active_ingredient', 'activeIngredient'),
    dosage: (app) => pick(app, 'dosage'),
    ratePerHa: (app) => pick(app, 'rate_per_ha', 'ratePerHa'),
    unitPrice: (app) => pick(app, 'unit_price', 'unitPrice'),
    cost: (app) => pick(app, 'cost'),
    uom: (app) => pick(app, 'uom', 'dosage_unit', 'dosageUnit'),
    totalQuantityApplied: (app) => pick(app, 'total_quantity_applied', 'totalQuantityApplied'),
    totalWaterQty: (app) => pick(app, 'total_water_qty', 'totalWaterQty'),
    machineryUsed: (app) => pick(app, 'machinery_used', 'application_method', 'machineryUsed', 'applicationMethod'),
    phiDays: (app) => {
      const value = app.phi_days ?? app.phiDays;
      return value == null || value === '' ? 0 : value;
    },
    clearToHarvestDate: (app) => formatClearDate(pick(app, 'phi_end_date', 'clearToHarvestDate')),
    weatherConditions: (app) => pick(app, 'weather_conditions', 'weatherConditions'),
    operatorName: (app) => pick(app, 'operator_name', 'operatorName'),
    verifiedBy: (app) => pick(app, 'verified_by', 'verifiedBy'),
    approvalStatus: (app) => pick(app, 'approval_status', 'approvalStatus'),
  };
}

export const EMPTY_PEST_EXPORT_FILTERS = {
  dateFrom: '',
  dateTo: '',
  field: '',
  ppp: '',
  activeIngredient: '',
  variety: '',
  crop: '',
  operator: '',
  segment: '',
};

const FILTER_GETTER_KEYS = {
  field: 'fieldId',
  ppp: 'productId',
  activeIngredient: 'activeIngredient',
  variety: 'variety',
  crop: 'cropName',
  operator: 'operatorName',
  segment: 'segmentId',
};

function norm(value) {
  return String(value || '').trim().toLowerCase();
}

function applicationDay(app) {
  return String(app?.application_date || app?.applicationDate || '').slice(0, 10);
}

export function matchesPestExportFilters(app, filters, getters) {
  if (!filters) return true;
  const day = applicationDay(app);
  const from = String(filters.dateFrom || '').slice(0, 10);
  const to = String(filters.dateTo || '').slice(0, 10);
  if (from && (!day || day < from)) return false;
  if (to && (!day || day > to)) return false;
  return Object.entries(FILTER_GETTER_KEYS).every(([filterKey, getterKey]) => {
    const wanted = norm(filters[filterKey]);
    if (!wanted) return true;
    return norm(getters[getterKey]?.(app)) === wanted;
  });
}

export function filterPestApps(apps, filters, getters) {
  return (apps || []).filter((app) => matchesPestExportFilters(app, filters, getters));
}

export function collectPestExportFilterOptions(apps, getters) {
  const buckets = {
    field: new Set(),
    ppp: new Set(),
    activeIngredient: new Set(),
    variety: new Set(),
    crop: new Set(),
    operator: new Set(),
    segment: new Set(),
  };
  (apps || []).forEach((app) => {
    Object.entries(FILTER_GETTER_KEYS).forEach(([filterKey, getterKey]) => {
      const value = String(getters[getterKey]?.(app) || '').trim();
      if (value) buckets[filterKey].add(value);
    });
  });
  return Object.fromEntries(
    Object.entries(buckets).map(([key, set]) => [
      key,
      [...set].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    ]),
  );
}

function rowId(row) {
  return row?.id || row?._id || null;
}

function rowsForTemplate(applications, templateRows, templateId) {
  const byId = new Map();
  (applications || []).forEach((app) => {
    const tid = app.template_id || app.templateId;
    if (tid !== templateId) return;
    const id = rowId(app);
    if (id) byId.set(id, app);
  });
  ((templateRows && templateRows[templateId]) || []).forEach((app) => {
    const id = rowId(app);
    if (id && !byId.has(id)) byId.set(id, app);
    else if (!id) byId.set(`anon-${byId.size}`, app);
  });
  return [...byId.values()];
}

export function buildPestExcelSheets(applications, {
  templates = [],
  templateRows = {},
  fields = [],
  products = [],
  filters,
} = {}) {
  const fieldById = Object.fromEntries((fields || []).map((f) => [f.id, f]));
  const productById = Object.fromEntries((products || []).map((p) => [p.id, p]));
  const getters = pestGetters({ fieldById, productById });
  const filteredApps = filterPestApps(applications, filters, getters);
  const filteredTemplateRows = {};
  Object.entries(templateRows || {}).forEach(([templateId, rows]) => {
    filteredTemplateRows[templateId] = filterPestApps(rows, filters, getters);
  });
  const usedNames = new Set();
  const sheets = [];

  sheets.push({
    sheetName: safeSheetName('Application Records', usedNames),
    rows: filteredApps.map((app) => mapEntryToTemplateRow(app, APPLICATION_RECORDS_COLUMNS, getters)),
  });

  (templates || []).forEach((template) => {
    const config = template.columns_config || template.columnsConfig;
    const columns = templateColumns(config, { prepend: [] });
    if (columns.length === 0) return;
    const rows = rowsForTemplate(filteredApps, filteredTemplateRows, template.id);
    if (rows.length === 0) return;
    sheets.push({
      sheetName: safeSheetName(template.name || 'Template', usedNames),
      rows: rows.map((app) => mapEntryToTemplateRow(app, columns, getters)),
    });
  });

  return sheets.filter((sheet) => sheet.rows.length > 0);
}
