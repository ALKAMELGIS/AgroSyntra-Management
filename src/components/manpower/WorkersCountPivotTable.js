import { useMemo, useState } from 'react';
import { Alert, Box, Paper, Tab, TableContainer, Tabs } from '@mui/material';
import {
  WORKERS_COUNT_SUMMARY_METRICS,
} from '../../utils/manpowerDetailPivotConstants';
import {
  buildWorkersCountCropSummaryPair,
  buildWorkersCountSummaryGrid,
} from '../../utils/manpowerWorkersCountSummaryGrid';

const CELL_FONT = '"Segoe UI", Calibri, Arial, sans-serif';

function SummaryTable({ grid, maxHeight }) {
  return (
    <TableContainer sx={{ maxHeight, overflow: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <Box
        component="table"
        sx={{
          borderCollapse: 'collapse',
          width: '100%',
          fontFamily: CELL_FONT,
          fontSize: 12,
          '& th, & td': {
            border: '1px solid',
            borderColor: 'divider',
            px: 1,
            py: 0.5,
            whiteSpace: 'nowrap',
          },
        }}
      >
        <thead>
          <tr>
            {grid.headers.map((h, i) => (
              <Box
                component="th"
                key={h}
                sx={{
                  position: 'sticky',
                  top: 0,
                  zIndex: i === 0 ? 3 : 2,
                  left: i === 0 ? 0 : undefined,
                  bgcolor: i === 0 ? 'success.light' : 'warning.light',
                  fontWeight: 700,
                  textAlign: i === 0 ? 'left' : 'center',
                  minWidth: i === 0 ? 140 : 72,
                }}
              >
                {h}
              </Box>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.rows.map((row) => (
            <tr key={row.crop}>
              <Box
                component="td"
                sx={{
                  position: 'sticky',
                  left: 0,
                  zIndex: 1,
                  bgcolor: 'success.light',
                  fontWeight: 600,
                }}
              >
                {row.crop}
              </Box>
              {row.cells.map((val, i) => (
                <Box
                  component="td"
                  key={`${row.crop}-${i}`}
                  sx={{ textAlign: 'right' }}
                >
                  {val}
                </Box>
              ))}
              <Box component="td" sx={{ textAlign: 'right', fontWeight: 600 }}>
                {row.rowTotal}
              </Box>
            </tr>
          ))}
          <tr>
            <Box
              component="td"
              sx={{
                position: 'sticky',
                left: 0,
                zIndex: 1,
                bgcolor: 'warning.main',
                color: 'warning.contrastText',
                fontWeight: 700,
              }}
            >
              {grid.footer.label}
            </Box>
            {grid.footer.cells.map((val, i) => (
              <Box
                component="td"
                key={`foot-${i}`}
                sx={{
                  textAlign: 'right',
                  fontWeight: 700,
                  bgcolor: 'warning.main',
                  color: 'warning.contrastText',
                }}
              >
                {val}
              </Box>
            ))}
            <Box
              component="td"
              sx={{
                textAlign: 'right',
                fontWeight: 700,
                bgcolor: 'warning.main',
                color: 'warning.contrastText',
              }}
            >
              {grid.footer.rowTotal}
            </Box>
          </tr>
        </tbody>
      </Box>
    </TableContainer>
  );
}

export default function WorkersCountPivotTable({
  pivotData,
  tillStartDate,
  tillEndDate,
  groupBy,
  rowOrder,
  maxHeight,
}) {
  const [metricTab, setMetricTab] = useState(0);
  const metricId = WORKERS_COUNT_SUMMARY_METRICS[metricTab]?.id ?? 'eag';

  const grid = useMemo(
    () => (pivotData
      ? buildWorkersCountSummaryGrid(pivotData, metricId, {
        startDate: tillStartDate,
        endDate: tillEndDate,
        groupBy,
        rowOrder,
      })
      : null),
    [pivotData, metricId, tillStartDate, tillEndDate, groupBy, rowOrder],
  );

  const showTillGridMismatch = useMemo(() => {
    if (!pivotData || !tillStartDate || !tillEndDate || !rowOrder.length) {
      return false;
    }
    const pair = buildWorkersCountCropSummaryPair(pivotData, {
      dailyReportDate: tillEndDate,
      tillStartDate,
      tillEndDate,
      groupBy,
      rowOrder,
    });
    const tillTotal = pair.till.footer.eag + pair.till.footer.casual;
    const rangeGrid = buildWorkersCountSummaryGrid(pivotData, 'total', {
      startDate: tillStartDate,
      endDate: tillEndDate,
      groupBy,
      rowOrder,
      debugLog: true,
    });
    // #region agent log
    fetch('http://127.0.0.1:7696/ingest/fe52ce8f-1e39-401c-9d8d-13bdb7e59857',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'f50e55'},body:JSON.stringify({sessionId:'f50e55',runId:'post-fix',hypothesisId:'range-grid',location:'WorkersCountPivotTable.js:showTillGridMismatch',message:'till vs range grid',data:{tillStartDate,tillEndDate,tillTotal,rangeGridTotal:rangeGrid.footer.rowTotal,datesCount:(pivotData.dates||[]).length,cellsCount:(pivotData.cells||[]).length},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    return tillTotal > 0 && rangeGrid.footer.rowTotal === 0;
  }, [pivotData, tillStartDate, tillEndDate, groupBy, rowOrder]);

  if (!grid) return null;

  return (
    <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
      {showTillGridMismatch && (
        <Alert severity="warning" sx={{ m: 1.5, mb: 0 }}>
          Till date ({tillStartDate}–{tillEndDate}) has workers, but the activity grid is empty
          for the same <strong>From</strong>–<strong>To</strong> range.
        </Alert>
      )}
      <Tabs
        value={metricTab}
        onChange={(_, v) => setMetricTab(v)}
        sx={{ px: 1, borderBottom: 1, borderColor: 'divider', minHeight: 42 }}
      >
        {WORKERS_COUNT_SUMMARY_METRICS.map((m) => (
          <Tab key={m.id} label={m.title} sx={{ minHeight: 42, py: 1 }} />
        ))}
      </Tabs>
      <SummaryTable grid={grid} maxHeight={maxHeight} />
    </Paper>
  );
}
