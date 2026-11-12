import {
  Table, TableHead, TableRow, TableCell, TableBody, TextField, Tooltip,
  IconButton, FormControl, Select, MenuItem, Box, Typography,
} from '@mui/material';
import { AddOutlined as AddIcon, DeleteOutlineOutlined as DeleteIcon } from '@mui/icons-material';
import { COUNT_BASIS_OPTIONS, SCOUTING_SAMPLE_INDICES } from '../utils/scoutingObsRows';
import { pestGroupKey, formatInfestationPct } from '../utils/scoutingInfestation';

/**
 * Insect or disease count table with Segment + count basis (method) columns.
 */
export default function ScoutingObservationTable({
  title,
  subtitle,
  chipLabel,
  rows,
  totals,
  segmentOptions,
  showInfestation = false,
  infestationByPest = {},
  onUpdateRow,
  onAddRow,
  onRemoveRow,
}) {
  const hasSegments = segmentOptions.length > 0;

  return (
    <>
      <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700 }}>
        {title}
        {chipLabel && (
          <Typography component="span" variant="caption" sx={{ ml: 1, fontWeight: 400 }}>
            ({chipLabel})
          </Typography>
        )}
      </Typography>
      {subtitle && (
        <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
          {subtitle}
        </Typography>
      )}
      <Box sx={{ overflowX: 'auto' }}>
      <Table size="small" sx={{ minWidth: showInfestation ? 1200 : 1140 }}>
        <TableHead>
          <TableRow sx={{ bgcolor: 'action.hover' }}>
            <TableCell sx={{ minWidth: 200 }}>Pest / disease</TableCell>
            <TableCell sx={{ minWidth: 110 }}>Segment</TableCell>
            <TableCell sx={{ minWidth: 110 }}>Count basis</TableCell>
            {SCOUTING_SAMPLE_INDICES.map((n) => (
              <TableCell key={n} align="center" sx={{ minWidth: 64 }}>
                <Tooltip title={`Sample point ${n} within this segment`}>
                  <span>Sample {n}</span>
                </Tooltip>
              </TableCell>
            ))}
            <TableCell align="center" sx={{ minWidth: 56 }}>Total</TableCell>
            <TableCell align="center" sx={{ minWidth: 56 }}>Avg</TableCell>
            {showInfestation && (
              <TableCell align="center" sx={{ minWidth: 72 }}>
                <Tooltip title="(plant count × sum of segment averages) ÷ sampling units" describeChild>
                  <span>Infestation %</span>
                </Tooltip>
              </TableCell>
            )}
            <TableCell align="center" sx={{ width: 72 }} />
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row, idx) => {
            const t = totals[idx] || {};
            const showPestLabel = idx === 0 || rows[idx - 1]?.abbr !== row.abbr;
            return (
              <TableRow key={row.rowId}>
                <TableCell sx={{ whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                  {showPestLabel ? (
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
                      <Typography variant="body2" sx={{ flex: 1 }}>{row.label}</Typography>
                      <Tooltip title="Add another row for this pest (different segment)">
                        <IconButton size="small" onClick={() => onAddRow(idx)} aria-label="Add row">
                          <AddIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  ) : (
                    <Typography variant="caption" color="text.secondary" sx={{ pl: 1 }}>
                      (same pest)
                    </Typography>
                  )}
                </TableCell>
                <TableCell sx={{ verticalAlign: 'top' }}>
                  <FormControl fullWidth size="small" variant="standard">
                    <Select
                      displayEmpty
                      value={row.samplingUnit || ''}
                      onChange={(e) => onUpdateRow(idx, { samplingUnit: e.target.value })}
                      disabled={!hasSegments}
                      inputProps={{ 'aria-label': `${row.label} segment` }}
                    >
                      <MenuItem value="">
                        <em>{hasSegments ? 'Select…' : 'Select bays/valves above'}</em>
                      </MenuItem>
                      {segmentOptions.map((seg) => (
                        <MenuItem key={seg} value={seg}>{seg}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </TableCell>
                <TableCell sx={{ verticalAlign: 'top' }}>
                  <FormControl fullWidth size="small" variant="standard">
                    <Select
                      value={row.samplingMethod || 'plant'}
                      onChange={(e) => onUpdateRow(idx, { samplingMethod: e.target.value })}
                      inputProps={{ 'aria-label': `${row.label} count basis` }}
                    >
                      {COUNT_BASIS_OPTIONS.map((m) => (
                        <MenuItem key={m} value={m}>{m}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </TableCell>
                {SCOUTING_SAMPLE_INDICES.map((n) => (
                  <TableCell key={n} align="center" sx={{ p: 0.5, verticalAlign: 'top' }}>
                    <TextField
                      size="small"
                      variant="standard"
                      type="number"
                      value={row[`count${n}`]}
                      onChange={(e) => onUpdateRow(idx, { [`count${n}`]: e.target.value })}
                      inputProps={{ style: { textAlign: 'center', width: 52 }, 'aria-label': `${row.label} sample ${n}`, inputMode: 'numeric', min: 0 }}
                    />
                  </TableCell>
                ))}
                <TableCell align="center" sx={{ fontWeight: 600, verticalAlign: 'top' }}>
                  {t.avg !== null ? t.total : '—'}
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 600, verticalAlign: 'top' }}>
                  {t.avg !== null ? t.avg.toFixed(2) : '—'}
                </TableCell>
                {showInfestation && (
                  <TableCell align="center" sx={{ fontWeight: 600, verticalAlign: 'top' }}>
                    {showPestLabel
                      ? formatInfestationPct(infestationByPest[pestGroupKey(row)])
                      : ''}
                  </TableCell>
                )}
                <TableCell align="center" sx={{ verticalAlign: 'top' }}>
                  {!row.isBase && (
                    <Tooltip title="Remove this row">
                      <IconButton size="small" onClick={() => onRemoveRow(idx)} color="error" aria-label={`Remove ${row.label} row`}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      </Box>
    </>
  );
}
