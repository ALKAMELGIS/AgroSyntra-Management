/**
 * Map helper components for the Remote Sensing page.
 *
 * Extracted from RemoteSensing.js to keep the main file focused on
 * business logic and page layout.
 */
import { useState, useEffect, useRef } from 'react';
import {
  Box,
  Paper,
  TextField,
  IconButton,
  CircularProgress,
  ToggleButton,
  ToggleButtonGroup,
  Switch,
  useTheme,
} from '@mui/material';
import {
  CloseOutlined as CloseIcon,
  SatelliteOutlined as SatelliteIcon,
  SearchOutlined as SearchIcon,
  MyLocationOutlined as MyLocationIcon,
  HomeOutlined as HomeIcon,
  MapOutlined as MapIcon,
  TerrainOutlined as TerrainIcon,
} from '@mui/icons-material';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { BASEMAPS } from '../../utils/mapBasemaps';
import { toLatLngRing } from '../../utils/polygonRing';
import {
  isMapAlive,
  safeMapOp,
  MapLifecycle,
  MapResizeInvalidator,
  safeFitBounds,
  safeFlyTo,
} from '../../utils/leafletSafe';

export { MapLifecycle, MapResizeInvalidator };

/** Swap basemap tiles in place instead of remounting TileLayer (prevents zoom transition races). */
export function BasemapLayer({ baseMap }) {
  const map = useMap();
  useEffect(() => {
    const config = BASEMAPS[baseMap];
    if (!config || !isMapAlive(map)) return undefined;
    const layer = L.tileLayer(config.url, { attribution: config.attribution, zIndex: 0 });
    layer.addTo(map);
    return () => {
      safeMapOp(map, () => map.removeLayer(layer));
    };
  }, [map, baseMap]);
  return null;
}

// ─── FitBounds ──────────────────────────────────────────────────────

/** Automatically fits the map viewport to encompass all field locations. */
export function FitBounds({ fields }) {
  const map = useMap();

  useEffect(() => {
    if (fields.length === 0) return;
    const bounds = fields
      .map((field) => {
        const ring = toLatLngRing(field.polygon);
        if (ring) return ring;
        if (field.latitude && field.longitude) return [[field.latitude, field.longitude]];
        return null;
      })
      .filter(Boolean)
      .flat();

    if (bounds.length === 0) return;
    safeFitBounds(map, bounds, { padding: [50, 50] });
  }, [fields, map]);

  return null;
}

// ─── DrawingTool ────────────────────────────────────────────────────

/** Enables Leaflet-Draw polygon creation mode and reports drawn coordinates. */
export function DrawingTool({ drawingMode, onPolygonDrawn }) {
  const map = useMap();
  const polygonHandlerRef = useRef(null);
  const handleDrawCreatedRef = useRef(null);
  // Latest callback in a ref: the parent passes a new function on every render,
  // and restarting the draw handler then would throw away the points placed so far.
  const onDrawnRef = useRef(onPolygonDrawn);
  onDrawnRef.current = onPolygonDrawn;

  useEffect(() => {
    if (!drawingMode) {
      if (polygonHandlerRef.current) {
        polygonHandlerRef.current.disable();
        polygonHandlerRef.current = null;
      }
      const h = handleDrawCreatedRef.current;
      if (h && L.Draw?.Event?.CREATED) {
        map.off(L.Draw.Event.CREATED, h);
        handleDrawCreatedRef.current = null;
      }
      return;
    }

    let cancelled = false;

    (async () => {
      if (typeof window !== 'undefined') window.L = L;
      try {
        await import('leaflet-draw');
      } catch (e) {
        console.warn('leaflet-draw failed to load:', e);
        return;
      }
      if (cancelled || !L.Draw?.Polygon) return;

      const handler = new L.Draw.Polygon(map, {
        allowIntersection: false,
        showArea: true,
        shapeOptions: { color: '#3388ff', weight: 3, fillOpacity: 0.2 },
      });

      const handleDrawCreated = (e) => {
        const layer = e.layer;
        const latlngs = layer.getLatLngs()[0];
        const coords = latlngs.map((ll) => [ll.lat, ll.lng]);
        handler.disable();
        polygonHandlerRef.current = null;
        handleDrawCreatedRef.current = null;
        onDrawnRef.current?.(coords);
      };

      handleDrawCreatedRef.current = handleDrawCreated;
      map.on(L.Draw.Event.CREATED, handleDrawCreated);
      handler.enable();
      polygonHandlerRef.current = handler;
    })();

    return () => {
      cancelled = true;
      const h = handleDrawCreatedRef.current;
      if (h && L.Draw?.Event?.CREATED) {
        map.off(L.Draw.Event.CREATED, h);
        handleDrawCreatedRef.current = null;
      }
      if (polygonHandlerRef.current) {
        polygonHandlerRef.current.disable();
        polygonHandlerRef.current = null;
      }
    };
  }, [drawingMode, map]);

  return null;
}

