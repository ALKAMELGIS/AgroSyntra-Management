import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, IconButton, InputAdornment, MenuItem, TextField, Typography,
} from '@mui/material';
import {
  SatelliteAltOutlined as SatelliteIcon, CheckCircleOutlined as CheckCircle, CancelOutlined as ErrorIcon, Visibility, VisibilityOff,
} from '@mui/icons-material';
import HelpTip from '../../HelpTip';
import * as api from './satelliteApi';

/**
 * Settings → API Keys → Satellite imagery (CEO).
 * The configuration ID is checked against the service, stored encrypted on
 * the server and never sent back to the browser (only a masked form).
 */
export default function SatelliteSettingsCard() {
  const [cfg, setCfg] = useState(null);
  const [id, setId] = useState('');
  const [label, setLabel] = useState('');
  const [service, setService] = useState('sentinel-hub');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    api.getSettings().then((c) => { setCfg(c); setService(c?.service || 'sentinel-hub'); setLabel(c?.label || ''); }).catch(() => setCfg({ configured: false }));
  }, []);

  const run = async (kind) => {
    setBusy(kind); setResult(null);
    try {
      if (kind === 'test') {
        setResult(await api.testSettings({ instanceId: id.trim() || 'USE_SAVED', service }));
      } else {
        const saved = await api.saveSettings({ instanceId: id.trim(), service, label: label.trim() });
        setCfg(saved); setService(saved.service); setId('');
        setResult({ success: true, message: 'Saved. Satellite tools are ready on GIS Map.', layers: saved.layers });
      }
    } catch (e) {
      setResult({ success: false, message: e.message });
    }
    setBusy(null);
  };

  if (!cfg) return null;
  return (
    <Card sx={{ mb: 4, border: '1px solid', borderColor: 'success.light', borderRadius: 2 }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, flexWrap: 'wrap' }}>
          <SatelliteIcon color="success" fontSize="large" />
          <Typography variant="h5">Satellite imagery</Typography>
          <HelpTip>
            Sentinel-2 images and indices (NDVI, NDWI, NDMI, SAVI …) on GIS Map. Paste the configuration (instance) ID from your Sentinel Hub or Copernicus Data Space dashboard; it is checked, stored encrypted and used only by the server.
          </HelpTip>
          <Chip
            icon={cfg.configured ? <CheckCircle /> : <ErrorIcon />}
            label={cfg.configured ? 'Connected' : 'Not set'}
            color={cfg.configured ? 'success' : 'warning'}
            size="small"
            sx={{ marginInlineStart: 'auto' }}
          />
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '2fr 1.4fr 1fr' }, gap: 2 }}>
          <TextField
            label="Configuration ID"
            type={show ? 'text' : 'password'}
            value={id}
            onChange={(e) => setId(e.target.value)}
            placeholder={cfg.configured ? cfg.idMasked : '00000000-0000-0000-0000-000000000000'}
            inputProps={{ autoComplete: 'off', spellCheck: false, dir: 'ltr' }}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton onClick={() => setShow(!show)} edge="end" size="small" aria-label={show ? 'Hide' : 'Show'}>
                    {show ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
          <TextField label="Name (optional)" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Public Data (featured collections)" />
          <TextField select label="Service" value={service} onChange={(e) => setService(e.target.value)}>
            <MenuItem value="sentinel-hub">Sentinel Hub</MenuItem>
            <MenuItem value="copernicus">Copernicus Data Space</MenuItem>
          </TextField>
        </Box>
        <Box sx={{ display: 'flex', gap: 2, mt: 2.5 }}>
          <Button variant="outlined" onClick={() => run('test')} disabled={Boolean(busy) || (!id.trim() && !cfg.configured)} startIcon={busy === 'test' ? <CircularProgress size={16} /> : null}>
            Test
          </Button>
          <Button variant="contained" onClick={() => run('save')} disabled={Boolean(busy) || !id.trim()} startIcon={busy === 'save' ? <CircularProgress size={16} color="inherit" /> : null}>
            Save
          </Button>
        </Box>
        {result && (
          <Alert severity={result.success ? 'success' : 'error'} sx={{ mt: 2 }}>
            {result.message}
            {result.layers?.length > 0 && (
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 1 }}>
                {result.layers.slice(0, 24).map((l) => <Chip key={l.id} size="small" label={<span translate="no">{l.id}</span>} />)}
              </Box>
            )}
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
