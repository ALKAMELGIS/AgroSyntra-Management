import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Alert, Box, Button, Chip, CircularProgress, IconButton, InputAdornment, Link, MenuItem, Paper,
  Stack, Step, StepButton, Stepper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import {
  ContentCopyOutlined as CopyIcon, OpenInNewOutlined as OpenIcon, RefreshOutlined as RefreshIcon,
  SyncOutlined as SyncIcon, LinkOffOutlined as LinkOffIcon, CheckCircleOutlined as DoneIcon,
} from '@mui/icons-material';
import PageTitle from '../../components/PageTitle';
import { useNotification } from '../../contexts/NotificationContext';
import { API_BASE, getAuthHeaders } from '../../config/api';

const BASE = `${API_BASE}/integrations/john-deere`;

async function call(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    const err = new Error(json?.error?.message || `Request failed (${res.status})`);
    err.code = json?.error?.code;
    throw err;
  }
  return json.data;
}

const STEPS = ['App settings', 'Sign in', 'Organization', 'Fields', 'Sync'];

export const OPERATION_TYPES = [
  { key: 'SEEDING', label: 'Seeding' },
  { key: 'APPLICATION', label: 'Application' },
  { key: 'HARVEST', label: 'Harvest' },
  { key: 'TILLAGE', label: 'Tillage' },
  { key: 'CARTING', label: 'Carting' },
];
const TYPE_LABEL = Object.fromEntries(OPERATION_TYPES.map((t) => [t.key, t.label]));

function stepFor(status) {
  if (!status?.clientId || !status?.hasClientSecret) return 0;
  if (!status.signedIn) return 1;
  if (!status.organization) return 2;
  if (!status.mappedFields) return 3;
  return 4;
}

const fmtDate = (v) => (v ? String(v).slice(0, 10) : '—');
const fmtMeasure = (m) => (m && typeof m.value === 'number'
  ? <bdi>{`${m.value.toLocaleString('en-US', { maximumFractionDigits: 2 })}${m.unitId ? ` ${m.unitId}` : ''}`}</bdi>
  : '—');

/** One compact card per step: title, short help line, content. */
function StepCard({ title, help, children, actions }) {
  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, md: 2.5 }, borderRadius: 2 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ sm: 'flex-start' }} sx={{ mb: 2 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h6" component="h2" sx={{ fontSize: '1rem', fontWeight: 600 }}>{title}</Typography>
          {help && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{help}</Typography>}
        </Box>
        {actions && <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>{actions}</Stack>}
      </Stack>
      {children}
    </Paper>
  );
}

