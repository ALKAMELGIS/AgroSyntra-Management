import { OPENING_FIELDS, CLOSING_FIELDS } from './plantationWorkbookRows';
import { asExportNumber, excelSheetName, formatExportDate } from './excelSheetName';

const SEASON_CLOSED_REASON = 'Season closed';

export function availabilitySeasonText(row) {
  if (row?.kind === 'uprooted') {
    const date = row.uprooted_at ? String(row.uprooted_at).split('T')[0] : '';
    return row.uproot_reason ? `${date} · ${row.uproot_reason}` : `Uprooted ${date}`;
  }
  if (row?.kind === 'partial') {
    const date = row.uprooted_at ? String(row.uprooted_at).split('T')[0] : '';
    if (row.uproot_reason) return `${date} · ${row.uproot_reason}`;
    return date ? `Uprooted ${date}` : 'Partial';
  }
  if (row?.planted_in_window) return 'Vacant';
  return 'Never planted this season';
}

export function formatUprootedLabel(row) {
  if (!row?.uprooted_at) return '—';
  const date = String(row.uprooted_at).split('T')[0];
  const reason = row.uproot_reason || '';
  return reason ? `${date} · ${reason}` : date;
}

function siteOf(row, { includeSite, siteNameByFieldId, siteName } = {}) {
  if (!includeSite) return {};
  const fieldId = row.fieldId || row.field_id;
  return { Site: siteNameByFieldId?.[fieldId] || siteName || row.site_name || '' };
}

export function buildAvailableRows(rows, opts = {}) {
  return (rows || []).map((row) => ({
    ...siteOf(row, opts),
    Field: row.field_name || '',
    'Farm Area': row.farm_area_name || '',
    Availability: row.availability || '',
    'Occupied segments': (row.occupied_segments || []).join(', ') || '—',
    'Free / uprooted segments': (row.free_segments || []).join(', ')
      || (row.availability === 'Vacant' ? 'Entire field' : '—'),
    'This season': availabilitySeasonText(row),
    'Last crop': row.last_crop || '—',
  }));
}

export function buildOccupiedRows(rows, opts = {}) {
  return (rows || []).map((row) => ({
    ...siteOf(row, opts),
    Field: row.fieldName || '',
    'Farm Area': row.farmAreaName || '—',
    Crop: row.cropName || '—',
    Variety: row.varietyName || '—',
    Segments: row.segmentsLabel || '—',
    'Occupied since': formatExportDate(row.occupancyStart) || '—',
  }));
}

export function buildHistoryRows(rows, opts = {}) {
  return (rows || []).map((row) => ({
    ...siteOf(row, opts),
    Field: row.field_name || '',
    'Farm Area': row.farm_area_name || '',
    Crop: row.crop_name || '',
    Variety: row.variety_name || '—',
    'Start Date': formatExportDate(row.start_date),
    'End Date': row.end_date ? formatExportDate(row.end_date) : 'Current',
    Uprooted: formatUprootedLabel(row),
    Cycles: row.cycle_count != null && Number(row.cycle_count) > 0 ? Number(row.cycle_count) : '—',
  }));
}

export function buildRotationExportSheets({
  available = [],
  occupied = [],
  history = [],
  includeSite = false,
  siteNameByFieldId = {},
  siteName = '',
} = {}) {
  const used = new Set();
  const opts = { includeSite, siteNameByFieldId, siteName };
  const sheets = [];
  const availableRows = buildAvailableRows(available, opts);
  const occupiedRows = buildOccupiedRows(occupied, opts);
  const historyRows = buildHistoryRows(history, opts);
  if (availableRows.length) {
    sheets.push({ sheetName: excelSheetName('Available', used), rows: availableRows });
  }
  if (occupiedRows.length) {
    sheets.push({ sheetName: excelSheetName('Occupied', used), rows: occupiedRows });
  }
  if (historyRows.length) {
    sheets.push({ sheetName: excelSheetName('History', used), rows: historyRows });
  }
  return sheets;
}

