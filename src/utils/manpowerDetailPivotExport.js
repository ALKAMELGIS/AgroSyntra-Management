import * as XLSX from 'xlsx-js-style';
import {
  buildAllSummaryGrids,
  buildWorkersCountCropSummaryPair,
  cropSummaryPairToAoa,
  summaryGridToAoa,
} from './manpowerWorkersCountSummaryGrid';
import { buildWorkHoursSummaryGrid } from './manpowerWorkHoursGrid';
import { resolvePivotActivityColumns } from './manpowerPivotActivities';
import { getManpowerExportColors, applySheetHeaderStyles } from './manpowerExportTheme';

export { isoDateToExcelSerial } from './manpowerWorkersCountMatrix';

function styleWorksheet(ws, colors) {
  if (!ws?.['!ref']) return;
  const range = XLSX.utils.decode_range(ws['!ref']);
  for (let r = range.s.r; r <= range.e.r; r += 1) {
    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const ref = XLSX.utils.encode_cell({ r, c });
      const cell = ws[ref];
      if (!cell) continue;
      const isHeaderRow = r === 0;
      cell.s = {
        fill: isHeaderRow
          ? { fgColor: { rgb: c === 0 ? colors.rowHeaderFill : colors.activityHeaderFill } }
          : undefined,
        font: isHeaderRow ? colors.headerFont : undefined,
        border: colors.bodyBorder,
      };
    }
  }
}

function appendStyledSheet(wb, aoa, sheetName, colors) {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  styleWorksheet(ws, colors);
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
}

/** @deprecated legacy wide pivot */
export function buildDetailSummarySheetRows(pivotData) {
  const grids = buildAllSummaryGrids(pivotData);
  return summaryGridToAoa(grids[0]);
}

export function downloadDetailSummaryWorkbook(
  pivotData,
  filename = 'workers-count.xlsx',
  cropSummaryOpts = null,
  theme = null,
) {
  const colors = getManpowerExportColors(theme);
  const gridOpts = {
    startDate: cropSummaryOpts?.tillStartDate,
    endDate: cropSummaryOpts?.tillEndDate,
    groupBy: cropSummaryOpts?.groupBy ?? 'crop',
    rowOrder: cropSummaryOpts?.rowOrder ?? [],
  };
  const grids = buildAllSummaryGrids(pivotData, gridOpts);
  const wb = XLSX.utils.book_new();
  for (const grid of grids) {
    appendStyledSheet(wb, summaryGridToAoa(grid), grid.title, colors);
  }
  if (cropSummaryOpts?.dailyReportDate) {
    const pair = buildWorkersCountCropSummaryPair(pivotData, cropSummaryOpts);
    appendStyledSheet(wb, cropSummaryPairToAoa(pair), 'Summary', colors);
  }
  XLSX.writeFile(wb, filename);
}

export function downloadWorkHoursWorkbook(
  pivotData,
  filename = 'work-hours.xlsx',
  opts = {},
  theme = null,
) {
  const colors = getManpowerExportColors(theme);
  const wb = XLSX.utils.book_new();
  const activityKeys = resolvePivotActivityColumns(pivotData).map((a) => a.key);
  const gridOpts = {
    groupBy: opts.groupBy ?? 'crop',
    rowOrder: opts.rowOrder ?? [],
    activityKeys: activityKeys.length ? activityKeys : undefined,
  };

  for (const { metric, title } of [
    { metric: 'eag', title: 'EAG' },
    { metric: 'casual', title: 'Casual' },
    { metric: 'total', title: 'Total' },
  ]) {
    const grid = buildWorkHoursSummaryGrid(pivotData, metric, gridOpts);
    const aoa = [
      grid.headers,
      ...grid.rows.map((row) => [
        row.rowKey,
        ...row.workers.flatMap((w, i) => [w, row.hours[i]]),
        row.rowTotalW,
        row.rowTotalH,
      ]),
      ['Total', ...grid.footer.workers.flatMap((w, i) => [w, grid.footer.hours[i]]), grid.footer.rowTotalW, grid.footer.rowTotalH],
    ];
    appendStyledSheet(wb, aoa, title, colors);
  }
  XLSX.writeFile(wb, filename);
}
