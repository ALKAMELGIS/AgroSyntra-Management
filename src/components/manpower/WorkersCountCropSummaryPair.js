import { useMemo } from 'react';
import {
  Alert,
  Box,
  Paper,
  TableContainer,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  buildWorkersCountCropSummaryPair,
  pivotHasRecordsOnDate,
} from '../../utils/manpowerWorkersCountSummaryGrid';

const CELL_FONT = 'var(--font-sans, Inter, "IBM Plex Sans Arabic", system-ui, sans-serif)';

function numCell(val) {
  if (val === '' || val === null || val === undefined) return '';
  return val;
}

function CropSummaryPanel({ panel, maxHeight }) {
  return (
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Box
        sx={{
          bgcolor: 'warning.light',
          border: '1px solid',
          borderColor: 'divider',
          borderBottom: 0,
          px: 1.5,
          py: 0.75,
          textAlign: 'center',
          fontWeight: 700,
          fontFamily: CELL_FONT,
          fontSize: 13,
        }}
      >
        {panel.title}
      </Box>
      <TableContainer
        sx={{
          maxHeight,
          overflow: 'auto',
          WebkitOverflowScrolling: 'touch',
          border: '1px solid',
          borderColor: 'divider',
        }}
      >
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
              {panel.headers.map((h, i) => (
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
                    minWidth: i === 0 ? 120 : 64,
                  }}
                >
                  {h}
                </Box>
              ))}
            </tr>
          </thead>
          <tbody>
            {panel.rows.map((row) => (
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
                <Box component="td" sx={{ textAlign: 'right' }}>{numCell(row.eag)}</Box>
                <Box component="td" sx={{ textAlign: 'right' }}>{numCell(row.casual)}</Box>
                <Box component="td" sx={{ textAlign: 'right' }}>{numCell(row.budget)}</Box>
                <Box component="td" sx={{ textAlign: 'right' }}>{numCell(row.difference)}</Box>
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
                {panel.footer.label}
              </Box>
              <Box
                component="td"
                sx={{
                  textAlign: 'right',
                  fontWeight: 700,
                  bgcolor: 'warning.main',
                  color: 'warning.contrastText',
                }}
              >
                {panel.footer.eag}
              </Box>
              <Box
                component="td"
                sx={{
                  textAlign: 'right',
                  fontWeight: 700,
                  bgcolor: 'warning.main',
                  color: 'warning.contrastText',
                }}
              >
                {panel.footer.casual}
              </Box>
              <Box
                component="td"
                sx={{ bgcolor: 'warning.main', color: 'warning.contrastText' }}
              />
              <Box
                component="td"
                sx={{ bgcolor: 'warning.main', color: 'warning.contrastText' }}
              />
            </tr>
          </tbody>
        </Box>
      </TableContainer>
    </Box>
  );
}

export default function WorkersCountCropSummaryPair({
  pivotData,
  dailyReportDate,
  tillStartDate,
  tillEndDate,
  groupBy,
  rowOrder,
  maxHeight,
}) {
  const theme = useTheme();
  const stack = useMediaQuery(theme.breakpoints.down('md'));

  const pair = useMemo(() => {
    if (!pivotData || !dailyReportDate || !tillStartDate || !tillEndDate) return null;
    return buildWorkersCountCropSummaryPair(pivotData, {
      dailyReportDate,
      tillStartDate,
      tillEndDate,
      groupBy,
      rowOrder,
    });
  }, [pivotData, dailyReportDate, tillStartDate, tillEndDate, groupBy, rowOrder]);

  if (!pair) return null;

  const noDailyRecords = !pivotHasRecordsOnDate(pivotData, dailyReportDate);

  return (
    <Paper variant="outlined" sx={{ overflow: 'hidden', mt: 2, p: { xs: 1, sm: 1.5 } }}>
      <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 600 }}>
        Daily &amp; till date summary
      </Typography>
      {noDailyRecords && (
        <Alert severity="warning" sx={{ mb: 1.5 }}>
          No manpower records on the daily report date in this range. Widen From/To, pick another
          day, or click Refresh after new entries are saved.
        </Alert>
      )}
      <Box
        sx={{
          display: 'flex',
          flexDirection: stack ? 'column' : 'row',
          gap: 2,
          alignItems: 'flex-start',
        }}
      >
        <CropSummaryPanel panel={pair.daily} maxHeight={maxHeight} />
        <CropSummaryPanel panel={pair.till} maxHeight={maxHeight} />
      </Box>
    </Paper>
  );
}