// ─── MapWidgets ─────────────────────────────────────────────────────

/** Overlay controls: search bar, GPS, home button, basemap switcher, Sentinel toggle. */
// ─── PolygonEditor ──────────────────────────────────────────────────

/**
 * Edits an existing boundary in place: drag the corner handles, click a
 * middle handle to add a corner, click a corner to remove it. The current
 * shape is reported through onChange; saving is up to the parent.
 */
export function PolygonEditor({ positions, onChange }) {
  const map = useMap();
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!positions || positions.length < 3) return undefined;
    let layer = null;
    let cancelled = false;
    const report = () => {
      if (!layer) return;
      const ring = layer.getLatLngs()[0] || [];
      onChangeRef.current?.(ring.map((ll) => [ll.lat, ll.lng]));
    };
    (async () => {
      if (typeof window !== 'undefined') window.L = L;
      try { await import('leaflet-draw'); } catch { return; }
      if (cancelled) return;
      layer = L.polygon(positions, { color: '#ffb300', weight: 3, fillOpacity: 0.15, dashArray: '6 4' }).addTo(map);
      if (layer.editing) layer.editing.enable();
      layer.on('edit', report);
      map.on('draw:editvertex', report);
      try { map.fitBounds(layer.getBounds(), { padding: [40, 40], maxZoom: 18 }); } catch { /* empty map */ }
      report();
    })();
    return () => {
      cancelled = true;
      map.off('draw:editvertex', report);
      if (layer) { if (layer.editing) layer.editing.disable(); layer.off('edit', report); map.removeLayer(layer); }
    };
    // positions are the starting shape only; edits live in the Leaflet layer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  return null;
}

