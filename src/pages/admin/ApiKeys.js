import { useState, useEffect } from 'react';
import {
  Container, Paper, Typography, Box, Button, TextField, Dialog, DialogTitle, DialogContent,
  DialogActions, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  IconButton, Chip, Alert, Select, MenuItem, FormControl, InputLabel, CircularProgress,
  Card, CardContent, Divider, InputAdornment,
} from '@mui/material';
import {
  VpnKey as KeyIcon, Add as AddIcon, Delete as DeleteIcon, ContentCopy as CopyIcon,
  Psychology as BrainIcon, CheckCircle, Cancel as ErrorIcon, Visibility, VisibilityOff,
  CloudQueue as WeatherIcon,
} from '@mui/icons-material';
import { apiRequest } from '../../utils/api';
import { useNotification } from '../../contexts/NotificationContext';
import { useConfirmDialog } from '../../components/ConfirmDialog';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { canManageSystemSettings } from '../../utils/roleAccess';

const AI_MODELS = {
  anthropic: [
    { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
    { value: 'claude-opus-4-20250514', label: 'Claude Opus 4' },
    { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku (fast)' },
  ],
  openai: [
    { value: 'gpt-4o', label: 'GPT-4o' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini (fast)' },
    { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
  ],
};

function AIBrainCard() {
  const notify = useNotification();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const [provider, setProvider] = useState('anthropic');
  const [model, setModel] = useState('claude-sonnet-4-20250514');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [hasExistingKey, setHasExistingKey] = useState(false);
  const [keyMasked, setKeyMasked] = useState(null);

  useEffect(() => {
    apiRequest('/settings/ai')
      .then((res) => {
        const d = res?.data || res;
        setProvider(d.provider || 'anthropic');
        setModel(d.model || 'claude-sonnet-4-20250514');
        setHasExistingKey(d.hasKey || false);
        setKeyMasked(d.keyMasked || null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleProviderChange = (newProvider) => {
    setProvider(newProvider);
    const models = AI_MODELS[newProvider];
    if (models?.length) setModel(models[0].value);
  };

  const handleSave = async () => {
    setSaving(true);
    setTestResult(null);
    try {
      const payload = { provider, model };
      if (apiKey) payload.apiKey = apiKey;
      const res = await apiRequest('/settings/ai', { method: 'PUT', body: JSON.stringify(payload) });
      const d = res?.data || res;
      setHasExistingKey(d.hasKey);
      setKeyMasked(d.keyMasked);
      setApiKey('');
      notify.success('AI configuration saved');
    } catch (err) {
      notify.error(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    const keyToTest = apiKey || null;
    if (!keyToTest && !hasExistingKey) {
      notify.warning('Enter an API key first');
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      let testKey = keyToTest;
      if (!testKey) {
        notify.info('Testing with saved key...');
        const configRes = await apiRequest('/settings/ai');
        const config = configRes?.data || configRes;
        if (!config.hasKey) { notify.warning('No key saved to test'); setTesting(false); return; }
        testKey = '__USE_SAVED__';
      }
      if (testKey === '__USE_SAVED__') {
        const res = await apiRequest('/settings/ai/test', {
          method: 'POST',
          body: JSON.stringify({ provider, model, apiKey: 'USE_SAVED' }),
        });
        setTestResult(res?.data || res);
      } else {
        const res = await apiRequest('/settings/ai/test', {
          method: 'POST',
          body: JSON.stringify({ provider, model, apiKey: testKey }),
        });
        setTestResult(res?.data || res);
      }
    } catch (err) {
      setTestResult({ success: false, message: err.message || 'Test failed' });
    } finally {
      setTesting(false);
    }
  };

  const handleDeleteKey = async () => {
    try {
      await apiRequest('/settings/ai/key', { method: 'DELETE' });
      setHasExistingKey(false);
      setKeyMasked(null);
      notify.success('API key removed');
    } catch (err) {
      notify.error(err.message);
    }
  };

  if (loading) {
    return (
      <Card sx={{ mb: 4 }}>
        <CardContent sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card sx={{ mb: 4, border: '1px solid', borderColor: 'primary.light', borderRadius: 2 }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <BrainIcon color="primary" fontSize="large" />
          <Typography variant="h5" fontWeight={700}>AI Brain</Typography>
          {hasExistingKey && (
            <Chip icon={<CheckCircle />} label="Connected" color="success" size="small" sx={{ ml: 'auto' }} />
          )}
          {!hasExistingKey && (
            <Chip icon={<ErrorIcon />} label="No Key" color="warning" size="small" sx={{ ml: 'auto' }} />
          )}
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Configure the AI provider that powers the lesson generator, AI tutor, and quiz generator.
        </Typography>

        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <FormControl sx={{ minWidth: 180 }}>
            <InputLabel>Provider</InputLabel>
            <Select value={provider} label="Provider" onChange={(e) => handleProviderChange(e.target.value)}>
              <MenuItem value="anthropic">Anthropic (Claude)</MenuItem>
              <MenuItem value="openai">OpenAI (GPT)</MenuItem>
            </Select>
          </FormControl>

          <FormControl sx={{ minWidth: 240 }}>
            <InputLabel>Model</InputLabel>
            <Select value={model} label="Model" onChange={(e) => setModel(e.target.value)}>
              {(AI_MODELS[provider] || []).map((m) => (
                <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>

        <Divider sx={{ my: 2 }} />

        <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <TextField
            label="API Key"
            variant="outlined"
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={hasExistingKey ? keyMasked || '••••••••' : 'Paste your API key here'}
            sx={{ flexGrow: 1, minWidth: 300 }}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton onClick={() => setShowKey(!showKey)} edge="end" size="small">
                    {showKey ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
          {hasExistingKey && (
            <IconButton color="error" onClick={handleDeleteKey} title="Remove saved key">
              <DeleteIcon />
            </IconButton>
          )}
        </Box>

        {hasExistingKey && !apiKey && (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
            Key saved: {keyMasked}. Enter a new key to replace it.
          </Typography>
        )}

        <Box sx={{ display: 'flex', gap: 2, mt: 3 }}>
          <Button
            variant="outlined"
            onClick={handleTest}
            disabled={testing}
            startIcon={testing ? <CircularProgress size={16} /> : null}
          >
            {testing ? 'Testing...' : 'Test Connection'}
          </Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={saving || (!apiKey && !hasExistingKey)}
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : null}
          >
            {saving ? 'Saving...' : 'Save Configuration'}
          </Button>
        </Box>

        {testResult && (
          <Alert severity={testResult.success ? 'success' : 'error'} sx={{ mt: 2 }}>
            {testResult.message}
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

function WeatherMapApiKeyCard() {
  const notify = useNotification();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [hasExistingKey, setHasExistingKey] = useState(false);
  const [keyMasked, setKeyMasked] = useState(null);

  useEffect(() => {
    apiRequest('/settings/openweather')
      .then((res) => {
        const d = res?.data || res;
        setHasExistingKey(d.hasKey || false);
        setKeyMasked(d.keyMasked || null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setTestResult(null);
    try {
      const payload = {};
      if (apiKey) payload.apiKey = apiKey;
      const res = await apiRequest('/settings/openweather', { method: 'PUT', body: JSON.stringify(payload) });
      const d = res?.data || res;
      setHasExistingKey(d.hasKey);
      setKeyMasked(d.keyMasked);
      setApiKey('');
      notify.success('Weather Map API key saved');
    } catch (err) {
      notify.error(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!apiKey && !hasExistingKey) {
      notify.warning('Enter an API key first');
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const testKey = apiKey || 'USE_SAVED';
      const res = await apiRequest('/settings/openweather/test', {
        method: 'POST',
        body: JSON.stringify({ apiKey: testKey }),
      });
      setTestResult(res?.data || res);
    } catch (err) {
      setTestResult({ success: false, message: err.message || 'Test failed' });
    } finally {
      setTesting(false);
    }
  };

  const handleDeleteKey = async () => {
    try {
      await apiRequest('/settings/openweather/key', { method: 'DELETE' });
      setHasExistingKey(false);
      setKeyMasked(null);
      notify.success('API key removed');
    } catch (err) {
      notify.error(err.message);
    }
  };

  if (loading) {
    return (
      <Card sx={{ mb: 4 }}>
        <CardContent sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card sx={{ mb: 4, border: '1px solid', borderColor: 'info.light', borderRadius: 2 }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <WeatherIcon color="info" fontSize="large" />
          <Typography variant="h5" fontWeight={700}>Weather Map API Key</Typography>
          {hasExistingKey && (
            <Chip icon={<CheckCircle />} label="Connected" color="success" size="small" sx={{ ml: 'auto' }} />
          )}
          {!hasExistingKey && (
            <Chip icon={<ErrorIcon />} label="No Key" color="warning" size="small" sx={{ ml: 'auto' }} />
          )}
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          OpenWeatherMap powers Weather Log auto-fetch and Weather Map (NDVI, satellite, soil data).
          Get a free key at{' '}
          <a href="https://openweathermap.org/api" target="_blank" rel="noopener noreferrer">openweathermap.org</a>.
        </Typography>

        <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <TextField
            label="OpenWeatherMap API Key"
            variant="outlined"
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={hasExistingKey ? keyMasked || '••••••••' : 'Paste your API key here'}
            sx={{ flexGrow: 1, minWidth: 300 }}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton onClick={() => setShowKey(!showKey)} edge="end" size="small">
                    {showKey ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
          {hasExistingKey && (
            <IconButton color="error" onClick={handleDeleteKey} title="Remove saved key">
              <DeleteIcon />
            </IconButton>
          )}
        </Box>

        {hasExistingKey && !apiKey && (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
            Key saved: {keyMasked}. Enter a new key to replace it.
          </Typography>
        )}

        <Box sx={{ display: 'flex', gap: 2, mt: 3 }}>
          <Button
            variant="outlined"
            onClick={handleTest}
            disabled={testing}
            startIcon={testing ? <CircularProgress size={16} /> : null}
          >
            {testing ? 'Testing...' : 'Test Connection'}
          </Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={saving || (!apiKey && !hasExistingKey)}
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : null}
          >
            {saving ? 'Saving...' : 'Save Key'}
          </Button>
        </Box>

        {testResult && (
          <Alert severity={testResult.success ? 'success' : 'error'} sx={{ mt: 2 }}>
            {testResult.message}
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

export default function ApiKeys() {
  const { t } = useTranslation();
  // AI and OpenWeather keys are CEO-only; API keys are CEO and operation manager (route guard).
  const canEditSystemKeys = canManageSystemSettings(useAuth().user);
  const [keys, setKeys] = useState([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [newKey, setNewKey] = useState(null);
  const notify = useNotification();
  const [confirm, confirmDialog] = useConfirmDialog();

  const loadKeys = () => {
    apiRequest('/api-keys').then((d) => setKeys(d || [])).catch(() => {});
  };
  useEffect(loadKeys, []);

  const handleCreate = async () => {
    if (!name.trim()) { notify.warning('Name is required'); return; }
    try {
      const result = await apiRequest('/api-keys', { method: 'POST', body: JSON.stringify({ name }) });
      setNewKey(result.key);
      setName('');
      loadKeys();
    } catch (err) { notify.error(err.message); }
  };

  const handleRevoke = async (id) => {
    if (await confirm('Revoke this API key? It will immediately stop working.', { severity: 'error', confirmLabel: 'Revoke' })) {
      try {
        await apiRequest(`/api-keys/${id}`, { method: 'DELETE' });
        notify.success('API key revoked');
        loadKeys();
      } catch (err) { notify.error(err.message); }
    }
  };

  const copyKey = () => {
    if (newKey) navigator.clipboard.writeText(newKey);
    notify.success('API key copied to clipboard');
  };

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      {canEditSystemKeys ? (
        <>
          {/* AI Brain Configuration */}
          <AIBrainCard />

          {/* OpenWeatherMap Configuration */}
          <WeatherMapApiKeyCard />
        </>
      ) : (
        <Alert severity="info" sx={{ mb: 3 }}>{t('adminAccess.systemKeysCeoOnly')}</Alert>
      )}

      {/* API Keys Section */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 3, mb: 3 }}>
        <Typography variant="h4" fontWeight={700} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <KeyIcon fontSize="large" /> API Keys
        </Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setCreateOpen(true); setNewKey(null); }}>
          Create Key
        </Button>
      </Box>

      {newKey && (
        <Alert severity="success" sx={{ mb: 3 }} action={<IconButton onClick={copyKey}><CopyIcon /></IconButton>}>
          <Typography variant="subtitle2">Your new API key (copy it now — it won't be shown again):</Typography>
          <Typography variant="body2" sx={{ fontFamily: 'monospace', mt: 0.5, wordBreak: 'break-all' }}>{newKey}</Typography>
        </Alert>
      )}

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Key Prefix</TableCell>
              <TableCell>Created</TableCell>
              <TableCell>Last Used</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="center">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {keys.map((key) => (
              <TableRow key={key.id}>
                <TableCell>{key.name}</TableCell>
                <TableCell><code>{key.key_prefix}...</code></TableCell>
                <TableCell>{key.created_at ? format(new Date(key.created_at), 'MMM d, yyyy') : ''}</TableCell>
                <TableCell>{key.last_used ? format(new Date(key.last_used), 'MMM d, h:mm a') : 'Never'}</TableCell>
                <TableCell>
                  <Chip label={key.is_active ? 'Active' : 'Revoked'} color={key.is_active ? 'success' : 'default'} size="small" />
                </TableCell>
                <TableCell align="center">
                  {key.is_active && (
                    <IconButton size="small" color="error" onClick={() => handleRevoke(key.id)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {keys.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} align="center">No API keys created yet</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create API Key</DialogTitle>
        <DialogContent>
          <TextField fullWidth label="Key Name" value={name} onChange={(e) => setName(e.target.value)} sx={{ mt: 1 }} placeholder="e.g., IoT Sensor Integration" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate}>Create</Button>
        </DialogActions>
      </Dialog>
      {confirmDialog}
    </Container>
  );
}
