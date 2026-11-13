import { useMemo, useRef, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert, Autocomplete, Box, Button, ButtonBase, Chip, CircularProgress, Divider, FormControlLabel, List, ListItemButton,
  ListItemText, Slider, Stack, Switch, Tab, Tabs, TextField, Tooltip as MuiTooltip, IconButton, Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import {
  CloudOutlined as CloudIcon, DrawOutlined as DrawIcon, UploadFileOutlined as UploadIcon, ZoomInMapOutlined as ZoomIcon,
  DeleteOutlineRounded as ClearIcon, CheckRounded as CheckIcon, CloseRounded as CloseIconSmall,
  ImageOutlined as FigureIcon, TableChartOutlined as TableIcon,
} from '@mui/icons-material';
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import L from 'leaflet';
import HelpTip from '../../HelpTip';
import ExportButton from '../../ExportButton';
import * as api from './satelliteApi';
import { aoiAreaHa, aoiBbox, parseLatLng, readAoiFile, ringToFeature, outerRing } from './aoi';

const GROUPS = [
  { key: 'all', label: 'All layers' },
  { key: 'vegetation', label: 'Vegetation' },
  { key: 'water', label: 'Water & moisture' },
  { key: 'soil', label: 'Soil' },
  { key: 'visual', label: 'Band combinations' },
];
const VISUAL_SWATCH = {
  TRUE_COLOR: 'linear-gradient(135deg,#3d5a2a,#7a8b55 40%,#b9a77a 70%,#6f8fa8)',
  FALSE_COLOR: 'linear-gradient(135deg,#7a0d0d,#d1403a 45%,#e6a07c 70%,#3e6f8c)',
  SWIR: 'linear-gradient(135deg,#1b4d2b,#5b8c4a 40%,#c7b36d 70%,#e9d7b0)',
};

const section = { px: 2.5, py: 1.75 };
const label = { fontSize: '0.75rem', fontWeight: 700, letterSpacing: 0, textTransform: 'none', color: 'text.secondary', mb: 1 };

export function NotConfigured({ isAdmin }) {
  return (
    <Box sx={section}>
      <Alert severity="info" sx={{ fontSize: '0.8125rem' }}>
        Satellite imagery is not set up yet.{' '}
        {isAdmin ? <RouterLink to="/admin/api-keys">Settings → API Keys → Satellite imagery</RouterLink> : 'Ask your administrator.'}
      </Alert>
    </Box>
  );
}

export function rampCss(legend) {
  if (!legend?.length) return null;
  const min = legend[0].value;
  const max = legend[legend.length - 1].value;
  return `linear-gradient(90deg, ${legend.map((l) => `${l.color} ${((l.value - min) / (max - min || 1)) * 100}%`).join(', ')})`;
}

/** Index layers: gallery by group, show on map, opacity, legend. */
export function LayersPanel({ sat }) {
  const [group, setGroup] = useState('all');
  const list = sat.indices.filter((i) => group === 'all' || i.group === group);
  return (
    <Box>
      <Box sx={{ ...section, pb: 1 }}>
        <FormControlLabel
          control={<Switch checked={sat.show} onChange={(e) => sat.setShow(e.target.checked)} />}
          label={<Typography sx={{ fontSize: '0.875rem', fontWeight: 600 }}>Show on map</Typography>}
        />
        <Typography sx={{ ...label, mt: 1.5, mb: 0 }}>Opacity</Typography>
        <Slider size="small" min={0.2} max={1} step={0.05} value={sat.opacity} onChange={(_, v) => sat.setOpacity(v)} aria-label="Opacity" valueLabelDisplay="auto" valueLabelFormat={(v) => `${Math.round(v * 100)}%`} />
      </Box>
      <Tabs value={group} onChange={(_, v) => setGroup(v)} variant="scrollable" scrollButtons="auto" sx={{ px: 1, minHeight: 40, borderBottom: 1, borderColor: 'divider', '& .MuiTab-root': { minHeight: 40, fontSize: '0.75rem', textTransform: 'none', px: 1.25 } }}>
        {GROUPS.map((g) => <Tab key={g.key} value={g.key} label={g.label} />)}
      </Tabs>
      <Box sx={{ p: 1.5, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1 }}>
        {list.map((i) => {
          const selected = i.key === sat.index;
          return (
            <ButtonBase
              key={i.key}
              onClick={() => { sat.setIndex(i.key); sat.setShow(true); }}
              aria-pressed={selected}
              sx={(t) => ({
                display: 'block', textAlign: 'start', borderRadius: 1.5, overflow: 'hidden', border: 2,
                borderColor: selected ? 'primary.main' : 'divider', bgcolor: selected ? alpha(t.palette.primary.main, 0.06) : 'background.paper',
                '&.Mui-focusVisible': { outline: `2px solid ${t.palette.primary.main}`, outlineOffset: 2 },
              })}
            >
              {/* Inline style: the RTL style plugin must not rewrite gradient stops. */}
              <Box sx={{ height: 44 }} style={{ background: VISUAL_SWATCH[i.key] || rampCss(i.legend) || '#ccc' }} />
              <Box sx={{ px: 1, py: 0.75 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Typography component="span" sx={{ fontSize: '0.8125rem', fontWeight: 600, flex: 1, minWidth: 0 }} noWrap>{i.label}</Typography>
                  {selected && <CheckIcon sx={{ fontSize: 16, color: 'primary.main' }} />}
                </Box>
                <Typography component="span" sx={{ display: 'block', fontSize: '0.6875rem', color: 'text.secondary' }} noWrap>{i.description}</Typography>
              </Box>
            </ButtonBase>
          );
        })}
      </Box>
      {sat.current && (
        <Box sx={{ ...section, pt: 0 }}>
          <Typography sx={label}>Formula</Typography>
          <Typography dir="ltr" sx={{ fontSize: '0.8125rem', fontFamily: 'var(--font-mono)', textAlign: 'end' }} translate="no">{sat.current.formula}</Typography>
          {sat.current.legend && <LegendBar legend={sat.current.legend} sx={{ mt: 1.5 }} />}
        </Box>
      )}
    </Box>
  );
}

export function LegendBar({ legend, sx }) {
  return (
    <Box sx={sx} dir="ltr">
      <Box sx={{ height: 10, borderRadius: 5 }} style={{ background: rampCss(legend) }} />
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5, fontSize: '0.6875rem', color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
        <span>{legend[0].value}</span>
        <span>{legend[Math.floor(legend.length / 2)].value}</span>
        <span>{legend[legend.length - 1].value}</span>
      </Box>
    </Box>
  );
}

function viewBbox(map, sat) {
  const box = sat.aoi ? aoiBbox(sat.aoi) : null;
  if (box) return box;
  const b = map?.getBounds?.();
  return b ? [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()] : null;
}

function SceneList({ scenes, value, onPick, allowLatest = true }) {
  if (!scenes) return null;
  if (!scenes.length) return <Typography variant="body2" color="text.secondary" sx={{ px: 2.5, py: 1 }}>No scenes match these filters.</Typography>;
  return (
    <List dense disablePadding sx={{ px: 1 }}>
      {allowLatest && (
        <ListItemButton selected={!value} onClick={() => onPick(null)} sx={{ borderRadius: 1 }}>
          <ListItemText primary="Best of the period (least cloudy, most recent)" primaryTypographyProps={{ fontSize: '0.8125rem' }} />
        </ListItemButton>
      )}
      {scenes.map((s) => (
        <ListItemButton key={s.date} selected={value === s.date} onClick={() => onPick(s.date)} sx={{ borderRadius: 1, gap: 1 }}>
          <ListItemText primary={<bdi>{s.date}</bdi>} secondary={`Sentinel-2 L2A · ${s.tiles} tile${s.tiles > 1 ? 's' : ''}`} primaryTypographyProps={{ fontSize: '0.8125rem', fontWeight: 600 }} secondaryTypographyProps={{ fontSize: '0.6875rem' }} />
          <Chip size="small" icon={<CloudIcon />} label={`${s.cloud}%`} color={s.cloud <= 10 ? 'success' : s.cloud <= 30 ? 'default' : 'warning'} variant="outlined" />
        </ListItemButton>
      ))}
    </List>
  );
}

function useSceneSearch(sat, mapRef) {
  const [scenes, setScenes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const search = async () => {
    const bbox = viewBbox(mapRef.current, sat);
    if (!bbox) return;
    setBusy(true); setError(null);
    try { setScenes(await api.searchScenes({ bbox, from: sat.from, to: sat.to, maxcc: sat.maxcc })); } catch (e) { setError(e.message); setScenes(null); }
    setBusy(false);
  };
  return { scenes, busy, error, search };
}

/** Imagery date: period, cloud filter, scene search and pick. */
export function DatesPanel({ sat, mapRef }) {
  const s = useSceneSearch(sat, mapRef);
  return (
    <Box>
      <Box sx={section}>
        <Typography sx={label}>Period</Typography>
        <Stack direction="row" spacing={1}>
          <TextField size="small" type="date" label="Start" value={sat.from} onChange={(e) => { sat.setFrom(e.target.value); sat.setScene(null); }} InputLabelProps={{ shrink: true }} fullWidth />
          <TextField size="small" type="date" label="End" value={sat.to} onChange={(e) => { sat.setTo(e.target.value); sat.setScene(null); }} InputLabelProps={{ shrink: true }} fullWidth />
        </Stack>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2 }}>
          <Typography sx={{ ...label, mb: 0, flexShrink: 0 }}>Cloud ≤</Typography>
          <Slider size="small" min={0} max={100} step={5} value={sat.maxcc} onChange={(_, v) => sat.setMaxcc(v)} aria-label="Maximum cloud cover" sx={{ mx: 1 }} />
          <Chip size="small" icon={<CloudIcon />} label={`${sat.maxcc}%`} />
        </Box>
        <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mt: 1 }}>
          {'Sentinel-2 L2A · '}<bdi>{sat.scene ? `scene ${sat.scene}` : `${sat.from} → ${sat.to}`}</bdi>
        </Typography>
        <Button fullWidth variant="outlined" sx={{ mt: 1.5 }} onClick={s.search} disabled={!sat.status.configured || s.busy} startIcon={s.busy ? <CircularProgress size={16} /> : null}>
          Search scenes
        </Button>
        {s.error && <Alert severity="error" sx={{ mt: 1.5 }}>{s.error}</Alert>}
      </Box>
      <SceneList scenes={s.scenes} value={sat.scene} onPick={(d) => { sat.setScene(d); sat.setShow(true); }} />
    </Box>
  );
}

