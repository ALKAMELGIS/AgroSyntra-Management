import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Chip, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import { apiRequest } from '../../utils/api';
import { excelTableSx, GutterCell } from '../table/ExcelTable';
import useSeasonListDates from '../../hooks/useSeasonListDates';

function statusRowSx(status) {
  if (status === 'Under') {
    return {
      '& .MuiTableCell-root:not(.table-gutter)': { bgcolor: 'table.errorBg' },
    };
  }
  if (status === 'Over') {
    return {
      '& .MuiTableCell-root:not(.table-gutter)': { bgcolor: 'table.sectionBg' },
    };
  }
  return undefined;
}

export default function ManpowerPerformancePanel({ siteId, tableHeight }) {
  const { startDate, endDate, setStartDate, setEndDate, seasonStart, seasonEnd, isReady: seasonDatesReady } = useSeasonListDates();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [summaryFilter, setSummaryFilter] = useState('all');
  const [selectedWorkerId, setSelectedWorkerId] = useState(null);

  const load = useCallback(async () => {
    if (!seasonDatesReady || !siteId || !startDate || !endDate) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        start_date: startDate,
        end_date: endDate,
        site_id: siteId,
      });
      const result = await apiRequest(`/manpower/summary/performance?${params.toString()}`);
      setData(result);
    } catch (err) {
      setError(err.message || 'Failed to load performance');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [siteId, startDate, endDate, seasonDatesReady]);

  useEffect(() => {
    load();
  }, [load]);

  const workerSummary = useMemo(() => {
    const rows = data?.workerSummary || [];
    if (summaryFilter === 'missed') {
      return rows.filter((r) => r.daysWithTarget > 0 && r.daysMissed === r.daysWithTarget);
    }
    if (summaryFilter === 'achieved') {
      return rows.filter((r) => r.daysWithTarget > 0 && r.daysMissed === 0);
    }
    return rows;
  }, [data, summaryFilter]);

  const vsTarget = useMemo(() => {
    const rows = data?.vsTarget || [];
    if (!selectedWorkerId) return rows;
    return rows.filter((r) => r.workerId === selectedWorkerId);
  }, [data, selectedWorkerId]);

  const overtime = data?.overtime || [];

  if (!siteId) {
    return (
      <Alert severity="warning">Select a site using the dropdown at the top left of the app.</Alert>
    );
  }

  return (
    <Box>
      <Paper sx={{ p: 2, mb: 2, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
        <TextField
          size="small"
          type="date"
          label="From"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          InputLabelProps={{ shrink: true }}
          inputProps={{ min: seasonStart || undefined, max: seasonEnd || undefined }}
          sx={{ width: 150 }}
        />
        <TextField
          size="small"
          type="date"
          label="To"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          InputLabelProps={{ shrink: true }}
          inputProps={{ min: seasonStart || undefined, max: seasonEnd || undefined }}
          sx={{ width: 150 }}
        />
        <Button variant="outlined" onClick={load} disabled={loading}>Refresh</Button>
      </Paper>

      <Alert severity="info" sx={{ mb: 2 }}>
        Approved records only. Actual is compared to the Reference target in the same unit.
        Overtime is any worker-day over 10 hours.
      </Alert>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>Worker summary</Typography>
      <Box sx={{ display: 'flex', gap: 1, mb: 1, flexWrap: 'wrap' }}>
        <Chip
          label="All"
          size="small"
          color={summaryFilter === 'all' ? 'success' : 'default'}
          variant={summaryFilter === 'all' ? 'filled' : 'outlined'}
          onClick={() => setSummaryFilter('all')}
        />
        <Chip
          label="Missed every day"
          size="small"
          color={summaryFilter === 'missed' ? 'error' : 'default'}
          variant={summaryFilter === 'missed' ? 'filled' : 'outlined'}
          onClick={() => setSummaryFilter('missed')}
        />
        <Chip
          label="Achieved every day"
          size="small"
          color={summaryFilter === 'achieved' ? 'success' : 'default'}
          variant={summaryFilter === 'achieved' ? 'filled' : 'outlined'}
          onClick={() => setSummaryFilter('achieved')}
        />
        {selectedWorkerId && (
          <Chip
            label="Clear worker filter"
            size="small"
            onDelete={() => setSelectedWorkerId(null)}
            onClick={() => setSelectedWorkerId(null)}
          />
        )}
      </Box>
      <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 280, mb: 3 }}>
        <Table size="small" stickyHeader sx={excelTableSx}>
          <TableHead>
            <TableRow>
              <GutterCell />
              <TableCell>Employee ID</TableCell>
              <TableCell>Worker</TableCell>
              <TableCell className="col-numeric">Days with target</TableCell>
              <TableCell className="col-numeric">Days achieved</TableCell>
              <TableCell className="col-numeric">Days missed</TableCell>
              <TableCell className="col-numeric">Miss streak</TableCell>
              <TableCell>Result</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {!loading && workerSummary.length === 0 && (
              <TableRow>
                <TableCell colSpan={8}>
                  <Typography variant="body2" color="text.secondary">
                    No workers with a Reference target in this range.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
            {workerSummary.map((r, i) => (
              <TableRow
                key={r.workerId}
                hover
                selected={selectedWorkerId === r.workerId}
                onClick={() => setSelectedWorkerId(
                  selectedWorkerId === r.workerId ? null : r.workerId,
                )}
                sx={{ cursor: 'pointer' }}
              >
                <GutterCell index={i + 1} />
                <TableCell>{r.employeeId}</TableCell>
                <TableCell>{r.workerName}</TableCell>
                <TableCell className="col-numeric">{r.daysWithTarget}</TableCell>
                <TableCell className="col-numeric">{r.daysAchieved}</TableCell>
                <TableCell className="col-numeric">{r.daysMissed}</TableCell>
                <TableCell className="col-numeric">{r.missStreak}</TableCell>
                <TableCell>{r.result}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>Vs target</Typography>
      <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: tableHeight || 360, mb: 3 }}>
        <Table size="small" stickyHeader sx={excelTableSx}>
          <TableHead>
            <TableRow>
              <GutterCell />
              <TableCell>Date</TableCell>
              <TableCell>Employee ID</TableCell>
              <TableCell>Worker</TableCell>
              <TableCell>Activity</TableCell>
              <TableCell>Crop</TableCell>
              <TableCell>Variety</TableCell>
              <TableCell className="col-numeric">Actual</TableCell>
              <TableCell className="col-numeric">Target</TableCell>
              <TableCell>Unit</TableCell>
              <TableCell className="col-numeric">Variance</TableCell>
              <TableCell>Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {!loading && vsTarget.length === 0 && (
              <TableRow>
                <TableCell colSpan={12}>
                  <Typography variant="body2" color="text.secondary">
                    No actual vs target rows. Add targets on the Reference tab, then refresh.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
            {vsTarget.map((r, i) => (
              <TableRow key={`${r.workerId}-${r.date}-${r.activity}-${r.crop}-${r.variety}`} sx={statusRowSx(r.status)}>
                <GutterCell index={i + 1} />
                <TableCell>{r.date}</TableCell>
                <TableCell>{r.employeeId}</TableCell>
                <TableCell>{r.workerName}</TableCell>
                <TableCell>{r.activity}</TableCell>
                <TableCell>{r.crop}</TableCell>
                <TableCell>{r.variety}</TableCell>
                <TableCell className="col-numeric">{r.actual}</TableCell>
                <TableCell className="col-numeric">{r.target}</TableCell>
                <TableCell>{r.unit}</TableCell>
                <TableCell className="col-numeric">{r.variance}</TableCell>
                <TableCell>{r.status}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>Overtime (over 10 hours)</Typography>
      <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 280 }}>
        <Table size="small" stickyHeader sx={excelTableSx}>
          <TableHead>
            <TableRow>
              <GutterCell />
              <TableCell>Date</TableCell>
              <TableCell>Employee ID</TableCell>
              <TableCell>Worker</TableCell>
              <TableCell>Category</TableCell>
              <TableCell className="col-numeric">Hours</TableCell>
              <TableCell className="col-numeric">Extra hours</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {!loading && overtime.length === 0 && (
              <TableRow>
                <TableCell colSpan={7}>
                  <Typography variant="body2" color="text.secondary">
                    No worker-days over 10 hours in this range.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
            {overtime.map((r, i) => (
              <TableRow key={`${r.workerId}-${r.date}`} hover>
                <GutterCell index={i + 1} />
                <TableCell>{r.date}</TableCell>
                <TableCell>{r.employeeId}</TableCell>
                <TableCell>{r.workerName}</TableCell>
                <TableCell>{r.workerCategory}</TableCell>
                <TableCell className="col-numeric">{r.hours}</TableCell>
                <TableCell className="col-numeric">{r.extraHours}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
