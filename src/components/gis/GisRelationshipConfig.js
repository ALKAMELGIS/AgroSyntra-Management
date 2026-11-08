import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Collapse, Divider, IconButton, InputAdornment, Link, MenuItem, Paper, Stack,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import {
  CheckCircleOutlined as OkIcon, ErrorOutlineOutlined as ErrIcon, WarningAmberOutlined as WarnIcon,
  ContentCopyOutlined as CopyIcon, SearchOutlined as SearchIcon, SyncOutlined as SyncIcon,
  VisibilityOutlined as ShowIcon, VisibilityOffOutlined as HideIcon, ExpandMoreOutlined as ExpandIcon,
  ExpandLessOutlined as CollapseIcon, ArrowForwardOutlined as ArrowIcon, ArrowBackOutlined as ArrowBackIcon,
} from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import { Link as RouterLink } from 'react-router-dom';
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

/** How each layer key feeds AgroCloud's setup screens (one hierarchy, built from the layer). */
const HIERARCHY = [
  { role: 'zoneId', arc: 'ZONE_ID', target: 'Zone', screens: [['Zones & Sites', '/manage/countries']] },
  { role: 'site', arc: 'SITE / Site_Code', target: 'Site', screens: [['Zones & Sites', '/manage/countries']] },
  { role: 'structureType', arc: 'Structure_Type', target: 'Farm area · Field type', screens: [['Farm Areas & Crops', '/manage/farm-areas'], ['Field Types & Names', '/manage/field-types']] },
  { role: 'farmCode', arc: 'Farm_Name / Farm_Code', target: 'Field (one per feature)', screens: [['Field Types & Names', '/manage/field-types']] },
  { role: 'globalId', arc: 'GlobalID', target: 'Permanent link to the feature', screens: [] },
];

/** Check messages are written here (not taken from the server) so they read naturally in both languages. */
const CHECK_TEXT = {
  reachable: (r, ar) => (ar ? `الطبقة «${r.layer.name}» متاحة` : `Layer "${r.layer.name}" is reachable`),
  geometry: (r, ar) => (ar ? `نوع الشكل: ${r.layer.geometryType || '—'}` : `Geometry: ${r.layer.geometryType || 'none'}`),
  key_globalId: (r, ar) => (r.mapping.globalId ? (ar ? `المعرّف الثابت: ${r.mapping.globalId}` : `Global ID: ${r.mapping.globalId}`) : (ar ? 'لم يُعثر على حقل GlobalID — اختره' : 'No GlobalID field — choose one')),
  key_zoneId: (r, ar) => (r.mapping.zoneId ? (ar ? `المنطقة: ${r.mapping.zoneId}` : `Zone: ${r.mapping.zoneId}`) : (ar ? 'لم يُعثر على حقل المنطقة — اختره' : 'No zone field — choose one')),
  key_farmCode: (r, ar) => (r.mapping.farmCode ? (ar ? `رمز المزرعة: ${r.mapping.farmCode}` : `Farm code: ${r.mapping.farmCode}`) : (ar ? 'لم يُعثر على حقل رمز المزرعة — اختره' : 'No farm code field — choose one')),
  unique_keys: (r, ar) => (r.keys.duplicateCount || r.keys.duplicates.length
    ? (ar ? `${r.keys.duplicateCount || r.keys.duplicates.length} زوج ZONE_ID + Farm_Code مستخدم في أكثر من معلم` : `${r.keys.duplicateCount || r.keys.duplicates.length} ZONE_ID + Farm_Code pair(s) are used by more than one feature`)
    : (ar ? 'كل زوج ZONE_ID + Farm_Code فريد' : 'Every ZONE_ID + Farm_Code pair is unique')),
  missing_keys: (r, ar) => (ar ? `${r.keys.missingZone} معلم بدون ZONE_ID و${r.keys.missingFarmCode} بدون Farm_Code — لا يمكن ربطها بالمفتاح` : `${r.keys.missingZone} feature(s) without ZONE_ID, ${r.keys.missingFarmCode} without Farm_Code — they cannot be linked by key`),
  missing_global_id: (r, ar) => (ar ? `${r.keys.missingGlobalId} معلم بدون GlobalID` : `${r.keys.missingGlobalId} feature(s) without GlobalID`),
  site_not_applicable: (r, ar) => {
    const code = r.keys.notApplicableSiteCode;
    if (code === null || code === undefined) throw new Error('no code');
    const n = (r.keys.sites || []).find((x) => String(x.value).startsWith(`${code} ·`))?.count || 0;
    return ar ? `${n} معلم قيمة SITE فيه = ${code} (غير منطبق)، والنظام حالياً ينشئ لها موقعاً باسم «Site ${code}»`
      : `${n} feature(s) have SITE = ${code} ("Not Applicable"); today these become a site called "Site ${code}"`;
  },
  zones_new: (r, ar) => (ar ? `مناطق في الطبقة غير موجودة في AgroCloud: ${(r.agroCloud.zonesOnlyInLayer || []).join('، ')}` : `Zones in the layer but not in AgroCloud: ${(r.agroCloud.zonesOnlyInLayer || []).join(', ')}`),
  read_only: (r, ar) => (r.layer.editable
    ? (ar ? 'الطبقة تسمح بالتعديل، لكن AgroCloud يقرؤها فقط ولا يرسل أي تعديل' : 'The layer allows editing, but AgroCloud only reads it (no edits are ever sent)')
    : (ar ? 'طبقة للقراءة فقط — AgroCloud يقرؤها فقط' : 'Read-only layer — AgroCloud only reads it')),
};

