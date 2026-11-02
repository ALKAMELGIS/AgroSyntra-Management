import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { apiRequest } from './api';
import { fetchOrganizationLogoBlob } from './organizationLogo';

export const DEFAULT_ORG_NAME = 'ELITE AGRO UAE LLC';

export const OPS_EXPORT = {
  harvest: { title: 'HARVEST RECORD', docRef: 'EAG/AFO/IMS/RC-111', sheetName: 'Harvest' },
  fertigation: { title: 'FERTIGATION RECORD', docRef: 'EAG/AFO/IMS/RC-132', sheetName: 'Fertigation' },
  ecph: { title: 'EC / pH RECORD', docRef: '', sheetName: 'EC pH' },
  pest: { title: 'PPP APPLICATION RECORD', docRef: 'EAG/AFO/IMS/RC-109', sheetName: 'Application Records' },
  costing: { title: 'IPM COSTING REPORT', docRef: '', sheetName: 'Cost Details' },
  manpower: { title: 'MANPOWER RECORD', docRef: '', sheetName: 'Record', freezeCols: 4 },
  manpowerCost: { title: 'MANPOWER COST REPORT', docRef: '', sheetName: 'Cost', freezeCols: 2 },
  bio: { title: 'BIOLOGICAL CONTROL RECORD', docRef: '', sheetName: 'Entry' },
  irrigationDrip: { title: 'IRRIGATION RECORD', docRef: 'EAG/AFO/IMS/RC-108', sheetName: 'Drip', freezeCols: 6 },
  cropRotation: { title: 'CROP ROTATION', docRef: '', sheetName: 'History' },
  planting: { title: 'PLANTING AND TRANSPLANT RECORD', docRef: '', sheetName: 'Planting' },
  germination: { title: 'GERMINATION RECORD', docRef: '', sheetName: 'Germination' },
  nurserySowing: { title: 'SOWING RECORD — NURSERY', docRef: 'RC-241', sheetName: 'Sowing' },
  plantation: { title: 'PLANTATION OPENING / CLOSING', docRef: '', sheetName: 'Opening' },
  pumpElectricity: { title: 'ELECTRICITY USAGE RECORD', docRef: 'EAG/AFO/IMS/RC-109', sheetName: 'Electricity' },
  pumpWater: { title: 'WATER USAGE RECORD', docRef: 'EAG/OPR/IMS/RC-129', sheetName: 'Water' },
  pumpFogger: { title: 'FOGGER USAGE RECORD', docRef: 'EAG/OPR/IMS/RC-129', sheetName: 'Fogger' },
  scoutingSummary: { title: 'SCOUTING SUMMARY', docRef: '', sheetName: 'Summary' },
  bumbleBees: { title: 'BUMBLE BEE RECORD', docRef: '', sheetName: 'Summary' },
};

const HEADER_GREEN = 'FF1B5E20';
const BORDER_GRAY = 'FFC8C8C8';
const META_GRAY = 'FF555555';
const WHITE = 'FFFFFFFF';

const thinBorder = { style: 'thin', color: { argb: BORDER_GRAY } };
const cellBorder = {
  top: thinBorder,
  left: thinBorder,
  bottom: thinBorder,
  right: thinBorder,
};

