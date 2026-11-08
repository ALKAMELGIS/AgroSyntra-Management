import { useState, useEffect, useCallback, useMemo } from 'react';
import { confirmAction } from '../../components/ConfirmDialog';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box, Typography, Paper, Button, TextField, Chip, Grid,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  CircularProgress, Alert, IconButton, Tooltip, Dialog, DialogTitle,
  DialogContent, DialogActions, FormControl, InputLabel, Select, MenuItem,
  Checkbox, FormControlLabel, Divider, Autocomplete,
} from '@mui/material';
import {
  AddOutlined as Add, EditOutlined as Edit, DeleteOutlined as Delete, SyncOutlined as Sync, CheckCircleOutlined as CheckCircle, ErrorOutlined as ErrorIcon,
  Link as LinkIcon, LinkOffOutlined as LinkOff, ScienceOutlined as Science, PlayArrow, ContentCopyOutlined as ContentCopy, HistoryOutlined as History,
} from '@mui/icons-material';
import { useNotification } from '../../contexts/NotificationContext';
import { excelTableSx, freezeColumnsSx, GutterCell, GUTTER_WIDTH } from '../../components/table/ExcelTable';

import { API_BASE, getAuthHeaders } from '../../config/api';
import PageTitle from '../../components/PageTitle';

const API = API_BASE;
const INTEGRATION_FROZEN_WIDTHS = [180];
const hdrs = () => ({
  'Content-Type': 'application/json',
  ...getAuthHeaders(),
});

const TYPES = [
  { value: 'weather_station', label: 'Weather Station' },
  { value: 'soil_sensor', label: 'Soil Sensor' },
  { value: 'valve_controller', label: 'Valve Controller' },
  { value: 'other', label: 'Other' },
];

const AUTH_TYPES = [
  { value: 'api_key', label: 'API Key' },
  { value: 'bearer_token', label: 'Bearer Token' },
  { value: 'basic', label: 'Basic Auth (Username/Password)' },
  { value: 'none', label: 'None' },
];

const WEATHER_MAPPING = {
  maxTemp: 'data.temperature.max',
  minTemp: 'data.temperature.min',
  avgRH: 'data.humidity.average',
  rainfall: 'data.rain.total',
  pressure: 'data.pressure.value',
  windSpeed: 'data.wind.speed',
  windDirection: 'data.wind.direction',
  clouds: 'data.clouds.coverage',
};

const SOIL_MAPPING = {
  moisture_pct: 'data.moisture',
  temperature_c: 'data.temperature',
  ec_dsm: 'data.ec',
  ph: 'data.ph',
  depth_cm: 'data.depth',
};

function getDefaultMapping(type) {
  if (type === 'soil_sensor') return { ...SOIL_MAPPING };
  return { ...WEATHER_MAPPING };
}

const emptyForm = {
  name: '', type: 'weather_station', provider: '', baseUrl: '',
  authType: 'api_key', authConfig: { key: '', param: 'api_key' },
  pollingIntervalMinutes: 60, dataMapping: { ...WEATHER_MAPPING }, isActive: true,
};

function getNextSyncText(item) {
  if (!item.is_active) return 'Disabled';
  if (!item.last_synced_at) return 'Due now';
  const next = new Date(item.last_synced_at).getTime() + item.polling_interval_minutes * 60 * 1000;
  const diff = next - Date.now();
  if (diff <= 0) return 'Due now';
  const mins = Math.ceil(diff / 60000);
  if (mins >= 60) return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  return `${mins}m`;
}

