import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { AddOutlined as Add, DeleteOutlined as Delete, EditOutlined as Edit, FileDownloadOutlined as FileDownload, PlayArrow } from '@mui/icons-material';
import { TableSkeleton } from '../components/LoadingSkeleton';
import { excelTableSx, freezeColumnsSx, GutterCell, GUTTER_WIDTH } from '../components/table/ExcelTable';
import { useAuth } from '../contexts/AuthContext';
import { useActiveSeason } from '../contexts/ActiveSeasonContext';
import { useActiveSite } from '../contexts/ActiveSiteContext';
import { useNotification } from '../contexts/NotificationContext';
import { apiRequest } from '../utils/api';
import { canManageSeasons } from '../utils/roleAccess';
import {
  isEndedSeason,
  farmTodayYmd,
  seasonsToCsv,
  toSeasonYmd,
  unusedPastSeasonWindow,
} from '../utils/seasonListDates';
import InfoNote from '../components/InfoNote';
import PageTitle from '../components/PageTitle';

const SEASON_FROZEN_WIDTHS = [160];

function seasonKind(season) {
  if (season.status === 'open') return { label: 'Open', color: 'success' };
  if (season.status === 'reopen_pending') return { label: 'Reopen pending', color: 'warning' };
  if (isEndedSeason(season)) return { label: 'Ended', color: 'default' };
  return { label: 'Historical', color: 'info' };
}

function isHistoricalSeason(season) {
  return season.status === 'closed' && !season.closed_by && !season.closedBy;
}

