import {
  DEFAULT_NEW_WEEK_COUNT,
  packCost,
  resolvedSitePrice,
  weekOverlapsRange,
  weekToDateRange,
  weeksFromCount,
} from './bioControlWeeks';
import { excelSheetName } from './excelSheetName';

export { excelSheetName } from './excelSheetName';

export function uniqueProductHeaders(products) {
  const used = new Map();
  return (products || []).map((product) => {
    const name = String(product.product_name || 'Product').trim() || 'Product';
    const code = String(product.item_code || '').trim();
    let label = code ? `${name} (${code})` : name;
    const key = label.toLowerCase();
    const count = (used.get(key) || 0) + 1;
    used.set(key, count);
    if (count > 1) label = `${label} #${count}`;
    return {
      id: product.id,
      label,
      perM2Key: `${label} per m²`,
      unitsKey: `${label} # units`,
      product,
    };
  });
}

export function entriesByProductWeek(entries) {
  const map = {};
  for (const entry of entries || []) {
    const productId = entry.product_column_id || entry.productColumnId;
    const week = entry.week_number ?? entry.weekNumber;
    map[`${productId}_${week}`] = {
      perM2: Number(entry.per_m2 ?? entry.perM2) || 0,
      units: Number(entry.units) || 0,
    };
  }
  return map;
}

export function resolveExportWeeks(setup, weekFilter = {}) {
  const weekCount = setup?.week_count || DEFAULT_NEW_WEEK_COUNT;
  const week1Start = setup?.start_date;
  const allWeeks = weeksFromCount(weekCount);
  const filtered = allWeeks.filter((week) => (
    weekOverlapsRange(week, week1Start, weekFilter.from, weekFilter.to)
  ));
  return filtered.length ? filtered : allWeeks;
}

function emptyEntryRow(headers, week, dateRange) {
  return { ...headers, Wk: week, 'Date Range': dateRange };
}

export function buildBioEntrySheetRows({
  setup,
  products,
  entries,
  weekNumbers,
  week1Start,
} = {}) {
  const cols = uniqueProductHeaders(products);
  const entryMap = entriesByProductWeek(entries);
  const weeks = weekNumbers?.length
    ? weekNumbers
    : weeksFromCount(setup?.week_count || DEFAULT_NEW_WEEK_COUNT);
  const headers = { Wk: '', 'Date Range': '' };
  for (const col of cols) {
    headers[col.perM2Key] = '';
    headers[col.unitsKey] = '';
  }

  const start = setup?.start_date || week1Start;
  const rows = weeks.map((week) => {
    const row = emptyEntryRow(headers, week, weekToDateRange(week, start));
    for (const col of cols) {
      const cell = entryMap[`${col.id}_${week}`] || {};
      row[col.perM2Key] = cell.perM2 || '';
      row[col.unitsKey] = cell.units || '';
    }
    return row;
  });

  const total = emptyEntryRow(headers, 'TOTAL', '');
  const cost = emptyEntryRow(headers, 'COST', '');
  for (const col of cols) {
    let totalPerM2 = 0;
    let totalUnits = 0;
    for (const week of weeks) {
      const cell = entryMap[`${col.id}_${week}`] || {};
      totalPerM2 += cell.perM2 || 0;
      totalUnits += cell.units || 0;
    }
    const price = resolvedSitePrice(col.product.price_per_package);
    total[col.perM2Key] = totalPerM2 || '';
    total[col.unitsKey] = totalUnits || '';
    cost[col.unitsKey] = packCost(totalUnits, price || 0) || '';
  }
  rows.push(total, cost);
  return rows;
}

const SUMMARY_KEYS = {
  Product: '',
  'Item Code': '',
  UOM: '',
  'Per package': '',
  'Site price': '',
  'Total per m²': 0,
  'Total units': 0,
  'Total cost': 0,
};

export function buildBioFieldSummaryRows({ products, entries, weekNumbers } = {}) {
  const cols = uniqueProductHeaders(products);
  const entryMap = entriesByProductWeek(entries);
  const weeks = weekNumbers || [];

  const rows = cols.map((col) => {
    let totalPerM2 = 0;
    let totalUnits = 0;
    for (const week of weeks) {
      const cell = entryMap[`${col.id}_${week}`] || {};
      totalPerM2 += cell.perM2 || 0;
      totalUnits += cell.units || 0;
    }
    const price = resolvedSitePrice(col.product.price_per_package);
    return {
      ...SUMMARY_KEYS,
      Product: col.product.product_name || '',
      'Item Code': col.product.item_code || '',
      UOM: col.product.uom_name || '',
      'Per package': col.product.per_package ?? '',
      'Site price': price ?? '',
      'Total per m²': totalPerM2 || 0,
      'Total units': totalUnits || 0,
      'Total cost': packCost(totalUnits, price || 0),
    };
  });

  if (rows.length === 0) {
    rows.push({ ...SUMMARY_KEYS });
  }

  const totalPerM2 = rows.reduce((sum, row) => sum + (Number(row['Total per m²']) || 0), 0);
  const totalUnits = rows.reduce((sum, row) => sum + (Number(row['Total units']) || 0), 0);
  const totalCost = rows.reduce((sum, row) => sum + (Number(row['Total cost']) || 0), 0);
  rows.push({
    ...SUMMARY_KEYS,
    Product: 'TOTAL',
    'Total per m²': totalPerM2,
    'Total units': totalUnits,
  });
  rows.push({
    ...SUMMARY_KEYS,
    Product: 'COST',
    'Total cost': totalCost,
  });
  return rows;
}

export function buildBioExportSheets(fields, { weekFilter } = {}) {
  const used = new Set();
  const sheets = [];
  for (const field of fields || []) {
    const setup = field.setup || {};
    const fieldName = field.fieldName || setup.field_name || 'Field';
    const weeks = resolveExportWeeks(setup, weekFilter);
    sheets.push({
      sheetName: excelSheetName(fieldName, used),
      title: `BIOLOGICAL CONTROL RECORD — ${fieldName}`,
      freezeCols: 2,
      rows: buildBioEntrySheetRows({
        setup,
        products: field.products,
        entries: field.entries,
        weekNumbers: weeks,
        week1Start: setup.start_date,
      }),
    });
    sheets.push({
      sheetName: excelSheetName(`${fieldName} SUMMARY`, used),
      title: `BIOLOGICAL CONTROL RECORD — ${fieldName} SUMMARY`,
      rows: buildBioFieldSummaryRows({
        products: field.products,
        entries: field.entries,
        weekNumbers: weeks,
      }),
    });
  }
  return sheets;
}

export function bioExportFilename(cropName, seasonName) {
  const part = (value, fallback) => String(value || fallback)
    .replace(/[^\w]+/g, '-')
    .replace(/^-|-$/g, '') || fallback;
  return `Biological-Control-${part(cropName, 'Crop')}-${part(seasonName, 'Season')}.xlsx`;
}