function checkText(c, report, ar) {
  try {
    return CHECK_TEXT[c.id] ? CHECK_TEXT[c.id](report, ar) : c.message;
  } catch {
    return c.message;
  }
}

const STATUS_ICON = { ok: OkIcon, warn: WarnIcon, error: ErrIcon };
const STATUS_COLOR = { ok: 'success.main', warn: 'warning.dark', error: 'error.main' };

function Card({ title, help, children, actions }) {
  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, md: 2.5 }, borderRadius: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, mb: help || children ? 1.5 : 0, flexWrap: 'wrap' }}>
        <Box sx={{ flex: '1 1 260px', minWidth: 0 }}>
          <Typography variant="h6" component="h2" sx={{ fontSize: '1rem', fontWeight: 600 }}>{title}</Typography>
          {help && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>{help}</Typography>}
        </Box>
        {actions && <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>{actions}</Box>}
      </Box>
      {children}
    </Paper>
  );
}

/** The link written the way ArcGIS describes a Relationship Class. */
function RelationshipClassCard({ layerName, mapping, connected }) {
  const origin = layerName || 'Agro_Structures';
  const pk = mapping.globalId || 'GlobalID';
  const bk = `${mapping.zoneId || 'ZONE_ID'} + ${mapping.farmCode || 'Farm_Code'}`;
  const rows = [
    ['Relationship class', <bdi translate="no">{`${origin}_AgroCloud_Fields`}</bdi>],
    ['Type', 'Simple (read only — the layer is never edited)'],
    ['Origin (ArcGIS layer)', <bdi translate="no">{origin}</bdi>],
    ['Destination (AgroCloud)', 'Fields → form records'],
    ['Origin primary key', <bdi translate="no">{`${pk}  ·  ${bk}`}</bdi>],
    ['Destination foreign key', <bdi translate="no">fields.gis_external_id  ·  fields.gis_zone_id + gis_farm_code</bdi>],
    ['Cardinality', 'One feature to one field; one field to many form records'],
    ['Forms', <bdi translate="no">field_id → form_records.form_id (FORM_ID)</bdi>],
  ];
  return (
    <Card
      title="Relationship Class"
      help={connected ? 'How each feature of the layer reaches its field and its forms.' : 'Not configured yet — add the layer link below.'}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 2 }}>
        <Chip color="primary" variant="outlined" label={<bdi translate="no">{`ArcGIS · ${origin}`}</bdi>} />
        <Typography variant="caption" color="text.secondary" translate="no">{`1 ─ 1  (${pk})`}</Typography>
        <Chip color="primary" variant="outlined" label="Field" />
        <Typography variant="caption" color="text.secondary" translate="no">1 ─ M  (field_id)</Typography>
        <Chip color="primary" variant="outlined" label={<bdi translate="no">Form records · FORM_ID</bdi>} />
      </Box>
      <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'minmax(180px, 240px) 1fr' }, columnGap: 2, rowGap: 0.75 }}>
        {rows.map(([k, v]) => (
          <Box key={k} sx={{ display: 'contents' }}>
            <Typography component="dt" variant="body2" color="text.secondary">{k}</Typography>
            <Typography component="dd" variant="body2" sx={{ m: 0, fontWeight: 500, overflowWrap: 'anywhere' }}>{v}</Typography>
          </Box>
        ))}
      </Box>
    </Card>
  );
}

