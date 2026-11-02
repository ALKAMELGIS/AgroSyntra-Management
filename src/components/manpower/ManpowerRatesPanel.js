import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert, Autocomplete, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  Grid, IconButton, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField,
  Tooltip, Typography,
} from '@mui/material';
import { AddOutlined as Add, DeleteOutlined as Delete, EditOutlined as Edit, HistoryOutlined as History, UndoOutlined as Undo } from '@mui/icons-material';
import { useApiMutation, useApiQuery, useDynamicMutation } from '../../hooks/useApiQuery';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../contexts/NotificationContext';
import { useConfirmDialog } from '../ConfirmDialog';
import { excelTableSx, GutterCell } from '../table/ExcelTable';
import DashboardSection from '../dashboard/DashboardSection';
import { canEditManpowerRates } from '../../utils/roleAccess';
import {
  WORKER_CATEGORIES, formatAed, groupRateRows, nextScheduledRate, rateInForce, todayIso, workersOnPersonalRate,
} from '../../utils/manpowerCost';

const INVALIDATE = [['manpower-cost']];

function formatSetOn(value) {
  if (!value) return '-';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '-' : todayIso(d);
}

/** mode: 'group' | 'personal' | 'end' (personal rate → back on group rate). */
function RateDialog({ open, mode, title, workers, fixedWorker, onClose, onSave, saving }) {
  const { t } = useTranslation();
  const today = todayIso();
  const [worker, setWorker] = useState(fixedWorker || null);
  const [rate, setRate] = useState('');
  const [startDate, setStartDate] = useState(today);
  const [note, setNote] = useState('');

  const needsRate = mode !== 'end';
  const rateNumber = Number(rate);
  const rateValid = !needsRate || (rate !== '' && Number.isFinite(rateNumber) && rateNumber >= 0);
  const workerValid = mode === 'group' || Boolean(worker);
  const canSave = rateValid && workerValid && Boolean(startDate) && !saving;

  const handleSave = () => {
    if (!canSave) return;
    onSave({
      workerId: worker?.id,
      ratePerHour: needsRate ? rateNumber : null,
      effectiveFrom: startDate,
      note: note.trim() || null,
    });
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          {mode !== 'group' && (
            fixedWorker ? (
              <TextField
                label={t('manpowerCost.rates.worker')}
                value={`${fixedWorker.employee_id || fixedWorker.employeeId || ''} · ${fixedWorker.name || fixedWorker.workerName || ''}`}
                disabled
              />
            ) : (
              <Autocomplete
                options={workers}
                value={worker}
                onChange={(_e, v) => setWorker(v)}
                getOptionLabel={(w) => `${w.employee_id} · ${w.name}`}
                isOptionEqualToValue={(a, b) => a.id === b.id}
                renderInput={(params) => <TextField {...params} label={t('manpowerCost.rates.worker')} />}
              />
            )
          )}
          {needsRate && (
            <TextField
              type="number"
              label={t('manpowerCost.rates.ratePerHour')}
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              inputProps={{ min: 0, step: 0.25 }}
              error={rate !== '' && !rateValid}
              helperText={rate !== '' && !rateValid ? t('manpowerCost.rates.invalidRate') : ' '}
              autoFocus
            />
          )}
          <TextField
            type="date"
            label={t('manpowerCost.rates.startDate')}
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          {startDate && startDate < today && (
            <Alert severity="warning">{t('manpowerCost.rates.backdateWarning')}</Alert>
          )}
          <TextField
            label={t('manpowerCost.rates.note')}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            inputProps={{ maxLength: 500 }}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('common.cancel')}</Button>
        <Button variant="contained" onClick={handleSave} disabled={!canSave}>{t('common.save')}</Button>
      </DialogActions>
    </Dialog>
  );
}