export default function ApiIntegrations() {
  const notify = useNotification();
  const [integrations, setIntegrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);

  // Dialogs
  const [formDialog, setFormDialog] = useState({ open: false, mode: 'add' });
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(null);
  const [syncing, setSyncing] = useState(null);
  const [dialogTestResult, setDialogTestResult] = useState(null);
  const [dialogTesting, setDialogTesting] = useState(false);

  // Field assignment
  const [fieldDialog, setFieldDialog] = useState({ open: false, integrationId: null, integrationName: '' });
  const [assignedFields, setAssignedFields] = useState([]);
  const [allFields, setAllFields] = useState([]);
  const [farmAreas, setFarmAreas] = useState([]);
  const [assignForm, setAssignForm] = useState({ fieldIds: [], stationId: '', isShared: false });
  const [loadingFields, setLoadingFields] = useState(false);

  // Sync history
  const [historyDialog, setHistoryDialog] = useState({ open: false, integrationId: null, integrationName: '' });
  const [syncHistory, setSyncHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Next-sync countdown timer (tick every 60s)
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(timer);
  }, []);

  const loadIntegrations = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API}/api-integrations`, { headers: hdrs() });
      const data = await res.json();
      if (data.success) setIntegrations(data.data || []);
      else setError(data.error?.message || 'Failed to load');
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadIntegrations(); }, [loadIntegrations]);

  const loadAllFields = async () => {
    try {
      const res = await fetch(`${API}/fields`, { headers: hdrs() });
      const data = await res.json();
      if (data.success) setAllFields(data.data || []);
    } catch {}
  };

  const loadFarmAreas = async () => {
    try {
      const res = await fetch(`${API}/farm-areas`, { headers: hdrs() });
      const data = await res.json();
      if (data.success) setFarmAreas(data.data || []);
    } catch {}
  };

  // Save integration
  const handleSave = async () => {
    setSaving(true);
    try {
      const isEdit = formDialog.mode === 'edit';
      const url = isEdit ? `${API}/api-integrations/${form.id}` : `${API}/api-integrations`;
      const res = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: hdrs(),
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.success) {
        notify.success(isEdit ? 'Integration updated' : 'Integration created');
        setFormDialog({ open: false, mode: 'add' });
        setDialogTestResult(null);
        loadIntegrations();
      } else {
        notify.error(data.error?.message || 'Failed');
      }
    } catch (err) { notify.error(err.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!(await confirmAction('Delete this integration?'))) return;
    try {
      await fetch(`${API}/api-integrations/${id}`, { method: 'DELETE', headers: hdrs() });
      notify.success('Integration deleted');
      loadIntegrations();
    } catch (err) { notify.error(err.message); }
  };

  const handleDuplicate = async (id) => {
    try {
      const res = await fetch(`${API}/api-integrations/${id}/duplicate`, { method: 'POST', headers: hdrs() });
      const data = await res.json();
      if (data.success) {
        notify.success(`Duplicated as "${data.data.name}"`);
        loadIntegrations();
      } else {
        notify.error(data.error?.message || 'Failed');
      }
    } catch (err) { notify.error(err.message); }
  };

  const handleTest = async (id) => {
    setTesting(id);
    setTestResult(null);
    try {
      const res = await fetch(`${API}/api-integrations/${id}/test`, { method: 'POST', headers: hdrs() });
      const data = await res.json();
      setTestResult({ id, ...data.data });
      if (data.data?.success) notify.success('Connection successful');
      else notify.warning(data.data?.message || 'Connection failed');
    } catch (err) { notify.error(err.message); }
    finally { setTesting(null); }
  };

  const handleDialogTest = async () => {
    setDialogTesting(true);
    setDialogTestResult(null);
    try {
      const isEdit = formDialog.mode === 'edit' && form.id;
      const url = isEdit
        ? `${API}/api-integrations/${form.id}/test`
        : `${API}/api-integrations/test-unsaved`;
      const res = await fetch(url, {
        method: 'POST', headers: hdrs(),
        body: isEdit ? undefined : JSON.stringify({
          baseUrl: form.baseUrl, authType: form.authType, authConfig: form.authConfig,
        }),
      });
      const data = await res.json();
      setDialogTestResult(data.data);
    } catch (err) { setDialogTestResult({ success: false, message: err.message }); }
    finally { setDialogTesting(false); }
  };

  const handleSync = async (id) => {
    setSyncing(id);
    try {
      const res = await fetch(`${API}/api-integrations/${id}/sync`, { method: 'POST', headers: hdrs() });
      const data = await res.json();
      if (data.success) {
        const r = data.data;
        notify.success(`Synced: ${r.synced} fields, skipped: ${r.skipped}${r.errors?.length ? `, errors: ${r.errors.length}` : ''}`);
        loadIntegrations();
      } else {
        notify.error(data.error?.message || 'Sync failed');
      }
    } catch (err) { notify.error(err.message); }
    finally { setSyncing(null); }
  };

  // Sync history
  const openHistoryDialog = async (integrationId, integrationName) => {
    setHistoryDialog({ open: true, integrationId, integrationName });
    setLoadingHistory(true);
    try {
      const res = await fetch(`${API}/api-integrations/${integrationId}/sync-history?limit=20`, { headers: hdrs() });
      const data = await res.json();
      if (data.success) setSyncHistory(data.data || []);
    } catch {}
    finally { setLoadingHistory(false); }
  };

  // Field assignment
  const openFieldDialog = async (integrationId, integrationName) => {
    setFieldDialog({ open: true, integrationId, integrationName });
    setLoadingFields(true);
    setAssignForm({ fieldIds: [], stationId: '', isShared: false });
    try {
      await Promise.all([loadAllFields(), loadFarmAreas()]);
      const assignedRes = await fetch(`${API}/api-integrations/${integrationId}/fields`, { headers: hdrs() }).then((r) => r.json());
      setAssignedFields(assignedRes?.data || []);
    } catch {}
    finally { setLoadingFields(false); }
  };

  const handleAssign = async () => {
    try {
      const assignments = assignForm.fieldIds.map((fId) => ({
        fieldId: fId, stationId: assignForm.stationId, isShared: assignForm.isShared,
      }));
      const res = await fetch(`${API}/api-integrations/${fieldDialog.integrationId}/fields`, {
        method: 'POST', headers: hdrs(), body: JSON.stringify({ assignments }),
      });
      const data = await res.json();
      if (data.success) {
        notify.success('Fields assigned');
        const updatedRes = await fetch(`${API}/api-integrations/${fieldDialog.integrationId}/fields`, { headers: hdrs() }).then((r) => r.json());
        setAssignedFields(updatedRes?.data || []);
        setAssignForm({ fieldIds: [], stationId: '', isShared: false });
        loadIntegrations();
      }
    } catch (err) { notify.error(err.message); }
  };

  const handleRemoveField = async (fieldId) => {
    try {
      await fetch(`${API}/api-integrations/${fieldDialog.integrationId}/fields/${fieldId}`, {
        method: 'DELETE', headers: hdrs(),
      });
      setAssignedFields((prev) => prev.filter((f) => f.field_id !== fieldId));
      loadIntegrations();
    } catch (err) { notify.error(err.message); }
  };

  const handleBulkSelectArea = (areaId) => {
    const areaFields = allFields
      .filter((f) => f.farm_area_id === areaId)
      .filter((f) => !assignedFields.some((a) => a.field_id === f.id))
      .map((f) => f.id);
    setAssignForm((prev) => ({
      ...prev,
      fieldIds: [...new Set([...prev.fieldIds, ...areaFields])],
    }));
  };

  const openAdd = () => {
    setForm({ ...emptyForm, authConfig: { key: '', param: 'api_key' }, dataMapping: getDefaultMapping('weather_station') });
    setTestResult(null);
    setDialogTestResult(null);
    setFormDialog({ open: true, mode: 'add' });
  };

  const openEdit = async (id) => {
    try {
      const res = await fetch(`${API}/api-integrations/${id}`, { headers: hdrs() });
      const data = await res.json();
      if (data.success) {
        const i = data.data;
        setForm({
          id: i.id, name: i.name, type: i.type, provider: i.provider || '',
          baseUrl: i.base_url, authType: i.auth_type,
          authConfig: i.auth_config || {}, pollingIntervalMinutes: i.polling_interval_minutes,
          dataMapping: i.data_mapping || {}, isActive: i.is_active,
        });
        setTestResult(null);
        setDialogTestResult(null);
        setFormDialog({ open: true, mode: 'edit' });
      }
    } catch (err) { notify.error(err.message); }
  };

  const renderAuthFields = () => {
    switch (form.authType) {
      case 'api_key':
        return (
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField label="API Key" fullWidth value={form.authConfig.key || ''}
              onChange={(e) => setForm({ ...form, authConfig: { ...form.authConfig, key: e.target.value } })} />
            <TextField label="Query Param Name" fullWidth value={form.authConfig.param || 'api_key'}
              onChange={(e) => setForm({ ...form, authConfig: { ...form.authConfig, param: e.target.value } })}
              helperText="e.g. api_key, key, token" />
          </Box>
        );
      case 'bearer_token':
        return (
          <TextField label="Bearer Token" fullWidth value={form.authConfig.token || ''}
            onChange={(e) => setForm({ ...form, authConfig: { ...form.authConfig, token: e.target.value } })} />
        );
      case 'basic':
        return (
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField label="Username" fullWidth value={form.authConfig.username || ''}
              onChange={(e) => setForm({ ...form, authConfig: { ...form.authConfig, username: e.target.value } })} />
            <TextField label="Password" type="password" fullWidth value={form.authConfig.password || ''}
              onChange={(e) => setForm({ ...form, authConfig: { ...form.authConfig, password: e.target.value } })} />
          </Box>
        );
      default:
        return null;
    }
  };

  const getStatusInfo = (item) => {
    if (item.last_error) return { label: 'Error', color: 'error', icon: <ErrorIcon fontSize="small" /> };
    if (item.last_synced_at) return { label: 'Active', color: 'success', icon: <CheckCircle fontSize="small" /> };
    return { label: 'Never Synced', color: 'default', icon: null };
  };

  const formatDate = (d) => d ? new Date(d).toLocaleString() : 'Never';

  const availableFieldsForAssign = useMemo(
    () => allFields.filter((f) => !assignedFields.some((a) => a.field_id === f.id)),
    [allFields, assignedFields],
  );

  const areaOptions = useMemo(() => {
    const areaIds = [...new Set(availableFieldsForAssign.map((f) => f.farm_area_id).filter(Boolean))];
    return farmAreas.filter((a) => areaIds.includes(a.id));
  }, [availableFieldsForAssign, farmAreas]);

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Science color="primary" sx={{ fontSize: 32 }} />
          <PageTitle>API Integrations</PageTitle>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Button variant="outlined" component={RouterLink} to="/admin/integrations/john-deere" startIcon={<LinkIcon />}>John Deere Operations Center</Button>
          <Button variant="contained" startIcon={<Add />} onClick={openAdd}>Add Integration</Button>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {loading ? (
        <Box sx={{ textAlign: 'center', py: 6 }}><CircularProgress /></Box>
      ) : integrations.length === 0 ? (
        <Paper sx={{ p: 6, textAlign: 'center' }}>
          <Typography color="text.secondary" gutterBottom>No API integrations configured yet</Typography>
          <Button variant="outlined" startIcon={<Add />} onClick={openAdd}>Add Your First Integration</Button>
        </Paper>
      ) : (
        <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 'calc(100vh - 280px)' }}>
          <Table size="small" sx={[excelTableSx, freezeColumnsSx(INTEGRATION_FROZEN_WIDTHS, GUTTER_WIDTH)]}>
            <TableHead>
              <TableRow>
                <GutterCell />
                <TableCell className="col-frozen-0">Name</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Provider</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Last Synced</TableCell>
                <TableCell className="col-numeric">Fields</TableCell>
                <TableCell>Next Sync</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {integrations.map((item, idx) => {
                const status = getStatusInfo(item);
                return (
                  <TableRow key={item.id} hover>
                    <GutterCell index={idx + 1} />
                    <TableCell className="col-frozen-0" title={item.name} sx={{ fontWeight: 600 }}>{item.name}</TableCell>
                    <TableCell>
                      <Chip label={TYPES.find((t) => t.value === item.type)?.label || item.type} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell>{item.provider || '—'}</TableCell>
                    <TableCell>
                      <Chip icon={status.icon} label={status.label} color={status.color} size="small" />
                      {item.last_error && (
                        <Typography variant="caption" color="error" display="block" sx={{ mt: 0.5, maxWidth: 200 }} noWrap>
                          {item.last_error}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{formatDate(item.last_synced_at)}</Typography>
                    </TableCell>
                    <TableCell className="col-numeric">
                      <Chip label={item.field_count || 0} size="small" variant="outlined"
                        onClick={() => openFieldDialog(item.id, item.name)} />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color={getNextSyncText(item) === 'Due now' ? 'warning.dark' : 'text.secondary'}>
                        {getNextSyncText(item)}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      <Tooltip title="Test Connection">
                        <IconButton size="small" onClick={() => handleTest(item.id)} disabled={testing === item.id}>
                          {testing === item.id ? <CircularProgress size={18} /> : <PlayArrow fontSize="small" />}
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Sync Now">
                        <IconButton size="small" color="primary" onClick={() => handleSync(item.id)} disabled={syncing === item.id}>
                          {syncing === item.id ? <CircularProgress size={18} /> : <Sync fontSize="small" />}
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Sync History">
                        <IconButton size="small" onClick={() => openHistoryDialog(item.id, item.name)}>
                          <History fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Assign Fields">
                        <IconButton size="small" color="secondary" onClick={() => openFieldDialog(item.id, item.name)}>
                          <LinkIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Duplicate">
                        <IconButton size="small" onClick={() => handleDuplicate(item.id)}>
                          <ContentCopy fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Edit">
                        <IconButton size="small" onClick={() => openEdit(item.id)}><Edit fontSize="small" /></IconButton>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <IconButton size="small" color="error" onClick={() => handleDelete(item.id)}><Delete fontSize="small" /></IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {testResult && (
        <Alert severity={testResult.success ? 'success' : 'error'} sx={{ mt: 2 }} onClose={() => setTestResult(null)}>
          {testResult.message}
          {testResult.sampleKeys && <Typography variant="caption" display="block">Response keys: {testResult.sampleKeys.join(', ')}</Typography>}
        </Alert>
      )}

      {/* ─── Add / Edit Integration Dialog ───────────────── */}
      <Dialog open={formDialog.open} onClose={() => { setFormDialog({ open: false, mode: 'add' }); setDialogTestResult(null); }} maxWidth="md" fullWidth>
        <DialogTitle>{formDialog.mode === 'edit' ? 'Edit Integration' : 'Add API Integration'}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField label="Name" fullWidth required value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. GH1 Weather Station" />
              <FormControl sx={{ minWidth: 200 }}>
                <InputLabel id="apiintegrations-type-label-1">Type</InputLabel>
                <Select labelId="apiintegrations-type-label-1" value={form.type} label="Type" onChange={(e) => {
                  const newType = e.target.value;
                  setForm({ ...form, type: newType, dataMapping: getDefaultMapping(newType) });
                }}>
                  {TYPES.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
                </Select>
              </FormControl>
            </Box>

            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField label="Provider" fullWidth value={form.provider}
                onChange={(e) => setForm({ ...form, provider: e.target.value })}
                placeholder="e.g. Davis, METOS, Custom" />
              <TextField label="Polling Interval (min)" type="number" sx={{ width: 200 }}
                value={form.pollingIntervalMinutes}
                onChange={(e) => setForm({ ...form, pollingIntervalMinutes: Number(e.target.value) })} />
            </Box>

            <TextField label="Base URL" fullWidth required value={form.baseUrl}
              onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
              placeholder="https://api.provider.com/v1/stations/123/data" />

            <Divider />
            <Typography variant="subtitle2" color="text.secondary">Authentication</Typography>

            <FormControl fullWidth>
              <InputLabel id="apiintegrations-auth-type-label-2">Auth Type</InputLabel>
              <Select labelId="apiintegrations-auth-type-label-2" value={form.authType} label="Auth Type" onChange={(e) => setForm({ ...form, authType: e.target.value, authConfig: {} })}>
                {AUTH_TYPES.map((a) => <MenuItem key={a.value} value={a.value}>{a.label}</MenuItem>)}
              </Select>
            </FormControl>
            {renderAuthFields()}

            <Divider />
            <Typography variant="subtitle2" color="text.secondary">
              Data Mapping (API response path &rarr; weather log field)
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Use dot-notation to map fields from the API response. e.g. "data.temperature.max" extracts the value at response.data.temperature.max
            </Typography>

            <Grid container spacing={1}>
              {Object.entries(form.dataMapping || {}).map(([key, val]) => (
                <Grid size={{ xs: 12, sm: 6 }} key={key}>
                  <TextField
                    label={key} fullWidth size="small" value={val}
                    onChange={(e) => setForm({ ...form, dataMapping: { ...form.dataMapping, [key]: e.target.value } })}
                  />
                </Grid>
              ))}
            </Grid>

            <FormControlLabel
              control={<Checkbox checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />}
              label="Active (enable automatic polling)"
            />

            {dialogTestResult && (
              <Alert severity={dialogTestResult.success ? 'success' : 'error'} onClose={() => setDialogTestResult(null)}>
                {dialogTestResult.message}
                {dialogTestResult.sampleKeys && (
                  <Typography variant="caption" display="block">Response keys: {dialogTestResult.sampleKeys.join(', ')}</Typography>
                )}
              </Alert>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDialogTest} disabled={dialogTesting || !form.baseUrl}
            startIcon={dialogTesting ? <CircularProgress size={16} /> : <PlayArrow />}>
            Test Connection
          </Button>
          <Box sx={{ flex: 1 }} />
          <Button onClick={() => { setFormDialog({ open: false, mode: 'add' }); setDialogTestResult(null); }}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving || !form.name || !form.baseUrl}>
            {saving ? <CircularProgress size={20} /> : formDialog.mode === 'edit' ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ─── Sync History Dialog ─────────────────────────── */}
      <Dialog open={historyDialog.open} onClose={() => setHistoryDialog({ open: false, integrationId: null, integrationName: '' })} maxWidth="md" fullWidth>
        <DialogTitle>Sync History: {historyDialog.integrationName}</DialogTitle>
        <DialogContent>
          {loadingHistory ? <CircularProgress /> : syncHistory.length === 0 ? (
            <Typography color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>No sync history yet</Typography>
          ) : (
            <TableContainer>
              <Table size="small" sx={excelTableSx}>
                <TableHead>
                  <TableRow>
                    <GutterCell />
                    <TableCell>Time</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell className="col-numeric">Synced</TableCell>
                    <TableCell className="col-numeric">Skipped</TableCell>
                    <TableCell className="col-numeric">Errors</TableCell>
                    <TableCell>Trigger</TableCell>
                    <TableCell>Duration</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {syncHistory.map((log, idx) => {
                    const statusColor = { success: 'success', partial: 'warning', failed: 'error', running: 'info' }[log.status] || 'default';
                    const duration = log.finished_at && log.started_at
                      ? `${((new Date(log.finished_at) - new Date(log.started_at)) / 1000).toFixed(1)}s`
                      : '—';
                    return (
                      <TableRow key={log.id} hover>
                        <GutterCell index={idx + 1} />
                        <TableCell>{new Date(log.started_at).toLocaleString()}</TableCell>
                        <TableCell><Chip label={log.status} color={statusColor} size="small" /></TableCell>
                        <TableCell className="col-numeric">{log.synced_count}</TableCell>
                        <TableCell className="col-numeric">{log.skipped_count}</TableCell>
                        <TableCell className="col-numeric">
                          {log.error_count > 0 ? (
                            <Tooltip title={Array.isArray(log.errors) ? log.errors.join('\n') : ''}>
                              <Chip label={log.error_count} color="error" size="small" />
                            </Tooltip>
                          ) : 0}
                        </TableCell>
                        <TableCell><Chip label={log.triggered_by} size="small" variant="outlined" /></TableCell>
                        <TableCell>{duration}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHistoryDialog({ open: false, integrationId: null, integrationName: '' })}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* ─── Field Assignment Dialog ─────────────────────── */}
      <Dialog open={fieldDialog.open} onClose={() => setFieldDialog({ open: false, integrationId: null, integrationName: '' })} maxWidth="sm" fullWidth>
        <DialogTitle>Field Assignments: {fieldDialog.integrationName}</DialogTitle>
        <DialogContent>
          {loadingFields ? <CircularProgress /> : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
              {assignedFields.length > 0 && (
                <>
                  <Typography variant="subtitle2">Assigned Fields</Typography>
                  <TableContainer>
                    <Table size="small" sx={excelTableSx}>
                      <TableHead>
                        <TableRow>
                          <GutterCell />
                          <TableCell>Field</TableCell>
                          <TableCell>Area</TableCell>
                          <TableCell>Station ID</TableCell>
                          <TableCell>Shared</TableCell>
                          <TableCell />
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {assignedFields.map((f, idx) => (
                          <TableRow key={f.field_id} hover>
                            <GutterCell index={idx + 1} />
                            <TableCell>{f.field_name}</TableCell>
                            <TableCell>{f.farm_area_name || '—'}</TableCell>
                            <TableCell>{f.station_id || '—'}</TableCell>
                            <TableCell>{f.is_shared ? 'Yes' : 'No'}</TableCell>
                            <TableCell>
                              <IconButton size="small" color="error" onClick={() => handleRemoveField(f.field_id)} aria-label="Unlink">
                                <LinkOff fontSize="small" />
                              </IconButton>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                  <Divider />
                </>
              )}

              <Typography variant="subtitle2">Assign New Fields</Typography>

              {/* Bulk select by farm area */}
              {areaOptions.length > 0 && (
                <FormControl fullWidth size="small">
                  <InputLabel id="apiintegrations-quick-select-all-fields--label-3">Quick select: All fields in area</InputLabel>
                  <Select labelId="apiintegrations-quick-select-all-fields--label-3"
                    value=""
                    label="Quick select: All fields in area"
                    onChange={(e) => { if (e.target.value) handleBulkSelectArea(e.target.value); }}
                  >
                    {areaOptions.map((a) => {
                      const count = availableFieldsForAssign.filter((f) => f.farm_area_id === a.id).length;
                      return (
                        <MenuItem key={a.id} value={a.id}>
                          {a.name} ({count} field{count !== 1 ? 's' : ''})
                        </MenuItem>
                      );
                    })}
                  </Select>
                </FormControl>
              )}

              <Autocomplete
                multiple
                options={availableFieldsForAssign}
                getOptionLabel={(o) => o.name}
                groupBy={(o) => {
                  const area = farmAreas.find((a) => a.id === o.farm_area_id);
                  return area?.name || 'Other';
                }}
                value={allFields.filter((f) => assignForm.fieldIds.includes(f.id))}
                onChange={(_, vals) => setAssignForm({ ...assignForm, fieldIds: vals.map((v) => v.id) })}
                renderInput={(params) => <TextField {...params} label="Select Fields" />}
              />
              <TextField label="Station ID (external identifier)" value={assignForm.stationId}
                onChange={(e) => setAssignForm({ ...assignForm, stationId: e.target.value })}
                helperText="The station ID used by the provider's API" />
              <FormControlLabel
                control={<Checkbox checked={assignForm.isShared} onChange={(e) => setAssignForm({ ...assignForm, isShared: e.target.checked })} />}
                label="Shared station (open field — one station for multiple fields)"
              />
              <Button variant="contained" onClick={handleAssign} disabled={assignForm.fieldIds.length === 0}
                startIcon={<LinkIcon />}>
                Assign {assignForm.fieldIds.length} Field{assignForm.fieldIds.length !== 1 ? 's' : ''}
              </Button>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFieldDialog({ open: false, integrationId: null, integrationName: '' })}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
