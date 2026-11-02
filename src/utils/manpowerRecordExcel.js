import { apiRequestWithMeta } from './api';
import { MAX_ACTIVITY_BLOCKS } from './manpowerDailyExcel';

export const MANPOWER_RECORDS_PAGE_SIZE = 100;

function pad2(n) {
  return String(n).padStart(2, '0');
}

export function toExportYmd(value) {
  if (value == null || value === '') return '';
  const match = String(value).match(/(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getUTCFullYear()}-${pad2(value.getUTCMonth() + 1)}-${pad2(value.getUTCDate())}`;
  }
  return '';
}

function toHm(value) {
  if (value == null || value === '') return '';
  const match = String(value).match(/(\d{1,2}):(\d{2})/);
  if (!match) return '';
  return `${pad2(Number(match[1]))}:${match[2]}`;
}

function toNumberOrEmpty(value) {
  if (value == null || value === '') return '';
  const n = Number(value);
  return Number.isFinite(n) ? n : '';
}

export function manpowerRecordExportHeaders() {
  const headers = ['Date', 'ID', 'Employee Name', 'Employee Category'];
  for (let i = 1; i <= MAX_ACTIVITY_BLOCKS; i += 1) {
    headers.push(
      `Activity ${i}`,
      `Unit ${i}`,
      `Crop ${i}`,
      `Location ${i}`,
      `Section ${i}`,
      `Start time ${i}`,
      `End time ${i}`,
      `Target ${i}`,
      `Work done Qty ${i}`,
      `Work Hours ${i}`,
    );
  }
  headers.push('Total Hours');
  return headers;
}

export function buildManpowerRecordExportRows(groups) {
  const headers = manpowerRecordExportHeaders();
  return (groups || []).map((g) => {
    const row = {};
    headers.forEach((header) => {
      row[header] = '';
    });
    row.Date = toExportYmd(g.date);
    row.ID = g.employeeId ?? '';
    row['Employee Name'] = g.workerName ?? '';
    row['Employee Category'] = g.workerCategory ?? '';
    for (let i = 0; i < MAX_ACTIVITY_BLOCKS; i += 1) {
      const n = i + 1;
      const t = g.tasks?.[i];
      if (!t) continue;
      row[`Activity ${n}`] = t.activity ?? '';
      row[`Unit ${n}`] = t.unit ?? '';
      row[`Crop ${n}`] = t.variety ?? '';
      row[`Location ${n}`] = t.location ?? '';
      row[`Section ${n}`] = t.section ?? '';
      row[`Start time ${n}`] = toHm(t.start_time);
      row[`End time ${n}`] = toHm(t.end_time);
      row[`Target ${n}`] = toNumberOrEmpty(t.target);
      row[`Work done Qty ${n}`] = toNumberOrEmpty(t.actual);
      row[`Work Hours ${n}`] = toNumberOrEmpty(t.work_hours);
    }
    const total = toNumberOrEmpty(g.totalHours);
    row['Total Hours'] = total === '' ? 0 : total;
    return row;
  });
}

export async function fetchAllManpowerRecords(filters = {}, requestWithMeta = apiRequestWithMeta) {
  const all = [];
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;
  const maxOffset = MANPOWER_RECORDS_PAGE_SIZE * 500;

  while (offset < total && offset <= maxOffset) {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value == null || value === '') return;
      params.set(key, String(value));
    });
    params.set('limit', String(MANPOWER_RECORDS_PAGE_SIZE));
    params.set('offset', String(offset));
    const result = await requestWithMeta(`/manpower/records?${params.toString()}`);
    const page = result?.data || [];
    all.push(...page);
    const metaTotal = Number(result?.meta?.total);
    if (Number.isFinite(metaTotal)) {
      total = metaTotal;
    } else if (page.length < MANPOWER_RECORDS_PAGE_SIZE) {
      total = offset + page.length;
    }
    if (page.length < MANPOWER_RECORDS_PAGE_SIZE) break;
    offset += MANPOWER_RECORDS_PAGE_SIZE;
  }

  return all;
}
