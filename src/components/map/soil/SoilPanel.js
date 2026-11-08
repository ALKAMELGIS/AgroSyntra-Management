import { useEffect, useState } from 'react';
import { useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import {
  Alert, Box, Chip, CircularProgress, IconButton, Table, TableBody, TableCell, TableHead, TableRow, Tooltip, Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { CloseRounded as CloseIcon, TerrainOutlined as SoilIcon } from '@mui/icons-material';
import { apiRequest } from '../../../utils/api';
import HelpTip from '../../HelpTip';
import ExportButton from '../../ExportButton';
import { soilApplies, featureAt, featureType, featureName } from './soilRules';

const DEPTHS = [0, 10, 30, 60, 100];
const fmt = (v) => (v === null || v === undefined ? '—' : typeof v === 'number' ? v.toLocaleString('en-US', { maximumFractionDigits: 1 }) : v);

/** Inside the Leaflet map: every click while the soil tool is on picks a point. */
export function SoilMapPicker({ active, point, onPick }) {
  const map = useMap();
  // preclick fires for every click, also on field polygons (which handle their own click).
  useMapEvents({
    preclick: (e) => { if (active) onPick({ lat: e.latlng.lat, lon: e.latlng.lng }); },
    popupopen: () => { if (active) map.closePopup(); },
  });
  useEffect(() => {
    const el = map.getContainer();
    el.style.cursor = active ? 'crosshair' : '';
    return () => { el.style.cursor = ''; };
  }, [map, active]);
  useEffect(() => {
    if (!active || !point) return undefined;
    const m = L.circleMarker([point.lat, point.lon], { radius: 7, color: '#fff', weight: 2, fillColor: '#8d5524', fillOpacity: 1, interactive: false }).addTo(map);
    return () => { m.remove(); };
  }, [map, active, point]);
  return null;
}

/**
 * Soil bar at the bottom of the map (beside the legend), switched on from the
 * tool bar — no side panel. Open fields and pivots only.
 */
export function SoilDock({ point, features = [], onClose }) {
  const [depths, setDepths] = useState([0, 30, 60]);
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const hit = point ? featureAt(features, point.lon, point.lat) : null;
  const type = hit ? featureType(hit.properties) : '';
  const rule = hit ? soilApplies(type) : null;
  const blocked = point && (!hit ? 'outside' : !rule.allowed ? 'protected' : null);

  useEffect(() => {
    if (!point || blocked) { setData(null); setError(null); return undefined; }
    let alive = true;
    setBusy(true); setError(null);
    apiRequest(`/soil-grids/point?lat=${point.lat.toFixed(5)}&lon=${point.lon.toFixed(5)}&depths=${depths.join(',')}`)
      .then((d) => { if (!alive) return; if (Array.isArray(d?.rows) && Array.isArray(d?.depths)) setData(d); else { setData(null); setError('No soil data for this point.'); } })
      .catch((e) => { if (alive) { setError(e.message); setData(null); } })
      .finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [point, depths, blocked]);

  const toggleDepth = (d) => setDepths((cur) => (cur.includes(d) ? (cur.length > 1 ? cur.filter((x) => x !== d) : cur) : [...cur, d].sort((a, b) => a - b)));
  const csv = () => {
    const head = ['property', 'unit', ...data.depths.map((d) => `${d}cm`)];
    const lines = [head.join(','), ...data.rows.map((r) => head.map((k) => `"${String(r[k] ?? '').replace(/"/g, '""')}"`).join(','))];
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = `soil_${point.lat.toFixed(4)}_${point.lon.toFixed(4)}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  return (
    <Box
      role="region"
      aria-label="Soil properties"
      sx={(t) => ({
        width: { xs: '100%', sm: 520 }, maxWidth: '100%', borderRadius: 1.5, border: 1, borderColor: 'divider', boxShadow: 3,
        bgcolor: alpha(t.palette.background.paper, 0.97), overflow: 'hidden',
      })}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 1.25, py: 0.75, borderBottom: 1, borderColor: 'divider', flexWrap: 'wrap' }}>
        <SoilIcon sx={{ fontSize: 18, color: '#8d5524' }} />
        <Typography sx={{ fontSize: '0.8125rem', fontWeight: 700, mr: 0.5 }}>Soil</Typography>
        <HelpTip size={20}>Global soil maps by OpenLandMap (OpenGeoHub), 250 m, for open fields and pivots. Values are modelled, not lab results.</HelpTip>
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', flex: 1, minWidth: 0 }} role="group" aria-label="Depth">
          {DEPTHS.map((d) => (
            <Chip key={d} size="small" label={<bdi>{`${d} cm`}</bdi>} color={depths.includes(d) ? 'primary' : 'default'} variant={depths.includes(d) ? 'filled' : 'outlined'}
              onClick={() => toggleDepth(d)} aria-pressed={depths.includes(d)} sx={{ height: 24 }} />
          ))}
        </Box>
        {data && <ExportButton size="small" format="csv" label="Export CSV" onClick={csv} />}
        <Tooltip title="Close"><IconButton size="small" aria-label="Close soil" onClick={onClose}><CloseIcon fontSize="small" /></IconButton></Tooltip>
      </Box>
      <Box sx={{ px: 1.25, py: 1 }}>
        {!point && <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>Click an open field or pivot on the map.</Typography>}
        {point && hit && (
          <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mb: 0.5 }}>
            <bdi translate="no">{featureName(hit.properties) || '—'}</bdi>{' · '}<span data-ui-text="">{type || '—'}</span>{' · '}<bdi>{`${point.lat.toFixed(5)}, ${point.lon.toFixed(5)}`}</bdi>
          </Typography>
        )}
        {blocked === 'outside' && <Alert severity="info" sx={{ py: 0 }}>Click inside an open field or pivot.</Alert>}
        {blocked === 'protected' && <Alert severity="warning" sx={{ py: 0 }}>Soil maps are for open fields and pivots, not protected structures.</Alert>}
        {busy && <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><CircularProgress size={16} /><Typography variant="body2">Reading the soil maps…</Typography></Box>}
        {error && !busy && <Alert severity="error" sx={{ py: 0 }}>{error}</Alert>}
        {data && !busy && !blocked && (
          <Box sx={{ overflowX: 'auto' }} tabIndex={0} role="region" aria-label="Soil profile table">
            <Table size="small" aria-label="Soil profile" sx={{ '& .MuiTableCell-root': { px: 0.75, py: 0.5, fontSize: '0.75rem', whiteSpace: 'nowrap' }, '& thead .MuiTableCell-root': { textTransform: 'none', fontSize: '0.6875rem' } }}>
              <TableHead>
                <TableRow>
                  <TableCell>Depth</TableCell>
                  {data.rows.map((r) => (
                    <TableCell key={r.key} align="right">
                      <span data-ui-text="">{r.property}</span>
                      {r.unit && <Typography component="span" sx={{ display: 'block', fontSize: '0.625rem', color: 'text.secondary' }} translate="no">{r.unit}</Typography>}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {data.depths.map((d) => (
                  <TableRow key={d}>
                    <TableCell><bdi>{`${d} cm`}</bdi></TableCell>
                    {data.rows.map((r) => (
                      <TableCell key={r.key} align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                        {typeof r[`${d}cm`] === 'string' ? <span data-ui-text="">{r[`${d}cm`]}</span> : <span translate="no">{fmt(r[`${d}cm`])}</span>}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}
      </Box>
    </Box>
  );
}