/** Area of interest: draw, upload, pick a field, go to coordinates; clip / mask. */
export function AoiPanel({ sat, mapRef, fields = [] }) {
  const fileRef = useRef(null);
  const [coord, setCoord] = useState('');
  const [error, setError] = useState(null);
  const area = sat.aoi ? aoiAreaHa(sat.aoi) : 0;
  const zoomTo = (feature) => {
    const ring = outerRing(feature);
    if (ring && mapRef.current) mapRef.current.fitBounds(L.latLngBounds(ring.map(([lng, lat]) => [lat, lng])), { padding: [40, 40], maxZoom: 17 });
  };
  const pickField = (f) => {
    const ring = outerRing(f?.feature);
    if (!ring) return;
    const feat = ringToFeature(ring, f.label);
    sat.setAoi(feat);
    zoomTo(feat);
  };
  return (
    <Box>
      <Box sx={section}>
        <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary', mb: 1.5 }}>Draw the area to monitor, upload it, or use a field.</Typography>
        <Stack spacing={1}>
          <Button variant={sat.drawing ? 'contained' : 'outlined'} startIcon={<DrawIcon />} onClick={() => sat.setDrawing(!sat.drawing)}>
            {sat.drawing ? 'Click points on the map… (finish on the first point)' : 'Draw AOI on the map'}
          </Button>
          <Button variant="outlined" startIcon={<UploadIcon />} onClick={() => fileRef.current?.click()}>Upload AOI (GeoJSON / KML)</Button>
          <input ref={fileRef} type="file" accept=".geojson,.json,.kml" hidden onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            try { setError(null); const f = await readAoiFile(file); sat.setAoi(f); zoomTo(f); } catch (err) { setError(err.message); }
          }} />
          {fields.length > 0 && (
            <Autocomplete
              size="small"
              options={fields}
              getOptionLabel={(o) => o.label}
              onChange={(_, v) => v && pickField(v)}
              renderInput={(params) => <TextField {...params} label="Use a field as AOI" />}
            />
          )}
          <TextField
            size="small" label="Go to coordinates (lat, lng)" placeholder="24.2134, 55.7612" value={coord}
            onChange={(e) => setCoord(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              const ll = parseLatLng(coord);
              if (ll && mapRef.current) mapRef.current.setView(ll, 15); else setError('Write the coordinates as: latitude, longitude');
            }}
          />
        </Stack>
        {error && <Alert severity="error" sx={{ mt: 1.5 }}>{error}</Alert>}
      </Box>
      {sat.aoi && (
        <>
          <Divider />
          <Box sx={section}>
            <Typography sx={label}>Current AOI</Typography>
            <Typography sx={{ fontSize: '0.875rem', fontWeight: 600 }}>{sat.aoi.properties?.name || 'AOI'}</Typography>
            <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}><bdi>{`${area.toLocaleString('en-US', { maximumFractionDigits: 2 })} ha`}</bdi></Typography>
            <FormControlLabel sx={{ mt: 1 }} control={<Switch checked={sat.clip} onChange={(e) => sat.setClip(e.target.checked)} />} label={<Typography sx={{ fontSize: '0.8125rem' }}>Clip image to AOI (mask)</Typography>} />
            <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
              <Button size="small" startIcon={<ZoomIcon />} onClick={() => zoomTo(sat.aoi)}>Zoom to AOI</Button>
              <Button size="small" color="error" startIcon={<ClearIcon />} onClick={sat.clearAoi}>Clear</Button>
            </Stack>
          </Box>
        </>
      )}
    </Box>
  );
}

