import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Typography, Paper, Button, TextField, Chip, Stack, Alert,
  CircularProgress, Dialog, DialogTitle, DialogContent, DialogActions,
  Accordion, AccordionSummary, AccordionDetails, Divider,
  Table, TableBody, TableCell, TableHead, TableRow, TableContainer,
} from '@mui/material';
import { ExpandMoreOutlined as ExpandMore, CheckOutlined as Check, CloseOutlined as Close, EditOutlined as Edit } from '@mui/icons-material';
import { apiRequest } from '../../utils/api';
import { useNotification } from '../../contexts/NotificationContext';
import useSeasonListDates from '../../hooks/useSeasonListDates';
import ManpowerOptionalValue from './ManpowerOptionalValue';
import { excelTableSx, GutterCell } from '../table/ExcelTable';
import InfoNote from '../InfoNote';

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-GB');
}

function WorkerActivityTable({ records }) {
  if (!records?.length) {
    return <Typography variant="body2" color="text.secondary">No activities</Typography>;
  }
  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small" sx={excelTableSx}>
        <TableHead>
          <TableRow>
            <GutterCell />
            <TableCell>Activity</TableCell>
            <TableCell>Location</TableCell>
            <TableCell>Section</TableCell>
            <TableCell>Start</TableCell>
            <TableCell>End</TableCell>
            <TableCell className="col-numeric">Hours</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {records.map((r, idx) => (
            <TableRow key={r.id} hover>
              <GutterCell index={idx + 1} />
              <TableCell><ManpowerOptionalValue field="activity" value={r.activity} /></TableCell>
              <TableCell>{r.location || '—'}</TableCell>
              <TableCell>{r.section || '—'}</TableCell>
              <TableCell>{r.startTime?.substring?.(0, 5) || r.startTime || '—'}</TableCell>
              <TableCell>{r.endTime?.substring?.(0, 5) || r.endTime || '—'}</TableCell>
              <TableCell className="col-numeric">{r.workHours ?? '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

export default function ManpowerApprovalsPanel({
  siteId,
  tableHeight,
  onEditRecord,
  onChanged,
}) {
  const notify = useNotification();
  const { startDate, endDate, setStartDate, setEndDate, seasonStart, seasonEnd, isReady: seasonDatesReady } = useSeasonListDates();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [actingKey, setActingKey] = useState(null);
  const [rejectDialog, setRejectDialog] = useState({
    open: false,
    scope: null,
    submissionKey: null,
    workerId: null,
    label: '',
  });
  const [rejectReason, setRejectReason] = useState('');

  const loadPending = useCallback(async () => {
    if (!seasonDatesReady) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ start_date: startDate, end_date: endDate });
      if (siteId) params.set('site_id', siteId);
      const data = await apiRequest(`/manpower/approvals/pending?${params.toString()}`);
      setSubmissions(data || []);
    } catch (err) {
      setError(err.message || 'Failed to load pending approvals');
      setSubmissions([]);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, siteId, seasonDatesReady]);

  useEffect(() => {
    loadPending();
  }, [loadPending]);

  const runAction = async (key, fn) => {
    setActingKey(key);
    try {
      await fn();
      notify.success('Updated');
      await loadPending();
      onChanged?.();
    } catch (err) {
      notify.error(err.message || 'Action failed');
    } finally {
      setActingKey(null);
    }
  };

  const approveSubmission = (submissionKey) => runAction(`sub-approve-${submissionKey}`, () =>
    apiRequest(`/manpower/approvals/submissions/${encodeURIComponent(submissionKey)}/approve`, { method: 'POST' }),
  );

  const approveWorker = (submissionKey, workerId) => runAction(`worker-approve-${submissionKey}-${workerId}`, () =>
    apiRequest(
      `/manpower/approvals/submissions/${encodeURIComponent(submissionKey)}/workers/${workerId}/approve`,
      { method: 'POST' },
    ),
  );

  const openReject = (scope, submission, worker = null) => {
    setRejectDialog({
      open: true,
      scope,
      submissionKey: submission.submissionKey,
      workerId: worker?.workerId || null,
      label: worker
        ? `${worker.workerName} (${submission.submittedByName})`
        : `${submission.submittedByName} · ${formatDate(submission.recordDate)}`,
    });
    setRejectReason('');
  };

  const submitReject = async () => {
    const { scope, submissionKey, workerId } = rejectDialog;
    if (!rejectReason.trim()) {
      notify.error('Rejection reason is required');
      return;
    }
    const key = scope === 'worker'
      ? `worker-reject-${submissionKey}-${workerId}`
      : `sub-reject-${submissionKey}`;
    setActingKey(key);
    try {
      if (scope === 'worker') {
        await apiRequest(
          `/manpower/approvals/submissions/${encodeURIComponent(submissionKey)}/workers/${workerId}/reject`,
          { method: 'POST', body: JSON.stringify({ reason: rejectReason.trim() }) },
        );
      } else {
        await apiRequest(
          `/manpower/approvals/submissions/${encodeURIComponent(submissionKey)}/reject`,
          { method: 'POST', body: JSON.stringify({ reason: rejectReason.trim() }) },
        );
      }
      setRejectDialog({ open: false, scope: null, submissionKey: null, workerId: null, label: '' });
      notify.success('Rejected');
      await loadPending();
      onChanged?.();
    } catch (err) {
      notify.error(err.message || 'Reject failed');
    } finally {
      setActingKey(null);
    }
  };

  const totalPendingWorkers = useMemo(
    () => submissions.reduce((sum, s) => sum + (s.pendingWorkerCount || 0), 0),
    [submissions],
  );

  return (
    <Box>
      <Paper sx={{ p: 2, mb: 2, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <TextField size="small" type="date" label="From" value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          InputLabelProps={{ shrink: true }} sx={{ width: 150 }}
          inputProps={{ min: seasonStart || undefined, max: seasonEnd || undefined }} />
        <TextField size="small" type="date" label="To" value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          InputLabelProps={{ shrink: true }} sx={{ width: 150 }}
          inputProps={{ min: seasonStart || undefined, max: seasonEnd || undefined }} />
        <Button variant="outlined" onClick={loadPending} disabled={loading}>Refresh</Button>
        <Chip
          label={`${submissions.length} submission${submissions.length === 1 ? '' : 's'} · ${totalPendingWorkers} worker${totalPendingWorkers === 1 ? '' : 's'} pending`}
          color="warning"
          variant="outlined"
        />
      </Paper>

      <InfoNote severity="info" sx={{ mb: 2 }}>
        Each card is one Daily Activity Sheet submit (team leader or data entry). <strong>Approve all</strong> approves every pending worker in that group only.
        Pending activities are hidden from Daily Report and Workers count until approved.
      </InfoNote>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : error ? (
        <Alert severity="error">{error}</Alert>
      ) : submissions.length === 0 ? (
        <Alert severity="success">No pending activity submissions in this date range.</Alert>
      ) : (
        <Stack spacing={2}>
          {submissions.map((submission) => {
            const subBusy = actingKey === `sub-approve-${submission.submissionKey}`
              || actingKey === `sub-reject-${submission.submissionKey}`;
            const hasClash = Boolean(submission.hasClash);
            return (
              <Paper
                key={submission.submissionKey}
                variant="outlined"
                sx={{
                  overflow: 'hidden',
                  ...(hasClash ? {
                    border: '2px solid',
                    borderColor: 'warning.main',
                    borderLeftWidth: 8,
                  } : {}),
                }}
              >
                <Box sx={{
                  p: 2,
                  bgcolor: hasClash ? 'warning.light' : 'background.muted',
                  borderBottom: '1px solid',
                  borderColor: hasClash ? 'warning.main' : 'divider',
                }}>
                  <Stack
                    direction={{ xs: 'column', md: 'row' }}
                    spacing={1.5}
                    alignItems={{ xs: 'stretch', md: 'center' }}
                    justifyContent="space-between"
                  >
                    <Box>
                      <Typography variant="subtitle1" fontWeight={700}>
                        {formatDate(submission.recordDate)} · {submission.submittedByName}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {submission.pendingWorkerCount} worker{submission.pendingWorkerCount === 1 ? '' : 's'}
                        {' · '}
                        {submission.pendingTaskCount} activit{submission.pendingTaskCount === 1 ? 'y' : 'ies'} pending
                      </Typography>
                    </Box>
                    <Stack direction="row" spacing={1}>
                      <Button
                        size="small"
                        variant="contained"
                        color="success"
                        startIcon={<Check />}
                        disabled={subBusy || !!actingKey}
                        onClick={() => approveSubmission(submission.submissionKey)}
                      >
                        Approve all
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        color="error"
                        startIcon={<Close />}
                        disabled={subBusy || !!actingKey}
                        onClick={() => openReject('submission', submission)}
                      >
                        Reject all
                      </Button>
                    </Stack>
                  </Stack>
                </Box>

                {hasClash && submission.clashBanner && (
                  <Alert severity="warning" sx={{ borderRadius: 0 }}>
                    {submission.clashBanner}
                  </Alert>
                )}

                {submission.workers.map((worker) => {
                  const workerBusy = actingKey === `worker-approve-${submission.submissionKey}-${worker.workerId}`
                    || actingKey === `worker-reject-${submission.submissionKey}-${worker.workerId}`;
                  return (
                    <Accordion key={worker.workerId} disableGutters elevation={0}>
                      <AccordionSummary expandIcon={<ExpandMore />}>
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ width: '100%', pr: 1, flexWrap: 'wrap' }}>
                          <Typography fontWeight={600}>{worker.workerName}</Typography>
                          <Chip size="small" label={worker.employeeId} variant="outlined" />
                          <Chip size="small" label={worker.workerCategory} variant="outlined" />
                          {worker.clash && (
                            <>
                              <Chip size="small" color="warning" label="Clash" />
                              <Typography variant="body2" color="warning.dark">
                                {worker.clash.otherSubmitterName}
                                {' · '}
                                {worker.clash.approvalStatus === 'approved' ? 'already approved' : 'still pending'}
                              </Typography>
                            </>
                          )}
                          <Typography variant="body2" color="text.secondary">
                            {worker.records.length} activit{worker.records.length === 1 ? 'y' : 'ies'} · {worker.totalHours || 0} h
                          </Typography>
                          <Box sx={{ flexGrow: 1 }} />
                          <Button
                            size="small"
                            variant="contained"
                            color="success"
                            startIcon={<Check />}
                            disabled={workerBusy || !!actingKey}
                            onClick={(e) => {
                              e.stopPropagation();
                              approveWorker(submission.submissionKey, worker.workerId);
                            }}
                          >
                            Approve
                          </Button>
                          <Button
                            size="small"
                            variant="outlined"
                            color="error"
                            startIcon={<Close />}
                            disabled={workerBusy || !!actingKey}
                            onClick={(e) => {
                              e.stopPropagation();
                              openReject('worker', submission, worker);
                            }}
                          >
                            Reject
                          </Button>
                          <Button
                            size="small"
                            startIcon={<Edit />}
                            disabled={workerBusy || !!actingKey}
                            onClick={(e) => {
                              e.stopPropagation();
                              const first = worker.records[0];
                              if (first && onEditRecord) {
                                onEditRecord({
                                  id: first.id,
                                  activity: first.activity,
                                  unit: first.unit,
                                  variety: first.variety,
                                  location: first.location,
                                  section: first.section,
                                  start_time: first.startTime,
                                  end_time: first.endTime,
                                  target: first.target,
                                  actual: first.actual,
                                  work_hours: first.workHours,
                                  overtime: first.overtime,
                                  total_hours: first.totalHours,
                                  approval_status: 'pending',
                                });
                              }
                            }}
                          >
                            Edit
                          </Button>
                        </Stack>
                      </AccordionSummary>
                      <AccordionDetails sx={{ pt: 0 }}>
                        <Divider sx={{ mb: 1 }} />
                        <WorkerActivityTable records={worker.records} />
                      </AccordionDetails>
                    </Accordion>
                  );
                })}
              </Paper>
            );
          })}
        </Stack>
      )}

      <Dialog open={rejectDialog.open} onClose={() => setRejectDialog({ open: false, scope: null, submissionKey: null, workerId: null, label: '' })} maxWidth="sm" fullWidth>
        <DialogTitle>Reject submission</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" sx={{ mb: 2 }}>
            {rejectDialog.label}
          </Typography>
          <TextField
            fullWidth
            multiline
            minRows={3}
            label="Reason"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRejectDialog({ open: false, scope: null, submissionKey: null, workerId: null, label: '' })}>
            Cancel
          </Button>
          <Button variant="contained" color="error" onClick={submitReject} disabled={!!actingKey}>
            Reject
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
