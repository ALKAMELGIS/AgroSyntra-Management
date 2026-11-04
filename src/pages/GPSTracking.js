import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Container, Paper, Typography, Box, Grid, Card, CardContent, Button, TextField,
  MenuItem, Dialog, DialogTitle, DialogContent, DialogActions, Chip, IconButton,
  Alert,
} from '@mui/material';
import {
  GpsFixedOutlined as GpsIcon, AddOutlined as AddIcon, DeleteOutlined as DeleteIcon,
  MyLocationOutlined as PositionIcon, RefreshOutlined as RefreshIcon, ContentCopyOutlined as CopyIcon,
} from '@mui/icons-material';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { MapLifecycle, MapResizeInvalidator, safeFitBounds, safeFlyTo } from '../utils/leafletSafe';
import { apiRequest } from '../utils/api';
import { API_BASE } from '../config/api';
import { useNotification } from '../contexts/NotificationContext';
import { useConfirmDialog } from '../components/ConfirmDialog';
import { formatDistanceToNow } from 'date-fns';
import {
  downsampleTrail,
  dubaiTodayYmd,
  isRecentPing,
  trailCoordsFromPositions,
} from '../utils/gpsTracking';
import { useAuth } from '../contexts/AuthContext';
import { canWriteOpsStock } from '../utils/roleAccess';
import 'leaflet/dist/leaflet.css';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const EQUIPMENT_TYPES = ['tractor', 'sprayer', 'harvester', 'drone', 'vehicle', 'other'];
const TYPE_ICONS = { tractor: '🚜', sprayer: '💦', harvester: '🌾', drone: '🛸', vehicle: '🚗', other: '📍' };
const DEFAULT_CENTER = [24.4539, 54.3773];
const POLL_MS = 20000;

function GpsMapFocus({ shouldFit, onFitted, trailCoords, focusLatLng }) {
  const map = useMap();
  useEffect(() => {
    if (!shouldFit) return;
    if (trailCoords.length > 1) {
      safeFitBounds(map, trailCoords, { padding: [32, 32] });
    } else if (focusLatLng) {
      safeFlyTo(map, focusLatLng, 14);
    }
    onFitted();
  }, [shouldFit, trailCoords, focusLatLng, map, onFitted]);
  return null;
}