/** Change detection: a second date on the other side of a swipe handle. */
export function ComparePanel({ sat, mapRef }) {
  const s = useSceneSearch(sat, mapRef);
  return (
    <Box>
      <Box sx={section}>
        <FormControlLabel
          control={<Switch checked={sat.compare.on} onChange={(e) => { sat.setCompare((c) => ({ ...c, on: e.target.checked })); if (e.target.checked) sat.setShow(true); }} />}
          label={<Typography sx={{ fontSize: '0.875rem', fontWeight: 600 }}>Compare two dates</Typography>}
        />
        <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary', mt: 0.5 }}>
          {'Side A: '}<bdi>{sat.scene || `${sat.from} → ${sat.to}`}</bdi>{' · Side B: '}<bdi>{sat.compare.date || '—'}</bdi>
        </Typography>
        <TextField size="small" type="date" label="Date B" sx={{ mt: 1.5 }} fullWidth InputLabelProps={{ shrink: true }}
          value={sat.compare.date || ''} onChange={(e) => sat.setCompare((c) => ({ ...c, date: e.target.value || null, on: true }))} />
        <Button fullWidth variant="outlined" sx={{ mt: 1.5 }} onClick={s.search} disabled={!sat.status.configured || s.busy}>Find scenes for date B</Button>
        {s.error && <Alert severity="error" sx={{ mt: 1.5 }}>{s.error}</Alert>}
      </Box>
      <SceneList scenes={s.scenes} value={sat.compare.date} allowLatest={false} onPick={(d) => sat.setCompare((c) => ({ ...c, date: d, on: true }))} />
    </Box>
  );
}