function downloadSeasonsCsv(seasons, siteLabel) {
  const blob = new Blob([seasonsToCsv(seasons)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `seasons-${siteLabel || 'site'}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function SeasonsManagement() {
  const notify = useNotification();
  const { user } = useAuth();
  const { activeSiteId, countries } = useActiveSite();
  const { seasons, isLoaded, reloadSeasons } = useActiveSeason();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);
  const [form, setForm] = useState({ name: '', startDate: '', plannedEndDate: '' });
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', plannedEndDate: '', endDate: '' });
  const [savingEdit, setSavingEdit] = useState(false);
  const canManage = canManageSeasons(user);
  const hasOpenSeason = seasons.some((season) => season.status === 'open');

  const siteLabel = useMemo(() => {
    for (const country of countries || []) {
      const site = country.sites?.find((row) => row.id === activeSiteId);
      if (site) return site.name;
    }
    return '';
  }, [countries, activeSiteId]);

  const openAdd = () => {
    const draft = unusedPastSeasonWindow(seasons);
    setForm({
      name: draft.name,
      startDate: draft.startDate,
      plannedEndDate: draft.plannedEndDate,
    });
    setDialogOpen(true);
  };

  const handleCreate = async () => {
    if (!activeSiteId || !form.name.trim() || !form.startDate || !form.plannedEndDate) return;
    setSaving(true);
    try {
      await apiRequest('/seasons', {
        method: 'POST',
        body: JSON.stringify({
          siteId: activeSiteId,
          name: form.name.trim(),
          startDate: form.startDate,
          plannedEndDate: form.plannedEndDate,
          status: 'closed',
        }),
      });
      notify.success(`${form.name.trim()} saved. Pick it in the sidebar and request reopen so an auditor can unlock it.`);
      setDialogOpen(false);
      reloadSeasons();
    } catch (error) {
      notify.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleStart = async () => {
    if (!activeSiteId) return;
    setStarting(true);
    try {
      const season = await apiRequest('/seasons/start', {
        method: 'POST',
        body: JSON.stringify({ siteId: activeSiteId }),
      });
      notify.success(`${season?.name || 'Season'} is now open.`);
      reloadSeasons();
    } catch (error) {
      notify.error(error.message);
    } finally {
      setStarting(false);
    }
  };

  const openEdit = (season) => {
    setEditTarget(season);
    setEditForm({
      name: season.name || '',
      plannedEndDate: toSeasonYmd(season.planned_end_date),
      endDate: toSeasonYmd(season.end_date) || farmTodayYmd(),
    });
  };

  const handleEdit = async () => {
    if (!editTarget || !editForm.name.trim()) return;
    const open = editTarget.status === 'open';
    if (open && !editForm.plannedEndDate) return;
    if (!open && !editForm.endDate) return;
    setSavingEdit(true);
    try {
      const body = open
        ? { name: editForm.name.trim(), plannedEndDate: editForm.plannedEndDate }
        : { name: editForm.name.trim(), endDate: editForm.endDate };
      await apiRequest(`/seasons/${editTarget.id}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      notify.success(`${editForm.name.trim()} saved.`);
      setEditTarget(null);
      reloadSeasons();
    } catch (error) {
      notify.error(error.message);
    } finally {
      setSavingEdit(false);
    }
  };

  const openDelete = (season) => {
    setDeleteTarget(season);
    setDeleteConfirm('');
  };

  const handleDelete = async () => {
    if (!deleteTarget || deleteConfirm !== deleteTarget.name) return;
    setDeleting(true);
    try {
      const result = await apiRequest(`/seasons/${deleteTarget.id}`, { method: 'DELETE' });
      const counts = result?.deleted || {};
      const bits = [];
      if (counts.plantings) bits.push(`${counts.plantings} planting${counts.plantings === 1 ? '' : 's'}`);
      if (counts.openField) bits.push(`${counts.openField} open-field row${counts.openField === 1 ? '' : 's'}`);
      if (counts.cropHistory) bits.push(`${counts.cropHistory} rotation row${counts.cropHistory === 1 ? '' : 's'}`);
      notify.success(
        bits.length
          ? `${deleteTarget.name} deleted. Removed ${bits.join(', ')}.`
          : `${deleteTarget.name} deleted.`,
      );
      setDeleteTarget(null);
      setDeleteConfirm('');
      reloadSeasons();
    } catch (error) {
      notify.error(error.message);
    } finally {
      setDeleting(false);
    }
  };

  const handleExport = () => {
    if (!seasons.length) {
      notify.error('No seasons to export');
      return;
    }
    downloadSeasonsCsv(seasons, siteLabel.replace(/\s+/g, '-').toLowerCase());
    notify.success('Seasons exported');
  };

  if (!isLoaded) {
    return (
      <Container maxWidth="xl">
        <Paper elevation={3} sx={{ p: 4, mt: 2 }}>
          <PageTitle sx={{ mb: 3 }}>Seasons</PageTitle>
          <TableSkeleton rows={5} columns={6} />
        </Paper>
      </Container>
    );
  }

  return (
    <Container maxWidth="xl">
      <Paper elevation={3} sx={{ p: 4, mt: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, gap: 2, flexWrap: 'wrap' }}>
          <PageTitle>Seasons{siteLabel ? ` — ${siteLabel}` : ''}</PageTitle>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button variant="outlined" startIcon={<FileDownload />} onClick={handleExport} disabled={!seasons.length}>
              Export CSV
            </Button>
            {canManage && !hasOpenSeason ? (
              <Button
                variant="contained"
                color="success"
                startIcon={<PlayArrow />}
                onClick={handleStart}
                disabled={!activeSiteId || starting}
              >
                Start season
              </Button>
            ) : null}
            {canManage ? (
              <Button variant="contained" startIcon={<Add />} onClick={openAdd} disabled={!activeSiteId}>
                Add past season
              </Button>
            ) : null}
          </Box>
        </Box>

        {!activeSiteId ? (
          <InfoNote mode="line" severity="info">Pick a site in the sidebar to manage seasons.</InfoNote>
        ) : !hasOpenSeason && canManage ? (
          <InfoNote mode="line" severity="info" sx={{ mb: 2 }}>
            This site has no open season. Start the current farm year (1 Sep – 31 Jul), or add a past year and request reopen for historical import.
          </InfoNote>
        ) : (
          <InfoNote severity="info" sx={{ mb: 2 }}>
            Add a past farm year here so historical planting can attach to it after an auditor unlocks it. This does not uproot fields or open a new year.
          </InfoNote>
        )}

        <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 'calc(100vh - 280px)' }}>
          <Table size="small" sx={[excelTableSx, freezeColumnsSx(SEASON_FROZEN_WIDTHS, GUTTER_WIDTH)]}>
            <TableHead>
              <TableRow>
                <GutterCell />
                <TableCell className="col-frozen-0">Name</TableCell>
                <TableCell>Start</TableCell>
                <TableCell>Planned end</TableCell>
                <TableCell>End</TableCell>
                <TableCell>Status</TableCell>
                {canManage ? <TableCell>Actions</TableCell> : null}
              </TableRow>
            </TableHead>
            <TableBody>
              {seasons.length === 0 && (
                <TableRow>
                  <TableCell colSpan={canManage ? 7 : 6} align="center">
                    No seasons for this site
                  </TableCell>
                </TableRow>
              )}
              {seasons.map((season, idx) => {
                const kind = seasonKind(season);
                return (
                  <TableRow key={season.id} hover>
                    <GutterCell index={idx + 1} />
                    <TableCell className="col-frozen-0">{season.name}</TableCell>
                    <TableCell>{toSeasonYmd(season.start_date) || '—'}</TableCell>
                    <TableCell>{toSeasonYmd(season.planned_end_date) || '—'}</TableCell>
                    <TableCell>{toSeasonYmd(season.end_date) || '—'}</TableCell>
                    <TableCell>
                      <Chip size="small" label={kind.label} color={kind.color} />
                    </TableCell>
                    {canManage ? (
                      <TableCell>
                        <Button
                          size="small"
                          startIcon={<Edit />}
                          onClick={() => openEdit(season)}
                        >
                          Edit
                        </Button>
                        {isHistoricalSeason(season) ? (
                          <Button
                            size="small"
                            color="error"
                            startIcon={<Delete />}
                            onClick={() => openDelete(season)}
                          >
                            Delete
                          </Button>
                        ) : null}
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Dialog open={dialogOpen} onClose={() => !saving && setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add past season</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
          <TextField
            label="Name"
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            fullWidth
          />
          <TextField
            label="Start date"
            type="date"
            value={form.startDate}
            onChange={(e) => setForm((prev) => ({ ...prev, startDate: e.target.value }))}
            InputLabelProps={{ shrink: true }}
            fullWidth
          />
          <TextField
            label="Planned end"
            type="date"
            value={form.plannedEndDate}
            onChange={(e) => setForm((prev) => ({ ...prev, plannedEndDate: e.target.value }))}
            InputLabelProps={{ shrink: true }}
            fullWidth
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate} disabled={saving || !form.name.trim()}>
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(editTarget)} onClose={() => !savingEdit && setEditTarget(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit {editTarget?.name || 'season'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
          {editTarget?.status === 'open' ? (
            <InfoNote severity="info">
              Change the year name or planned end. Start date stays put so plantings already
              in the year keep their occupancy.
            </InfoNote>
          ) : (
            <InfoNote severity="info">
              Changing the end date only updates the year calendar window. Planting uproot
              dates from End season stay as they were.
            </InfoNote>
          )}
          <TextField
            label="Name"
            value={editForm.name}
            onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
            fullWidth
          />
          {editTarget?.status === 'open' ? (
            <TextField
              label="Planned end"
              type="date"
              value={editForm.plannedEndDate}
              onChange={(e) => setEditForm((prev) => ({ ...prev, plannedEndDate: e.target.value }))}
              InputLabelProps={{ shrink: true }}
              inputProps={{ min: toSeasonYmd(editTarget?.start_date) || undefined }}
              fullWidth
            />
          ) : (
            <TextField
              label="End date"
              type="date"
              value={editForm.endDate}
              onChange={(e) => setEditForm((prev) => ({ ...prev, endDate: e.target.value }))}
              InputLabelProps={{ shrink: true }}
              inputProps={{
                min: toSeasonYmd(editTarget?.start_date) || undefined,
                max: farmTodayYmd(),
              }}
              helperText="On or after the start date, and not after today."
              fullWidth
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditTarget(null)} disabled={savingEdit}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleEdit}
            disabled={
              savingEdit
              || !editForm.name.trim()
              || (editTarget?.status === 'open' ? !editForm.plannedEndDate : !editForm.endDate)
            }
          >
            {savingEdit ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(deleteTarget)}
        onClose={() => !deleting && setDeleteTarget(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Delete {deleteTarget?.name}?</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            Occupancy and crop rotation for this year will be removed. Harvest, EC/pH,
            fertigation, irrigation, and IPM rows stay, but harvests will no longer be
            linked to a planting.
          </Alert>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Type <strong>{deleteTarget?.name}</strong> to confirm.
          </Typography>
          <TextField
            autoFocus
            fullWidth
            size="small"
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
            placeholder={deleteTarget?.name || ''}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleDelete}
            disabled={deleting || !deleteTarget || deleteConfirm !== deleteTarget.name}
          >
            {deleting ? 'Deleting…' : 'Delete season'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}

export default SeasonsManagement;
