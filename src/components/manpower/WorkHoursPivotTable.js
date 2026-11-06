import { useMemo, useState } from 'react';
import { Box, Paper, Tab, TableContainer, Tabs } from '@mui/material';
import {
  buildWorkHoursSummaryGrid,
  WORKERS_COUNT_SUMMARY_METRICS,
} from '../../utils/manpowerWorkHoursGrid';

const CELL_FONT = 'var(--font-sans, Inter, "IBM Plex Sans Arabic", system-ui, sans-serif)';

function HoursSummaryTable({ grid, maxHeight, onCellClick }) {
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
            <Box
              component="th"
              rowSpan={2}
              sx={{
                position: 'sticky',
                top: 0,
                left: 0,
                zIndex: 4,
                bgcolor: 'success.light',
                fontWeight: 700,
                textAlign: 'left',
                minWidth: 140,
              }}
            >
              {grid.headers[0]}
            </Box>
            {grid.activityCols.map((act) => (
              <Box
                component="th"
                key={act.key}
                colSpan={2}
                sx={{
                  position: 'sticky',
                  top: 0,
                  zIndex: 3,
                  bgcolor: 'warning.light',
                  fontWeight: 700,
                  textAlign: 'center',
                }}
              >
                {act.label}
              </Box>
            ))}
            <Box component="th" colSpan={2} sx={{ position: 'sticky', top: 0, zIndex: 3, bgcolor: 'warning.light', fontWeight: 700, textAlign: 'center' }}>
              Total
            </Box>
          </tr>
          <tr>
            {grid.activityCols.flatMap((act) => [
              <Box component="th" key={`${act.key}-w`} sx={{ bgcolor: 'warning.light', fontSize: 11, textAlign: 'center' }}>W</Box>,
              <Box component="th" key={`${act.key}-h`} sx={{ bgcolor: 'warning.light', fontSize: 11, textAlign: 'center' }}>Hrs</Box>,
            ])}
            <Box component="th" sx={{ bgcolor: 'warning.light', fontSize: 11, textAlign: 'center' }}>W</Box>
            <Box component="th" sx={{ bgcolor: 'warning.light', fontSize: 11, textAlign: 'center' }}>Hrs</Box>
          </tr>
        </thead>
        <tbody>
          {grid.rows.map((row) => (
            <tr key={row.rowKey}>
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
                {row.rowKey}
              </Box>
              {grid.activityCols.map((act, i) => (
                <Box key={`${row.rowKey}-${act.key}`} component="td" colSpan={2} sx={{ p: 0 }}>
                  <Box sx={{ display: 'flex' }}>
                    <Box
                      component="span"
                      onClick={() => onCellClick?.({ rowKey: row.rowKey, activity: act.key, activityLabel: act.label })}
                      sx={{
                        flex: 1,
                        textAlign: 'right',
                        px: 1,
                        py: 0.5,
                        borderRight: '1px solid',
                        borderColor: 'divider',
                        cursor: onCellClick ? 'pointer' : 'default',
                        '&:hover': onCellClick ? { bgcolor: 'action.hover' } : undefined,
                      }}
                    >
                      {row.workers[i]}
                    </Box>
                    <Box
                      component="span"
                      onClick={() => onCellClick?.({ rowKey: row.rowKey, activity: act.key, activityLabel: act.label })}
                      sx={{
                        flex: 1,
                        textAlign: 'right',
                        px: 1,
                        py: 0.5,
                        cursor: onCellClick ? 'pointer' : 'default',
                        '&:hover': onCellClick ? { bgcolor: 'action.hover' } : undefined,
                      }}
                    >
                      {row.hours[i]}
                    </Box>
                  </Box>
                </Box>
              ))}
              <Box component="td" sx={{ textAlign: 'right', fontWeight: 600 }}>{row.rowTotalW}</Box>
              <Box component="td" sx={{ textAlign: 'right', fontWeight: 600 }}>{row.rowTotalH}</Box>
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
            {grid.activityCols.flatMap((act, i) => [
              <Box key={`f-${act.key}-w`} component="td" sx={{ textAlign: 'right', fontWeight: 700, bgcolor: 'warning.main', color: 'warning.contrastText' }}>{grid.footer.workers[i]}</Box>,
              <Box key={`f-${act.key}-h`} component="td" sx={{ textAlign: 'right', fontWeight: 700, bgcolor: 'warning.main', color: 'warning.contrastText' }}>{grid.footer.hours[i]}</Box>,
            ])}
            <Box component="td" sx={{ textAlign: 'right', fontWeight: 700, bgcolor: 'warning.main', color: 'warning.contrastText' }}>{grid.footer.rowTotalW}</Box>
            <Box component="td" sx={{ textAlign: 'right', fontWeight: 700, bgcolor: 'warning.main', color: 'warning.contrastText' }}>{grid.footer.rowTotalH}</Box>
          </tr>
        </tbody>
      </Box>
    </TableContainer>
  );
}

export default function WorkHoursPivotTable({
  pivotData,
  groupBy,
  rowOrder,
  activityKeys,
  maxHeight,
  onCellClick,
}) {
  const [metricTab, setMetricTab] = useState(0);
  const metricId = WORKERS_COUNT_SUMMARY_METRICS[metricTab]?.id ?? 'eag';

  const grid = useMemo(
    () => (pivotData
      ? buildWorkHoursSummaryGrid(pivotData, metricId, {
        groupBy,
        rowOrder,
        activityKeys,
      })
      : null),
    [pivotData, metricId, groupBy, rowOrder, activityKeys],
  );

  if (!grid) return null;

  return (
    <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
      <Tabs
        value={metricTab}
        onChange={(_, v) => setMetricTab(v)}
        sx={{ px: 1, borderBottom: 1, borderColor: 'divider', minHeight: 42 }}
      >
        {WORKERS_COUNT_SUMMARY_METRICS.map((m) => (
          <Tab key={m.id} label={m.title} sx={{ minHeight: 42, py: 1 }} />
        ))}
      </Tabs>
      <HoursSummaryTable grid={grid} maxHeight={maxHeight} onCellClick={onCellClick} />
    </Paper>
  );
}
