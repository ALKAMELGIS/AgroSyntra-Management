import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Collapse, IconButton, InputAdornment, MenuItem, Paper, Stack,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import {
  CheckCircleOutlined as OkIcon, ErrorOutlineOutlined as ErrIcon, WarningAmberOutlined as WarnIcon,
  ContentCopyOutlined as CopyIcon, SearchOutlined as SearchIcon, SyncOutlined as SyncIcon,
  VisibilityOutlined as ShowIcon, VisibilityOffOutlined as HideIcon, ExpandMoreOutlined as ExpandIcon,
  ExpandLessOutlined as CollapseIcon, EastOutlined as ArrowIcon, WestOutlined as ArrowBackIcon,
  SaveOutlined as SaveIcon,
} from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import { useNotification } from '../../contexts/NotificationContext';
import { API_BASE, getAuthHeaders } from '../../config/api';

async function call(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) throw new Error(json?.error?.message || `Request failed (${res.status})`);
  return json.data;
}

/**
 * Settings → Zones & Sites → "GIS configuration".
 * Relationship Class between the ArcGIS structures layer and AgroCloud:
 *   feature (GlobalID · ZONE_ID + Farm_Code) 1─1 field 1─M form records (FORM_ID)
 * Three steps: layer → keys → link. The layer is only read.
 */

/** Short check results shown as chips (both languages written here, not taken from the server). */
function checkChips(r, ar) {
  const out = [];
  const add = (status, en, a) => out.push({ status, text: ar ? a : en });
  const dup = r.keys?.duplicateCount ?? r.keys?.duplicates?.length ?? 0;
  add('ok', `${r.layer.featureCount ?? '—'} features`, `${r.layer.featureCount ?? '—'} معلم`);
  add(dup ? 'error' : 'ok', dup ? `${dup} duplicate keys` : 'Keys unique', dup ? `${dup} مفتاح مكرر` : 'المفاتيح فريدة');
  const missing = (r.keys?.missingZone || 0) + (r.keys?.missingFarmCode || 0);
  if (missing) add('warn', `${missing} missing keys`, `${missing} مفتاح ناقص`);
  const code = r.keys?.notApplicableSiteCode;
  if (code !== null && code !== undefined) {
    const n = (r.keys.sites || []).find((x) => String(x.value).startsWith(`${code} ·`))?.count || 0;
    if (n) add('warn', `SITE ${code} (Not Applicable): ${n}`, `SITE ${code} (غير منطبق): ${n}`);
  }
  const newZones = r.agroCloud?.zonesOnlyInLayer || [];
  if (newZones.length) add('warn', `New zones: ${newZones.join(', ')}`, `مناطق جديدة: ${newZones.join('، ')}`);
  add('ok', 'Read only', 'قراءة فقط');
  return out;
}

const STATUS_ICON = { ok: OkIcon, warn: WarnIcon, error: ErrIcon };
const STATUS_COLOR = { ok: 'success', warn: 'warning', error: 'error' };

function Step({ n, title, done, disabled, children, actions }) {
  return (
    <Paper variant="outlined" sx={{ p: { xs: 1.75, md: 2 }, borderRadius: 2, opacity: disabled ? 0.55 : 1 }} aria-disabled={disabled || undefined}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 1.5, flexWrap: 'wrap' }}>
        <Box sx={{
          width: 28, height: 28, borderRadius: '50%', display: 'grid', placeItems: 'center', flexShrink: 0,
          bgcolor: done ? 'success.main' : 'primary.main', color: 'common.white', fontWeight: 700, fontSize: '0.875rem',
        }}>
          {done ? <OkIcon sx={{ fontSize: 18 }} /> : n}
        </Box>
        <Typography variant="h6" component="h2" sx={{ fontSize: '1rem', fontWeight: 600, flex: '1 1 auto' }}>{title}</Typography>
        {actions && <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>{actions}</Box>}
      </Box>
      {children}
    </Paper>
  );
}

function Num({ label, value, color }) {
  return (
    <Box sx={{ minWidth: 104, flex: '1 1 104px', px: 1.5, py: 1, borderRadius: 1.5, bgcolor: 'action.hover' }}>
      <Typography sx={{ fontWeight: 700, fontSize: '1.125rem', color, fontVariantNumeric: 'tabular-nums', lineHeight: 1.3 }}><bdi>{value ?? '—'}</bdi></Typography>
      <Typography variant="caption" color="text.secondary" component="div">{label}</Typography>
    </Box>
  );
}