export function MapWidgets({
  fields,
  baseMap,
  setBaseMap,
  showSentinelOverlay,
  setShowSentinelOverlay,
  sentinelConfigured,
  setSearchLoading,
  searchLoading,
  onGeocodeSuccess,
  onClearSearch,
  setSearchError,
}) {
  const map = useMap();
  const [searchInput, setSearchInput] = useState('');

  // Reposition zoom control to top-left
  useEffect(() => {
    if (!map) return;
    const zoomControl = L.control.zoom({ position: 'topleft' });
    zoomControl.addTo(map);
    return () => zoomControl.remove();
  }, [map]);

  const handleSearch = async (e) => {
    e?.preventDefault?.();
    const q = (searchInput || '').trim();
    if (!q) return;
    setSearchError(null);
    setSearchLoading(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1`,
        { headers: { Accept: 'application/json' } },
      );
      const data = await res.json();
      if (!data || data.length === 0) {
        setSearchError('No results found');
        setSearchLoading(false);
        return;
      }
      const { lat, lon } = data[0];
      const latNum = parseFloat(lat);
      const lonNum = parseFloat(lon);
      safeFlyTo(map, [latNum, lonNum], 14);
      onGeocodeSuccess([latNum, lonNum]);
    } catch {
      setSearchError('Search failed');
    }
    setSearchLoading(false);
  };

  const handleGps = () => {
    if (!navigator.geolocation) {
      setSearchError('Geolocation not supported');
      return;
    }
    setSearchError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        safeFlyTo(map, [latitude, longitude], 14);
        onGeocodeSuccess([latitude, longitude]);
      },
      () => setSearchError('Location unavailable'),
    );
  };

  const handleHome = () => {
    if (fields.length === 0) return;
    const bounds = fields
      .map((f) => {
        const ring = toLatLngRing(f.polygon);
        if (ring) return ring;
        if (f.latitude != null && f.longitude != null) return [[f.latitude, f.longitude]];
        return null;
      })
      .filter(Boolean)
      .flat();
    if (bounds.length > 0) {
      safeFitBounds(map, bounds, { padding: [50, 50], maxZoom: 15 });
    }
  };

  // Leaflet keeps its zoom buttons on the physical left in both directions, while the
  // RTL style plugin mirrors left/right. Write the sides so that, after mirroring, this
  // block always starts 50px from the physical left and never covers the zoom buttons.
  const isRtl = useTheme().direction === 'rtl';
  const sideSx = isRtl
    ? { right: 50, left: { xs: 10, sm: 'auto' } }
    : { left: 50, right: { xs: 10, sm: 'auto' } };
  // Basemap switcher: physical right on wide screens (away from zoom + search), full width on phones.
  const basemapSideSx = isRtl
    ? { left: 10, right: { xs: 10, sm: 'auto' } }
    : { right: 10, left: { xs: 10, sm: 'auto' } };
  const ctrlSx = {
    bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', width: 36, height: 36,
    '&:hover': { bgcolor: 'background.paper' }, '&.Mui-disabled': { bgcolor: 'background.paper', opacity: 0.6 },
  };

  return (
    <>
      {/* Top-left: search, home, GPS */}
      <Box sx={{ position: 'absolute', top: 10, ...sideSx, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        <Paper component="form" onSubmit={handleSearch} sx={{ display: 'flex', alignItems: 'center', p: 0.25, minWidth: { xs: 0, sm: 220 } }}>
          <TextField
            size="small"
            placeholder="Search location..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            variant="standard"
            inputProps={{ 'aria-label': 'Search location' }}
            InputProps={{ disableUnderline: true, sx: { px: 1, minHeight: 32 } }}
            sx={{ flex: 1 }}
          />
          <IconButton type="submit" size="small" title="Search" disabled={searchLoading}>
            {searchLoading ? <CircularProgress size={20} /> : <SearchIcon />}
          </IconButton>
          {onClearSearch && (
            <IconButton size="small" onClick={() => { setSearchInput(''); onClearSearch(); }} title="Clear search" aria-label="Clear search">
              <CloseIcon sx={{ fontSize: 18 }} />
            </IconButton>
          )}
        </Paper>
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <IconButton size="small" onClick={handleHome} title="Fit to fields" disabled={fields.length === 0} sx={ctrlSx} aria-label="Fit to fields">
            <HomeIcon />
          </IconButton>
          <IconButton size="small" onClick={handleGps} title="My location" sx={ctrlSx} aria-label="My location">
            <MyLocationIcon />
          </IconButton>
        </Box>
      </Box>
      {/* Top-right: basemap widget */}
      <Box sx={{ position: 'absolute', top: { xs: 'auto', sm: 10 }, bottom: { xs: 28, sm: 'auto' }, ...basemapSideSx, zIndex: 1000 }}>
        <Paper sx={{ p: 0.5, display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
          <ToggleButtonGroup
            value={baseMap}
            exclusive
            onChange={(_, v) => v != null && setBaseMap(v)}
            size="small"
            sx={{ '& .MuiToggleButton-root': { py: 0.75, px: 1.25, minHeight: 30 } }}
          >
            <ToggleButton value="light" title="Light base map">
              <TerrainIcon sx={{ mr: 0.25 }} fontSize="small" />Light
            </ToggleButton>
            <ToggleButton value="osm" title="OpenStreetMap">
              <MapIcon sx={{ mr: 0.25 }} fontSize="small" />OSM
            </ToggleButton>
            <ToggleButton value="satellite" title="Aerial imagery — best for drawing field boundaries">
              <SatelliteIcon sx={{ mr: 0.25 }} fontSize="small" />Satellite
            </ToggleButton>
          </ToggleButtonGroup>
          {sentinelConfigured && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }} title="Sentinel-2 overlay">
              <SatelliteIcon sx={{ fontSize: 18 }} />
              <Switch size="small" checked={showSentinelOverlay} onChange={(e) => setShowSentinelOverlay(e.target.checked)} slotProps={{ input: { 'aria-label': 'Sentinel-2 overlay' } }} />
            </Box>
          )}
        </Paper>
      </Box>
    </>
  );
}
