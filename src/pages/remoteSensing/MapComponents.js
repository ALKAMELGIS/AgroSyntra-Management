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
} from '@mui/material';
import {
  Close as CloseIcon,
  Satellite as SatelliteIcon,
  Search as SearchIcon,
  MyLocation as MyLocationIcon,
  Home as HomeIcon,
  Map as MapIcon,
  Terrain as TerrainIcon,
} from '@mui/icons-material';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { BASEMAPS } from '../../utils/mapBasemaps';
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
        if (field.polygon && field.polygon.length > 0) return field.polygon;
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
        onPolygonDrawn(coords);
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
  }, [drawingMode, map, onPolygonDrawn]);

  return null;
}

// ─── MapWidgets ─────────────────────────────────────────────────────

/** Overlay controls: search bar, GPS, home button, basemap switcher, Sentinel toggle. */
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
        if (f.polygon && f.polygon.length > 0) return f.polygon;
        if (f.latitude != null && f.longitude != null) return [[f.latitude, f.longitude]];
        return null;
      })
      .filter(Boolean)
      .flat();
    if (bounds.length > 0) {
      safeFitBounds(map, bounds, { padding: [50, 50], maxZoom: 15 });
    }
  };

  return (
    <>
      {/* Top-left: search, home, GPS */}
      <Box sx={{ position: 'absolute', top: 10, left: 50, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        <Paper component="form" onSubmit={handleSearch} sx={{ display: 'flex', alignItems: 'center', p: 0.25, minWidth: 200 }}>
          <TextField
            size="small"
            placeholder="Search location..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            variant="standard"
            InputProps={{ disableUnderline: true, sx: { px: 1 } }}
            sx={{ flex: 1 }}
          />
          <IconButton type="submit" size="small" title="Search" disabled={searchLoading}>
            {searchLoading ? <CircularProgress size={20} /> : <SearchIcon />}
          </IconButton>
          {onClearSearch && (
            <IconButton size="small" onClick={() => { setSearchInput(''); onClearSearch(); }} title="Clear search">
              <CloseIcon sx={{ fontSize: 18 }} />
            </IconButton>
          )}
        </Paper>
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <IconButton size="small" onClick={handleHome} title="Fit to fields" disabled={fields.length === 0} sx={{ bgcolor: 'background.paper' }}>
            <HomeIcon />
          </IconButton>
          <IconButton size="small" onClick={handleGps} title="My location" sx={{ bgcolor: 'background.paper' }}>
            <MyLocationIcon />
          </IconButton>
        </Box>
      </Box>
      {/* Top-right: basemap widget */}
      <Box sx={{ position: 'absolute', top: 10, right: 10, zIndex: 1000 }}>
        <Paper sx={{ p: 0.5, display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
          <ToggleButtonGroup
            value={baseMap}
            exclusive
            onChange={(_, v) => v != null && setBaseMap(v)}
            size="small"
            sx={{ '& .MuiToggleButton-root': { py: 0.25, px: 0.75 } }}
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
              <Switch size="small" checked={showSentinelOverlay} onChange={(e) => setShowSentinelOverlay(e.target.checked)} />
            </Box>
          )}
        </Paper>
      </Box>
    </>
  );
}