function CopyId({ value }) {
  const notify = useNotification();
  if (!value) return null;
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25, fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'text.secondary' }} translate="no">
      <bdi>{value}</bdi>
      <Tooltip title="Copy">
        <IconButton size="small" aria-label="Copy" onClick={() => { navigator.clipboard?.writeText(value); notify.success('Copied'); }}>
          <CopyIcon sx={{ fontSize: 14 }} />
        </IconButton>
      </Tooltip>
    </Box>
  );
}

/** One line: layer ─(keys)─ field ─ forms, plus the ArcGIS Relationship Class properties on demand. */
function RelationshipBar({ layerName, mapping, connected, rtl }) {
  const [open, setOpen] = useState(false);
  const Arrow = rtl ? ArrowBackIcon : ArrowIcon;
  const origin = layerName || 'Agro_Structures';
  const pk = mapping.globalId || 'GlobalID';
  const bk = `${mapping.zoneId || 'ZONE_ID'} + ${mapping.farmCode || 'Farm_Code'}`;
  const node = (label, primary) => (
    <Box sx={{ px: 1.25, py: 0.75, borderRadius: 1.5, border: 1, borderColor: primary ? 'primary.main' : 'divider', bgcolor: primary ? 'action.hover' : 'background.paper', fontWeight: 600, fontSize: '0.875rem' }}>
      {label}
    </Box>
  );
  const edge = (text) => (
    <Box sx={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', color: 'text.secondary', px: 0.5 }}>
      <Typography variant="caption" translate="no" sx={{ lineHeight: 1.2 }}><bdi>{text}</bdi></Typography>
      <Arrow sx={{ fontSize: 18 }} />
    </Box>
  );
  const props = [
    ['Origin', <bdi translate="no">{origin}</bdi>],
    ['Origin primary key', <bdi translate="no">{`${pk} · ${bk}`}</bdi>],
    ['Destination', 'Fields'],
    ['Destination foreign key', <bdi translate="no">gis_external_id · gis_zone_id + gis_farm_code</bdi>],
    ['Cardinality', <bdi translate="no">1 : 1 · 1 : M</bdi>],
    ['Type', 'Simple · read only'],
  ];
  return (
    <Paper variant="outlined" sx={{ p: { xs: 1.75, md: 2 }, borderRadius: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Typography variant="h6" component="h2" sx={{ fontSize: '1rem', fontWeight: 600 }}>Relationship Class</Typography>
        <Chip size="small" color={connected ? 'success' : 'default'} variant={connected ? 'filled' : 'outlined'} label={connected ? 'Connected' : 'Not set'} />
        <Box sx={{ flex: 1 }} />
        <Button size="small" onClick={() => setOpen((v) => !v)} endIcon={open ? <CollapseIcon /> : <ExpandIcon />} aria-expanded={open}>
          Properties
        </Button>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap', mt: 1.5 }}>
        {node(<bdi translate="no">{origin}</bdi>, true)}
        {edge(`1:1 · ${pk}`)}
        {node('Field')}
        {edge('1:M · field_id')}
        {node(<bdi translate="no">FORM_ID</bdi>, true)}
      </Box>
      <Collapse in={open} unmountOnExit>
        <Box component="dl" sx={{ m: 0, mt: 1.5, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '200px 1fr' }, columnGap: 2, rowGap: 0.5 }}>
          {props.map(([k, v]) => (
            <Box key={k} sx={{ display: 'contents' }}>
              <Typography component="dt" variant="body2" color="text.secondary">{k}</Typography>
              <Typography component="dd" variant="body2" sx={{ m: 0, fontWeight: 500, overflowWrap: 'anywhere' }}>{v}</Typography>
            </Box>
          ))}
        </Box>
      </Collapse>
    </Paper>
  );
}

const ISSUE_LABEL = {
  feature_missing_keys: 'Feature without ZONE_ID or Farm_Code',
  duplicate_feature_keys: 'Same ZONE_ID + Farm_Code on several features',
  feature_not_linked: 'Feature not linked to a field',
  field_linked_to_many_features: 'Field linked to several features',
  duplicate_field_keys: 'Same ZONE_ID + Farm_Code on several fields',
};

export default function GisRelationshipConfig() {
  const notify = useNotification();
  const theme = useTheme();
  const rtl = theme.direction === 'rtl';
  const [connections, setConnections] = useState([]);
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [name, setName] = useState('');
  const [layerId, setLayerId] = useState(null);
  const [mapping, setMapping] = useState({});
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [moreKeys, setMoreKeys] = useState(false);
  const [showDup, setShowDup] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [issues, setIssues] = useState(null);
  const [showIssues, setShowIssues] = useState(false);
  const [lookup, setLookup] = useState({ zone: '', code: '', globalId: '' });
  const [found, setFound] = useState(null);
  const [openForm, setOpenForm] = useState(null);

  const pickConnection = useCallback((c) => {
    setLayerId(c.id);
    setUrl(`${String(c.source_url || '').replace(/\/$/, '')}/${c.layer_index ?? 0}`);
    setName(c.name || '');
    setMapping(c.attribute_mapping || {});
    setToken('');
    setReport(null);
    setSyncResult(null);
  }, []);

  const loadConnections = useCallback(async (openFirst = false) => {
    try {
      const list = await call('/gis/arcgis/connections');
      setConnections(Array.isArray(list) ? list : []);
      if (openFirst && Array.isArray(list) && list.length) pickConnection(list[0]);
    } catch (e) {
      setError(e.message);
    }
  }, [pickConnection]);
  useEffect(() => { loadConnections(true); }, [loadConnections]);

  const inspect = async (withMapping = mapping) => {
    setBusy('inspect');
    setError('');
    try {
      const data = await call('/gis/arcgis/inspect', {
        method: 'POST',
        body: { url: url.trim(), token: token || undefined, mapping: withMapping, ...(layerId ? { layerId } : {}) },
      });
      setReport(data);
      setMapping(data.mapping || {});
      if (!name && data.layer?.name) setName(data.layer.name);
    } catch (e) {
      setReport(null);
      setError(e.message);
    } finally {
      setBusy('');
    }
  };

  const save = async () => {
    setBusy('save');
    setError('');
    try {
      const data = await call('/gis/arcgis/connections', {
        method: 'POST',
        body: { name: name || undefined, url: url.trim(), mapping, ...(token ? { token } : {}) },
      });
      setLayerId(data.id);
      notify.success(data.created ? 'Connection saved' : 'Connection updated');
      loadConnections();
      return data.id;
    } catch (e) {
      setError(e.message);
      return null;
    } finally {
      setBusy('');
    }
  };

  const syncAndLink = async () => {
    const id = await save();
    if (!id) return;
    setBusy('sync');
    setError('');
    try {
      const sync = await call(`/gis/layers/${id}/sync`, { method: 'POST' });
      const link = await call(`/gis/layers/${id}/auto-link`, { method: 'POST' });
      setSyncResult({ sync, link });
      setIssues(await call('/gis/arcgis/link-issues'));
      loadConnections();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  };

  const findFeature = async () => {
    const qs = new URLSearchParams();
    if (lookup.globalId.trim()) qs.set('global_id', lookup.globalId.trim());
    if (lookup.zone.trim()) qs.set('zone_id', lookup.zone.trim());
    if (lookup.code.trim()) qs.set('farm_code', lookup.code.trim());
    if (layerId) qs.set('layer_id', layerId);
    qs.set('records', '10');
    setBusy('find');
    setFound(null);
    try {
      setFound(await call(`/gis/features/forms?${qs.toString()}`));
    } catch (e) {
      setFound({ error: e.message });
    } finally {
      setBusy('');
    }
  };

  const fieldOptions = useMemo(() => (report?.layer?.fields || []).filter((f) => !['OID', 'Geometry', 'Blob', 'Raster'].includes(f.type)), [report]);
  const keyRoles = report?.keyRoles || [];
  const requiredMissing = keyRoles.some((k) => k.required && !mapping[k.role]);
  const current = connections.find((c) => c.id === layerId);
  const linkedDone = Boolean(syncResult) || Boolean(current?.linked_features);

  const keySelect = (k) => (
    <TextField
      key={k.role} select size="small" label={k.label} required={k.required}
      value={mapping[k.role] || ''} onChange={(e) => setMapping((m) => ({ ...m, [k.role]: e.target.value }))}
      error={k.required && !mapping[k.role]}
      SelectProps={{ displayEmpty: true }} InputLabelProps={{ shrink: true }}
    >
      <MenuItem value=""><em>Not used</em></MenuItem>
      {fieldOptions.map((f) => (
        <MenuItem key={f.name} value={f.name} translate="no">{f.name}</MenuItem>
      ))}
      {k.role === 'globalId' && report?.layer?.globalIdField && !fieldOptions.some((f) => f.name === report.layer.globalIdField) && (
        <MenuItem value={report.layer.globalIdField} translate="no">{report.layer.globalIdField}</MenuItem>
      )}
    </TextField>
  );

  return (
    <Stack spacing={1.5}>
      <RelationshipBar
        layerName={report?.layer?.name || current?.name || null}
        mapping={mapping}
        connected={Boolean(layerId)}
        rtl={rtl}
      />

      {/* 1. Layer */}
      <Step
        n={1} title="Layer" done={Boolean(report)}
        actions={connections.length > 1 ? (
          <TextField select size="small" label="Connection" value={layerId || ''} sx={{ minWidth: 200 }}
            onChange={(e) => { const c = connections.find((x) => x.id === e.target.value); if (c) pickConnection(c); }}>
            {connections.map((c) => <MenuItem key={c.id} value={c.id} translate="no">{c.name}</MenuItem>)}
          </TextField>
        ) : null}
      >
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 3fr) minmax(0, 1.2fr) auto' }, gap: 1.25, alignItems: 'start' }}>
          <TextField
            size="small" label="Layer link" value={url} onChange={(e) => setUrl(e.target.value)} fullWidth
            placeholder="https://…/FeatureServer/21"
            inputProps={{ dir: 'ltr', spellCheck: false, 'aria-label': 'Layer link' }}
          />
          <TextField
            size="small" label="Token (optional)" value={token} onChange={(e) => setToken(e.target.value)} fullWidth
            type={showToken ? 'text' : 'password'} autoComplete="off"
            placeholder={current?.has_token ? '••••••' : ''}
            inputProps={{ dir: 'ltr', 'aria-label': 'Token (optional)' }}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton size="small" aria-label={showToken ? 'Hide token' : 'Show token'} onClick={() => setShowToken((v) => !v)} edge="end">
                    {showToken ? <HideIcon fontSize="small" /> : <ShowIcon fontSize="small" />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
          <Button variant="contained" onClick={() => inspect({})} disabled={!url.trim() || busy === 'inspect'} sx={{ minHeight: 40, whiteSpace: 'nowrap' }}
            startIcon={busy === 'inspect' ? <CircularProgress size={16} color="inherit" /> : <SearchIcon />}>
            Check layer
          </Button>
        </Box>
        {error && <Alert severity="error" sx={{ mt: 1.25 }}>{error}</Alert>}
        {report && (
          <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 1.5 }}>
            <Chip size="small" color="primary" label={<bdi translate="no">{report.layer.name}</bdi>} />
            {checkChips(report, rtl).map((c) => {
              const Icon = STATUS_ICON[c.status];
              return (
                <Chip key={c.text} size="small" variant="outlined" color={STATUS_COLOR[c.status]}
                  icon={<Icon />} label={<span translate="no">{c.text}</span>}
                  onClick={c.status === 'error' && report.keys.duplicates?.length ? () => setShowDup((v) => !v) : undefined} />
              );
            })}
          </Box>
        )}
        <Collapse in={showDup && Boolean(report?.keys?.duplicates?.length)} unmountOnExit>
          <TableContainer sx={{ mt: 1.25, maxHeight: 200, border: 1, borderColor: 'divider', borderRadius: 1 }}>
            <Table size="small" stickyHeader aria-label="Duplicate keys">
              <TableHead><TableRow><TableCell>ZONE_ID</TableCell><TableCell>Farm_Code</TableCell><TableCell align="right">Features</TableCell></TableRow></TableHead>
              <TableBody>
                {(report?.keys?.duplicates || []).map((d) => (
                  <TableRow key={`${d.zone}|${d.farmCode}`}><TableCell>{d.zone}</TableCell><TableCell>{d.farmCode}</TableCell><TableCell align="right">{d.count}</TableCell></TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Collapse>
      </Step>

      {/* 2. Keys */}
      <Step
        n={2} title="Keys" done={Boolean(report) && !requiredMissing} disabled={!report}
        actions={report ? <Button size="small" onClick={() => inspect(mapping)} disabled={busy === 'inspect'} startIcon={<SearchIcon />}>Check again</Button> : null}
      >
        {report ? (
          <>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' }, gap: 1.25 }}>
              {keyRoles.filter((k) => k.required).map(keySelect)}
            </Box>
            <Button size="small" onClick={() => setMoreKeys((v) => !v)} endIcon={moreKeys ? <CollapseIcon /> : <ExpandIcon />} sx={{ mt: 1 }} aria-expanded={moreKeys}>
              More fields
            </Button>
            <Collapse in={moreKeys}>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' }, gap: 1.25, mt: 1 }}>
                {keyRoles.filter((k) => !k.required).map(keySelect)}
              </Box>
            </Collapse>
          </>
        ) : (
          <Typography variant="body2" color="text.secondary">Check the layer first.</Typography>
        )}
      </Step>

      {/* 3. Link */}
      <Step
        n={3} title="Link" done={linkedDone} disabled={!report && !layerId}
        actions={(
          <>
            <Button variant="outlined" onClick={save} disabled={!report || busy === 'save' || requiredMissing} startIcon={<SaveIcon />}>Save</Button>
            <Button variant="contained" onClick={syncAndLink} disabled={!!busy || !url.trim() || (report ? requiredMissing : !layerId)}
              startIcon={busy === 'sync' ? <CircularProgress size={16} color="inherit" /> : <SyncIcon />}>
              Sync and link
            </Button>
          </>
        )}
      >
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          {syncResult ? (
            <>
              <Num label="Features read" value={(syncResult.sync.added || 0) + (syncResult.sync.updated || 0)} />
              <Num label="Linked" value={syncResult.link.linked} color="success.main" />
              <Num label="New fields" value={syncResult.link.created} />
              <Num label="Not linked" value={syncResult.link.skipped} color={syncResult.link.skipped ? 'warning.dark' : undefined} />
            </>
          ) : current ? (
            <>
              <Num label="Linked" value={current.linked_features} color="success.main" />
              <Num label="Features" value={current.synced_features} />
              <Num label="Last sync" value={current.last_synced_at ? String(current.last_synced_at).slice(0, 10) : '—'} />
            </>
          ) : (
            <Typography variant="body2" color="text.secondary">Not linked yet.</Typography>
          )}
        </Box>
        {issues && issues.length > 0 && (
          <>
            <Button size="small" color="warning" onClick={() => setShowIssues((v) => !v)} sx={{ mt: 1 }} aria-expanded={showIssues}
              startIcon={<WarnIcon />}>
              {`${issues.length} link issue(s)`}
            </Button>
            <Collapse in={showIssues} unmountOnExit>
              <TableContainer sx={{ mt: 1, maxHeight: 280, border: 1, borderColor: 'divider', borderRadius: 1 }}>
                <Table size="small" stickyHeader aria-label="Link issues">
                  <TableHead><TableRow><TableCell>Issue</TableCell><TableCell>ZONE_ID</TableCell><TableCell>Farm_Code</TableCell><TableCell align="right">Count</TableCell></TableRow></TableHead>
                  <TableBody>
                    {issues.map((i, n) => (
                      // eslint-disable-next-line react/no-array-index-key
                      <TableRow key={n}>
                        <TableCell data-ui-text="">{ISSUE_LABEL[i.issue] || i.issue}</TableCell>
                        <TableCell>{i.zone_id || '—'}</TableCell>
                        <TableCell>{i.farm_code || '—'}</TableCell>
                        <TableCell align="right">{i.occurrences}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Collapse>
          </>
        )}
      </Step>

      {/* Feature → forms */}
      <Paper variant="outlined" sx={{ p: { xs: 1.75, md: 2 }, borderRadius: 2 }}>
        <Typography variant="h6" component="h2" sx={{ fontSize: '1rem', fontWeight: 600, mb: 1.5 }}>Feature forms</Typography>
        <Box component="form" onSubmit={(e) => { e.preventDefault(); findFeature(); }}
          sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: '150px 200px minmax(0, 1fr) auto' }, gap: 1.25, alignItems: 'start' }}>
          <TextField size="small" label="ZONE_ID" value={lookup.zone} onChange={(e) => setLookup((l) => ({ ...l, zone: e.target.value }))} inputProps={{ dir: 'ltr', 'aria-label': 'ZONE_ID' }} />
          <TextField size="small" label="Farm_Code" value={lookup.code} onChange={(e) => setLookup((l) => ({ ...l, code: e.target.value }))} inputProps={{ dir: 'ltr', 'aria-label': 'Farm_Code' }} />
          <TextField size="small" label="or GlobalID" value={lookup.globalId} onChange={(e) => setLookup((l) => ({ ...l, globalId: e.target.value }))}
            inputProps={{ dir: 'ltr', 'aria-label': 'or GlobalID' }} sx={{ gridColumn: { xs: '1 / -1', md: 'auto' } }} />
          <Button type="submit" variant="contained" disabled={busy === 'find' || !((lookup.zone && lookup.code) || lookup.globalId)}
            startIcon={busy === 'find' ? <CircularProgress size={16} color="inherit" /> : <SearchIcon />} sx={{ gridColumn: { xs: '1 / -1', md: 'auto' }, minHeight: 40 }}>
            Find
          </Button>
        </Box>

        {found?.error && <Alert severity="info" sx={{ mt: 1.5 }}>{found.error}</Alert>}
        {found && !found.error && (
          <Box sx={{ mt: 1.5 }}>
            {found.fields.map((f) => (
              <Box key={f.field_id} sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center', mb: 1 }}>
                <Chip color="primary" size="small" label={<bdi translate="no">{f.gis_link_key || f.field_name}</bdi>} />
                <Typography variant="body2" translate="no">{[f.zone_code, f.site_name, f.farm_area_name, f.field_name].filter(Boolean).join(' › ')}</Typography>
              </Box>
            ))}
            {found.fields.length === 0 && <Alert severity="warning" sx={{ mb: 1 }}>Not linked to a field yet.</Alert>}
            {found.forms.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>No records yet.</Typography>
            ) : (
              <Stack spacing={1}>
                {found.forms.map((f) => {
                  const open = openForm === f.form_id;
                  const valueKeys = [...new Set((f.records || []).flatMap((r) => Object.keys(r.values || {})))]
                    .filter((k) => !/(^id$|_id$|_at$|organization|created_by|updated_by)/.test(k)).slice(0, 6);
                  return (
                    <Paper key={f.form_id} variant="outlined" sx={{ borderRadius: 1.5 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.25, py: 0.75, flexWrap: 'wrap' }}>
                        <Typography sx={{ fontWeight: 600, flex: '1 1 160px' }}>{rtl && f.title_ar ? f.title_ar : f.title_en}</Typography>
                        <CopyId value={f.form_id} />
                        <Chip size="small" label={`${f.record_count} records`} />
                        <IconButton size="small" aria-label={open ? 'Hide records' : 'Show records'} aria-expanded={open} onClick={() => setOpenForm(open ? null : f.form_id)}>
                          {open ? <CollapseIcon /> : <ExpandIcon />}
                        </IconButton>
                      </Box>
                      <Collapse in={open} unmountOnExit>
                        <TableContainer sx={{ borderTop: 1, borderColor: 'divider', maxHeight: 300 }}>
                          <Table size="small" stickyHeader aria-label="Records">
                            <TableHead>
                              <TableRow>
                                <TableCell>Date</TableCell>
                                {valueKeys.map((k) => <TableCell key={k} translate="no">{k}</TableCell>)}
                                <TableCell>Record</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {(f.records || []).map((r) => (
                                <TableRow key={r.record_id}>
                                  <TableCell sx={{ whiteSpace: 'nowrap' }}><bdi>{String(r.record_date || '').slice(0, 10)}</bdi></TableCell>
                                  {valueKeys.map((k) => {
                                    const v = r.values?.[k];
                                    return <TableCell key={k} sx={{ whiteSpace: 'nowrap', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>{v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)}</TableCell>;
                                  })}
                                  <TableCell><CopyId value={r.record_id} /></TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </TableContainer>
                      </Collapse>
                    </Paper>
                  );
                })}
              </Stack>
            )}
          </Box>
        )}
      </Paper>
    </Stack>
  );
}