/** Time series of the index over the AOI. */
export function TimeSeriesPanel({ sat }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const canRun = sat.status.configured && sat.wkt && sat.current && !sat.current.visual;
  const run = async () => {
    setBusy(true); setError(null);
    try { setData(await api.getStats({ index: sat.index, geometry: sat.wkt, from: sat.from, to: sat.to, maxcc: sat.maxcc })); } catch (e) { setError(e.message); }
    setBusy(false);
  };
  const csv = useMemo(() => (data ? ['date,mean,min,max', ...data.map((d) => `${d.date},${d.mean},${d.min},${d.max}`)].join('\n') : ''), [data]);
  return (
    <Box sx={section}>
      <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>
        <bdi translate="no">{sat.current?.label || ''}</bdi>{' · '}<bdi>{`${sat.from} → ${sat.to}`}</bdi>{` · ${sat.aoi?.properties?.name || 'no AOI'}`}
      </Typography>
      {!sat.aoi && <Alert severity="info" sx={{ mt: 1.5 }}>Set an AOI first (draw it, upload it or pick a field).</Alert>}
      {sat.current?.visual && <Alert severity="info" sx={{ mt: 1.5 }}>Choose an index (NDVI, NDWI, NDMI …), not a band combination.</Alert>}
      <Button fullWidth variant="contained" sx={{ mt: 1.5 }} disabled={!canRun || busy} onClick={run} startIcon={busy ? <CircularProgress size={16} color="inherit" /> : null}>
        Build time series
      </Button>
      {error && <Alert severity="error" sx={{ mt: 1.5 }}>{error}</Alert>}
      {data && (
        data.length === 0 ? <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>No clear scenes in this period.</Typography> : (
          <>
            <Box dir="ltr" sx={{ height: 220, mt: 2 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data.map((d) => ({ ...d, range: [d.min, d.max] }))}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={16} />
                  <YAxis tick={{ fontSize: 11 }} width={40} domain={['auto', 'auto']} />
                  <Tooltip />
                  <Area dataKey="range" name="min–max" stroke="none" fill="#2e7d32" fillOpacity={0.15} />
                  <Line dataKey="mean" name="mean" stroke="#1b5e20" strokeWidth={2} dot={{ r: 2 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 1 }}>
              <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}><bdi>{`${data.length} scenes`}</bdi></Typography>
              <ExportButton size="small" format="csv" label="Export to CSV" onClick={() => {
                const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
                const a = document.createElement('a'); a.href = url; a.download = `${sat.index}_${sat.from}_${sat.to}.csv`; a.click();
                setTimeout(() => URL.revokeObjectURL(url), 2000);
              }} />
            </Box>
          </>
        )
      )}
    </Box>
  );
}