function HistoryTable({ rows, canEdit, onDelete }) {
  const { t } = useTranslation();
  if (rows.length === 0) {
    return <Typography color="text.secondary" sx={{ p: 2 }}>{t('manpowerCost.rates.noHistory')}</Typography>;
  }
  return (
    <TableContainer>
      <Table size="small" sx={excelTableSx}>
        <TableHead>
          <TableRow>
            <GutterCell />
            <TableCell>{t('manpowerCost.rates.startDate')}</TableCell>
            <TableCell className="col-numeric">{t('manpowerCost.rates.ratePerHour')}</TableCell>
            <TableCell>{t('manpowerCost.rates.note')}</TableCell>
            <TableCell>{t('manpowerCost.rates.setBy')}</TableCell>
            <TableCell>{t('manpowerCost.rates.setOn')}</TableCell>
            {canEdit && <TableCell />}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row, idx) => (
            <TableRow key={row.id} hover>
              <GutterCell index={idx + 1} />
              <TableCell>{row.effectiveFrom}</TableCell>
              <TableCell className="col-numeric">
                {row.ratePerHour == null ? t('manpowerCost.rates.backToGroup') : formatAed(row.ratePerHour)}
              </TableCell>
              <TableCell>{row.note || '-'}</TableCell>
              <TableCell>{row.createdByName || '-'}</TableCell>
              <TableCell>{formatSetOn(row.createdAt)}</TableCell>
              {canEdit && (
                <TableCell>
                  <IconButton size="small" color="error" onClick={() => onDelete(row)} aria-label={t('common.delete')}>
                    <Delete fontSize="small" />
                  </IconButton>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function rateSummary(t, current, upcoming) {
  const parts = [];
  if (current) parts.push(current.ratePerHour == null ? t('manpowerCost.rates.notSet') : `${formatAed(current.ratePerHour)} AED`);
  else parts.push(t('manpowerCost.rates.notSet'));
  if (upcoming) {
    parts.push(upcoming.ratePerHour == null
      ? t('manpowerCost.rates.backOnGroupFrom', { date: upcoming.effectiveFrom })
      : t('manpowerCost.rates.scheduled', { rate: formatAed(upcoming.ratePerHour), date: upcoming.effectiveFrom }));
  }
  return parts;
}

export default function ManpowerRatesPanel({ siteId, sites }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const notify = useNotification();
  const [confirm, confirmDialog] = useConfirmDialog();
  const canEdit = canEditManpowerRates(user);
  const today = todayIso();

  // dialog: { mode, category?, worker? } ; history: { title, rows }
  const [dialog, setDialog] = useState(null);
  const [historyFor, setHistoryFor] = useState(null);

  const rates = useApiQuery(
    ['manpower-cost', 'rates', siteId],
    `/manpower-cost/rates?site_id=${siteId}`,
    { enabled: Boolean(siteId) },
  );
  const workers = useApiQuery(
    ['manpower-cost', 'workers', siteId],
    `/manpower/workers?site_id=${siteId}`,
    { enabled: Boolean(siteId) && canEdit },
  );

  const saveGroup = useApiMutation('/manpower-cost/rates/group', { method: 'POST' }, INVALIDATE);
  const saveWorker = useApiMutation('/manpower-cost/rates/worker', { method: 'POST' }, INVALIDATE);
  const removeRate = useDynamicMutation((id) => `/manpower-cost/rates/${id}`, { method: 'DELETE' }, INVALIDATE);

  const groupRates = useMemo(() => rates.data?.groupRates || [], [rates.data]);
  const workerRates = useMemo(() => rates.data?.workerRates || [], [rates.data]);
  const personal = useMemo(() => workersOnPersonalRate(workerRates, today), [workerRates, today]);
  const siteName = sites.find((s) => s.id === siteId)?.name || '';

  if (!siteId) {
    return <Alert severity="info">{t('manpowerCost.rates.pickSite')}</Alert>;
  }
  if (rates.isLoading) {
    return <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>;
  }
  if (rates.error) {
    return <Alert severity="error">{rates.error.message || t('manpowerCost.loadFailed')}</Alert>;
  }

  const handleSave = async (values) => {
    try {
      if (dialog.mode === 'group') {
        await saveGroup.mutateAsync({
          siteId,
          category: dialog.category,
          ratePerHour: values.ratePerHour,
          effectiveFrom: values.effectiveFrom,
          note: values.note,
        });
      } else {
        await saveWorker.mutateAsync({
          workerId: values.workerId,
          ratePerHour: values.ratePerHour,
          effectiveFrom: values.effectiveFrom,
          note: values.note,
        });
      }
      notify.success(t('manpowerCost.rates.saved'));
      setDialog(null);
      setHistoryFor(null);
    } catch (err) {
      notify.error(err.message || t('manpowerCost.rates.saveFailed'));
    }
  };

  const handleDelete = async (row) => {
    if (!(await confirm(t('manpowerCost.rates.deleteConfirm'), {
      title: t('common.delete'),
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
    }))) return;
    try {
      await removeRate.mutateAsync({ pathArg: row.id });
      notify.success(t('manpowerCost.rates.deleted'));
      setHistoryFor((h) => (h ? { ...h, rows: h.rows.filter((r) => r.id !== row.id) } : h));
    } catch (err) {
      notify.error(err.message || t('manpowerCost.rates.saveFailed'));
    }
  };

  const saving = saveGroup.isPending || saveWorker.isPending;
  const workerOptions = workers.data || [];

  return (
    <Box>
      {!canEdit && <Alert severity="info" variant="outlined" sx={{ mb: 2 }}>{t('manpowerCost.rates.readOnly')}</Alert>}

      <DashboardSection title={`${t('manpowerCost.rates.groupTitle')}${siteName ? ` · ${siteName}` : ''}`}>
        <Typography variant="body2" color="text.secondary" sx={{ px: 2, pt: 1.5 }}>
          {t('manpowerCost.rates.groupHelp')}
        </Typography>
        <Grid container spacing={2} sx={{ p: 2 }}>
          {WORKER_CATEGORIES.map((category) => {
            const rows = groupRateRows(groupRates, siteId, category);
            const current = rateInForce(rows, today);
            const upcoming = nextScheduledRate(rows, today);
            const [main, extra] = rateSummary(t, current, upcoming);
            return (
              <Grid size={{ xs: 12, md: 6 }} key={category}>
                <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
                  <Typography variant="overline" color="text.secondary">
                    {t(`manpowerCost.category.${category}`)}
                  </Typography>
                  <Typography variant="h5" sx={{ fontWeight: 700 }}>{main}</Typography>
                  {current && <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    {t('manpowerCost.rates.startDate')}: {current.effectiveFrom}
                  </Typography>}
                  {extra && <Typography variant="body2" color="primary">{extra}</Typography>}
                  <Box sx={{ display: 'flex', gap: 1, mt: 1.5, flexWrap: 'wrap' }}>
                    {canEdit && (
                      <Button
                        size="small"
                        variant="contained"
                        startIcon={<Edit />}
                        onClick={() => setDialog({ mode: 'group', category })}
                      >
                        {current ? t('manpowerCost.rates.changeRate') : t('manpowerCost.rates.setRate')}
                      </Button>
                    )}
                    <Button
                      size="small"
                      startIcon={<History />}
                      disabled={rows.length === 0}
                      onClick={() => setHistoryFor({ title: t(`manpowerCost.category.${category}`), rows })}
                    >
                      {t('manpowerCost.rates.history')}
                    </Button>
                  </Box>
                </Paper>
              </Grid>
            );
          })}
        </Grid>
      </DashboardSection>

      <DashboardSection
        title={t('manpowerCost.rates.personalTitle')}
        action={canEdit ? (
          <Button
            size="small"
            variant="contained"
            color="inherit"
            sx={{ color: 'text.primary' }}
            startIcon={<Add />}
            onClick={() => setDialog({ mode: 'personal' })}
          >
            {t('manpowerCost.rates.addPersonal')}
          </Button>
        ) : null}
      >
        <Typography variant="body2" color="text.secondary" sx={{ px: 2, pt: 1.5 }}>
          {t('manpowerCost.rates.personalHelp')}
        </Typography>
        {personal.length === 0 ? (
          <Typography color="text.secondary" sx={{ p: 2 }}>{t('manpowerCost.rates.noPersonal')}</Typography>
        ) : (
          <TableContainer sx={{ mt: 1 }}>
            <Table size="small" sx={excelTableSx}>
              <TableHead>
                <TableRow>
                  <GutterCell />
                  <TableCell>{t('manpowerCost.cols.employeeId')}</TableCell>
                  <TableCell>{t('manpowerCost.cols.worker')}</TableCell>
                  <TableCell>{t('manpowerCost.cols.category')}</TableCell>
                  <TableCell>{t('manpowerCost.cols.personalRate')}</TableCell>
                  <TableCell className="col-numeric">{t('manpowerCost.cols.groupRate')}</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {personal.map((p, idx) => {
                  const group = rateInForce(groupRateRows(groupRates, siteId, p.workerCategory), today);
                  const [main, extra] = rateSummary(t, p.current, p.upcoming);
                  const fixedWorker = { id: p.workerId, employeeId: p.employeeId, workerName: p.workerName };
                  return (
                    <TableRow key={p.workerId} hover>
                      <GutterCell index={idx + 1} />
                      <TableCell>{p.employeeId}</TableCell>
                      <TableCell>{p.workerName}</TableCell>
                      <TableCell>{t(`manpowerCost.category.${p.workerCategory}`, { defaultValue: p.workerCategory })}</TableCell>
                      <TableCell>
                        {main}
                        {extra && <Typography variant="caption" color="primary" sx={{ display: 'block' }}>{extra}</Typography>}
                      </TableCell>
                      <TableCell className="col-numeric">{group ? formatAed(group.ratePerHour) : '-'}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        {canEdit && (
                          <>
                            <Tooltip title={t('manpowerCost.rates.changeRate')}>
                              <IconButton size="small" onClick={() => setDialog({ mode: 'personal', worker: fixedWorker })}>
                                <Edit fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title={t('manpowerCost.rates.backToGroup')}>
                              <IconButton size="small" onClick={() => setDialog({ mode: 'end', worker: fixedWorker })}>
                                <Undo fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </>
                        )}
                        <Tooltip title={t('manpowerCost.rates.history')}>
                          <IconButton size="small" onClick={() => setHistoryFor({ title: p.workerName, rows: p.history })}>
                            <History fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DashboardSection>

      {dialog && (
        <RateDialog
          open
          mode={dialog.mode}
          title={dialog.mode === 'group'
            ? `${t(`manpowerCost.category.${dialog.category}`)} · ${siteName}`
            : dialog.mode === 'end' ? t('manpowerCost.rates.backToGroup') : t('manpowerCost.rates.addPersonal')}
          workers={workerOptions}
          fixedWorker={dialog.worker}
          saving={saving}
          onClose={() => setDialog(null)}
          onSave={handleSave}
        />
      )}

      <Dialog open={Boolean(historyFor)} onClose={() => setHistoryFor(null)} maxWidth="md" fullWidth>
        <DialogTitle>{t('manpowerCost.rates.history')} · {historyFor?.title}</DialogTitle>
        <DialogContent>
          {historyFor && <HistoryTable rows={historyFor.rows} canEdit={canEdit} onDelete={handleDelete} />}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHistoryFor(null)}>{t('common.back')}</Button>
        </DialogActions>
      </Dialog>

      {confirmDialog}
    </Box>
  );
}