function formatDdMmYyyy(d) {
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${dt.getFullYear()}`;
}

function formatCellValue(header, value) {
  if (value == null || value === '') return '';
  if (/^date$/i.test(String(header))) {
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  }
  return value;
}

function isGradeHeader(header) {
  return /^grade$/i.test(String(header));
}

function isNumericHeader(header) {
  return /qty|quantity|kg|m³|m3|m²|m2|volume|rate|amount|total|cost|yield|ec\b|ph\b|%|frequency|week number|valves|water|ml\b/i.test(
    String(header),
  );
}

function mimeToExt(mime) {
  if (mime === 'image/jpeg' || mime === 'image/jpg') return 'jpeg';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/gif') return 'gif';
  return 'png';
}

function toBase64(data) {
  if (!data) return '';
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer && Buffer.isBuffer(data)) {
    return data.toString('base64');
  }
  const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  if (typeof btoa === 'function') return btoa(binary);
  return Buffer.from(binary, 'binary').toString('base64');
}

function withXlsx(filename) {
  const base = String(filename || 'export').replace(/\.xlsx$/i, '');
  return `${base}.xlsx`;
}

export async function fetchOrgExportBranding() {
  let organizationName = DEFAULT_ORG_NAME;
  try {
    const org = await apiRequest('/organization');
    if (org?.name) organizationName = org.name;
  } catch {
    // Fall back to the default letterhead name
  }
  let logo = null;
  try {
    const blob = await fetchOrganizationLogoBlob();
    if (blob) {
      logo = { buffer: await blob.arrayBuffer(), mimeType: blob.type || 'image/png' };
    }
  } catch {
    logo = null;
  }
  return { organizationName, logo };
}

function addCompanySheet(workbook, rows, opts) {
  const {
    sheetName = 'Sheet1',
    title = '',
    docRef = '',
    organizationName = DEFAULT_ORG_NAME,
    siteName = '',
    exportedBy = '',
    exportedAt = new Date(),
    imageId = null,
    freezeCols = 0,
  } = opts;

  const headers = rows.length ? Object.keys(rows[0]) : [];
  const dataCols = Math.max(headers.length, 1);
  const colCount = Math.max(dataCols, 7);
  const frozenCols = Number(freezeCols) > 0 ? Number(freezeCols) : 0;
  const view = { state: 'frozen', ySplit: 5, activeCell: frozenCols ? 'E6' : 'A6' };
  if (frozenCols) view.xSplit = frozenCols;

  const sheet = workbook.addWorksheet(sheetName, {
    views: [view],
  });

  sheet.getColumn(1).width = 12;
  for (let c = 2; c <= colCount; c += 1) {
    const header = headers[c - 1] || '';
    sheet.getColumn(c).width = Math.min(28, Math.max(12, header.length + 4));
  }

  sheet.mergeCells(1, 1, 3, 1);
  [1, 2, 3].forEach((r) => {
    sheet.getRow(r).height = 28;
  });
  sheet.getRow(4).height = 8;
  sheet.getRow(5).height = 22;

  const titleEndCol = docRef ? Math.max(2, colCount - 1) : colCount;
  if (titleEndCol > 2) sheet.mergeCells(1, 2, 1, titleEndCol);
  if (colCount > 2) {
    sheet.mergeCells(2, 2, 2, colCount);
    sheet.mergeCells(3, 2, 3, colCount);
  }

  const companyCell = sheet.getCell(1, 2);
  companyCell.value = organizationName;
  companyCell.font = { name: 'Calibri', bold: true, size: 16, color: { argb: HEADER_GREEN } };
  companyCell.alignment = { vertical: 'middle', horizontal: 'left' };

  if (docRef) {
    const refCell = sheet.getCell(1, colCount);
    refCell.value = docRef;
    refCell.font = { name: 'Calibri', size: 9, color: { argb: META_GRAY } };
    refCell.alignment = { vertical: 'middle', horizontal: 'right' };
  }

  const titleCell = sheet.getCell(2, 2);
  titleCell.value = title;
  titleCell.font = { name: 'Calibri', bold: true, size: 12, color: { argb: 'FF000000' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left' };

  const metaParts = [];
  if (siteName) metaParts.push(`Site: ${siteName}`);
  if (exportedBy) metaParts.push(`Exported by: ${exportedBy}`);
  metaParts.push(`Exported: ${formatDdMmYyyy(exportedAt)}`);
  const metaCell = sheet.getCell(3, 2);
  metaCell.value = metaParts.join(' · ');
  metaCell.font = { name: 'Calibri', size: 10, color: { argb: META_GRAY } };
  metaCell.alignment = { vertical: 'middle', horizontal: 'left' };

  if (imageId != null) {
    sheet.addImage(imageId, {
      tl: { col: 0, row: 0 },
      ext: { width: 80, height: 80 },
      editAs: 'oneCell',
    });
  }

  headers.forEach((header, i) => {
    const cell = sheet.getCell(5, i + 1);
    cell.value = header;
    cell.font = { name: 'Calibri', bold: true, size: 11, color: { argb: WHITE } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_GREEN } };
    cell.border = cellBorder;
    cell.alignment = {
      vertical: 'middle',
      horizontal: isGradeHeader(header) ? 'center' : 'left',
    };
  });

  rows.forEach((row, rowIdx) => {
    const excelRow = 6 + rowIdx;
    headers.forEach((header, colIdx) => {
      const cell = sheet.getCell(excelRow, colIdx + 1);
      cell.value = formatCellValue(header, row[header]);
      cell.font = { name: 'Calibri', size: 11 };
      cell.border = cellBorder;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: WHITE } };
      if (isGradeHeader(header)) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      } else if (typeof row[header] === 'number' || isNumericHeader(header)) {
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
      } else {
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
      }
    });
  });
}

function logoImageId(workbook, logo) {
  if (!logo?.buffer) return null;
  return workbook.addImage({
    base64: toBase64(logo.buffer),
    extension: mimeToExt(logo.mimeType),
  });
}

/**
 * One workbook, several letterhead sheets. Empty sheet defs are skipped.
 */
export async function buildCompanyWorkbookFromSheets(sheets, opts = {}) {
  const workbook = new ExcelJS.Workbook();
  const imageId = logoImageId(workbook, opts.logo);
  const nonempty = (sheets || []).filter((s) => (s.rows || []).length > 0);
  const toWrite = nonempty.length
    ? nonempty
    : [{ sheetName: opts.sheetName || 'Sheet1', rows: [] }];
  toWrite.forEach((s) => {
    addCompanySheet(workbook, s.rows || [], {
      ...opts,
      sheetName: s.sheetName || opts.sheetName || 'Sheet1',
      title: s.title || opts.title,
      freezeCols: s.freezeCols != null ? s.freezeCols : opts.freezeCols,
      imageId,
    });
  });
  return workbook;
}

/**
 * Build a letterhead workbook matching the harvest/ops Excel mockup.
 * Column A rows 1–3 are reserved for the logo; titles start at B.
 */
export async function buildCompanyWorkbook(rows, opts = {}) {
  return buildCompanyWorkbookFromSheets(
    [{ sheetName: opts.sheetName || 'Sheet1', rows: rows || [] }],
    opts,
  );
}

export async function downloadCompanyExcel(rows, opts = {}) {
  const branding = await fetchOrgExportBranding();
  const shared = {
    ...opts,
    organizationName: opts.organizationName || branding.organizationName,
    logo: opts.logo !== undefined ? opts.logo : branding.logo,
  };
  const workbook = opts.sheets
    ? await buildCompanyWorkbookFromSheets(opts.sheets, shared)
    : await buildCompanyWorkbook(rows, shared);
  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    withXlsx(opts.filename),
  );
}