/** What is on the map: source, index, date, filters, AOI. */
export function MetadataPanel({ sat }) {
  const rows = [
    ['Satellite', 'Sentinel-2 L2A (ESA Copernicus)'],
    ['Service', sat.status.service === 'copernicus' ? 'Copernicus Data Space' : 'Sentinel Hub'],
    sat.status.label && ['Configuration', sat.status.label],
    ['Layer', sat.current?.label],
    ['Formula', sat.current?.formula],
    ['Date', sat.scene || `${sat.from} → ${sat.to}`],
    ['Cloud cover ≤', `${sat.maxcc}%`],
    ['Resolution', '10 m (visible, NIR) · 20 m (SWIR)'],
    ['Revisit', '≈ 5 days'],
    ['AOI', sat.aoi ? `${sat.aoi.properties?.name || 'AOI'} · ${aoiAreaHa(sat.aoi).toLocaleString('en-US', { maximumFractionDigits: 2 })} ha` : '—'],
    ['Clip to AOI', sat.clip && sat.aoi ? 'Yes' : 'No'],
  ].filter(Boolean);
  return (
    <Box component="dl" sx={{ ...section, m: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 2, rowGap: 1 }}>
      {rows.map(([k, v]) => (
        <Box key={k} sx={{ display: 'contents' }}>
          <Typography component="dt" sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>{k}</Typography>
          <Typography component="dd" sx={{ m: 0, fontSize: '0.8125rem', fontWeight: 500, overflowWrap: 'anywhere' }}><bdi translate="no">{v || '—'}</bdi></Typography>
        </Box>
      ))}
      <Box sx={{ gridColumn: '1 / -1', mt: 1 }}>
        <HelpTip>Images come from the satellite service through the AgroCloud server; the configuration ID stays on the server.</HelpTip>
      </Box>
    </Box>
  );
}

