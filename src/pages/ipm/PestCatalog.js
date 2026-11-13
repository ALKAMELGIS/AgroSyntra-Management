import ReadOnlyBanner from '../../components/ReadOnlyBanner';
import FitTableContainer from '../../components/table/FitTableContainer';
import { useState, useEffect } from 'react';
import {
  Box, Typography, Paper, Table, TableBody, TableCell, TableHead, TableRow,
  Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem, Chip,
  IconButton, Alert, CircularProgress, Tabs, Tab, Tooltip, Switch, FormControlLabel, Autocomplete,
} from '@mui/material';
import { AddOutlined as Add, EditOutlined as Edit, DeleteOutlined as Delete, BugReportOutlined as BugReport, ScienceOutlined as Science, HelpOutlineOutlined as HelpOutline, GrassOutlined as Grass, SpaOutlined as Spa, HealthAndSafetyOutlined as HealthAndSafety } from '@mui/icons-material';
import api from '../../utils/api';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { canEditIpmCatalog } from '../../utils/ipmAccess';
import { useActiveSite } from '../../contexts/ActiveSiteContext';
import { excelTableSx, freezeColumnsSx, GutterCell, GUTTER_WIDTH } from '../../components/table/ExcelTable';
import InfoNote from '../../components/InfoNote';
import { HintLabel } from '../../components/form/FormLayout';
import PageTitle from '../../components/PageTitle';

const CATEGORY_LABELS = {
  pest: 'Pest',
  disease: 'Disease',
  preventative: 'Preventative',
  other: 'Other',
  biological_control: 'Biological Control',
};
const CATEGORY_COLORS = {
  pest: 'warning',
  disease: 'error',
  preventative: 'info',
  other: 'default',
  biological_control: 'success',
};

// Name stays pinned: nine columns of chips still run off a typical screen, and
// once they do every row looks alike without it.
const NAME_FROZEN_WIDTHS = [160];
const TABLE_MAX_HEIGHT = 'calc(100vh - 280px)';

const emptyForm = {
  name: '',
  category: 'pest',
  description: '',
  recommendedAction: '',
  warningThreshold: 20,
  criticalThreshold: 50,
  matchPattern: '',
  sortOrder: 0,
  includeInSummary: false,
  matchToId: '',
  groupIds: [],
};

const ORGANIZE_CATEGORIES = new Set(['pest', 'disease', 'preventative']);

function catalogSearchHaystack(item) {
  const groups = (item.groups || []).map((group) => group.name || '').join(' ');
  return `${item.name || ''} ${groups}`.toLowerCase();
}

