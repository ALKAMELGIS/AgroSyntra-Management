/**
 * Branded Excel export for the Manpower Cost page: approved hours × rate per hour.
 * Pure: takes the /manpower-cost/detail and /manpower-cost/summary responses.
 */
import { asExportNumber, formatExportDate } from './excelSheetName';

const CATEGORY_LABELS = { Casual: 'Casual', Permanent: 'Permanent (EAG)' };
const SOURCE_LABELS = { group: 'Group', personal: 'Personal' };

function category(value) {
  return CATEGORY_LABELS[value] || value || '';
}

function money(value) {
  return value == null ? '' : asExportNumber(Number(value).toFixed(2));
}

function hours(value) {
  return value == null ? '' : asExportNumber(Number(Number(value).toFixed(2)));
}

function buildSummaryRows({ summary, period, siteName }) {
  const totals = summary?.totals || {};
  return [
    { Item: 'Period', Value: `${formatExportDate(period?.startDate)} – ${formatExportDate(period?.endDate)}` },
    { Item: 'Site', Value: siteName || 'All sites' },
    { Item: 'Total cost (AED)', Value: money(totals.cost ?? 0) },
    { Item: 'Approved hours', Value: hours(totals.hours ?? 0) },
    { Item: 'Hours with no rate (not in the total)', Value: hours(totals.missingRateHours ?? 0) },
    { Item: 'Workers', Value: asExportNumber(totals.workers ?? 0) },
    { Item: 'Note', Value: 'Only approved hours count. Pending and rejected days are left out.' },
  ];
}

export function buildManpowerCostLineRows(detail) {
  const lines = detail?.lines || [];
  if (lines.length === 0) return [];
  const rows = lines.map((l) => ({
    'Employee ID': l.employeeId || '',
    Worker: l.workerName || '',
    Category: category(l.category),
    Site: l.siteName || '',
    From: formatExportDate(l.firstDate),
    To: formatExportDate(l.lastDate),
    Hours: hours(l.hours),
    'Rate / hr (AED)': l.rate == null ? '' : money(l.rate),
    'Rate from': SOURCE_LABELS[l.rateSource] || 'No rate',
    'Cost (AED)': l.rateSource == null ? '' : money(l.cost),
  }));
  const totals = detail?.totals || {};
  rows.push({
    'Employee ID': 'Total',
    Worker: '',
    Category: '',
    Site: '',
    From: '',
    To: '',
    Hours: hours(totals.hours ?? 0),
    'Rate / hr (AED)': '',
    'Rate from': '',
    'Cost (AED)': money(totals.cost ?? 0),
  });
  return rows;
}

function bucketRows(buckets, labelHeader, labelFor) {
  return (buckets || []).map((b) => ({
    [labelHeader]: labelFor(b),
    Hours: hours(b.hours),
    'Cost (AED)': money(b.cost),
  }));
}

function offGroupRows(workers) {
  return (workers || []).map((w) => ({
    'Employee ID': w.employeeId || '',
    Worker: w.workerName || '',
    Category: category(w.category),
    Site: w.siteName || '',
    'Personal rate (AED)': (w.personalRates || []).map((r) => Number(r).toFixed(2)).join(' / '),
    'Group rate (AED)': money(w.groupRate),
    Hours: hours(w.hours),
    'Cost (AED)': money(w.cost),
    'Difference vs group (AED)': money(w.differenceVsGroup),
  }));
}

function missingRateRows(workers) {
  return (workers || []).map((w) => ({
    'Employee ID': w.employeeId || '',
    Worker: w.workerName || '',
    Category: category(w.category),
    Site: w.siteName || '',
    'Hours with no rate': hours(w.hours),
    From: formatExportDate(w.firstDate),
    To: formatExportDate(w.lastDate),
  }));
}

/** Sheets for downloadCompanyExcel({ sheets }); sheets with no rows are skipped by the writer. */
export function buildManpowerCostSheets({ detail, summary, period, siteName } = {}) {
  return [
    { sheetName: 'Summary', rows: buildSummaryRows({ summary, period, siteName }) },
    { sheetName: 'Cost', rows: buildManpowerCostLineRows(detail), freezeCols: 2 },
    {
      sheetName: 'Casual vs Permanent',
      rows: bucketRows(summary?.byCategory, 'Category', (b) => category(b.key || b.label)),
    },
    {
      sheetName: 'By activity',
      rows: bucketRows(summary?.byActivity, 'Activity', (b) => b.label || 'Unassigned'),
    },
    {
      sheetName: 'By site',
      rows: bucketRows(summary?.bySite, 'Site', (b) => b.label || 'No site'),
    },
    { sheetName: 'Not on group rate', rows: offGroupRows(summary?.offGroupRate), freezeCols: 2 },
    { sheetName: 'Missing rate', rows: missingRateRows(summary?.missingRate), freezeCols: 2 },
  ].filter((s) => s.rows.length > 0);
}

/** True when the period has approved hours to export. */
export function hasManpowerCostData(detail) {
  return (detail?.lines || []).length > 0;
}