function Stat({ label, value, color }) {
  return (
    <Box sx={{ minWidth: 120, flex: '1 1 120px', p: 1.5, borderRadius: 1.5, bgcolor: 'action.hover' }}>
      <Typography variant="caption" color="text.secondary" component="div">{label}</Typography>
      <Typography sx={{ fontWeight: 700, fontSize: '1.25rem', color, fontVariantNumeric: 'tabular-nums' }}><bdi>{value ?? '—'}</bdi></Typography>
    </Box>
  );
}

function CopyId({ value }) {
  const notify = useNotification();
  if (!value) return null;
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'text.secondary' }} translate="no">
      <bdi>{value}</bdi>
      <Tooltip title="Copy">
        <IconButton size="small" aria-label="Copy" onClick={() => { navigator.clipboard?.writeText(value); notify.success('Copied'); }}>
          <CopyIcon sx={{ fontSize: 14 }} />
        </IconButton>
      </Tooltip>
    </Box>
  );
}

/**
 * GIS configuration shown inside Settings → Zones & Sites (tab "GIS configuration").
 * Defines the Relationship Class between the ArcGIS structures layer and AgroCloud:
 *   Layer feature (GlobalID · ZONE_ID + Farm_Code)  1 ─ 1  Field  1 ─ M  Form records (FORM_ID)
 */
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
  const [syncResult, setSyncResult] = useState(null);
  const [issues, setIssues] = useState(null);
  const [lookup, setLookup] = useState({ zone: '', code: '', globalId: '' });
  const [found, setFound] = useState(null);
  const [openForm, setOpenForm] = useState(null);

  const loadConnections = useCallback(async (openFirst = false) => {
    try {
      const list = await call('/gis/arcgis/connections');
      setConnections(list);
      if (openFirst && list.length) pickConnection(list[0]);
    } catch (e) {
      setError(e.message);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { loadConnections(true); }, [loadConnections]);

  const pickConnection = (c) => {
    setLayerId(c.id);
    setUrl(`${String(c.source_url || '').replace(/\/$/, '')}/${c.layer_index ?? 0}`);
    setName(c.name || '');
    setMapping(c.attribute_mapping || {});
    setToken('');
    setReport(null);
    setSyncResult(null);
  };

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
    const id = layerId || (await save());
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
  const requiredMissing = (report?.keyRoles || []).some((k) => k.required && !mapping[k.role]);
  const NextIcon = rtl ? ArrowBackIcon : ArrowIcon;

  return (
    <Box>
      <Stack spacing={2}>
        <RelationshipClassCard
          layerName={report?.layer?.name || connections.find((c) => c.id === layerId)?.name || null}
          mapping={mapping}
          connected={Boolean(layerId)}
        />
        {connections.length > 0 && (
          <Card title="Saved connections" help="Choose one to check it again, change its key fields or sync it.">
            <Stack spacing={1}>
              {connections.map((c) => (
                <Box key={c.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', p: 1.25, borderRadius: 1.5, border: 1, borderColor: layerId === c.id ? 'primary.main' : 'divider' }}>
                  <Box sx={{ flex: '1 1 260px', minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 600 }} translate="no">{c.name}</Typography>
                    <Typography variant="caption" color="text.secondary" component="div" sx={{ overflowWrap: 'anywhere' }} translate="no">
                      {`${c.source_url}/${c.layer_index}`}
                    </Typography>
                  </Box>
                  <Chip size="small" label={`${c.linked_features ?? 0} / ${c.synced_features ?? 0} linked`} />
                  <Chip size="small" variant="outlined" color={c.sync_status === 'error' ? 'error' : c.sync_status === 'synced' ? 'success' : 'default'} label={c.sync_status || 'Not synced'} />
                  <Button size="small" onClick={() => pickConnection(c)}>Open</Button>
                </Box>
              ))}
            </Stack>
          </Card>
        )}

        <Card
          title="1. Layer link"
          help="Paste the link of the feature layer, ending with the layer number (…/FeatureServer/21). Add a token only if the layer is not public."
        >
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '2fr 1fr' }, gap: 1.5 }}>
            <TextField
              label="Layer link" value={url} onChange={(e) => setUrl(e.target.value)} fullWidth
              placeholder="https://…/arcgis/rest/services/<service>/FeatureServer/<layer>"
              inputProps={{ dir: 'ltr', spellCheck: false, 'aria-label': 'Layer link' }}
            />
            <TextField
              label="Token (optional)" value={token} onChange={(e) => setToken(e.target.value)} fullWidth
              type={showToken ? 'text' : 'password'} autoComplete="off"
              inputProps={{ dir: 'ltr', 'aria-label': 'Token (optional)' }}
              helperText={layerId && connections.find((c) => c.id === layerId)?.has_token ? 'A token is saved; leave empty to keep it' : ' '}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton aria-label={showToken ? 'Hide token' : 'Show token'} onClick={() => setShowToken((v) => !v)} edge="end">
                      {showToken ? <HideIcon /> : <ShowIcon />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
          </Box>
          <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap' }}>
            <Button variant="contained" onClick={() => inspect({})} disabled={!url.trim() || busy === 'inspect'}
              startIcon={busy === 'inspect' ? <CircularProgress size={16} color="inherit" /> : <SearchIcon />}>
              Check layer
            </Button>
          </Box>
          {error && <Alert severity="error" sx={{ mt: 1.5 }}>{error}</Alert>}
        </Card>

        {report && (
          <>
            <Card title="2. Layer check" help={`Checked ${new Date(report.inspectedAt).toLocaleString()}`}>
              <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mb: 2 }}>
                <Stat label="Layer" value={report.layer.name} />
                <Stat label="Features" value={report.layer.featureCount} />
                <Stat label="Linked by GlobalID" value={report.agroCloud.matchedByGlobalId} color="success.main" />
                <Stat label="Linked by ZONE_ID + Farm_Code" value={report.agroCloud.matchedByKey} color="success.main" />
                <Stat label="Not linked yet" value={report.agroCloud.unmatched} color={report.agroCloud.unmatched ? 'warning.dark' : undefined} />
              </Box>
              <Stack spacing={0.75}>
                {report.checks.map((c) => {
                  const Icon = STATUS_ICON[c.status];
                  return (
                    <Box key={c.id} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                      <Icon sx={{ color: STATUS_COLOR[c.status], fontSize: 20, mt: '1px', flexShrink: 0 }} />
                      <Typography variant="body2" translate="no">{checkText(c, report, rtl)}</Typography>
                    </Box>
                  );
                })}
              </Stack>
              {report.keys.duplicates.length > 0 && (
                <TableContainer sx={{ mt: 2, maxHeight: 240, border: 1, borderColor: 'divider', borderRadius: 1 }}>
                  <Table size="small" stickyHeader aria-label="Duplicate keys">
                    <TableHead><TableRow><TableCell>ZONE_ID</TableCell><TableCell>Farm_Code</TableCell><TableCell align="right">Features</TableCell></TableRow></TableHead>
                    <TableBody>
                      {report.keys.duplicates.map((d) => (
                        <TableRow key={`${d.zone}|${d.farmCode}`}><TableCell>{d.zone}</TableCell><TableCell>{d.farmCode}</TableCell><TableCell align="right">{d.count}</TableCell></TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </Card>

            <Card
              title="3. Key fields"
              help="Which layer field holds each key. Found automatically; change one if your layer uses another name, then check again."
              actions={<Button onClick={() => inspect(mapping)} disabled={busy === 'inspect'} startIcon={<SearchIcon />}>Check again</Button>}
            >
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(4, 1fr)' }, gap: 1.5 }}>
                {report.keyRoles.map((k) => (
                  <TextField
                    key={k.role} select size="small" label={k.label} required={k.required}
                    value={mapping[k.role] || ''} onChange={(e) => setMapping((m) => ({ ...m, [k.role]: e.target.value }))}
                    error={k.required && !mapping[k.role]}
                    SelectProps={{ displayEmpty: true }} InputLabelProps={{ shrink: true }}
                  >
                    <MenuItem value=""><em>Not used</em></MenuItem>
                    {fieldOptions.map((f) => (
                      <MenuItem key={f.name} value={f.name} translate="no">{f.alias && f.alias !== f.name ? `${f.name} (${f.alias})` : f.name}</MenuItem>
                    ))}
                    {k.role === 'globalId' && report.layer.globalIdField && !fieldOptions.some((f) => f.name === report.layer.globalIdField) && (
                      <MenuItem value={report.layer.globalIdField} translate="no">{report.layer.globalIdField}</MenuItem>
                    )}
                  </TextField>
                ))}
              </Box>

              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle2" sx={{ mb: 1 }}>How the layer builds AgroCloud&apos;s setup</Typography>
              <TableContainer sx={{ border: 1, borderColor: 'divider', borderRadius: 1 }}>
                <Table size="small" aria-label="Layer to AgroCloud">
                  <TableHead>
                    <TableRow><TableCell>ArcGIS field</TableCell><TableCell>AgroCloud</TableCell><TableCell>Managed in</TableCell><TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Values in this layer</TableCell></TableRow>
                  </TableHead>
                  <TableBody>
                    {HIERARCHY.map((h) => {
                      const values = h.role === 'zoneId' ? report.keys.zones : h.role === 'site' ? report.keys.sites : h.role === 'structureType' ? report.keys.structureTypes : null;
                      return (
                        <TableRow key={h.role}>
                          <TableCell sx={{ whiteSpace: 'nowrap' }}><bdi translate="no">{mapping[h.role] || h.arc}</bdi></TableCell>
                          <TableCell data-ui-text="">{h.target}</TableCell>
                          <TableCell data-ui-text="">
                            {h.screens.length ? h.screens.map(([label, to], i) => (
                              <span key={to}>{i > 0 && ' · '}<Link component={RouterLink} to={to} underline="always">{label}</Link></span>
                            )) : '—'}
                          </TableCell>
                          <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                            {values ? (
                              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                                {values.slice(0, 14).map((v) => <Chip key={v.value} size="small" variant="outlined" label={<bdi translate="no">{`${v.value} (${v.count})`}</bdi>} />)}
                                {values.length > 14 && <Chip size="small" label={`+${values.length - 14}`} />}
                              </Box>
                            ) : h.role === 'farmCode' ? <span data-ui-text="">{`${report.keys.uniqueKeys} unique keys`}</span> : '—'}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </Card>

            <Card
              title="4. Save and link"
              help="Saves the link and key fields, reads the features (read only) and links each one to its AgroCloud field by GlobalID, then ZONE_ID + Farm_Code."
              actions={(
                <>
                  <Button variant="outlined" onClick={save} disabled={busy === 'save' || requiredMissing}>Save connection</Button>
                  <Button variant="contained" onClick={syncAndLink} disabled={!!busy || requiredMissing}
                    startIcon={busy === 'sync' ? <CircularProgress size={16} color="inherit" /> : <SyncIcon />}>
                    Sync and link
                  </Button>
                </>
              )}
            >
              <TextField size="small" label="Connection name" value={name} onChange={(e) => setName(e.target.value)} sx={{ width: { xs: '100%', sm: 360 } }} />
              {requiredMissing && <Alert severity="warning" sx={{ mt: 1.5 }}>Choose the required key fields first.</Alert>}
              {syncResult && (
                <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mt: 2 }}>
                  <Stat label="Features read" value={(syncResult.sync.added || 0) + (syncResult.sync.updated || 0)} />
                  <Stat label="Linked to fields" value={syncResult.link.linked} color="success.main" />
                  <Stat label="New fields created" value={syncResult.link.created} />
                  <Stat label="Could not link" value={syncResult.link.skipped} color={syncResult.link.skipped ? 'warning.dark' : undefined} />
                </Box>
              )}
              {issues && issues.length > 0 && (
                <Alert severity="warning" sx={{ mt: 2 }}>
                  {`${issues.length} link issue(s) — see the list below.`}
                </Alert>
              )}
            </Card>
          </>
        )}

        <Card
          title="Find a feature's forms"
          help="Every form recorded on the field linked to a feature, with its FORM_ID. Search by ZONE_ID + Farm_Code or by GlobalID."
        >
          <Box component="form" onSubmit={(e) => { e.preventDefault(); findFeature(); }}
            sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: '160px 220px 1fr auto' }, gap: 1.5, alignItems: 'start' }}>
            <TextField size="small" label="ZONE_ID" value={lookup.zone} onChange={(e) => setLookup((l) => ({ ...l, zone: e.target.value }))} inputProps={{ dir: 'ltr', 'aria-label': 'ZONE_ID' }} />
            <TextField size="small" label="Farm_Code" value={lookup.code} onChange={(e) => setLookup((l) => ({ ...l, code: e.target.value }))} inputProps={{ dir: 'ltr', 'aria-label': 'Farm_Code' }} />
            <TextField size="small" label="or GlobalID" value={lookup.globalId} onChange={(e) => setLookup((l) => ({ ...l, globalId: e.target.value }))}
              inputProps={{ dir: 'ltr', 'aria-label': 'or GlobalID' }} sx={{ gridColumn: { xs: '1 / -1', md: 'auto' } }} />
            <Button type="submit" variant="contained" disabled={busy === 'find' || !((lookup.zone && lookup.code) || lookup.globalId)}
              startIcon={busy === 'find' ? <CircularProgress size={16} color="inherit" /> : <SearchIcon />} sx={{ gridColumn: { xs: '1 / -1', md: 'auto' }, minHeight: 40 }}>
              Find
            </Button>
          </Box>

          {found?.error && <Alert severity="info" sx={{ mt: 2 }}>{found.error}</Alert>}
          {found && !found.error && (
            <Box sx={{ mt: 2 }}>
              {found.fields.map((f) => (
                <Box key={f.field_id} sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center', mb: 1 }}>
                  <Chip color="primary" label={<bdi translate="no">{f.gis_link_key || f.field_name}</bdi>} />
                  <Typography variant="body2" translate="no">{[f.zone_code, f.site_name, f.farm_area_name, f.field_name].filter(Boolean).join(' › ')}</Typography>
                </Box>
              ))}
              {found.fields.length === 0 && <Alert severity="warning" sx={{ mb: 1 }}>The feature is not linked to a field yet. Run “Sync and link”.</Alert>}
              {found.forms.length === 0 ? (
                <Typography color="text.secondary" sx={{ py: 2 }}>No form records on this field yet.</Typography>
              ) : (
                <Stack spacing={1}>
                  {found.forms.map((f) => {
                    const open = openForm === f.form_id;
                    const valueKeys = [...new Set((f.records || []).flatMap((r) => Object.keys(r.values || {})))]
                      .filter((k) => !/(^id$|_id$|_at$|organization|created_by|updated_by)/.test(k)).slice(0, 6);
                    return (
                      <Paper key={f.form_id} variant="outlined" sx={{ borderRadius: 1.5 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1.25, flexWrap: 'wrap' }}>
                          <Box sx={{ flex: '1 1 240px', minWidth: 0 }}>
                            <Typography sx={{ fontWeight: 600 }}>{rtl && f.title_ar ? f.title_ar : f.title_en}</Typography>
                            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                              <Typography variant="caption" color="text.secondary">FORM_ID</Typography>
                              <CopyId value={f.form_id} />
                            </Box>
                          </Box>
                          <Chip size="small" label={`${f.record_count} records`} />
                          <Typography variant="caption" color="text.secondary"><bdi>{`${String(f.first_record_date || '').slice(0, 10)} → ${String(f.last_record_date || '').slice(0, 10)}`}</bdi></Typography>
                          <IconButton aria-label={open ? 'Hide records' : 'Show records'} aria-expanded={open} onClick={() => setOpenForm(open ? null : f.form_id)}>
                            {open ? <CollapseIcon /> : <ExpandIcon />}
                          </IconButton>
                        </Box>
                        <Collapse in={open} unmountOnExit>
                          <TableContainer sx={{ borderTop: 1, borderColor: 'divider', maxHeight: 320 }}>
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
        </Card>

        {issues && issues.length > 0 && (
          <Card title="Link issues" help="Fix these in the layer (or in AgroCloud), then sync again.">
            <TableContainer sx={{ maxHeight: 360, border: 1, borderColor: 'divider', borderRadius: 1 }}>
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
          </Card>
        )}

        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, display: 'flex', gap: 1, alignItems: 'flex-start' }}>
          <NextIcon color="action" sx={{ mt: '2px' }} />
          <Typography variant="body2" color="text.secondary">
            Power BI reads the same links: the views in the database schema “bi” (forms, form_records, form_record_values, dim_location, gis_feature_forms, gis_key_forms) or the API /api/v1/forms with an API key.
          </Typography>
        </Paper>
      </Stack>
    </Box>
  );
}

const ISSUE_LABEL = {
  feature_missing_keys: 'Feature without ZONE_ID or Farm_Code',
  duplicate_feature_keys: 'Same ZONE_ID + Farm_Code on several features',
  feature_not_linked: 'Feature not linked to a field',
  field_linked_to_many_features: 'Field linked to several features',
  duplicate_field_keys: 'Same ZONE_ID + Farm_Code on several fields',
};
