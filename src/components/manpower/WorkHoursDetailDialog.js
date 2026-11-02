import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
  Collapse,
  IconButton,
  Box,
  Typography,
  CircularProgress,
  Alert,
} from '@mui/material';
import { KeyboardArrowDownOutlined as KeyboardArrowDown, KeyboardArrowUpOutlined as KeyboardArrowUp } from '@mui/icons-material';
import { apiRequest } from '../../utils/api';

function DrillRow({ row }) {
  const [open, setOpen] = useState(false);
  const units = row.units || [];
  const hPerUnit = units.length === 1 && row.actual > 0
    ? Math.round((row.hours / row.actual) * 100) / 100
    : null;

  return (
    <>
      <TableRow>
        <TableCell>
          {(row.workers?.length > 0) && (
            <IconButton size="small" onClick={() => setOpen(!open)} aria-label={open ? 'Collapse row' : 'Expand row'}>
              {open ? <KeyboardArrowUp /> : <KeyboardArrowDown />}
            </IconButton>
          )}
          {row.date}
        </TableCell>
        <TableCell>{row.location || '—'}</TableCell>
        <TableCell>{row.section || '—'}</TableCell>
        <TableCell align="right">{row.eagWorkers || ''}</TableCell>
        <TableCell align="right">{row.casualWorkers || ''}</TableCell>
        <TableCell align="right">{row.hours || ''}</TableCell>
        <TableCell align="right">{row.actual || ''}</TableCell>
        <TableCell>{units.length === 1 ? units[0] : (units.length > 1 ? 'Mixed' : '')}</TableCell>
        <TableCell align="right">{hPerUnit ?? ''}</TableCell>
      </TableRow>
      {row.workers?.length > 0 && (
        <TableRow>
          <TableCell colSpan={9} sx={{ py: 0 }}>
            <Collapse in={open}>
              <Box sx={{ py: 1, pl: 4 }}>
                {row.workers.map((w) => (
                  <Typography key={w.employeeId || w.name} variant="body2">
                    {w.name || w.employeeId} ({w.category}) — {w.hours}h
                  </Typography>
                ))}
              </Box>
            </Collapse>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

export default function WorkHoursDetailDialog({
  open,
  onClose,
  startDate,
  endDate,
  siteId,
  crop,
  variety,
  activity,
  activityLabel,
  groupBy,
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!open || !startDate || !endDate || !crop || !activity) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          start_date: startDate,
          end_date: endDate,
          crop,
          activity,
          group_by: groupBy || 'crop',
          approved_only: 'true',
        });
        if (siteId) params.set('site_id', siteId);
        if (groupBy === 'variety' && variety) params.set('variety', variety);
        if (crop) params.set('crop', crop);
        const result = await apiRequest(`/manpower/summary/hours-detail?${params.toString()}`);
        if (!cancelled) setData(result);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load detail');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, startDate, endDate, siteId, crop, variety, activity, groupBy]);

  const title = `${crop}${groupBy === 'variety' && variety ? ` / ${variety}` : ''} — ${activityLabel || activity}, ${startDate} to ${endDate}`;

  const totals = (data?.rows || []).reduce(
    (acc, r) => ({
      eag: acc.eag + (r.eagWorkers || 0),
      casual: acc.casual + (r.casualWorkers || 0),
      hours: acc.hours + (r.hours || 0),
      actual: acc.actual + (r.actual || 0),
    }),
    { eag: 0, casual: 0, hours: 0, actual: 0 },
  );

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent dividers>
        {loading && <CircularProgress size={24} />}
        {error && <Alert severity="error">{error}</Alert>}
        {!loading && !error && (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Location</TableCell>
                  <TableCell>Section</TableCell>
                  <TableCell align="right">EAG</TableCell>
                  <TableCell align="right">Casual</TableCell>
                  <TableCell align="right">Hours</TableCell>
                  <TableCell align="right">Output</TableCell>
                  <TableCell>Unit</TableCell>
                  <TableCell align="right">h/unit</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(data?.rows || []).map((row, i) => (
                  <DrillRow key={`${row.date}-${row.location}-${i}`} row={row} />
                ))}
                {(data?.rows || []).length > 0 && (
                  <TableRow sx={{ bgcolor: 'warning.light' }}>
                    <TableCell colSpan={3} sx={{ fontWeight: 700 }}>Total</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>{totals.eag}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>{totals.casual}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>{Math.round(totals.hours * 10) / 10}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>{totals.actual || ''}</TableCell>
                    <TableCell colSpan={2} />
                  </TableRow>
                )}
                {(data?.rows || []).length === 0 && !loading && (
                  <TableRow>
                    <TableCell colSpan={9} align="center">No records for this selection</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
