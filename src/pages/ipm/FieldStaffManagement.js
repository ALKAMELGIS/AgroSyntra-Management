import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Paper, Button, TextField, MenuItem, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, Dialog, DialogTitle, DialogContent,
  DialogActions, Alert, CircularProgress, FormControl, InputLabel, Select,
  Autocomplete, ToggleButton, ToggleButtonGroup, Divider,
} from '@mui/material';
import { AddOutlined as AddIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../contexts/NotificationContext';
import { useMasterData } from '../../utils/useMasterData';
import { useActiveSite } from '../../contexts/ActiveSiteContext';
import { apiRequest } from '../../utils/api';
import { canManageFieldStaff, getRoleLabel } from '../../utils/roleAccess';
import { excelTableSx, GutterCell } from '../../components/table/ExcelTable';
import InfoNote from '../../components/InfoNote';
import PageTitle from '../../components/PageTitle';

function workerOptionLabel(w) {
  if (!w) return '';
  const tl = w.is_team_leader ? 'TL: Yes' : 'TL: No';
  return `${w.name} · ${w.employee_id} · ${tl} · ${w.category || '—'}`;
}

export default function FieldStaffManagement() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const notify = useNotification();
  const { data: masterData } = useMasterData();
  const { activeSiteId } = useActiveSite();
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState('create');
  const [pinDialog, setPinDialog] = useState({ open: false, id: null, name: '' });
  const [pinValue, setPinValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [eligibleWorkers, setEligibleWorkers] = useState([]);
  const [loadingWorkers, setLoadingWorkers] = useState(false);
  const [selectedWorker, setSelectedWorker] = useState(null);
  const [linkSiteFilter, setLinkSiteFilter] = useState(activeSiteId || '');
  const [form, setForm] = useState({
    name: '',
    employeeId: '',
    pin: '',
    role: 'scouter',
    siteId: activeSiteId || '',
  });
  const [linkForm, setLinkForm] = useState({
    pin: '',
    role: 'scouter',
    siteId: '',
  });

  const sites = [];
  masterData.countries?.forEach((c) => c.sites?.forEach((s) => sites.push(s)));

  const loadStaff = async () => {
    try {
      setLoading(true);
      const data = await apiRequest('/field-staff');
      setStaff(data || []);
    } catch (err) {
      notify.error(err.message || 'Failed to load field staff');
    } finally {
      setLoading(false);
    }
  };

  const loadEligibleWorkers = useCallback(async (siteId) => {
    try {
      setLoadingWorkers(true);
      const params = new URLSearchParams();
      if (siteId) params.set('site_id', siteId);
      const data = await apiRequest(`/field-staff/eligible-workers?${params.toString()}`);
      setEligibleWorkers(data || []);
    } catch (err) {
      notify.error(err.message || 'Failed to load workers');
      setEligibleWorkers([]);
    } finally {
      setLoadingWorkers(false);
    }
  }, [notify]);

  useEffect(() => { loadStaff(); }, []);

  useEffect(() => {
    if (activeSiteId) {
      setForm((f) => ({ ...f, siteId: activeSiteId }));
      setLinkSiteFilter(activeSiteId);
    }
  }, [activeSiteId]);

  useEffect(() => {
    if (dialogOpen && dialogMode === 'link') {
      loadEligibleWorkers(linkSiteFilter || undefined);
    }
  }, [dialogOpen, dialogMode, linkSiteFilter, loadEligibleWorkers]);

  const resetDialog = () => {
    setDialogMode('create');
    setSelectedWorker(null);
    setForm({ name: '', employeeId: '', pin: '', role: 'scouter', siteId: activeSiteId || '' });
    setLinkForm({ pin: '', role: 'scouter', siteId: '' });
    setLinkSiteFilter(activeSiteId || '');
  };

  const openDialog = () => {
    resetDialog();
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    resetDialog();
  };

  if (!canManageFieldStaff(user)) {
    return (
      <Box>
        <Alert severity="error">{t('fieldStaffAccess.noPermission')}</Alert>
      </Box>
    );
  }

  const handleCreate = async () => {
    if (!form.name.trim() || !form.employeeId.trim() || !form.pin || !form.siteId) {
      notify.warning('Name, Employee ID, PIN, and Site are required');
      return;
    }
    setSaving(true);
    try {
      await apiRequest('/field-staff', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      notify.success('Field staff created');
      closeDialog();
      loadStaff();
    } catch (err) {
      notify.error(err.message || 'Failed to create field staff');
    } finally {
      setSaving(false);
    }
  };

  const handleLink = async () => {
    if (!selectedWorker) {
      notify.warning('Select a worker to link');
      return;
    }
    if (!linkForm.pin || linkForm.pin.length < 4) {
      notify.warning('PIN must be at least 4 characters');
      return;
    }
    const siteId = linkForm.siteId || selectedWorker.site_id;
    if (!siteId) {
      notify.warning('Assign a site before linking');
      return;
    }
    setSaving(true);
    try {
      await apiRequest('/field-staff/link', {
        method: 'POST',
        body: JSON.stringify({
          workerId: selectedWorker.id,
          role: linkForm.role,
          pin: linkForm.pin,
          siteId,
        }),
      });
      notify.success('Worker linked as field staff');
      closeDialog();
      loadStaff();
    } catch (err) {
      notify.error(err.message || 'Failed to link worker');
    } finally {
      setSaving(false);
    }
  };

  const handlePinUpdate = async () => {
    if (!pinDialog.id || pinValue.length < 4) return;
    setSaving(true);
    try {
      await apiRequest(`/field-staff/${pinDialog.id}/pin`, {
        method: 'PUT',
        body: JSON.stringify({ pin: pinValue }),
      });
      notify.success('PIN updated');
      setPinDialog({ open: false, id: null, name: '' });
      setPinValue('');
    } catch (err) {
      notify.error(err.message || 'Failed to update PIN');
    } finally {
      setSaving(false);
    }
  };

  const roleNote = linkForm.role === 'scouter'
    ? 'Keeps current team leader status'
    : 'Will become / remain a team leader';

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <PageTitle help="Create or link scouters and operators with Employee ID + PIN. Link existing manpower workers without duplicating them.">Field Staff</PageTitle>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openDialog}>
          Add Field Staff
        </Button>
      </Box>

      <InfoNote severity="info" sx={{ mb: 2 }}>{t('fieldStaffAccess.siteScopeNote')}</InfoNote>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
      ) : (
        <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 'calc(100vh - 260px)' }}>
          <Table size="small" sx={excelTableSx}>
            <TableHead>
              <TableRow>
                <GutterCell />
                <TableCell>Name</TableCell>
                <TableCell>Employee ID</TableCell>
                <TableCell>Role</TableCell>
                <TableCell>Site</TableCell>
                <TableCell>Team Leader</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {staff.map((row, idx) => (
                <TableRow key={row.id} hover>
                  <GutterCell index={idx + 1} />
                  <TableCell>{row.name}</TableCell>
                  <TableCell>{row.employee_id}</TableCell>
                  <TableCell><Chip size="small" label={getRoleLabel(row.role)} /></TableCell>
                  <TableCell>{row.site_name || '—'}</TableCell>
                  <TableCell>{row.is_team_leader ? 'Yes' : 'No'}</TableCell>
                  <TableCell>
                    <Button size="small" onClick={() => setPinDialog({ open: true, id: row.id, name: row.name })}>
                      Set PIN
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {staff.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} align="center">No field staff yet.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog open={dialogOpen} onClose={closeDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Add Field Staff</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={dialogMode}
            onChange={(_, v) => { if (v) { setDialogMode(v); setSelectedWorker(null); } }}
            fullWidth
          >
            <ToggleButton value="create">Create new</ToggleButton>
            <ToggleButton value="link">Link existing worker</ToggleButton>
          </ToggleButtonGroup>

          {dialogMode === 'create' ? (
            <>
              <TextField label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} fullWidth />
              <TextField label="Employee ID" value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} fullWidth />
              <TextField label="PIN" type="password" value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value })} fullWidth inputProps={{ maxLength: 8 }} />
              <FormControl fullWidth>
                <InputLabel id="fieldstaffmanagement-role-label-1">Role</InputLabel>
                <Select labelId="fieldstaffmanagement-role-label-1" label="Role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  <MenuItem value="scouter">Scouter (not team leader)</MenuItem>
                  <MenuItem value="operator">Operator (team leader + IPM)</MenuItem>
                </Select>
              </FormControl>
              <FormControl fullWidth>
                <InputLabel id="fieldstaffmanagement-site-label-2">Site</InputLabel>
                <Select labelId="fieldstaffmanagement-site-label-2" label="Site" value={form.siteId} onChange={(e) => setForm({ ...form, siteId: e.target.value })}>
                  {sites.map((s) => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
                </Select>
              </FormControl>
            </>
          ) : (
            <>
              <Typography variant="body2" color="text.secondary">
                Link a worker already in Manpower Record as a scouter or operator.
              </Typography>
              <FormControl fullWidth>
                <InputLabel id="fieldstaffmanagement-filter-by-site-label-3">Filter by site</InputLabel>
                <Select labelId="fieldstaffmanagement-filter-by-site-label-3"
                  label="Filter by site"
                  value={linkSiteFilter}
                  onChange={(e) => {
                    setLinkSiteFilter(e.target.value);
                    setSelectedWorker(null);
                  }}
                >
                  <MenuItem value="">All sites</MenuItem>
                  {sites.map((s) => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
                </Select>
              </FormControl>
              <Autocomplete
                options={eligibleWorkers}
                loading={loadingWorkers}
                value={selectedWorker}
                onChange={(_, w) => {
                  setSelectedWorker(w);
                  setLinkForm((f) => ({ ...f, siteId: w?.site_id || '' }));
                }}
                getOptionLabel={workerOptionLabel}
                isOptionEqualToValue={(a, b) => a.id === b.id}
                renderInput={(params) => (
                  <TextField {...params} label="Select worker" placeholder="Search by name or ID" />
                )}
                renderOption={(props, w) => (
                  <li {...props} key={w.id}>
                    <Box>
                      <Typography variant="body2" fontWeight={600}>{w.name} · {w.employee_id}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {w.is_team_leader ? 'Team Leader: Yes' : 'Team Leader: No'} · {w.category || '—'}
                        {w.site_name ? ` · ${w.site_name}` : ''}
                      </Typography>
                    </Box>
                  </li>
                )}
                noOptionsText={loadingWorkers ? 'Loading…' : 'No unlinked workers found'}
              />

              {selectedWorker && (
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>Worker status</Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                    <Chip
                      size="small"
                      label={selectedWorker.is_team_leader ? 'Team Leader: Yes' : 'Team Leader: No'}
                      color={selectedWorker.is_team_leader ? 'warning' : 'default'}
                    />
                    <Chip size="small" label={`Category: ${selectedWorker.category || '—'}`} variant="outlined" />
                    <Chip size="small" label="App account: None" variant="outlined" />
                    {selectedWorker.site_name && (
                      <Chip size="small" label={`Site: ${selectedWorker.site_name}`} variant="outlined" />
                    )}
                  </Box>
                </Paper>
              )}

              <Divider />

              <FormControl fullWidth>
                <InputLabel id="fieldstaffmanagement-role-to-assign-label-4">Role to assign</InputLabel>
                <Select labelId="fieldstaffmanagement-role-to-assign-label-4" label="Role to assign" value={linkForm.role} onChange={(e) => setLinkForm({ ...linkForm, role: e.target.value })}>
                  <MenuItem value="scouter">Scouter</MenuItem>
                  <MenuItem value="operator">Operator</MenuItem>
                </Select>
              </FormControl>
              <Typography variant="caption" color="text.secondary">{roleNote}</Typography>

              <TextField
                label="PIN"
                type="password"
                value={linkForm.pin}
                onChange={(e) => setLinkForm({ ...linkForm, pin: e.target.value })}
                fullWidth
                inputProps={{ maxLength: 8 }}
              />

              {selectedWorker && !selectedWorker.site_id && (
                <FormControl required fullWidth>
                  <InputLabel id="fieldstaffmanagement-site-required-label-5">Site</InputLabel>
                  <Select labelId="fieldstaffmanagement-site-required-label-5"
                    label="Site"
                    value={linkForm.siteId}
                    onChange={(e) => setLinkForm({ ...linkForm, siteId: e.target.value })}
                  >
                    {sites.map((s) => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
                  </Select>
                </FormControl>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog}>Cancel</Button>
          {dialogMode === 'create' ? (
            <Button variant="contained" onClick={handleCreate} disabled={saving}>{saving ? 'Saving…' : 'Create'}</Button>
          ) : (
            <Button variant="contained" onClick={handleLink} disabled={saving || !selectedWorker}>{saving ? 'Linking…' : 'Link worker'}</Button>
          )}
        </DialogActions>
      </Dialog>

      <Dialog open={pinDialog.open} onClose={() => setPinDialog({ open: false, id: null, name: '' })} maxWidth="xs" fullWidth>
        <DialogTitle>Set PIN for {pinDialog.name}</DialogTitle>
        <DialogContent>
          <TextField fullWidth label="New PIN" type="password" value={pinValue} onChange={(e) => setPinValue(e.target.value)} sx={{ mt: 1 }} inputProps={{ maxLength: 8 }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPinDialog({ open: false, id: null, name: '' })}>Cancel</Button>
          <Button variant="contained" onClick={handlePinUpdate} disabled={saving || pinValue.length < 4}>Save</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