export function ordinalCountingLabel(n) {
  const suffixes = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]} Counting`;
}

export function countingPercents(count) {
  if (!count || !count.seeds_total || count.seeds_total === 0) {
    return { noGermPct: '', germPct: '' };
  }
  const noGermPct = Math.round((count.seeds_no_germ / count.seeds_total) * 100);
  return { noGermPct, germPct: 100 - noGermPct };
}

function countingKeys(maxCounting) {
  return Array.from({ length: maxCounting }, (_, i) => {
    const prefix = ordinalCountingLabel(i + 1);
    return {
      n: i + 1,
      date: `${prefix} Date`,
      seedsTotal: `${prefix} Seeds Total`,
      noGerm: `${prefix} No Germ`,
      noGermPct: `${prefix} No Germ %`,
      germPct: `${prefix} Germ %`,
    };
  });
}

export function buildGerminationSheetRows(records, maxCounting = 1) {
  const keys = countingKeys(maxCounting);
  return (records || []).map((record) => {
    const row = { Variety: record.variety_name || record.varietyName || '' };
    keys.forEach((col) => {
      const count = (record.counts || []).find((c) => c.counting_number === col.n) || {};
      const pct = countingPercents(count);
      row[col.date] = formatExportDate(count.date);
      row[col.seedsTotal] = asExportNumber(count.seeds_total);
      row[col.noGerm] = asExportNumber(count.seeds_no_germ);
      row[col.noGermPct] = pct.noGermPct === '' ? '' : pct.noGermPct;
      row[col.germPct] = pct.germPct === '' ? '' : pct.germPct;
    });
    return row;
  });
}

export function buildGerminationExportSheets(sections, recordsBySection, maxCountings = {}) {
  const used = new Set();
  return (sections || []).map((section) => {
    const records = recordsBySection?.[section.id] || [];
    const rows = buildGerminationSheetRows(records, maxCountings[section.id] || 1);
    if (!rows.length) return null;
    return {
      sheetName: excelSheetName(section.name || 'Section', used),
      rows,
    };
  }).filter(Boolean);
}

export function buildPlantingExportRows(rows, {
  includeSowingBatch = false,
  includeSite = false,
  siteNameByFieldId = {},
  cropNameById = {},
  varietyNameById = {},
  fieldNameById = {},
  sowingLabelById = {},
} = {}) {
  return (rows || []).filter((row) => !row._isNew).map((row) => {
    const out = {};
    if (includeSite) out.Site = siteNameByFieldId[row.fieldId] || '';
    if (includeSowingBatch) {
      out['Sowing batch'] = sowingLabelById[row.sowingRecordId] || '';
    }
    out['Seeding Date'] = formatExportDate(row.seedingDate);
    out['Field ID'] = fieldNameById[row.fieldId] || row.fieldName || '';
    out['Segment (Bay)'] = row.segment || '';
    out.Area = row.totalArea || '';
    out['Crop Name'] = cropNameById[row.cropId] || row.cropName || '';
    out.Variety = varietyNameById[row.varietyId] || row.varietyName || '';
    out['Sub Class'] = row.cropSubClass || '';
    out['Crop Type'] = row.cropType || '';
    out.Breeder = row.breeder || '';
    out['Lot/Batch No'] = row.lotBatchNo || '';
    out.Quantity = asExportNumber(row.pmQuantity);
    out.UOM = row.uom || '';
    out['Trays/Hec'] = row.traysPerHec || '';
    out['Rate/Hec'] = row.ratePerHec || '';
    out['Transplant Date'] = formatExportDate(row.transplantDate);
    out['Authorized By'] = row.authorizedBy || '';
    return out;
  });
}

export function remainingSeedlings(seedlingCount, planted) {
  const total = parseFloat(seedlingCount);
  const used = parseFloat(planted);
  if (!Number.isFinite(total)) return '';
  if (!Number.isFinite(used)) return Number(total.toFixed(1));
  return Number((total - used).toFixed(1));
}

export function buildNurseryExportRows(rows, {
  cropNameById = {},
  varietyNameById = {},
  breederNameById = {},
} = {}) {
  return (rows || []).filter((row) => !row._isNew).map((row) => {
    const media = row.mediaComponents || {};
    return {
      'Date of sowing': formatExportDate(row.seedingDate),
      Crop: cropNameById[row.cropId] || row.cropName || '',
      Variety: varietyNameById[row.varietyId] || row.varietyName || '',
      'Seed Batch': row.seedBatch || '',
      Breeder: breederNameById[row.breederId] || row.breederName || '',
      'Seeds/cell': asExportNumber(row.seedsPerCell),
      'Tray type': row.trayType || '',
      'No. trays': asExportNumber(row.trayCount),
      'Growing Media': row.growingMediaBrand || '',
      Perlite: asExportNumber(media.perlite?.qty),
      'Perlite UoM': media.perlite?.uom || '',
      'Peat moss': asExportNumber(media.peatMoss?.qty),
      'Peat moss UoM': media.peatMoss?.uom || '',
      Compost: asExportNumber(media.compost?.qty),
      'Compost UoM': media.compost?.uom || '',
      Vermiculite: asExportNumber(media.vermiculite?.qty),
      'Vermiculite UoM': media.vermiculite?.uom || '',
      'No. Seedling': asExportNumber(row.seedlingCount),
      'Germ %': asExportNumber(row.germinationPct),
      'Ready to transplant': formatExportDate(row.readyToTransplantDate),
      Days: asExportNumber(row.totalDays),
      'Release date': formatExportDate(row.releaseDate),
      'Seedlings planted': asExportNumber(row.seedlingsPlanted),
      Remaining: remainingSeedlings(row.seedlingCount, row.seedlingsPlanted),
    };
  });
}

function plantationCellValue(row, field, lookups = {}) {
  const value = row[field.key];
  if (field.type === 'date') return formatExportDate(value);
  if (field.type === 'number') return asExportNumber(value);
  if (field.key === 'fieldId') {
    return lookups.fieldNameById?.[value] || row.fieldName || '';
  }
  if (field.key === 'cropId') {
    return lookups.cropNameById?.[value] || row.cropName || '';
  }
  if (field.key === 'varietyId') {
    return lookups.varietyNameById?.[value] || row.varietyName || '';
  }
  if (value === true) return 'Yes';
  if (value === false) return 'No';
  return value == null ? '' : value;
}

export function buildPlantationSheetRows(rows, fields, lookups = {}) {
  return (rows || []).filter((row) => !row._isNew).map((row) => {
    const out = {};
    (fields || []).forEach((field) => {
      out[field.label] = plantationCellValue(row, field, lookups);
    });
    return out;
  });
}

export function buildPlantationExportSheets({ opening = [], closing = [], lookups = {} } = {}) {
  const used = new Set();
  const sheets = [];
  const openingRows = buildPlantationSheetRows(opening, OPENING_FIELDS, lookups);
  const closingRows = buildPlantationSheetRows(closing, CLOSING_FIELDS, lookups);
  if (openingRows.length) {
    sheets.push({
      sheetName: excelSheetName('Opening', used),
      title: 'PLANTATION OPENING',
      rows: openingRows,
    });
  }
  if (closingRows.length) {
    sheets.push({
      sheetName: excelSheetName('Closing', used),
      title: 'PLANTATION CLOSING',
      rows: closingRows,
    });
  }
  return sheets;
}