/** PNG of the AOI (or the current view) for the chosen index and date. */
export async function downloadImage(sat, map) {
  const box = sat.aoi ? aoiBbox(sat.aoi) : (() => { const b = map.getBounds(); return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]; })();
  const sw = L.CRS.EPSG3857.project(L.latLng(box[1], box[0]));
  const ne = L.CRS.EPSG3857.project(L.latLng(box[3], box[2]));
  const ratio = (ne.y - sw.y) / (ne.x - sw.x || 1);
  const width = 1024;
  const height = Math.max(64, Math.min(1024, Math.round(width * ratio)));
  const q = new URLSearchParams({
    k: sat.tileKey, LAYERS: 'S2', INDEX: sat.index, BBOX: `${sw.x},${sw.y},${ne.x},${ne.y}`, CRS: 'EPSG:3857',
    WIDTH: String(width), HEIGHT: String(height), TIME: sat.time, MAXCC: String(sat.maxcc), FORMAT: 'image/png',
  });
  if (sat.clip && sat.wkt) q.set('GEOMETRY', sat.wkt);
  const res = await fetch(`${api.WMS_URL}?${q.toString()}`);
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = `${sat.index}_${sat.scene || sat.to}.png`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Vertical legend in the map's top-left corner while an index is shown.
 * Position is a plain style (always the physical left), below the zoom buttons
 * or the warning banner when those are in that corner.
 */
export function MapIndexLegend({ sat, top = 12 }) {
  if (!sat.ready || !sat.show || !sat.current?.legend) return null;
  const legend = sat.current.legend;
  const min = legend[0].value;
  const max = legend[legend.length - 1].value;
  const pos = (v) => `${((max - v) / (max - min || 1)) * 100}%`;
  const gradient = `linear-gradient(to top, ${legend.map((l) => `${l.color} ${((l.value - min) / (max - min || 1)) * 100}%`).join(', ')})`;
  return (
    <Box
      role="img"
      aria-label={`${sat.current.label} legend, ${min} to ${max}`}
      style={{ position: 'absolute', left: 12, top, zIndex: 1000 }}
      sx={(t) => ({ p: 1, pb: 1.25, borderRadius: 1.5, bgcolor: alpha(t.palette.background.paper, 0.94), boxShadow: 2, border: 1, borderColor: 'divider' })}
    >
      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, textAlign: 'center' }} translate="no">{sat.current.label}</Typography>
      <Typography sx={{ fontSize: '0.625rem', color: 'text.secondary', textAlign: 'center', mb: 1, maxWidth: 88 }}><bdi>{sat.scene || sat.to}</bdi></Typography>
      <Box dir="ltr" sx={{ display: 'flex', gap: 0.75, height: 140, mx: 'auto', width: 'fit-content' }}>
        <Box sx={{ width: 12, borderRadius: 6, flexShrink: 0 }} style={{ background: gradient }} />
        <Box sx={{ position: 'relative', width: 34 }}>
          {legend.map((l) => (
            <Typography key={l.value} component="span" sx={{ position: 'absolute', left: 0, transform: 'translateY(-50%)', fontSize: '0.625rem', lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: 'text.secondary', whiteSpace: 'nowrap' }} style={{ top: pos(l.value) }}>
              {l.value}
            </Typography>
          ))}
        </Box>
      </Box>
    </Box>
  );
}