export default function PestCatalog() {
  const { user } = useAuth();
  const { activeSiteId, activeSite } = useActiveSite();
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageTab, setPageTab] = useState('catalog');
  const [tab, setTab] = useState('all');
  const [samplingRows, setSamplingRows] = useState([]);
  const [samplingLoading, setSamplingLoading] = useState(false);
  const [samplingDrafts, setSamplingDrafts] = useState({});
  const [samplingSaving, setSamplingSaving] = useState({});
  const [samplingError, setSamplingError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [catalogSearch, setCatalogSearch] = useState('');
  const [mergeConfirm, setMergeConfirm] = useState(false);

  const { t } = useTranslation();
  const canEdit = canEditIpmCatalog(user);

  useEffect(() => { loadCatalog(); }, []);

  const loadSamplingUnits = async () => {
    if (!activeSiteId) {
      setSamplingRows([]);
      setSamplingDrafts({});
      return;
    }
    try {
      setSamplingLoading(true);
      setSamplingError('');
      const res = await api.get(`/scouting/sampling-units?site_id=${activeSiteId}`);
      const rows = res.data?.data || [];
      setSamplingRows(rows);
      const drafts = {};
      rows.forEach((r) => {
        drafts[r.field_id] = r.sampling_units ?? '';
      });
      setSamplingDrafts(drafts);
    } catch (err) {
      setSamplingError(err.response?.data?.error?.message || 'Failed to load sampling units');
    } finally {
      setSamplingLoading(false);
    }
  };

  useEffect(() => {
    if (pageTab === 'sampling') loadSamplingUnits();
  }, [pageTab, activeSiteId]);

  const loadCatalog = async () => {
    try {
      setLoading(true);
      const res = await api.get('/scouting/pest-catalog?include_inactive=true');
      setCatalog(res.data.data || []);
    } catch (err) {
      console.error('Failed to load pest catalog:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreate = () => {
    setEditing(null);
    setForm({
      ...emptyForm,
      category: tab === 'biological_control'
        ? 'biological_control'
        : tab === 'preventative'
          ? 'preventative'
          : 'pest',
    });
    setError('');
    setDialogOpen(true);
  };

  const handleOpenEdit = (item) => {
    setEditing(item);
    setForm({
      name: item.name || '',
      category: item.category || 'pest',
      description: item.description || '',
      recommendedAction: item.recommended_action || '',
      warningThreshold: item.warning_threshold ?? 20,
      criticalThreshold: item.critical_threshold ?? 50,
      matchPattern: item.match_pattern || '',
      sortOrder: item.sort_order ?? 0,
      includeInSummary: Boolean(item.include_in_summary),
      matchToId: '',
      groupIds: (item.groups || []).map((group) => group.id),
    });
    setError('');
    setDialogOpen(true);
  };

  const isBioForm = form.category === 'biological_control';
  const isPreventativeForm = form.category === 'preventative';

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Name is required'); return; }
    if (editing && form.matchToId) {
      setMergeConfirm(true);
      return;
    }
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const payload = {
        name: form.name,
        category: form.category,
        description: form.description,
        groupIds: ORGANIZE_CATEGORIES.has(form.category) ? form.groupIds : [],
      };

      if (isBioForm) {
        payload.matchPattern = form.matchPattern.trim().toUpperCase();
        payload.sortOrder = Number(form.sortOrder) || 0;
        payload.includeInSummary = Boolean(form.includeInSummary);
      } else {
        payload.recommendedAction = form.recommendedAction;
        payload.warningThreshold = Number(form.warningThreshold);
        payload.criticalThreshold = Number(form.criticalThreshold);
      }

      if (editing) {
        await api.put(`/scouting/pest-catalog/${editing.id}`, payload);
      } else {
        await api.post('/scouting/pest-catalog', payload);
      }
      setDialogOpen(false);
      loadCatalog();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleMergeConfirm = async () => {
    if (!editing || !form.matchToId) return;
    setSaving(true);
    setError('');
    try {
      const res = await api.put(`/scouting/pest-catalog/${editing.id}`, { matchToId: form.matchToId });
      const rewritten = res.data?.data?.rewrittenApplications || 0;
      const target = catalog.find((row) => row.id === form.matchToId);
      setSuccess(
        `Rewrote ${rewritten} application record${rewritten === 1 ? '' : 's'} to ${target?.name || 'the chosen name'} and hid ${editing.name} from your catalog.`,
      );
      setMergeConfirm(false);
      setDialogOpen(false);
      loadCatalog();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to match catalog entry');
      setMergeConfirm(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/scouting/pest-catalog/${id}`);
      setDeleteConfirm(null);
      loadCatalog();
    } catch (err) {
      alert('Failed to delete');
    }
  };

  const handleToggleActive = async (item) => {
    try {
      await api.put(`/scouting/pest-catalog/${item.id}`, { isActive: !item.is_active });
      loadCatalog();
    } catch (err) {
      alert('Failed to toggle status');
    }
  };

  const handleSaveSamplingUnits = async (fieldId) => {
    const value = Number(samplingDrafts[fieldId]);
    if (!Number.isFinite(value) || value <= 0) {
      setSamplingError('Sampling units must be a number greater than zero.');
      return;
    }
    setSamplingSaving((prev) => ({ ...prev, [fieldId]: true }));
    setSamplingError('');
    try {
      await api.put(`/scouting/sampling-units/${fieldId}`, { samplingUnits: value });
      await loadSamplingUnits();
    } catch (err) {
      setSamplingError(err.response?.data?.error?.message || 'Failed to save sampling units');
    } finally {
      setSamplingSaving((prev) => ({ ...prev, [fieldId]: false }));
    }
  };

  const nonBioCatalog = catalog.filter((c) => c.category !== 'biological_control');
  const bioCatalog = catalog.filter((c) => c.category === 'biological_control');
  const searchNeedle = catalogSearch.trim().toLowerCase();
  const filtered = (tab === 'all'
    ? nonBioCatalog
    : catalog.filter((c) => c.category === tab)
  ).filter((item) => !searchNeedle || catalogSearchHaystack(item).includes(searchNeedle));
  const organizeOptions = catalog.filter((row) => (
    ORGANIZE_CATEGORIES.has(row.category)
    && row.is_active !== false
    && (!editing || row.id !== editing.id)
  ));
  const matchValue = organizeOptions.find((row) => row.id === form.matchToId) || null;
  const groupValue = organizeOptions.filter((row) => form.groupIds.includes(row.id));
  const isBioTab = tab === 'biological_control';
  const isPreventativeTab = tab === 'preventative';

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 3, mb: 3 }}>
        <PageTitle>Pest &amp; Disease Catalog</PageTitle>
        {canEdit && pageTab === 'catalog' && (
          <Button variant="contained" startIcon={<Add />} onClick={handleOpenCreate}>
            {isBioTab ? 'Add Biological Control' : isPreventativeTab ? 'Add Preventative' : 'Add Entry'}
          </Button>
        )}
      </Box>

      <Tabs value={pageTab} onChange={(_, v) => setPageTab(v)} sx={{ mb: 2 }}>
        <Tab label="Catalog" value="catalog" icon={<BugReport fontSize="small" />} iconPosition="start" />
        <Tab label="Sampling Units" value="sampling" icon={<Grass fontSize="small" />} iconPosition="start" />
      </Tabs>

      {!canEdit && (
        <ReadOnlyBanner message={t('ipmCatalogAccess.pestViewOnly')} />
      )}

      {pageTab === 'sampling' ? (
        <>
          {samplingError && <Alert severity="error" sx={{ mb: 2 }}>{samplingError}</Alert>}
          {!activeSiteId ? (
            <InfoNote mode="line" severity="info" sx={{ mb: 2 }}>
              Select a site in the sidebar to configure sampling units.
            </InfoNote>
          ) : (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Per-field sampling units for scouting infestation %: (plant count × sum of segment averages) ÷ sampling units.
              Showing fields for <strong>{activeSite?.name || 'selected site'}</strong>.
              NetHouse fields default to 340 unless overridden.
            </Typography>
          )}
          {activeSiteId && (samplingLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
              <CircularProgress />
            </Box>
          ) : (
            <FitTableContainer component={Paper} variant="outlined" >
              <Table size="small" sx={excelTableSx}>
                <TableHead>
                  <TableRow>
                    <GutterCell />
                    <TableCell>Field</TableCell>
                    <TableCell>Site</TableCell>
                    <TableCell>Field type</TableCell>
                    <TableCell className="col-numeric">Sampling units</TableCell>
                    {canEdit && <TableCell>Actions</TableCell>}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {samplingRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={canEdit ? 6 : 5} align="center" sx={{ py: 4 }}>
                        <Typography color="text.secondary">No fields found</Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    samplingRows.map((row, idx) => (
                      <TableRow key={row.field_id} hover>
                        <GutterCell index={idx + 1} />
                        <TableCell>{row.field_name}</TableCell>
                        <TableCell>{row.site_name || '—'}</TableCell>
                        <TableCell>{row.field_type || '—'}</TableCell>
                        <TableCell className="col-numeric">
                          {canEdit ? (
                            <TextField
                              size="small"
                              type="number"
                              value={samplingDrafts[row.field_id] ?? ''}
                              onChange={(e) => setSamplingDrafts((prev) => ({
                                ...prev,
                                [row.field_id]: e.target.value,
                              }))}
                              inputProps={{ min: 0.01, step: 1, style: { textAlign: 'right' } }}
                              sx={{ width: 120 }}
                            />
                          ) : (
                            row.sampling_units ?? '—'
                          )}
                        </TableCell>
                        {canEdit && (
                          <TableCell align="center">
                            <Button
                              size="small"
                              variant="outlined"
                              disabled={samplingSaving[row.field_id]}
                              onClick={() => handleSaveSamplingUnits(row.field_id)}
                            >
                              {samplingSaving[row.field_id] ? 'Saving…' : 'Save'}
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </FitTableContainer>
          ))}
        </>
      ) : (
        <>
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
      {/* Category Tabs */}
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label={`All (${nonBioCatalog.length})`} value="all" />
        <Tab label={`Pests (${catalog.filter((c) => c.category === 'pest').length})`} value="pest"
          icon={<BugReport fontSize="small" />} iconPosition="start" />
        <Tab label={`Diseases (${catalog.filter((c) => c.category === 'disease').length})`} value="disease"
          icon={<Science fontSize="small" />} iconPosition="start" />
        <Tab label={`Preventatives (${catalog.filter((c) => c.category === 'preventative').length})`} value="preventative"
          icon={<HealthAndSafety fontSize="small" />} iconPosition="start" />
        <Tab label={`Biological Control (${bioCatalog.length})`} value="biological_control"
          icon={<Spa fontSize="small" />} iconPosition="start" />
        <Tab label={`Other (${catalog.filter((c) => c.category === 'other').length})`} value="other"
          icon={<HelpOutline fontSize="small" />} iconPosition="start" />
      </Tabs>

      {isBioTab && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Simple biological control agent names for scouting summary and IPM reference.
          Enable &quot;Include in summary&quot; to show a yellow column on the Scouting Summary report.
        </Typography>
      )}

      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}

      <TextField
        size="small"
        value={catalogSearch}
        onChange={(e) => setCatalogSearch(e.target.value)}
        placeholder="Search name or group (Thrips finds spots and combos)"
        sx={{ mb: 2, maxWidth: 420 }}
        fullWidth
      />

      <FitTableContainer component={Paper} variant="outlined" >
        <Table size="small" sx={[excelTableSx, freezeColumnsSx(NAME_FROZEN_WIDTHS, GUTTER_WIDTH)]}>
          <TableHead>
            <TableRow>
              <GutterCell />
              <TableCell className="col-frozen-0">Name</TableCell>
              {!isBioTab && <TableCell>Category</TableCell>}
              {!isBioTab && <TableCell>Groups</TableCell>}
              {isBioTab && <TableCell>Match pattern</TableCell>}
              {isBioTab && <TableCell className="col-numeric">Sort</TableCell>}
              {isBioTab && <TableCell>Summary</TableCell>}
              <TableCell>Description</TableCell>
              {!isBioTab && <TableCell>Recommended Action</TableCell>}
              {!isBioTab && <TableCell className="col-numeric">Warning %</TableCell>}
              {!isBioTab && <TableCell className="col-numeric">Critical %</TableCell>}
              {!isBioTab && <TableCell>Custom</TableCell>}
              <TableCell>Active</TableCell>
              {canEdit && <TableCell>Actions</TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canEdit ? (isBioTab ? 9 : 11) : (isBioTab ? 8 : 10)} align="center" sx={{ py: 4 }}>
                  <Typography color="text.secondary">No entries found</Typography>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((item, idx) => (
                <TableRow key={item.id} hover sx={{ opacity: item.is_active ? 1 : 0.5 }}>
                  <GutterCell index={idx + 1} />
                  <TableCell className="col-frozen-0" title={item.name || ''}>{item.name}</TableCell>
                  {!isBioTab && (
                    <TableCell>
                      <Chip label={CATEGORY_LABELS[item.category] || item.category} size="small"
                        color={CATEGORY_COLORS[item.category] || 'default'} variant="outlined" />
                    </TableCell>
                  )}
                  {!isBioTab && (
                    <TableCell>
                      {(item.groups || []).length === 0 ? '—' : (item.groups || []).map((group) => (
                        <Chip key={group.id} label={group.name} size="small" sx={{ mr: 0.5, mb: 0.5 }} />
                      ))}
                    </TableCell>
                  )}
                  {isBioTab && (
                    <TableCell sx={{ fontFamily: 'var(--font-mono, ui-monospace, monospace)' }}>{item.match_pattern || '—'}</TableCell>
                  )}
                  {isBioTab && (
                    <TableCell className="col-numeric">{item.sort_order ?? 0}</TableCell>
                  )}
                  {isBioTab && (
                    <TableCell align="center">
                      {item.include_in_summary ? (
                        <Chip label="Yes" size="small" color="success" variant="outlined" />
                      ) : '—'}
                    </TableCell>
                  )}
                  <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.description || ''}>
                    {item.description || '—'}
                  </TableCell>
                  {!isBioTab && (
                    <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.recommended_action || ''}>
                      {item.recommended_action || '—'}
                    </TableCell>
                  )}
                  {!isBioTab && (
                    <TableCell className="col-numeric">
                      <Chip label={`${item.warning_threshold ?? 20}%`} size="small" color="warning" variant="outlined" />
                    </TableCell>
                  )}
                  {!isBioTab && (
                    <TableCell className="col-numeric">
                      <Chip label={`${item.critical_threshold ?? 50}%`} size="small" color="error" variant="outlined" />
                    </TableCell>
                  )}
                  {!isBioTab && (
                    <TableCell align="center">{item.is_custom ? 'Yes' : 'No'}</TableCell>
                  )}
                  <TableCell align="center">
                    {canEdit ? (
                      <Switch size="small" checked={item.is_active} onChange={() => handleToggleActive(item)} />
                    ) : (
                      item.is_active ? 'Active' : 'Inactive'
                    )}
                  </TableCell>
                  {canEdit && (
                    <TableCell align="center">
                      <Tooltip title="Edit">
                        <IconButton size="small" onClick={() => handleOpenEdit(item)}>
                          <Edit fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <IconButton size="small" color="error" onClick={() => setDeleteConfirm(item)}>
                          <Delete fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </FitTableContainer>

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? 'Edit Entry' : (isBioForm ? 'Add Biological Control' : isPreventativeForm ? 'Add Preventative' : 'Add Pest / Disease')}</DialogTitle>
        <DialogContent>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <TextField fullWidth label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
            required margin="normal" />
          <TextField fullWidth select label="Category" value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value, matchToId: '', groupIds: [] })} margin="normal">
            <MenuItem value="pest">Pest</MenuItem>
            <MenuItem value="disease">Disease</MenuItem>
            <MenuItem value="preventative">Preventative</MenuItem>
            <MenuItem value="biological_control">Biological Control</MenuItem>
            <MenuItem value="other">Other</MenuItem>
          </TextField>
          {ORGANIZE_CATEGORIES.has(form.category) && (
            <>
              {editing && (
                <Autocomplete
                  sx={{ mt: 2 }}
                  options={organizeOptions}
                  value={matchValue}
                  getOptionLabel={(opt) => opt.name || ''}
                  isOptionEqualToValue={(a, b) => a.id === b.id}
                  onChange={(_, next) => setForm({ ...form, matchToId: next?.id || '' })}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label={<HintLabel hint="Use for duplicates or spelling. Sprays keep the name you pick. Leave empty for spots and combos.">Match to existing</HintLabel>}
                    />
                  )}
                />
              )}
              {!form.matchToId && (
                <Autocomplete
                  multiple
                  sx={{ mt: 2 }}
                  options={organizeOptions}
                  value={groupValue}
                  getOptionLabel={(opt) => opt.name || ''}
                  isOptionEqualToValue={(a, b) => a.id === b.id}
                  onChange={(_, next) => setForm({ ...form, groupIds: next.map((row) => row.id) })}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label={<HintLabel hint="Example: Thrips Spot → Thrips. A combo can belong to two groups.">Groups (original pests)</HintLabel>}
                    />
                  )}
                />
              )}
            </>
          )}
          <TextField fullWidth label="Description" value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })} margin="normal" multiline rows={2} />
          {isBioForm ? (
            <>
              <TextField fullWidth label={<HintLabel hint="Matches bio record product names">Match pattern</HintLabel>} value={form.matchPattern}
                onChange={(e) => setForm({ ...form, matchPattern: e.target.value })}
                margin="normal" placeholder="SWIRSKI" />
              <Box sx={{ display: 'flex', gap: 2, mt: 1 }}>
                <TextField fullWidth label="Sort order" type="number"
                  value={form.sortOrder}
                  onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
                  inputProps={{ min: 0, step: 1 }} />
                <FormControlLabel
                  sx={{ mt: 1 }}
                  control={(
                    <Switch
                      checked={form.includeInSummary}
                      onChange={(e) => setForm({ ...form, includeInSummary: e.target.checked })}
                    />
                  )}
                  label="Include in scouting summary"
                />
              </Box>
            </>
          ) : (
            <>
              <TextField fullWidth label="Recommended action" value={form.recommendedAction}
                onChange={(e) => setForm({ ...form, recommendedAction: e.target.value })} margin="normal" multiline rows={2} />
              <Box sx={{ display: 'flex', gap: 2, mt: 1 }}>
                <TextField fullWidth label={<HintLabel hint="Infestation % that sends a warning notification">Warning threshold (%)</HintLabel>} type="number"
                  value={form.warningThreshold}
                  onChange={(e) => setForm({ ...form, warningThreshold: e.target.value })}
                  inputProps={{ min: 0, max: 100 }} />
                <TextField fullWidth label={<HintLabel hint="Infestation % that sends a critical notification">Critical threshold (%)</HintLabel>} type="number"
                  value={form.criticalThreshold}
                  onChange={(e) => setForm({ ...form, criticalThreshold: e.target.value })}
                  inputProps={{ min: 0, max: 100 }} />
              </Box>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleSave} variant="contained" disabled={saving}>
            {saving ? 'Saving...' : editing ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)}>
        <DialogTitle>Confirm Delete</DialogTitle>
        <DialogContent>
          <Typography>Are you sure you want to deactivate "{deleteConfirm?.name}"? This will hide it from the catalog but keep historical data.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirm(null)}>Cancel</Button>
          <Button onClick={() => handleDelete(deleteConfirm.id)} color="error" variant="contained">Delete</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={mergeConfirm} onClose={() => !saving && setMergeConfirm(false)}>
        <DialogTitle>Match to existing name</DialogTitle>
        <DialogContent>
          <Typography>
            Sprays that used &quot;{editing?.name}&quot; will be rewritten to
            &quot;{matchValue?.name || 'the chosen name'}&quot;. This extra catalog row will be hidden from your farm only. Continue?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMergeConfirm(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleMergeConfirm} variant="contained" disabled={saving}>
            {saving ? 'Saving...' : 'Rewrite and hide'}
          </Button>
        </DialogActions>
      </Dialog>
        </>
      )}
        </>
      )}
    </Box>
  );
}
