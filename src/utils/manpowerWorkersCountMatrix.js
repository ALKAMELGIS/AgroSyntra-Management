import {
  FIELD_ACTIVITIES,
  GENERAL_ACTIVITIES,
  WORKERS_COUNT_BLANK_CROP,
  WORKERS_COUNT_FIELD_CROPS,
} from './manpowerDetailPivotConstants';

/** ISO YYYY-MM-DD → Excel serial (1900 system). */
export function isoDateToExcelSerial(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const utc = Date.UTC(y, m - 1, d);
  const epoch = Date.UTC(1899, 11, 30);
  return Math.floor((utc - epoch) / 86400000);
}

function cellKey(date, crop, activity) {
  return `${date}|${crop}|${activity}`;
}

function buildLookup(cells) {
  const map = new Map();
  for (const c of cells) {
    map.set(cellKey(c.date, c.crop, c.activity), c);
  }
  return map;
}

function getCounts(lookup, date, crop, activity) {
  const c = lookup.get(cellKey(date, crop, activity));
  return { casual: c?.casual ?? 0, eag: c?.eag ?? 0 };
}

function sumActivities(lookup, date, crop, activities) {
  let casual = 0;
  let eag = 0;
  for (const activity of activities) {
    const v = getCounts(lookup, date, crop, activity);
    casual += v.casual;
    eag += v.eag;
  }
  return { casual, eag };
}

function activitiesForCropSum(crop) {
  if (crop === 'General') return GENERAL_ACTIVITIES;
  if (crop === WORKERS_COUNT_BLANK_CROP) return ['(blank)'];
  return FIELD_ACTIVITIES;
}

/** @returns {{ headerRows: string[][], colMeta: object[], width: number }} */
export function buildWorkersCountColumnLayout() {
  const headerRow1 = ['', 'Column Labels'];
  const headerRow2 = [''];
  const headerRow3 = [''];
  const headerRow4 = ['Row Labels'];
  const colMeta = [];

  for (const crop of WORKERS_COUNT_FIELD_CROPS) {
    headerRow2.push(crop);
    for (let i = 1; i < FIELD_ACTIVITIES.length * 2; i += 1) {
      headerRow2.push('');
    }
    headerRow2.push(`${crop} Sum of Casual Worker`, `${crop} Sum of EAG`);

    for (const activity of FIELD_ACTIVITIES) {
      headerRow3.push(activity, '');
      headerRow4.push('Sum of Casual Worker', 'Sum of EAG');
      colMeta.push({ type: 'cell', crop, activity, field: 'casual' });
      colMeta.push({ type: 'cell', crop, activity, field: 'eag' });
    }
    headerRow3.push('', '');
    headerRow4.push('', '');
    colMeta.push({ type: 'cropSum', crop, field: 'casual' });
    colMeta.push({ type: 'cropSum', crop, field: 'eag' });
  }

  headerRow2.push(
    WORKERS_COUNT_BLANK_CROP,
    '',
    `${WORKERS_COUNT_BLANK_CROP} Sum of Casual Worker`,
    `${WORKERS_COUNT_BLANK_CROP} Sum of EAG`,
  );
  headerRow3.push('(blank)', '', '', '');
  headerRow4.push('Sum of Casual Worker', 'Sum of EAG', '', '');
  colMeta.push({
    type: 'cell',
    crop: WORKERS_COUNT_BLANK_CROP,
    activity: '(blank)',
    field: 'casual',
  });
  colMeta.push({
    type: 'cell',
    crop: WORKERS_COUNT_BLANK_CROP,
    activity: '(blank)',
    field: 'eag',
  });
  colMeta.push({ type: 'cropSum', crop: WORKERS_COUNT_BLANK_CROP, field: 'casual' });
  colMeta.push({ type: 'cropSum', crop: WORKERS_COUNT_BLANK_CROP, field: 'eag' });

  headerRow2.push('General');
  for (let i = 1; i < GENERAL_ACTIVITIES.length * 2; i += 1) {
    headerRow2.push('');
  }
  headerRow2.push('General Sum of Casual Worker', 'General Sum of EAG');

  for (const activity of GENERAL_ACTIVITIES) {
    headerRow3.push(activity, '');
    headerRow4.push('Sum of Casual Worker', 'Sum of EAG');
    colMeta.push({ type: 'cell', crop: 'General', activity, field: 'casual' });
    colMeta.push({ type: 'cell', crop: 'General', activity, field: 'eag' });
  }
  headerRow3.push('', '');
  headerRow4.push('', '');
  colMeta.push({ type: 'cropSum', crop: 'General', field: 'casual' });
  colMeta.push({ type: 'cropSum', crop: 'General', field: 'eag' });

  headerRow2.push('Total Sum of Casual Worker', 'Total Sum of EAG');
  headerRow3.push('', '');
  headerRow4.push('', '');
  colMeta.push({ type: 'grand', field: 'casual' });
  colMeta.push({ type: 'grand', field: 'eag' });

  const width = headerRow4.length;
  for (const hr of [headerRow1, headerRow2, headerRow3]) {
    while (hr.length < width) hr.push('');
  }

  return {
    headerRows: [headerRow1, headerRow2, headerRow3, headerRow4],
    colMeta,
    width,
  };
}

/**
 * Full detail summary sheet matrix (267 columns), matching Copy of workers count.xlsx.
 * @param {object} pivotData - API: { dates, cells }
 * @returns {{ rows: (string|number)[][], width: number }}
 */
export function buildWorkersCountDetailMatrix(pivotData) {
  const { dates = [], cells = [] } = pivotData || {};
  const lookup = buildLookup(cells);
  const { headerRows, colMeta, width } = buildWorkersCountColumnLayout();
  const rows = [...headerRows.map((r) => [...r])];

  for (const date of dates) {
    const row = [isoDateToExcelSerial(date)];
    let grandCasual = 0;
    let grandEag = 0;

    for (const meta of colMeta) {
      if (meta.type === 'cell') {
        const v = getCounts(lookup, date, meta.crop, meta.activity);
        row.push(meta.field === 'eag' ? v.eag : v.casual);
      } else if (meta.type === 'cropSum') {
        const acts = activitiesForCropSum(meta.crop);
        const s = sumActivities(lookup, date, meta.crop, acts);
        if (meta.field === 'eag') {
          row.push(s.eag);
          grandEag += s.eag;
        } else {
          row.push(s.casual);
          grandCasual += s.casual;
        }
      } else if (meta.type === 'grand') {
        row.push(meta.field === 'eag' ? grandEag : grandCasual);
      }
    }
    rows.push(row);
  }

  const grandRow = ['Grand Total'];
  for (let colIdx = 0; colIdx < colMeta.length; colIdx += 1) {
    let sum = 0;
    for (let r = headerRows.length; r < rows.length; r += 1) {
      sum += Number(rows[r][1 + colIdx]) || 0;
    }
    grandRow.push(sum);
  }
  rows.push(grandRow);

  for (const row of rows) {
    while (row.length < width) row.push('');
  }

  return { rows, width };
}

/** @deprecated use buildWorkersCountDetailMatrix */
export function buildDetailSummarySheetRows(pivotData) {
  return buildWorkersCountDetailMatrix(pivotData).rows;
}
