import { apiRequest } from './api';

function parseColumnsConfig(columnsConfig) {
  if (!columnsConfig) return [];
  let cfg = columnsConfig;
  if (typeof cfg === 'string') {
    try {
      cfg = JSON.parse(cfg);
    } catch {
      return [];
    }
  }
  if (Array.isArray(cfg)) return cfg;
  if (Array.isArray(cfg.columns)) return cfg.columns;
  return [];
}

function coversIdentity(col, identity) {
  const key = String(col.key || '').toLowerCase();
  const label = String(col.label || '').toLowerCase();
  if (identity === 'Date') {
    return key === 'date' || key === 'harvestdate' || label === 'date' || label.includes('harvest date');
  }
  if (identity === 'Field') {
    return key === 'field' || key === 'fieldname' || key === 'fieldid'
      || label === 'field' || label === 'field id' || label.startsWith('field ');
  }
  return key === identity.toLowerCase() || label === identity.toLowerCase();
}

function uniqueLabels(columns) {
  const seen = new Map();
  return columns.map((col) => {
    const base = col.label || col.key || '';
    const count = (seen.get(base) || 0) + 1;
    seen.set(base, count);
    const label = count > 1 ? `${base} (${count})` : base;
    return { ...col, label };
  });
}

export function templateColumns(columnsConfig, { prepend = ['Date', 'Field'] } = {}) {
  const fromTemplate = parseColumnsConfig(columnsConfig).map((col) => ({
    key: col.key,
    label: col.label || col.key,
  })).filter((col) => col.key);
  const identity = [];
  prepend.forEach((name) => {
    if (fromTemplate.some((col) => coversIdentity(col, name))) return;
    identity.push({
      key: name === 'Field' ? 'fieldName' : name.toLowerCase(),
      label: name,
    });
  });
  return uniqueLabels([...identity, ...fromTemplate]);
}

export function mapEntryToTemplateRow(entry, columns, getters = {}) {
  const row = {};
  (columns || []).forEach((col) => {
    const getter = getters[col.key];
    let value = '';
    if (typeof getter === 'function') value = getter(entry);
    else if (entry != null && entry[col.key] != null && entry[col.key] !== '') value = entry[col.key];
    else if (entry != null && entry[col.label] != null && entry[col.label] !== '') value = entry[col.label];
    row[col.label] = value == null ? '' : value;
  });
  return row;
}

export function pickDefaultTemplate(templates) {
  return (templates || []).find((t) => t.is_default) || (templates || [])[0] || null;
}

export function pickTemplateForEntry(entry, templates) {
  const id = entry?.templateId || entry?.template_id;
  if (id) {
    const match = (templates || []).find((t) => t.id === id);
    if (match) return match;
  }
  return pickDefaultTemplate(templates);
}

export function safeSheetName(name, used = new Set()) {
  const cleaned = String(name || 'Sheet').replace(/[\\/?*[\]:]/g, ' ').replace(/\s+/g, ' ').trim();
  let base = (cleaned || 'Sheet').slice(0, 31);
  let next = base;
  let i = 2;
  while (used.has(next.toLowerCase())) {
    const suffix = ` (${i})`;
    next = `${base.slice(0, Math.max(1, 31 - suffix.length))}${suffix}`;
    i += 1;
  }
  used.add(next.toLowerCase());
  return next;
}

export function buildTemplateExportSheets({
  entries,
  templates,
  getters,
  fallbackColumns,
  extraColumnsForRow,
  defaultSheetName = 'Export',
  prepend = ['Date', 'Field'],
}) {
  const rowsIn = entries || [];
  const usable = (templates || []).filter((t) => parseColumnsConfig(t.columns_config || t.columnsConfig).length > 0);
  const usedNames = new Set();

  const toRows = (list, columns) => list.map((entry) => {
    const mapped = mapEntryToTemplateRow(entry, columns, getters);
    if (!extraColumnsForRow) return mapped;
    return { ...mapped, ...extraColumnsForRow(entry) };
  });

  if (usable.length === 0) {
    return [{
      sheetName: safeSheetName(defaultSheetName, usedNames),
      rows: toRows(rowsIn, fallbackColumns),
    }];
  }

  if (usable.length === 1) {
    const columns = templateColumns(usable[0].columns_config || usable[0].columnsConfig, { prepend });
    return [{
      sheetName: safeSheetName(defaultSheetName, usedNames),
      rows: toRows(rowsIn, columns),
    }];
  }

  const buckets = new Map();
  usable.forEach((template) => {
    buckets.set(template.id, { template, entries: [] });
  });
  const fallback = pickDefaultTemplate(usable);
  rowsIn.forEach((entry) => {
    const template = pickTemplateForEntry(entry, usable);
    const bucket = buckets.get(template?.id) || buckets.get(fallback?.id);
    if (bucket) bucket.entries.push(entry);
  });

  return [...buckets.values()]
    .filter((bucket) => bucket.entries.length > 0)
    .map((bucket) => {
      const columns = templateColumns(
        bucket.template.columns_config || bucket.template.columnsConfig,
        { prepend },
      );
      return {
        sheetName: safeSheetName(bucket.template.name || defaultSheetName, usedNames),
        rows: toRows(bucket.entries, columns),
      };
    });
}

export async function listSiteTemplatesByCategory(siteId, category) {
  if (!siteId) return [];
  try {
    const data = await apiRequest(`/form-templates/site/${siteId}`);
    return (data || []).filter((t) => t.category === category && t.is_visible !== false);
  } catch {
    return [];
  }
}