export default function GPSTracking() {
  const canWrite = canWriteOpsStock(useAuth().user);
  const [equipment, setEquipment] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [positions, setPositions] = useState([]);
  const [trackDate, setTrackDate] = useState(() => dubaiTodayYmd());
  const [createOpen, setCreateOpen] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [testPoint, setTestPoint] = useState({ latitude: String(DEFAULT_CENTER[0]), longitude: String(DEFAULT_CENTER[1]) });
  const [form, setForm] = useState({ name: '', type: 'tractor', identifier: '' });
  const [shouldFit, setShouldFit] = useState(false);
  const notify = useNotification();
  const [confirm, confirmDialog] = useConfirmDialog();
  const selectedIdRef = useRef(null);
  const trackDateRef = useRef(trackDate);

  selectedIdRef.current = selectedId;
  trackDateRef.current = trackDate;

  const selectedEquipment = equipment.find((eq) => eq.id === selectedId) || null;

  const loadEquipment = useCallback(async () => {
    try {
      const data = await apiRequest('/gps/equipment');
      const rows = data || [];
      setEquipment(rows);
      setSelectedId((current) => (current && !rows.some((eq) => eq.id === current) ? null : current));
    } catch {
      setEquipment([]);
    }
  }, []);

  const loadPositions = useCallback(async (equipmentId, dateYmd, { fit = false } = {}) => {
    if (!equipmentId) {
      setPositions([]);
      return;
    }
    try {
      const data = await apiRequest(`/gps/positions/${equipmentId}?from=${dateYmd}&to=${dateYmd}`);
      if (selectedIdRef.current !== equipmentId || trackDateRef.current !== dateYmd) return;
      setPositions(data || []);
      if (fit) setShouldFit(true);
    } catch {
      if (selectedIdRef.current === equipmentId) setPositions([]);
    }
  }, []);

  useEffect(() => { loadEquipment(); }, [loadEquipment]);

  useEffect(() => {
    if (selectedId) {
      loadPositions(selectedId, trackDate, { fit: true });
    } else {
      setPositions([]);
    }
  }, [selectedId, trackDate, loadPositions]);

  useEffect(() => {
    let timer = null;
    const tick = () => {
      if (document.hidden) return;
      loadEquipment();
      const id = selectedIdRef.current;
      const dateYmd = trackDateRef.current;
      if (id && dateYmd === dubaiTodayYmd()) {
        loadPositions(id, dateYmd);
      }
    };
    const start = () => {
      window.clearInterval(timer);
      timer = window.setInterval(tick, POLL_MS);
    };
    const onVis = () => {
      if (document.hidden) {
        window.clearInterval(timer);
        timer = null;
      } else {
        tick();
        start();
      }
    };
    start();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [loadEquipment, loadPositions]);

  const handleCreate = async () => {
    if (!form.name.trim()) { notify.warning('Name is required'); return; }
    try {
      await apiRequest('/gps/equipment', { method: 'POST', body: JSON.stringify(form) });
      notify.success('Equipment added');
      setCreateOpen(false);
      setForm({ name: '', type: 'tractor', identifier: '' });
      loadEquipment();
    } catch (err) { notify.error(err.message); }
  };

  const handleDelete = async (id) => {
    if (await confirm('Deactivate this equipment?')) {
      try {
        await apiRequest(`/gps/equipment/${id}`, { method: 'DELETE' });
        notify.success('Equipment deactivated');
        if (selectedId === id) {
          setSelectedId(null);
          setPositions([]);
        }
        loadEquipment();
      } catch (err) { notify.error(err.message); }
    }
  };

  const openTestPoint = () => {
    const last = selectedEquipment?.last_position;
    setTestPoint({
      latitude: last?.latitude != null ? String(last.latitude) : String(DEFAULT_CENTER[0]),
      longitude: last?.longitude != null ? String(last.longitude) : String(DEFAULT_CENTER[1]),
    });
    setTestOpen(true);
  };

  const handleTestPoint = async () => {
    if (!selectedEquipment) return;
    try {
      await apiRequest('/gps/position', {
        method: 'POST',
        body: JSON.stringify({
          equipment_id: selectedEquipment.id,
          latitude: Number(testPoint.latitude),
          longitude: Number(testPoint.longitude),
        }),
      });
      notify.success('Test point saved');
      setTestOpen(false);
      await loadEquipment();
      await loadPositions(selectedEquipment.id, trackDate, { fit: true });
    } catch (err) { notify.error(err.message); }
  };

  const copyIngest = async () => {
    if (!selectedEquipment) return;
    const body = {
      identifier: selectedEquipment.identifier || undefined,
      equipment_id: selectedEquipment.id,
      latitude: 24.4539,
      longitude: 54.3773,
      speed: 0,
      heading: 0,
    };
    const text = [
      `POST ${API_BASE}/gps/position`,
      'Header: X-API-Key: <key from Admin → API Keys>',
      JSON.stringify(body, null, 2),
    ].join('\n');
    await navigator.clipboard.writeText(text);
    notify.success('Ingest example copied');
  };

  const trailCoords = downsampleTrail(trailCoordsFromPositions(positions));
  const focusLatLng = selectedEquipment?.last_position
    ? [parseFloat(selectedEquipment.last_position.latitude), parseFloat(selectedEquipment.last_position.longitude)]
    : (trailCoords[0] || null);
  const onFitted = useCallback(() => setShouldFit(false), []);
  const viewingToday = trackDate === dubaiTodayYmd();

  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 1 }}>
        <Typography variant="h4" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <GpsIcon fontSize="large" /> GPS Tracking
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField
            label="Track date"
            type="date"
            size="small"
            value={trackDate}
            onChange={(e) => setTrackDate(e.target.value || dubaiTodayYmd())}
            InputLabelProps={{ shrink: true }}
          />
          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={() => { loadEquipment(); if (selectedId) loadPositions(selectedId, trackDate, { fit: true }); }}>
            Refresh
          </Button>
          {canWrite && <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>Add Equipment</Button>}
        </Box>
      </Box>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 4 }}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>Equipment ({equipment.length})</Typography>
            {equipment.map((eq) => {
              const recent = isRecentPing(eq.last_position?.recorded_at);
              return (
                <Card
                  key={eq.id}
                  sx={{
                    mb: 1, cursor: 'pointer',
                    border: selectedId === eq.id ? '2px solid #1976d2' : '1px solid #e0e0e0',
                    '&:hover': { boxShadow: 2 },
                  }}
                  onClick={() => setSelectedId(eq.id)}
                >
                  <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography fontSize={24}>{TYPE_ICONS[eq.type] || '📍'}</Typography>
                        <Box>
                          <Typography variant="subtitle2" fontWeight={600}>{eq.name}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {eq.identifier || eq.type} •{' '}
                            {eq.last_position?.recorded_at
                              ? formatDistanceToNow(new Date(eq.last_position.recorded_at), { addSuffix: true })
                              : 'No position data'}
                          </Typography>
                        </Box>
                      </Box>
                      {canWrite && <IconButton size="small" onClick={(e) => { e.stopPropagation(); handleDelete(eq.id); }} aria-label="Delete">
                        <DeleteIcon fontSize="small" />
                      </IconButton>}
                    </Box>
                    {eq.last_position && (
                      <Box sx={{ mt: 0.5, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                        {eq.last_position.speed > 0 && <Chip label={`${parseFloat(eq.last_position.speed).toFixed(1)} km/h`} size="small" />}
                        <Chip
                          icon={<PositionIcon sx={{ fontSize: 14 }} />}
                          label={recent ? 'Live' : 'Last seen'}
                          size="small"
                          color={recent ? 'success' : 'default'}
                        />
                      </Box>
                    )}
                  </CardContent>
                </Card>
              );
            })}
            {equipment.length === 0 && (
              <Typography color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>No equipment registered</Typography>
            )}
          </Paper>

          {selectedEquipment && (
            <Alert
              severity="info"
              sx={{ mt: 2 }}
              action={<IconButton size="small" onClick={copyIngest} aria-label="Copy"><CopyIcon fontSize="small" /></IconButton>}
            >
              <Typography variant="subtitle2">Send this tractor into the map</Typography>
              <Typography variant="caption" display="block" sx={{ fontFamily: 'var(--font-mono, ui-monospace, monospace)', wordBreak: 'break-all' }}>
                POST {API_BASE}/gps/position
              </Typography>
              <Typography variant="caption" display="block">
                Header X-API-Key (from Admin → API Keys). Body can use identifier
                {selectedEquipment.identifier ? ` "${selectedEquipment.identifier}"` : ''} or equipment_id.
              </Typography>
              {canWrite && <Button size="small" sx={{ mt: 1, textTransform: 'none' }} onClick={openTestPoint}>
                Drop test point
              </Button>}
            </Alert>
          )}
        </Grid>

        <Grid size={{ xs: 12, md: 8 }}>
          <Paper sx={{ p: 0, overflow: 'hidden', borderRadius: 2 }}>
            <Box sx={{ px: 2, py: 1, borderBottom: '1px solid #eee' }}>
              <Typography variant="body2" color="text.secondary">
                {selectedEquipment
                  ? `${TYPE_ICONS[selectedEquipment.type] || ''} ${selectedEquipment.name} — ${viewingToday ? 'today' : trackDate} (${positions.length} points)`
                  : 'Select a tractor to see its day track'}
              </Typography>
              {selectedEquipment && positions.length === 0 && (
                <Typography variant="caption" color="text.secondary">
                  No GPS points for this day. Drop a test point or POST to /gps/position.
                </Typography>
              )}
            </Box>
            <Box sx={{ height: 500 }}>
              <MapContainer center={DEFAULT_CENTER} zoom={12} style={{ height: '100%', width: '100%' }}>
                <MapLifecycle />
                <MapResizeInvalidator revision={`${selectedId || ''}:${trackDate}`} />
                <GpsMapFocus
                  shouldFit={shouldFit}
                  onFitted={onFitted}
                  trailCoords={trailCoords}
                  focusLatLng={focusLatLng && Number.isFinite(focusLatLng[0]) && Number.isFinite(focusLatLng[1]) ? focusLatLng : null}
                />
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

                {equipment.filter((eq) => eq.last_position).map((eq) => (
                  <Marker
                    key={eq.id}
                    position={[parseFloat(eq.last_position.latitude), parseFloat(eq.last_position.longitude)]}
                    eventHandlers={{ click: () => setSelectedId(eq.id) }}
                  >
                    <Popup>
                      <strong>{TYPE_ICONS[eq.type]} {eq.name}</strong><br />
                      {eq.last_position.speed > 0 && <>Speed: {parseFloat(eq.last_position.speed).toFixed(1)} km/h<br /></>}
                      Last seen: {eq.last_position.recorded_at ? formatDistanceToNow(new Date(eq.last_position.recorded_at), { addSuffix: true }) : 'Unknown'}
                    </Popup>
                  </Marker>
                ))}

                {trailCoords.length > 1 && (
                  <Polyline positions={trailCoords} color="#1976d2" weight={3} opacity={0.7} />
                )}
              </MapContainer>
            </Box>
          </Paper>
        </Grid>
      </Grid>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Equipment</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <TextField select label="Type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {EQUIPMENT_TYPES.map((t) => <MenuItem key={t} value={t}>{TYPE_ICONS[t]} {t.charAt(0).toUpperCase() + t.slice(1)}</MenuItem>)}
            </TextField>
            <TextField
              label="Identifier (IMEI / serial / plate)"
              value={form.identifier}
              onChange={(e) => setForm({ ...form, identifier: e.target.value })}
              helperText="Trackers can POST this instead of the equipment UUID"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate}>Add</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={testOpen} onClose={() => setTestOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Drop test point</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label="Latitude"
              value={testPoint.latitude}
              onChange={(e) => setTestPoint((prev) => ({ ...prev, latitude: e.target.value }))}
            />
            <TextField
              label="Longitude"
              value={testPoint.longitude}
              onChange={(e) => setTestPoint((prev) => ({ ...prev, longitude: e.target.value }))}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTestOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleTestPoint}>Save point</Button>
        </DialogActions>
      </Dialog>
      {confirmDialog}
    </Container>
  );
}