export default function JohnDeereIntegration() {
  const notify = useNotification();
  const theme = useTheme();
  const narrow = useMediaQuery(theme.breakpoints.down('md'));
  const location = useLocation();
  const navigate = useNavigate();

  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(0);
  const [banner, setBanner] = useState(null);
  const [busy, setBusy] = useState('');

  // Step 1
  const [form, setForm] = useState({ environment: 'sandbox', clientId: '', clientSecret: '', redirectUri: '' });
  // Step 3
  const [orgs, setOrgs] = useState(null);
  // Step 4
  const [fieldData, setFieldData] = useState(null);
  const [mapping, setMapping] = useState({});
  // Step 5
  const year = new Date().getFullYear();
  const [sync, setSync] = useState({ cropSeason: String(year), types: ['SEEDING', 'APPLICATION', 'HARVEST'], startDate: '', endDate: '' });
  const [result, setResult] = useState(null);
  const [operations, setOperations] = useState([]);
  const [opsType, setOpsType] = useState('');

  const applyStatus = useCallback((s, moveStep = true) => {
    setStatus(s);
    setForm((f) => ({ ...f, environment: s.environment, clientId: s.clientId || f.clientId, redirectUri: s.redirectUri || '' }));
    if (moveStep) setStep(stepFor(s));
  }, []);

  const loadOperations = useCallback(async (type = opsType) => {
    try {
      setOperations(await call(`/operations${type ? `?type=${type}` : ''}`));
    } catch { setOperations([]); }
  }, [opsType]);

  useEffect(() => {
    (async () => {
      try {
        applyStatus(await call('/status'));
        loadOperations('');
      } catch (e) {
        setBanner({ severity: 'error', text: e.message });
      } finally { setLoading(false); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Back from John Deere sign-in (?connected=1 / ?error=...)
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    if (q.get('connected')) setBanner({ severity: 'success', text: 'Signed in to John Deere. Choose the Operations Center organization to use.' });
    else if (q.get('error')) setBanner({ severity: 'error', text: q.get('error') });
    if (q.get('connected') || q.get('error')) navigate(location.pathname, { replace: true });
  }, [location.search, location.pathname, navigate]);

  const run = async (key, fn) => {
    setBusy(key);
    try { return await fn(); } catch (e) {
      if (e.code === 'NOT_SIGNED_IN') setStep(1);
      notify.error(e.message);
      return undefined;
    } finally { setBusy(''); }
  };

  const saveSettings = () => run('settings', async () => {
    const s = await call('/settings', { method: 'PUT', body: form });
    setForm((f) => ({ ...f, clientSecret: '' }));
    applyStatus(s);
    notify.success('John Deere app settings saved');
  });

  const signIn = () => run('signin', async () => {
    const { url } = await call('/authorize', { method: 'POST' });
    window.location.assign(url);
  });

  const loadOrgs = useCallback(() => run('orgs', async () => setOrgs(await call('/organizations'))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []);

  const chooseOrg = (o) => run(`org-${o.id}`, async () => {
    applyStatus(await call('/organization', { method: 'PUT', body: { id: o.id, name: o.name } }));
    setFieldData(null);
    notify.success(`Using ${o.name}`);
  });

  const loadFields = useCallback(() => run('fields', async () => {
    const d = await call('/fields');
    setFieldData(d);
    const m = {};
    d.fields.forEach((f) => { m[f.jdFieldId] = f.fieldId || f.suggestedFieldId || ''; });
    setMapping(m);
  }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  []);

  const saveMapping = () => run('mapping', async () => {
    applyStatus(await call('/field-mapping', { method: 'PUT', body: { mapping } }), false);
    notify.success('Field links saved');
    setStep(4);
  });

  const runSync = () => run('sync', async () => {
    const body = { types: sync.types };
    if (sync.startDate && sync.endDate) { body.startDate = `${sync.startDate}T00:00:00Z`; body.endDate = `${sync.endDate}T23:59:59Z`; }
    if (sync.cropSeason) body.cropSeason = sync.cropSeason;
    const r = await call('/sync', { method: 'POST', body });
    setResult(r);
    applyStatus(await call('/status'), false);
    loadOperations();
    notify.success(`${r.operations} operations read from ${r.fieldsScanned} fields`);
  });

  const disconnect = () => run('disconnect', async () => {
    applyStatus(await call('/disconnect', { method: 'POST' }));
    setOrgs(null); setFieldData(null);
    notify.success('Disconnected from John Deere');
  });

  useEffect(() => { if (step === 2 && status?.signedIn && orgs === null) loadOrgs(); }, [step, status, orgs, loadOrgs]);
  useEffect(() => { if (step === 3 && status?.organization && fieldData === null) loadFields(); }, [step, status, fieldData, loadFields]);

  const copy = (text) => {
    navigator.clipboard?.writeText(text).then(() => notify.success('Copied'), () => {});
  };

  const done = useMemo(() => {
    const s = stepFor(status);
    return STEPS.map((_, i) => i < s || (i === 4 && Boolean(status?.lastSyncAt)));
  }, [status]);

  if (loading) return <Box sx={{ py: 8, textAlign: 'center' }}><CircularProgress aria-label="Loading" /></Box>;

  const envLabel = status?.environment === 'production' ? 'Production' : 'Sandbox';
  const linkedCount = Object.values(mapping).filter(Boolean).length;

  return (
    <Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ sm: 'center' }} sx={{ mb: 2 }}>
        <Box sx={{ minWidth: 0 }}>
          <PageTitle>John Deere Operations Center</PageTitle>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Read field operations (seeding, application, harvest, tillage) from Operations Center into AgroCloud.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Chip size="small" label={envLabel} color={status?.environment === 'production' ? 'success' : 'warning'} variant="outlined" />
          <Chip size="small" label={status?.signedIn ? 'Signed in' : 'Not signed in'} color={status?.signedIn ? 'success' : 'default'} />
          {status?.signedIn && (
            <Button size="small" color="inherit" startIcon={<LinkOffIcon />} onClick={disconnect} disabled={busy === 'disconnect'}>Disconnect</Button>
          )}
        </Stack>
      </Stack>

      {banner && <Alert severity={banner.severity} onClose={() => setBanner(null)} sx={{ mb: 2 }}>{banner.text}</Alert>}

      <Stepper
        nonLinear activeStep={step} alternativeLabel={narrow} aria-label="Connection steps"
        sx={{ mb: 2, ...(narrow && { mx: -1, '& .MuiStepLabel-label': { fontSize: '0.75rem', mt: '4px !important', lineHeight: 1.3 }, '& .MuiStepButton-root': { px: 0.5, py: 0.5, m: 0 } }) }}
      >
        {STEPS.map((label, i) => (
          <Step key={label} completed={done[i]}>
            <StepButton onClick={() => setStep(i)} disabled={i > stepFor(status) && !done[i]}>{label}</StepButton>
          </Step>
        ))}
      </Stepper>

      {step === 0 && (
        <StepCard
          title="John Deere app settings"
          help="Create an application on developer.deere.com, add the redirect URI below to it, then paste its Client ID and secret here."
          actions={<Button size="small" endIcon={<OpenIcon />} href="https://developer.deere.com/" target="_blank" rel="noopener noreferrer">developer.deere.com</Button>}
        >
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
            <Box sx={{ gridColumn: '1 / -1' }}>
              <Typography variant="body2" sx={{ mb: 0.75, fontWeight: 500 }} id="jd-env-label">Environment</Typography>
              <ToggleButtonGroup
                exclusive size="small" color="primary" value={form.environment} aria-labelledby="jd-env-label"
                onChange={(_, v) => v && setForm((f) => ({ ...f, environment: v }))}
              >
                <ToggleButton value="sandbox">Sandbox</ToggleButton>
                <ToggleButton value="production">Production</ToggleButton>
              </ToggleButtonGroup>
              <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.75 }}>
                {form.environment === 'sandbox'
                  ? 'Sandbox: sandboxapi.deere.com — for testing with up to 5 organizations, before Deere approves the app.'
                  : 'Production: partnerapi.deere.com — real farm data. Use after John Deere approves the app for production.'}
              </Typography>
            </Box>
            <TextField label="Client ID" required size="small" value={form.clientId}
              onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))} autoComplete="off" />
            <TextField label="Client secret" required={!status?.hasClientSecret} size="small" type="password" value={form.clientSecret}
              placeholder={status?.hasClientSecret ? 'Saved — leave blank to keep' : ''}
              onChange={(e) => setForm((f) => ({ ...f, clientSecret: e.target.value }))} autoComplete="new-password" />
            <TextField
              label="Redirect URI" size="small" value={form.redirectUri} sx={{ gridColumn: '1 / -1' }}
              onChange={(e) => setForm((f) => ({ ...f, redirectUri: e.target.value }))}
              helperText="Add exactly this address to the app's redirect URIs on developer.deere.com."
              slotProps={{ input: { endAdornment: (
                <InputAdornment position="end">
                  <Tooltip title="Copy"><IconButton size="small" aria-label="Copy redirect URI" onClick={() => copy(form.redirectUri)}><CopyIcon /></IconButton></Tooltip>
                </InputAdornment>
              ) } }}
            />
          </Box>
          <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
            <Button variant="contained" onClick={saveSettings} disabled={busy === 'settings'}>Save settings</Button>
          </Stack>
        </StepCard>
      )}

      {step === 1 && (
        <StepCard
          title="Sign in with John Deere"
          help="You will be sent to John Deere's sign-in page and back here. AgroCloud asks for read access to agronomic data (ag1) and stays signed in (offline_access)."
        >
          {status?.signedIn ? (
            <Alert severity="success" icon={<DoneIcon />} action={<Button color="inherit" size="small" onClick={() => setStep(2)}>Next</Button>}>
              Signed in{status.connectedAt ? ` on ${fmtDate(status.connectedAt)}` : ''}.
            </Alert>
          ) : (
            <Button variant="contained" onClick={signIn} disabled={busy === 'signin'} endIcon={<OpenIcon />}>Sign in with John Deere</Button>
          )}
        </StepCard>
      )}

      {step === 2 && (
        <StepCard
          title="Operations Center organization"
          help="Organizations marked 'Share' must first allow AgroCloud to read their data on John Deere's connections page; you come back here afterwards."
          actions={<Button size="small" startIcon={<RefreshIcon />} onClick={loadOrgs} disabled={busy === 'orgs'}>Refresh</Button>}
        >
          {busy === 'orgs' && !orgs ? <CircularProgress size={24} aria-label="Loading organizations" /> : (
            <Stack spacing={1}>
              {(orgs || []).length === 0 && <Typography color="text.secondary">No organizations found for this John Deere account.</Typography>}
              {(orgs || []).map((o) => {
                const selected = status?.organization?.id === o.id;
                return (
                  <Paper key={o.id} variant="outlined" sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', borderColor: selected ? 'primary.main' : undefined }}>
                    <Box sx={{ flex: 1, minWidth: 160 }}>
                      <Typography fontWeight={600}>{o.name}</Typography>
                      <Typography variant="caption" color="text.secondary">ID {o.id}{o.type ? ` · ${o.type}` : ''}</Typography>
                    </Box>
                    {o.connectionsUri ? (
                      <Button size="small" variant="outlined" href={o.connectionsUri} endIcon={<OpenIcon />}>Share with AgroCloud</Button>
                    ) : selected ? (
                      <Chip size="small" color="primary" label="In use" />
                    ) : (
                      <Button size="small" variant="contained" onClick={() => chooseOrg(o)} disabled={busy === `org-${o.id}`}>Use this organization</Button>
                    )}
                  </Paper>
                );
              })}
            </Stack>
          )}
        </StepCard>
      )}

      {step === 3 && (
        <StepCard
          title="Link fields"
          help="Each John Deere field is linked to an AgroCloud field; names that match are suggested. Only linked fields are synced."
          actions={(
            <>
              <Button size="small" startIcon={<RefreshIcon />} onClick={loadFields} disabled={busy === 'fields'}>Refresh</Button>
              <Button size="small" variant="contained" onClick={saveMapping} disabled={busy === 'mapping' || !fieldData}>{`Save links (${linkedCount})`}</Button>
            </>
          )}
        >
          {!fieldData ? <CircularProgress size={24} aria-label="Loading fields" /> : (
            <TableContainer sx={{ maxHeight: 480 }}>
              <Table size="small" stickyHeader aria-label="Field links">
                <TableHead>
                  <TableRow>
                    <TableCell>John Deere field</TableCell>
                    <TableCell>AgroCloud field</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {fieldData.fields.length === 0 && (
                    <TableRow><TableCell colSpan={2}>No fields in this organization.</TableCell></TableRow>
                  )}
                  {fieldData.fields.map((f) => (
                    <TableRow key={f.jdFieldId}>
                      <TableCell>{f.jdFieldName}</TableCell>
                      <TableCell sx={{ minWidth: 200 }}>
                        <TextField
                          select size="small" fullWidth value={mapping[f.jdFieldId] || ''}
                          onChange={(e) => setMapping((m) => ({ ...m, [f.jdFieldId]: e.target.value }))}
                          slotProps={{ htmlInput: { 'aria-label': `AgroCloud field for ${f.jdFieldName}` } }}
                          helperText={!f.fieldId && f.suggestedFieldId && mapping[f.jdFieldId] === f.suggestedFieldId ? 'Suggested by name' : undefined}
                        >
                          <MenuItem value=""><em>Not linked</em></MenuItem>
                          {fieldData.agrocloudFields.map((a) => <MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>)}
                        </TextField>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </StepCard>
      )}

      {step === 4 && (
        <StepCard
          title="Sync field operations"
          help="Choose a crop season or a date range. Deere returns date ranges in 7-day windows; AgroCloud splits longer ranges automatically."
        >
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, minmax(0, 200px))' } }}>
            <TextField label="Crop season" sx={{ gridColumn: { xs: '1 / -1', sm: 'auto' } }} size="small" value={sync.cropSeason} inputMode="numeric"
              onChange={(e) => setSync((s) => ({ ...s, cropSeason: e.target.value.replace(/\D/g, '').slice(0, 4) }))} />
            <TextField label="From" type="date" size="small" value={sync.startDate} slotProps={{ inputLabel: { shrink: true } }}
              onChange={(e) => setSync((s) => ({ ...s, startDate: e.target.value }))} />
            <TextField label="To" type="date" size="small" value={sync.endDate} slotProps={{ inputLabel: { shrink: true } }}
              onChange={(e) => setSync((s) => ({ ...s, endDate: e.target.value }))} />
          </Box>
          <Typography variant="body2" sx={{ mt: 2, mb: 1, fontWeight: 500 }}>Operation types</Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {OPERATION_TYPES.map((t) => {
              const on = sync.types.includes(t.key);
              return (
                <Chip key={t.key} label={t.label} color={on ? 'primary' : 'default'} variant={on ? 'filled' : 'outlined'} aria-pressed={on}
                  onClick={() => setSync((s) => ({ ...s, types: on ? s.types.filter((x) => x !== t.key) : [...s.types, t.key] }))} />
              );
            })}
          </Stack>
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mt: 2 }} flexWrap="wrap" useFlexGap>
            <Button variant="contained" startIcon={busy === 'sync' ? <CircularProgress size={16} color="inherit" /> : <SyncIcon />}
              onClick={runSync} disabled={busy === 'sync' || !sync.types.length || (!sync.cropSeason && !(sync.startDate && sync.endDate))}>
              Sync now
            </Button>
            <Typography variant="body2" color="text.secondary">
              {`${status?.mappedFields || 0} linked fields`}{status?.lastSyncAt ? <> · <bdi>{fmtDate(status.lastSyncAt)}</bdi></> : null}
            </Typography>
          </Stack>
          {result && (
            <Alert severity={result.errors?.length ? 'warning' : 'success'} sx={{ mt: 2 }}>
              {result.operations} operations from {result.fieldsScanned} fields
              {Object.keys(result.byType || {}).length ? ` (${Object.entries(result.byType).map(([k, v]) => `${TYPE_LABEL[k] || k}: ${v}`).join(', ')})` : ''}.
              {result.errors?.length ? <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5 }}>{result.errors.map((e) => <li key={e}>{e}</li>)}</Box> : null}
            </Alert>
          )}
        </StepCard>
      )}

      <Paper variant="outlined" sx={{ mt: 2, borderRadius: 2, overflow: 'hidden' }}>
        <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between" sx={{ px: 2, py: 1.25, flexWrap: 'wrap' }} useFlexGap>
          <Typography variant="h6" component="h2" sx={{ fontSize: '1rem', fontWeight: 600 }}>
            {'Operations from John Deere'} <Typography component="span" color="text.secondary" variant="body2">({operations.length})</Typography>
          </Typography>
          <TextField select size="small" value={opsType} sx={{ minWidth: 160 }}
            slotProps={{ htmlInput: { 'aria-label': 'Operation type filter' }, select: { displayEmpty: true } }}
            onChange={(e) => { setOpsType(e.target.value); loadOperations(e.target.value); }}>
            <MenuItem value="">All types</MenuItem>
            {OPERATION_TYPES.map((t) => <MenuItem key={t.key} value={t.key}>{t.label}</MenuItem>)}
          </TextField>
        </Stack>
        <TableContainer sx={{ maxHeight: 520 }}>
          <Table size="small" stickyHeader aria-label="John Deere operations">
            <TableHead>
              <TableRow>
                <TableCell>Type</TableCell>
                <TableCell>John Deere field</TableCell>
                <TableCell>AgroCloud field</TableCell>
                <TableCell>Crop</TableCell>
                <TableCell>Season</TableCell>
                <TableCell>Start</TableCell>
                <TableCell>End</TableCell>
                <TableCell align="right">Area</TableCell>
                <TableCell align="right">Yield / rate</TableCell>
                <TableCell align="right">Moisture</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {operations.length === 0 && (
                <TableRow><TableCell colSpan={10} sx={{ color: 'text.secondary' }}>No operations yet. Connect and sync to see them here.</TableCell></TableRow>
              )}
              {operations.map((o) => {
                const m = o.measurements || {};
                return (
                  <TableRow key={o.id} hover>
                    <TableCell><Chip size="small" variant="outlined" label={TYPE_LABEL[o.operation_type] || o.operation_type} /></TableCell>
                    <TableCell>{o.jd_field_name || o.jd_field_id}</TableCell>
                    <TableCell>{o.field_name || <Chip size="small" variant="outlined" label="Not linked" />}</TableCell>
                    <TableCell>{o.crop_name || '—'}</TableCell>
                    <TableCell>{o.crop_season || '—'}</TableCell>
                    <TableCell>{fmtDate(o.start_date)}</TableCell>
                    <TableCell>{fmtDate(o.end_date)}</TableCell>
                    <TableCell align="right">{fmtMeasure(m.area)}</TableCell>
                    <TableCell align="right">{fmtMeasure(m.averageYield || m.averageMaterial || m.yield || m.totalMaterial)}</TableCell>
                    <TableCell align="right">{fmtMeasure(m.averageMoisture)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1.5 }}>
        <Box component="span" sx={{ display: 'block' }}>{"Read-only: these operations are kept beside AgroCloud's own harvest and application records, which keep their approval and PHI checks."}</Box>
        {' '}<Link underline="always" href="https://developer.deere.com/dev-docs/field-operations" target="_blank" rel="noopener noreferrer">Field Operations API</Link>.
      </Typography>
    </Box>
  );
}