/** Drag handle for the compare swipe (keyboard: arrows). */
export function CompareSwipe({ sat }) {
  const boxRef = useRef(null);
  if (!sat.ready || !sat.show || !sat.compare.on || !sat.compare.date) return null;
  const rtl = document.documentElement.dir === 'rtl';
  const set = (v) => sat.setCompare((c) => ({ ...c, swipe: Math.min(95, Math.max(5, v)) }));
  const fromEvent = (e) => {
    const r = boxRef.current.parentElement.getBoundingClientRect();
    set(((e.clientX - r.left) / r.width) * 100);
  };
  return (
    <Box ref={boxRef} sx={{ position: 'absolute', top: 0, bottom: 0, left: `${sat.compare.swipe}%`, zIndex: 1000, width: 0 }}>
      <Box sx={{ position: 'absolute', top: 0, bottom: 0, left: -1, width: 2, bgcolor: 'common.white', boxShadow: '0 0 4px rgba(0,0,0,.5)' }} />
      <Box
        role="slider" tabIndex={0} aria-label="Compare dates" aria-valuemin={5} aria-valuemax={95} aria-valuenow={Math.round(sat.compare.swipe)}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); }}
        onPointerMove={(e) => { if (e.buttons === 1) fromEvent(e); }}
        onKeyDown={(e) => { if (e.key === 'ArrowLeft') set(sat.compare.swipe - 2); if (e.key === 'ArrowRight') set(sat.compare.swipe + 2); }}
        sx={(t) => ({
          position: 'absolute', top: '50%', left: -18, width: 36, height: 36, mt: '-18px', borderRadius: '50%', cursor: 'ew-resize',
          bgcolor: 'common.white', color: 'text.primary', display: 'grid', placeItems: 'center', boxShadow: 3, fontSize: 14, fontWeight: 700, userSelect: 'none', touchAction: 'none',
          '&:focus-visible': { outline: `2px solid ${t.palette.primary.main}`, outlineOffset: 2 },
        })}
      >
        ⇆
      </Box>
      <Typography sx={{ position: 'absolute', top: 10, [rtl ? 'right' : 'left']: 8, px: 0.75, borderRadius: 1, bgcolor: 'rgba(0,0,0,.6)', color: '#fff', fontSize: '0.6875rem', whiteSpace: 'nowrap' }}><bdi>{`B · ${sat.compare.date}`}</bdi></Typography>
      <Typography sx={{ position: 'absolute', top: 10, [rtl ? 'left' : 'right']: 8, px: 0.75, borderRadius: 1, bgcolor: 'rgba(0,0,0,.6)', color: '#fff', fontSize: '0.6875rem', whiteSpace: 'nowrap' }}><bdi>{`A · ${sat.scene || sat.to}`}</bdi></Typography>
    </Box>
  );
}

const PERIODS = [
  { key: '3m', label: '3 months', months: 3 },
  { key: '6m', label: '6 months', months: 6 },
  { key: '1y', label: '1 year', months: 12 },
  { key: '2y', label: '2 years', months: 24 },
  { key: 'custom', label: 'Imagery dates', months: 0 },
];
const iso = (d) => d.toISOString().slice(0, 10);
function periodRange(key, sat) {
  const p = PERIODS.find((x) => x.key === key);
  if (!p || !p.months) return { from: sat.from, to: sat.to };
  const to = new Date(sat.to || Date.now());
  const from = new Date(to);
  from.setMonth(from.getMonth() - p.months);
  return { from: iso(from), to: iso(to) };
}

/** Saves the chart (SVG) as a PNG figure. */
function downloadFigure(container, name) {
  const svg = container?.querySelector('svg.recharts-surface');
  if (!svg) return;
  const box = svg.getBoundingClientRect();
  const clone = svg.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', box.width);
  clone.setAttribute('height', box.height);
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }));
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = box.width * 2; c.height = box.height * 2;
    const g = c.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height); g.scale(2, 2); g.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    const a = document.createElement('a'); a.href = c.toDataURL('image/png'); a.download = `${name}.png`; a.click();
  };
  img.src = url;
}

/**
 * Time series across the bottom of the map (like LandViewer): index, period,
 * Apply; min–max band with the mean; figure (PNG) and table (CSV) export.
 */
export function TimeSeriesDock({ sat, onClose, onSetAoi }) {
  const [period, setPeriod] = useState('1y');
  const [idx, setIdx] = useState(sat.current && !sat.current.visual ? sat.index : 'NDVI');
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const chartRef = useRef(null);
  const indices = sat.indices.filter((i) => !i.visual);
  const range = periodRange(period, sat);
  const run = async () => {
    if (!sat.wkt) return;
    setBusy(true); setError(null);
    try { setData(await api.getStats({ index: idx, geometry: sat.wkt, from: range.from, to: range.to, maxcc: sat.maxcc })); } catch (e) { setError(e.message); setData(null); }
    setBusy(false);
  };
  const name = `${idx}_${range.from}_${range.to}`;
  const csv = () => {
    const text = ['date,mean,min,max', ...data.map((d) => `${d.date},${d.mean},${d.min},${d.max}`)].join('\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = `${name}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  return (
    <Box role="region" aria-label="Time series" sx={(t) => ({ borderRadius: 1.5, border: 1, borderColor: 'divider', boxShadow: 3, bgcolor: alpha(t.palette.background.paper, 0.97), overflow: 'hidden' })}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.25, pt: 1.5, pb: 1, borderBottom: 1, borderColor: 'divider', flexWrap: 'wrap' }}>
        <TextField select size="small" label="Index" value={idx} onChange={(e) => setIdx(e.target.value)} sx={{ minWidth: 140 }} SelectProps={{ native: true }}>
          {indices.map((i) => <option key={i.key} value={i.key}>{i.label}</option>)}
        </TextField>
        <TextField select size="small" label="Period" value={period} onChange={(e) => setPeriod(e.target.value)} sx={{ minWidth: 140 }} SelectProps={{ native: true }}>
          {PERIODS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
        </TextField>
        <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}><bdi>{`Sentinel-2 · ${range.from} → ${range.to}`}</bdi></Typography>
        <Box sx={{ flex: 1 }} />
        <Button size="small" variant="contained" onClick={run} disabled={!sat.status.configured || !sat.wkt || busy} startIcon={busy ? <CircularProgress size={14} color="inherit" /> : null}>Apply</Button>
        <MuiTooltip title="Close"><IconButton size="small" aria-label="Close time series" onClick={onClose}><CloseIconSmall /></IconButton></MuiTooltip>
      </Box>
      <Box sx={{ px: 1.25, py: 1 }}>
        {!sat.aoi && (
          <Alert severity="info" sx={{ py: 0 }} action={<Button size="small" onClick={onSetAoi}>Set AOI</Button>}>Set an AOI first (draw it, upload it or pick a field).</Alert>
        )}
        {error && <Alert severity="error" sx={{ py: 0 }}>{error}</Alert>}
        {sat.aoi && !data && !error && <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>Choose the index and period, then Apply.</Typography>}
        {data && data.length === 0 && <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>No clear scenes in this period.</Typography>}
        {data && data.length > 0 && (
          <>
            <Box ref={chartRef} dir="ltr" sx={{ height: { xs: 120, md: 150 } }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data.map((d) => ({ ...d, range: [d.min, d.max] }))} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={24} />
                  <YAxis tick={{ fontSize: 11 }} width={36} domain={['auto', 'auto']} />
                  <Tooltip />
                  <Area dataKey="range" name="Min – Max" stroke="#3b82c4" strokeOpacity={0.5} fill="#3b82c4" fillOpacity={0.18} />
                  <Line dataKey="mean" name="Mean" stroke="#1b5e20" strokeWidth={2} dot={{ r: 2.5 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 0.5, flexWrap: 'wrap' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontSize: '0.75rem' }}><Box sx={{ width: 14, height: 8, bgcolor: 'rgba(59,130,196,.35)', borderRadius: 0.5 }} />Min – Max</Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontSize: '0.75rem' }}><Box sx={{ width: 14, height: 3, bgcolor: '#1b5e20' }} />Mean</Box>
              <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', flex: 1 }}>
                <bdi>{`${data.length} scenes · ${sat.aoi?.properties?.name || 'AOI'} · ${aoiAreaHa(sat.aoi).toLocaleString('en-US', { maximumFractionDigits: 1 })} ha`}</bdi>
              </Typography>
              <Button size="small" startIcon={<FigureIcon />} onClick={() => downloadFigure(chartRef.current, name)}>Figure</Button>
              <Button size="small" startIcon={<TableIcon />} onClick={csv}>Table</Button>
            </Box>
          </>
        )}
      </Box>
    </Box>
  );
}
