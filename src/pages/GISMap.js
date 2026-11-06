import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Box, Paper, Typography, IconButton, Drawer, List, ListItem, ListItemText,
  ListItemIcon, ListItemSecondaryAction, Switch, Button, TextField, Dialog,
  DialogTitle, DialogContent, DialogActions, FormControl, InputLabel, Select,
  MenuItem, Chip, CircularProgress, Alert, Snackbar, Divider, Tooltip,
  Card, CardContent, Slider, Tabs, Tab, LinearProgress, Autocomplete,
  useMediaQuery,
} from '@mui/material';
import {
  LayersOutlined as LayersIcon, AddOutlined as AddIcon, DeleteOutlined as DeleteIcon,
  SyncOutlined as SyncIcon, UploadOutlined as UploadIcon, LinkOutlined as LinkIcon,
  Visibility as VisIcon, VisibilityOff as VisOffIcon,
  ExpandMoreOutlined as ExpandMore, ChevronRightOutlined as ChevronRight, CloseOutlined as CloseIcon,
  CloudDownloadOutlined as CloudIcon, MapOutlined as MapIcon,
  PaletteOutlined as PaletteIcon, CheckOutlined as CheckIcon,
  InfoOutlined as InfoIcon, AutoFixHighOutlined as AutoLinkIcon,
  GrassOutlined as CropIcon, WaterOutlined as WaterIcon, ScienceOutlined as ScienceIcon,
  BugReportOutlined as BugIcon, WarningOutlined as WarningIcon,
  AgricultureOutlined as HarvestIcon, ShieldOutlined as ShieldIcon,
} from '@mui/icons-material';
import { MapContainer, TileLayer, GeoJSON, Popup, Marker, ZoomControl } from 'react-leaflet';
import { MapLifecycle, SafeFitLatLngBounds } from '../utils/leafletSafe';
import { API_BASE, getAuthHeaders } from '../config/api';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import useAppLayout, { CONTEXT_BAR_HEIGHT } from '../hooks/useAppLayout';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { canEditGis } from '../utils/roleAccess';
import InfoNote from '../components/InfoNote';
import { MapWorkspace, MapLegend, BasemapList, useMapWorkspace, useBasemap, mapZoomPosition } from '../components/map/MapPanel';
import { BASEMAPS } from '../utils/mapBasemaps';
import { LegendToggleOutlined as LegendIcon, MapOutlined as BasemapIcon } from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';

function sanitizeUrlInput(raw) {
  return raw.replace(/[^\x20-\x7E]/g, '').trim();
}

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const API = API_BASE;
const hdrs = () => ({ 'Content-Type': 'application/json', ...getAuthHeaders() });

async function api(path, opts = {}) {
  const res = await fetch(`${API}${path}`, { headers: hdrs(), ...opts });
  const data = await res.json();
  if (!data.success) throw new Error(data.error?.message || 'Request failed');
  return data.data;
}

function formatPhiDateTime(value) {
  if (!value) return '';
  const d = new Date(value);
  const date = d.toLocaleDateString();
  if (d.getHours() || d.getMinutes()) {
    return `${date}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  return date;
}

const DEFAULT_CENTER = [25.3, 51.5];
const DEFAULT_ZOOM = 8;

const STYLE_COLORS = [
  '#3388ff', '#ff3333', '#33cc33', '#ff9900', '#9933ff',
  '#00cccc', '#ff66b2', '#666666', '#cccc00', '#0066ff',
];

const APP_FIELD_OPTIONS = [
  { value: '', label: '-- Skip --' },
  { value: 'name', label: 'Field Name' },
  { value: 'area', label: 'Area' },
  { value: 'currentCropId', label: 'Current Crop' },
  { value: 'farmArea', label: 'Farm Area' },
  { value: 'fieldType', label: 'Field Type' },
  { value: 'valveCount', label: 'Valve Count' },
  { value: 'notes', label: 'Notes / Description' },
];

function TabPanel({ children, value, index }) {
  return value === index ? <Box sx={{ pt: 2 }}>{children}</Box> : null;
}

export default function GISMap() {
  const { isMobile, scrollRegionHeight, contentBleed, topBarHeight, padPx, bottomChrome } = useAppLayout();
  const isLargeScreen = useMediaQuery('(min-width:1536px)');
  const { t } = useTranslation();
  // CEO and operation manager manage GIS layers; everyone else (incl. farm manager) views only.
  const canEdit = canEditGis(useAuth().user);
  const mapHeight = `calc(100dvh - ${topBarHeight + padPx + bottomChrome + CONTEXT_BAR_HEIGHT}px)`;
  const workspace = useMapWorkspace('gis.workspace', 'layers');
  const closeWorkspace = workspace.close;
  const [basemap, setBasemap] = useBasemap('gis.basemap', 'osm');
  const theme = useTheme();
  const [layers, setLayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [featureData, setFeatureData] = useState({});
  const [selectedFeature, setSelectedFeature] = useState(null);
  const [snack, setSnack] = useState({ open: false, message: '', severity: 'success' });
  const [fields, setFields] = useState([]);
  const [farmAreas, setFarmAreas] = useState([]);
  const mapRef = useRef(null);

  const [addDialog, setAddDialog] = useState(false);
  const [addTab, setAddTab] = useState(0);
  const [arcgisUrl, setArcgisUrl] = useState('');
  const [arcgisToken, setArcgisToken] = useState('');
  const [arcgisName, setArcgisName] = useState('');
  const [arcgisLayerIdx, setArcgisLayerIdx] = useState(0);
  const [discoveredLayers, setDiscoveredLayers] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadName, setUploadName] = useState('');
  const [uploading, setUploading] = useState(false);

  const [mappingDialog, setMappingDialog] = useState(null);
  const [mappingMeta, setMappingMeta] = useState(null);
  const [mappingValues, setMappingValues] = useState({});
  const [loadingMeta, setLoadingMeta] = useState(false);

  const [styleDialog, setStyleDialog] = useState(null);
  const [styleValues, setStyleValues] = useState({});

  const [linkDialog, setLinkDialog] = useState(null);
  const [linkFieldId, setLinkFieldId] = useState('');
  const [linkAreaId, setLinkAreaId] = useState('');

  // Orphan detection: fields linked to a GIS external id that has
  // disappeared from every current layer. Surfaced as a banner + dialog
  // so an operator notices when a polygon was renamed/deleted on the
  // ArcGIS source and can decide whether to re-sync or retire the field.
  const [orphans, setOrphans] = useState([]);
  const [orphansOpen, setOrphansOpen] = useState(false);

  const [fieldInfoOpen, setFieldInfoOpen] = useState(false);
  const [fieldSummary, setFieldSummary] = useState(null);
  const [fieldInfoLoading, setFieldInfoLoading] = useState(false);
  const [autoLinking, setAutoLinking] = useState(null);
  const [phiStatus, setPhiStatus] = useState({});

  const notify = useCallback((message, severity = 'success') => setSnack({ open: true, message, severity }), []);

  const loadLayers = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api('/gis/layers');
      setLayers(data);
    } catch (err) {
      const msg = err.message || 'Request failed';
      if (msg.includes('schema not ready') || msg.includes('migration')) {
        notify('GIS module is initializing. Please refresh in a moment.', 'warning');
      } else {
        notify(msg, 'error');
      }
    } finally {
      setLoading(false);
    }
  }, [notify]);

  const loadFeatures = useCallback(async (layerId) => {
    try {
      const fc = await api(`/gis/layers/${layerId}/features`);
      setFeatureData((prev) => ({ ...prev, [layerId]: fc }));
    } catch (err) {
      console.error('Failed to load features for', layerId, err);
    }
  }, []);

  const loadPhiStatus = useCallback(async () => {
    try {
      const data = await api('/fields/phi-status');
      const map = {};
      for (const item of data) {
        map[item.fieldId] = item;
      }
      setPhiStatus(map);
    } catch { /* non-critical */ }
  }, []);

  const loadOrphans = useCallback(async () => {
    try {
      const r = await fetch(`${API}/fields/gis-orphans`, { headers: hdrs() });
      const d = await r.json();
      if (d.success) setOrphans(d.data || []);
    } catch { /* non-critical diagnostic */ }
  }, []);

  useEffect(() => {
    loadLayers();
    loadPhiStatus();
    loadOrphans();
    fetch(`${API}/fields`, { headers: hdrs() })
      .then((r) => r.json())
      .then((d) => { if (d.success) setFields(d.data || []); })
      .catch(() => {});
    fetch(`${API}/farm-areas`, { headers: hdrs() })
      .then((r) => r.json())
      .then((d) => { if (d.success) setFarmAreas(d.data || []); })
      .catch(() => {});
  }, [loadLayers, loadPhiStatus, loadOrphans]);

  useEffect(() => {
    if (isMobile) closeWorkspace();
  }, [isMobile, closeWorkspace]);

  useEffect(() => {
    layers.filter((l) => l.isVisible).forEach((l) => {
      if (!featureData[l.id]) loadFeatures(l.id);
    });
  }, [layers, loadFeatures, featureData]);

  const handleToggleVisibility = async (layer) => {
    try {
      // Viewers only toggle the layer locally; the saved default is changed by GIS editors.
      if (canEdit) {
        await api(`/gis/layers/${layer.id}`, {
          method: 'PUT',
          body: JSON.stringify({ isVisible: !layer.isVisible }),
        });
      }
      setLayers((prev) => prev.map((l) => l.id === layer.id ? { ...l, isVisible: !l.isVisible } : l));
      if (!layer.isVisible && !featureData[layer.id]) loadFeatures(layer.id);
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const [layerToDelete, setLayerToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const handleDeleteLayer = (layer) => {
    setLayerToDelete(layer);
  };

  const confirmDeleteLayer = async () => {
    if (!layerToDelete) return;
    setDeleting(true);
    try {
      await api(`/gis/layers/${layerToDelete.id}`, { method: 'DELETE' });
      setLayers((prev) => prev.filter((l) => l.id !== layerToDelete.id));
      setFeatureData((prev) => { const n = { ...prev }; delete n[layerToDelete.id]; return n; });
      notify('Layer deleted — fields and data entries are preserved.');
      setLayerToDelete(null);
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setDeleting(false);
    }
  };

  const hideLayerFromDialog = async () => {
    if (!layerToDelete) return;
    if (layerToDelete.isVisible) {
      await handleToggleVisibility(layerToDelete);
    }
    setLayerToDelete(null);
  };

  const handleSync = async (layer) => {
    try {
      notify('Syncing...');
      if (layer.sourceType === 'arcgis_feature_service' && layer.sourceUrl) {
        const baseUrl = sanitizeUrlInput(layer.sourceUrl).replace(/\/+$/, '');
        const idx = layer.layerIndex ?? 0;
        const url = `${baseUrl}/${idx}/query?where=1%3D1&outFields=*&returnGeometry=true&returnDomainValues=true&f=geojson`;
        // debug: console.log('[GIS] Syncing from:', url);
        const res = await fetch(url);
        if (!res.ok) throw new Error(`ArcGIS returned HTTP ${res.status}`);
        const geojson = await res.json();
        if (geojson.error) throw new Error(geojson.error.message || JSON.stringify(geojson.error));
        // Debug: uncomment to inspect feature properties
        // if (geojson.features?.length > 0) {
        //   const sampleProps = geojson.features.slice(0, 3).map((f) => ({
        //     allKeys: Object.keys(f.properties || {}),
        //     sample: f.properties || {},
        //   }));
        //   console.log('[GIS Sync] Sample feature properties:', JSON.stringify(sampleProps, null, 2));
        // }
        await api(`/gis/layers/${layer.id}`, {
          method: 'PUT',
          body: JSON.stringify({ geojsonData: geojson }),
        });
        const count = geojson.features?.length || 0;
        notify(`Sync complete: ${count} features loaded`);
      } else {
        const result = await api(`/gis/layers/${layer.id}/sync`, { method: 'POST' });
        notify(`Sync complete: ${result.added} added, ${result.updated} updated, ${result.removed} removed`);
      }
      loadFeatures(layer.id);
      loadLayers();
      // A sync is the one time orphan status can change, so refresh now
      // instead of waiting for the user to hard-reload.
      loadOrphans();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  // ── ArcGIS Connect ──

  const handleDiscover = async () => {
    if (!arcgisUrl) return;
    setConnecting(true);
    try {
      const cleaned = sanitizeUrlInput(arcgisUrl);
      const fsMatch = cleaned.match(/^(.*\/(?:Feature|Map)Server)(?:\/(\d+))?\/?$/i);
      const baseUrl = fsMatch ? fsMatch[1] : cleaned.replace(/\/+$/, '');
      const detectedIdx = fsMatch && fsMatch[2] ? parseInt(fsMatch[2], 10) : null;

      const res = await fetch(`${baseUrl}?f=json`);
      if (!res.ok) throw new Error(`ArcGIS returned HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));

      const layers = (data.layers || []).map((l) => ({
        id: l.id,
        name: l.name,
        geometryType: l.geometryType || '',
      }));

      setDiscoveredLayers(layers);
      if (layers.length > 0) {
        const matched = detectedIdx !== null
          ? layers.find((l) => l.id === detectedIdx) : null;
        setArcgisLayerIdx(matched ? matched.id : layers[0].id);
        setArcgisName(matched ? matched.name : layers[0].name);
      }
      notify(`Found ${layers.length} layer(s)`);
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setConnecting(false);
    }
  };

  const handleAddArcGIS = async () => {
    try {
      await api('/gis/layers', {
        method: 'POST',
        body: JSON.stringify({
          name: arcgisName || 'ArcGIS Layer',
          sourceType: 'arcgis_feature_service',
          sourceUrl: arcgisUrl,
          layerIndex: arcgisLayerIdx,
          authToken: arcgisToken || undefined,
        }),
      });
      notify('ArcGIS layer added and syncing');
      setAddDialog(false);
      setArcgisUrl(''); setArcgisToken(''); setArcgisName('');
      setDiscoveredLayers(null);
      loadLayers();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  // ── File Upload ──

  const handleUpload = async () => {
    if (!uploadFile) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', uploadFile);
      if (uploadName) fd.append('name', uploadName);

      const res = await fetch(`${API}/gis/upload`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: fd,
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error?.message || 'Upload failed');
      notify(`Imported ${data.data.featuresImported} features from ${uploadFile.name}`);
      setAddDialog(false);
      setUploadFile(null);
      setUploadName('');
      loadLayers();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setUploading(false);
    }
  };

  // ── Attribute Mapping ──

  const extractFieldsFromFeatures = (fc) => {
    if (fc && fc.features?.length > 0) {
      const props = fc.features[0].properties || {};
      return Object.keys(props)
        .filter((k) => !k.startsWith('_'))
        .map((k) => ({ name: k, alias: k, type: 'string' }));
    }
    return [];
  };

  const openMappingDialog = async (layer) => {
    setMappingDialog(layer);
    setMappingValues(layer.attributeMapping || {});
    if (layer.sourceType === 'arcgis_feature_service' && layer.sourceUrl) {
      setLoadingMeta(true);
      try {
        const baseUrl = sanitizeUrlInput(layer.sourceUrl).replace(/\/+$/, '');
        const idx = layer.layerIndex ?? 0;
        const metaUrl = `${baseUrl}/${idx}?f=json`;
        // debug: console.log('[GIS] Fetching metadata from:', metaUrl);
        const res = await fetch(metaUrl);
        if (!res.ok) throw new Error(`ArcGIS returned HTTP ${res.status}`);
        const data = await res.json();
        if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
        setMappingMeta({ fields: data.fields || [] });
      } catch (err) {
        console.error('[GIS] Metadata fetch failed:', err);
        const fc = featureData[layer.id];
        const fallbackFields = extractFieldsFromFeatures(fc);
        if (fallbackFields.length > 0) {
          setMappingMeta({ fields: fallbackFields });
          notify('Using cached feature attributes (live metadata unavailable)', 'warning');
        } else {
          notify(`Metadata fetch failed: ${err.message}. Try syncing the layer first.`, 'error');
          setMappingMeta(null);
        }
      } finally {
        setLoadingMeta(false);
      }
    } else {
      const fc = featureData[layer.id];
      setMappingMeta({ fields: extractFieldsFromFeatures(fc) });
    }
  };

  const saveMappingDialog = async () => {
    try {
      await api(`/gis/layers/${mappingDialog.id}`, {
        method: 'PUT',
        body: JSON.stringify({ attributeMapping: mappingValues }),
      });
      notify('Attribute mapping saved');
      setMappingDialog(null);
      loadLayers();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  // ── Style ──

  const openStyleDialog = (layer) => {
    setStyleDialog(layer);
    setStyleValues(layer.style || { color: '#3388ff', weight: 2, opacity: 0.8, fillOpacity: 0.3 });
  };

  const saveStyleDialog = async () => {
    try {
      await api(`/gis/layers/${styleDialog.id}`, {
        method: 'PUT',
        body: JSON.stringify({ style: styleValues }),
      });
      notify('Style saved');
      setStyleDialog(null);
      setLayers((prev) => prev.map((l) => l.id === styleDialog.id ? { ...l, style: styleValues } : l));
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  // ── Link Feature ──

  const handleLinkFeature = async () => {
    if (!linkDialog) return;
    try {
      await api(`/gis/layers/${linkDialog.layerId}/link`, {
        method: 'POST',
        body: JSON.stringify({
          featureId: linkDialog.featureId,
          fieldId: linkFieldId || null,
          farmAreaId: linkAreaId || null,
        }),
      });
      notify('Feature linked');
      setLinkDialog(null);
      setLinkFieldId(''); setLinkAreaId('');
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  // ── Auto-link features to fields ──

  const handleAutoLink = async (layer) => {
    setAutoLinking(layer.id);
    try {
      const result = await api(`/gis/layers/${layer.id}/auto-link`, { method: 'POST' });
      // Debug: uncomment to inspect auto-link diagnostics
      // console.log('Auto-link diagnostics:', JSON.stringify(result.diagnostics, null, 2));
      const parts = [`${result.linked} linked`];
      if (result.created > 0) parts.push(`${result.created} fields auto-created`);
      if (result.renamed > 0) parts.push(`${result.renamed} fields renamed`);
      if (result.relocated > 0) parts.push(`${result.relocated} fields relocated`);
      if (result.zonesCreated > 0) parts.push(`${result.zonesCreated} zones created`);
      if (result.skipped > 0) parts.push(`${result.skipped} skipped`);
      notify(`Auto-link: ${parts.join(', ')}`);
      loadFeatures(layer.id);
      loadPhiStatus();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setAutoLinking(null);
    }
  };

  // ── Load field summary ──

  const loadFieldSummary = async (fieldId) => {
    setFieldInfoOpen(true);
    setFieldInfoLoading(true);
    setFieldSummary(null);
    try {
      const data = await api(`/fields/${fieldId}/summary`);
      setFieldSummary(data);
    } catch (err) {
      notify('Failed to load field data: ' + err.message, 'error');
      setFieldInfoOpen(false);
    } finally {
      setFieldInfoLoading(false);
    }
  };

  // ── Map bounds from all visible features ──

  const allBounds = useMemo(() => {
    const coords = [];
    for (const layer of layers.filter((l) => l.isVisible)) {
      const fc = featureData[layer.id];
      if (!fc?.features) continue;
      for (const f of fc.features) {
        const g = f.geometry;
        if (!g) continue;
        const extractCoords = (c) => {
          if (typeof c[0] === 'number') { coords.push([c[1], c[0]]); return; }
          c.forEach(extractCoords);
        };
        if (g.coordinates) extractCoords(g.coordinates);
      }
    }
    if (coords.length === 0) return null;
    return L.latLngBounds(coords);
  }, [layers, featureData]);

  const getLayerStyle = (layer) => ({
    color: layer.style?.color || '#3388ff',
    weight: layer.style?.weight || 2,
    opacity: layer.style?.opacity || 0.8,
    fillOpacity: layer.style?.fillOpacity || 0.3,
  });

  const getFeatureStyle = (layer, feature) => {
    const base = getLayerStyle(layer);
    const linkedFieldId = feature?.properties?._linkedFieldId;
    if (!linkedFieldId) return base;
    const phi = phiStatus[linkedFieldId];
    if (!phi) return { ...base, color: '#4caf50', fillColor: '#4caf50', fillOpacity: 0.35 };
    if (phi.daysRemaining <= 1) return { ...base, color: '#ff9800', fillColor: '#ff9800', fillOpacity: 0.5 };
    return { ...base, color: '#f44336', fillColor: '#f44336', fillOpacity: 0.5 };
  };

  const onEachFeature = (layerId) => (feature, leafletLayer) => {
    const mapping = layers.find((l) => l.id === layerId)?.attributeMapping || {};
    const props = feature.properties || {};
    const reversedMapping = {};
    for (const [src, dst] of Object.entries(mapping)) {
      if (dst) reversedMapping[src] = dst;
    }

    let popupContent = '<div style="max-width:300px;max-height:250px;overflow:auto">';
    for (const [key, value] of Object.entries(props)) {
      if (key.startsWith('_')) continue;
      const mappedName = reversedMapping[key] || key;
      popupContent += `<b>${mappedName}:</b> ${value ?? 'N/A'}<br/>`;
    }
    if (props._linkedFieldId) {
      popupContent += '<br/><b style="color: #1f7a4d">Linked to field</b>';
    }
    popupContent += '</div>';
    leafletLayer.bindPopup(popupContent);

    leafletLayer.on('click', () => {
      setSelectedFeature({ layerId, feature });
      if (props._linkedFieldId) {
        loadFieldSummary(props._linkedFieldId);
      }
    });
  };

  // Layers panel: narrower on laptops so the map stays the main workspace.
  const drawerWidth = isLargeScreen ? 340 : 300;

  // Docked panel contents.
  const layersPanel = (
    <>
        {!canEdit && (
          <Box sx={{ px: 3, pt: 2 }}>
            <InfoNote severity="info">{t('adminAccess.gisViewOnly')}</InfoNote>
          </Box>
        )}

        {loading ? (
          <Box sx={{ p: 3, textAlign: 'center' }}><CircularProgress /></Box>
        ) : layers.length === 0 ? (
          <Box sx={{ p: 3, textAlign: 'center' }}>
            <Typography color="text.secondary">No layers yet. Add an ArcGIS connection or upload a file.</Typography>
          </Box>
        ) : (
          <List disablePadding>
            {layers.map((layer) => (
              <ListItem
                key={layer.id}
                sx={{
                  flexDirection: 'column',
                  alignItems: 'stretch',
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                  py: 1,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                  <Tooltip title={layer.isVisible
                    ? 'Hide layer on the map (data is kept — safe)'
                    : 'Show layer on the map'}>
                    <IconButton size="small" onClick={() => handleToggleVisibility(layer)} aria-label={`${layer.isVisible ? 'Hide' : 'Show'} layer ${layer.name}`} aria-pressed={!!layer.isVisible}>
                      {layer.isVisible ? <VisIcon color="primary" /> : <VisOffIcon />}
                    </IconButton>
                  </Tooltip>
                  <Box
                    sx={{
                      width: 14, height: 14, borderRadius: '50%', mr: 1,
                      backgroundColor: layer.style?.color || '#3388ff',
                      border: '1px solid rgba(0,0,0,0.2)',
                    }}
                  />
                  <ListItemText
                    primary={layer.name}
                    secondary={
                      <>
                        {layer.sourceType === 'arcgis_feature_service' ? 'ArcGIS' : 'File'}
                        {layer.featureCount !== undefined ? ` - ${layer.featureCount} features` : ''}
                      </>
                    }
                    primaryTypographyProps={{ noWrap: true, variant: 'body2', fontWeight: 600 }}
                    secondaryTypographyProps={{ variant: 'caption' }}
                    sx={{ minWidth: 0 }}
                  />
                </Box>
                <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
                  {canEdit && (<>
                  {layer.sourceType === 'arcgis_feature_service' && (
                    <Tooltip title="Sync from ArcGIS">
                      <IconButton size="small" onClick={() => handleSync(layer)} aria-label={`Sync ${layer.name} from ArcGIS`}><SyncIcon fontSize="small" /></IconButton>
                    </Tooltip>
                  )}
                  <Tooltip title="Auto-Link to Fields">
                    <IconButton
                      size="small"
                      aria-label={`Auto-link ${layer.name} to fields`}
                      onClick={() => handleAutoLink(layer)}
                      disabled={autoLinking === layer.id}
                    >
                      {autoLinking === layer.id ? <CircularProgress size={16} /> : <AutoLinkIcon fontSize="small" />}
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Attribute Mapping">
                    <IconButton size="small" onClick={() => openMappingDialog(layer)} aria-label={`Attribute mapping for ${layer.name}`}><LinkIcon fontSize="small" /></IconButton>
                  </Tooltip>
                  <Tooltip title="Style">
                    <IconButton size="small" onClick={() => openStyleDialog(layer)} aria-label={`Style ${layer.name}`}><PaletteIcon fontSize="small" /></IconButton>
                  </Tooltip>
                  <Tooltip title="Delete layer (removes map polygons only — fields and data entries are kept)">
                    <IconButton size="small" color="error" onClick={() => handleDeleteLayer(layer)} aria-label={`Delete layer ${layer.name}`}><DeleteIcon fontSize="small" /></IconButton>
                  </Tooltip>
                  </>)}
                  {layer.syncStatus === 'syncing' && <CircularProgress size={18} sx={{ ml: 'auto' }} />}
                  {layer.syncStatus === 'error' && (
                    <Tooltip title={layer.syncError || 'Sync error'}>
                      <Chip label="Error" size="small" color="error" sx={{ ml: 'auto' }} />
                    </Tooltip>
                  )}
                </Box>
              </ListItem>
            ))}
          </List>
        )}
    </>
  );
  const visibleLayers = layers.filter((l) => l.isVisible);
  // Legend follows what is switched on: one swatch per visible layer, plus the PHI colours fields are painted with.
  const legendSections = [
    { title: 'Layers', items: visibleLayers.map((l) => ({ color: l.style?.color || '#3388ff', label: l.name, shape: 'fill' })) },
    visibleLayers.length > 0 && {
      title: 'PHI status',
      items: [
        { color: '#f44336', label: 'Active PHI (>1 day left)' },
        { color: '#ff9800', label: 'Last PHI day' },
        { color: '#4caf50', label: 'Clear' },
        { color: '#3388ff', label: 'Not linked' },
      ],
    },
  ].filter(Boolean);

  return (
    <Box sx={{ mx: contentBleed, mb: contentBleed }}>
      {/* Docked workspace: tool bar · docked panel (Layers / Legend / Basemaps) · map. */}
      <MapWorkspace
        id="gis"
        workspace={workspace}
        height={mapHeight}
        panelWidth={drawerWidth}
        tools={[
          { key: 'layers', label: 'Layers', title: 'GIS Layers', icon: <LayersIcon />, badge: layers.length || undefined, content: layersPanel },
          { key: 'legend', label: 'Legend', icon: <LegendIcon />, badge: visibleLayers.length || undefined, content: <MapLegend sections={legendSections} /> },
          { key: 'basemaps', label: 'Basemaps', icon: <BasemapIcon />, content: <BasemapList value={basemap} onChange={setBasemap} /> },
          canEdit && { key: 'add', label: 'Add data', icon: <AddIcon />, onClick: () => { setAddDialog(true); setAddTab(0); } },
        ]}
      >

        {orphans.length > 0 && (
          <Alert
            severity="warning"
            variant="filled"
            icon={<WarningIcon />}
            sx={{
              position: 'absolute',
              top: 10,
              insetInlineStart: 10,
              insetInlineEnd: 64,
              zIndex: 1000,
            }}
            action={
              <Button
                size="small"
                color="inherit"
                onClick={() => setOrphansOpen(true)}
              >
                Review
              </Button>
            }
          >
            {orphans.length === 1
              ? '1 field has lost its GIS polygon on the source.'
              : `${orphans.length} fields have lost their GIS polygon on the source.`}
            {' '}Data is safe — but the map can't show them until re-synced.
          </Alert>
        )}

        <MapContainer
          center={DEFAULT_CENTER}
          zoom={DEFAULT_ZOOM}
          zoomControl={false}
          style={{ width: '100%', height: '100%' }}
          ref={mapRef}
        >
          <ZoomControl position={mapZoomPosition(theme)} />
          <MapLifecycle />
          <TileLayer key={basemap} url={BASEMAPS[basemap].url} attribution={BASEMAPS[basemap].attribution} />

          {allBounds && <SafeFitLatLngBounds bounds={allBounds} options={{ padding: [50, 50], maxZoom: 16 }} />}

          {layers.filter((l) => l.isVisible).map((layer) => {
            const fc = featureData[layer.id];
            if (!fc?.features?.length) return null;
            return (
              <GeoJSON
                key={`${layer.id}-${JSON.stringify(layer.style)}-${fc.features.length}-${Object.keys(phiStatus).length}`}
                data={fc}
                style={(feature) => getFeatureStyle(layer, feature)}
                onEachFeature={onEachFeature(layer.id)}
                pointToLayer={(feature, latlng) =>
                  L.circleMarker(latlng, {
                    radius: 6,
                    ...getLayerStyle(layer),
                    fillOpacity: 0.7,
                  })
                }
              />
            );
          })}

          {/* basemap toggle handled by default OSM tile layer */}
        </MapContainer>

        {/* PHI Legend */}

        {/* Feature Info Panel */}
        {selectedFeature && !fieldInfoOpen && (
          <Paper
            elevation={4}
            sx={{
              position: 'absolute', bottom: 30, insetInlineEnd: 12, zIndex: 1000,
              width: { xs: 'calc(100% - 24px)', sm: 320 }, maxHeight: { xs: '45%', sm: 350 }, overflow: 'auto', p: 2,
            }}
          >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="subtitle2">Feature Info</Typography>
              <IconButton size="small" onClick={() => setSelectedFeature(null)} aria-label="Close"><CloseIcon fontSize="small" /></IconButton>
            </Box>
            <Divider sx={{ mb: 1 }} />
            {Object.entries(selectedFeature.feature.properties || {}).filter(([k]) => !k.startsWith('_')).map(([key, value]) => (
              <Typography key={key} variant="body2" sx={{ mb: 0.5 }}>
                <strong>{key}:</strong> {value ?? 'N/A'}
              </Typography>
            ))}
            {selectedFeature.feature.properties?._linkedFieldId ? (
              <Button
                size="small"
                variant="contained"
                startIcon={<InfoIcon />}
                sx={{ mt: 1 }}
                onClick={() => loadFieldSummary(selectedFeature.feature.properties._linkedFieldId)}
              >
                View Field Data
              </Button>
            ) : canEdit && (
              <Button
                size="small"
                variant="outlined"
                startIcon={<LinkIcon />}
                sx={{ mt: 1 }}
                onClick={() => {
                  setLinkDialog({
                    layerId: selectedFeature.layerId,
                    featureId: selectedFeature.feature.id || selectedFeature.feature.properties?._id,
                  });
                  setLinkFieldId(selectedFeature.feature.properties?._linkedFieldId || '');
                  setLinkAreaId(selectedFeature.feature.properties?._linkedFarmAreaId || '');
                }}
              >
                Link to Field / Area
              </Button>
            )}
          </Paper>
        )}

        {/* Field Summary Drawer */}
        <Drawer
          anchor="right"
          open={fieldInfoOpen}
          onClose={() => { setFieldInfoOpen(false); setFieldSummary(null); }}
          PaperProps={{ sx: { width: { xs: '100%', sm: 420 }, p: 0 } }}
          sx={{ zIndex: 1200 }}
        >
          <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', bgcolor: 'primary.main', color: 'primary.contrastText' }}>
            <Typography variant="h6">Field Summary</Typography>
            <IconButton size="small" onClick={() => { setFieldInfoOpen(false); setFieldSummary(null); }} sx={{ color: 'inherit' }} aria-label="Close">
              <CloseIcon />
            </IconButton>
          </Box>
          {fieldInfoLoading ? (
            <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /><Typography sx={{ mt: 1 }}>Loading field data...</Typography></Box>
          ) : fieldSummary ? (
            <Box sx={{ p: 2, overflow: 'auto', maxHeight: scrollRegionHeight(80) }}>
              {/* Field header */}
              <Card variant="outlined" sx={{ mb: 2 }}>
                <CardContent sx={{ pb: '12px !important' }}>
                  <Typography variant="h6">{fieldSummary.field.name}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {fieldSummary.field.siteName} &gt; {fieldSummary.field.farmAreaName}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap' }}>
                    {fieldSummary.field.cropName && (
                      <Chip icon={<CropIcon />} label={fieldSummary.field.cropName} size="small" color="success" />
                    )}
                    {fieldSummary.field.varietyName && (
                      <Chip label={fieldSummary.field.varietyName} size="small" variant="outlined" />
                    )}
                    {fieldSummary.field.area && (
                      <Chip label={`${fieldSummary.field.area} ha`} size="small" variant="outlined" />
                    )}
                  </Box>
                </CardContent>
              </Card>

              {/* Active PHI Alerts */}
              {fieldSummary.activePhi.length > 0 && (
                <Card variant="outlined" sx={{ mb: 2, borderColor: 'warning.main' }}>
                  <CardContent sx={{ pb: '12px !important' }}>
                    <Typography variant="subtitle2" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'warning.dark', mb: 1 }}>
                      <WarningIcon fontSize="small" /> Active PHI
                    </Typography>
                    {fieldSummary.activePhi.map((phi, i) => (
                      <Box key={i} sx={{ mb: 0.5, p: 1, borderRadius: 1, bgcolor: 'action.selected', border: '1px solid', borderColor: 'warning.light' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <Typography variant="body2" fontWeight={600}>{phi.productName}</Typography>
                          {phi.segment && (
                            <Chip label={phi.segment} size="small" variant="outlined" sx={{ height: 18, fontSize: '0.6875rem' }} />
                          )}
                        </Box>
                        <Typography variant="caption" color="text.secondary">
                          PHI: {phi.phiDays} days | Clear to harvest: {formatPhiDateTime(phi.phiEndDate)}
                        </Typography>
                        <Chip
                          label={`${phi.daysRemaining} days remaining`}
                          size="small"
                          color={phi.daysRemaining <= 1 ? 'warning' : 'error'}
                          sx={{ mt: 0.5 }}
                        />
                      </Box>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Stats row */}
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, mb: 2 }}>
                <Card variant="outlined">
                  <CardContent sx={{ pb: '8px !important', pt: '12px !important' }}>
                    <Typography variant="caption" color="text.secondary"><HarvestIcon sx={{ fontSize: 14, mr: 0.5, verticalAlign: 'text-bottom' }} />Harvest (30d)</Typography>
                    <Typography variant="h6">{fieldSummary.harvest.totalKg.toLocaleString()} kg</Typography>
                    <Typography variant="caption" color="text.secondary">{fieldSummary.harvest.count} entries</Typography>
                  </CardContent>
                </Card>
                <Card variant="outlined">
                  <CardContent sx={{ pb: '8px !important', pt: '12px !important' }}>
                    <Typography variant="caption" color="text.secondary"><WaterIcon sx={{ fontSize: 14, mr: 0.5, verticalAlign: 'text-bottom' }} />Water (30d)</Typography>
                    <Typography variant="h6">{Number(fieldSummary.water.totalM3).toFixed(1)} m&sup3;</Typography>
                  </CardContent>
                </Card>
              </Box>

              {/* EC / PH averages */}
              <Card variant="outlined" sx={{ mb: 2 }}>
                <CardContent sx={{ pb: '12px !important' }}>
                  <Typography variant="subtitle2" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
                    <ScienceIcon fontSize="small" /> EC/PH Avg (7d)
                  </Typography>
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                    <Box>
                      <Typography variant="caption" color="text.secondary">EC In</Typography>
                      <Typography variant="body1" fontWeight={600}>{fieldSummary.ecph.avgEcIn ?? '—'}</Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary">EC Out</Typography>
                      <Typography variant="body1" fontWeight={600}>{fieldSummary.ecph.avgEcOut ?? '—'}</Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary">pH In</Typography>
                      <Typography variant="body1" fontWeight={600}>{fieldSummary.ecph.avgPhIn ?? '—'}</Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary">pH Out</Typography>
                      <Typography variant="body1" fontWeight={600}>{fieldSummary.ecph.avgPhOut ?? '—'}</Typography>
                    </Box>
                  </Box>
                </CardContent>
              </Card>

              {/* Scouting reports */}
              {fieldSummary.scouting.length > 0 && (
                <Card variant="outlined" sx={{ mb: 2 }}>
                  <CardContent sx={{ pb: '12px !important' }}>
                    <Typography variant="subtitle2" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
                      <BugIcon fontSize="small" /> Recent Scouting
                    </Typography>
                    {fieldSummary.scouting.map((s, i) => (
                      <Box key={i} sx={{ mb: 1, p: 1, borderRadius: 1, bgcolor: 'background.muted' }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Typography variant="body2" fontWeight={600}>{s.pestName || s.customPestName || 'Unknown'}</Typography>
                          <Chip
                            label={s.severity || s.status}
                            size="small"
                            color={s.severity === 'high' || s.severity === 'critical' ? 'error' : s.severity === 'medium' ? 'warning' : 'default'}
                          />
                        </Box>
                        <Typography variant="caption" color="text.secondary">
                          {new Date(s.reportDate).toLocaleDateString()}
                          {s.infestationPct != null ? ` | ${s.infestationPct}% infestation` : ''}
                        </Typography>
                      </Box>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Pesticide applications */}
              {fieldSummary.pesticides.length > 0 && (
                <Card variant="outlined" sx={{ mb: 2 }}>
                  <CardContent sx={{ pb: '12px !important' }}>
                    <Typography variant="subtitle2" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
                      <ShieldIcon fontSize="small" /> Recent Pesticide Applications
                    </Typography>
                    {fieldSummary.pesticides.map((p, i) => (
                      <Box key={i} sx={{ mb: 1, p: 1, borderRadius: 1, bgcolor: 'background.muted' }}>
                        <Typography variant="body2" fontWeight={600}>{p.productName}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {new Date(p.applicationDate).toLocaleDateString()}
                          {p.dosage ? ` | ${p.dosage} ${p.dosageUnit || ''}` : ''}
                          {p.targetPest ? ` | Target: ${p.targetPest}` : ''}
                        </Typography>
                        {p.phiEndDate && (
                          <Box>
                            <Typography variant="caption" color={p.phiRemaining > 0 ? 'warning.main' : 'success.main'}>
                              PHI ends: {formatPhiDateTime(p.phiEndDate)}
                              {p.phiRemaining > 0 ? ` (${p.phiRemaining}d remaining)` : ' (cleared)'}
                            </Typography>
                          </Box>
                        )}
                      </Box>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Bio-control releases */}
              {fieldSummary.bioReleases.length > 0 && (
                <Card variant="outlined" sx={{ mb: 2 }}>
                  <CardContent sx={{ pb: '12px !important' }}>
                    <Typography variant="subtitle2" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
                      <BugIcon fontSize="small" color="success" /> Bio-Control Releases
                    </Typography>
                    {fieldSummary.bioReleases.map((b, i) => (
                      <Box key={i} sx={{ mb: 0.5, p: 1, borderRadius: 1, bgcolor: 'background.muted' }}>
                        <Typography variant="body2" fontWeight={600}>{b.productName}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {new Date(b.releaseDate).toLocaleDateString()} | Qty: {b.quantity}
                          {b.targetPest ? ` | Target: ${b.targetPest}` : ''}
                        </Typography>
                      </Box>
                    ))}
                  </CardContent>
                </Card>
              )}
            </Box>
          ) : null}
        </Drawer>
      </MapWorkspace>

      {/* ── Add Layer Dialog ── */}
      <Dialog open={addDialog} onClose={() => setAddDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add GIS Layer</DialogTitle>
        <DialogContent>
          <Tabs value={addTab} onChange={(_, v) => setAddTab(v)} sx={{ mb: 1 }}>
            <Tab label="ArcGIS Feature Service" icon={<CloudIcon />} iconPosition="start" />
            <Tab label="Upload File" icon={<UploadIcon />} iconPosition="start" />
          </Tabs>

          <TabPanel value={addTab} index={0}>
            <TextField
              fullWidth label="Feature Service URL" value={arcgisUrl}
              onChange={(e) => setArcgisUrl(sanitizeUrlInput(e.target.value))}
              placeholder="https://services.arcgis.com/.../FeatureServer"
              sx={{ mb: 2 }}
            />
            <TextField
              fullWidth label="Token / API Key (optional)" value={arcgisToken}
              onChange={(e) => setArcgisToken(sanitizeUrlInput(e.target.value))}
              sx={{ mb: 2 }}
            />
            <Button
              variant="outlined" onClick={handleDiscover}
              disabled={!arcgisUrl || connecting}
              startIcon={connecting ? <CircularProgress size={16} /> : <SyncIcon />}
            >
              {connecting ? 'Connecting...' : 'Connect & Discover Layers'}
            </Button>

            {discoveredLayers && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle2" gutterBottom>
                  Found {discoveredLayers.length} layer(s):
                </Typography>
                <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                  <InputLabel id="gismap-select-layer-label-1">Select Layer</InputLabel>
                  <Select labelId="gismap-select-layer-label-1"
                    value={arcgisLayerIdx}
                    label="Select Layer"
                    onChange={(e) => {
                      setArcgisLayerIdx(e.target.value);
                      const found = discoveredLayers.find((l) => l.id === e.target.value);
                      if (found) setArcgisName(found.name);
                    }}
                  >
                    {discoveredLayers.map((l) => (
                      <MenuItem key={l.id} value={l.id}>
                        {l.name} ({l.geometryType || 'unknown'})
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <TextField
                  fullWidth label="Layer Name" value={arcgisName}
                  onChange={(e) => setArcgisName(e.target.value)}
                  size="small" sx={{ mb: 2 }}
                />
                <Button variant="contained" onClick={handleAddArcGIS} fullWidth>
                  Add Layer
                </Button>
              </Box>
            )}
          </TabPanel>

          <TabPanel value={addTab} index={1}>
            <Box
              sx={{
                border: '2px dashed', borderColor: 'divider', borderRadius: 2,
                p: 4, textAlign: 'center', mb: 2, cursor: 'pointer',
                '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' },
              }}
              onClick={() => document.getElementById('gis-file-input').click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files[0]) setUploadFile(e.dataTransfer.files[0]);
              }}
            >
              <input
                id="gis-file-input"
                type="file"
                accept=".geojson,.json,.kml,.kmz,.zip,.shp"
                style={{ display: 'none' }}
                onChange={(e) => { if (e.target.files[0]) setUploadFile(e.target.files[0]); }}
              />
              <UploadIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
              <Typography>
                {uploadFile ? uploadFile.name : 'Drop a file here or click to browse'}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Supports: GeoJSON, KML, KMZ, Shapefile (.zip)
              </Typography>
            </Box>
            <TextField
              fullWidth label="Layer Name (optional)" value={uploadName}
              onChange={(e) => setUploadName(e.target.value)}
              size="small" sx={{ mb: 2 }}
            />
            <Button
              variant="contained" fullWidth onClick={handleUpload}
              disabled={!uploadFile || uploading}
              startIcon={uploading ? <CircularProgress size={16} /> : <UploadIcon />}
            >
              {uploading ? 'Uploading...' : 'Upload & Import'}
            </Button>
          </TabPanel>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddDialog(false)}>Cancel</Button>
        </DialogActions>
      </Dialog>

      {/* ── Attribute Mapping Dialog ── */}
      <Dialog open={!!mappingDialog} onClose={() => setMappingDialog(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Attribute Mapping - {mappingDialog?.name}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Map source field names to your app's field names. This controls how attributes display and how data can be linked.
          </Typography>
          {loadingMeta ? (
            <Box sx={{ textAlign: 'center', py: 3 }}><CircularProgress /></Box>
          ) : mappingMeta?.fields?.length > 0 ? (
            mappingMeta.fields
              .filter((f) => !['OBJECTID', 'FID', 'Shape', 'Shape_Length', 'Shape_Area', 'GlobalID'].includes(f.name))
              .map((field) => (
                <Box key={field.name} sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1.5 }}>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body2" fontWeight={600}>{field.alias || field.name}</Typography>
                    <Typography variant="caption" color="text.secondary">{field.name} ({field.type})</Typography>
                  </Box>
                  <FormControl size="small" sx={{ flex: 1 }}>
                    <Select
                      value={mappingValues[field.name] || ''}
                      onChange={(e) => setMappingValues((prev) => ({ ...prev, [field.name]: e.target.value }))}
                      displayEmpty
                    >
                      {APP_FIELD_OPTIONS.map((opt) => (
                        <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Box>
              ))
          ) : (
            <InfoNote mode="line" severity="info">No attributes found. Sync the layer first to discover attributes.</InfoNote>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMappingDialog(null)}>Cancel</Button>
          <Button variant="contained" onClick={saveMappingDialog}>Save Mapping</Button>
        </DialogActions>
      </Dialog>

      {/* ── Style Dialog ── */}
      <Dialog open={!!styleDialog} onClose={() => setStyleDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Layer Style - {styleDialog?.name}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" gutterBottom>Color</Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
            {STYLE_COLORS.map((c) => (
              <Box
                key={c}
                onClick={() => setStyleValues((prev) => ({ ...prev, color: c }))}
                sx={{
                  width: 32, height: 32, borderRadius: '50%', bgcolor: c, cursor: 'pointer',
                  border: styleValues.color === c ? '3px solid' : '1px solid rgba(0,0,0,0.2)',
                  borderColor: styleValues.color === c ? 'primary.main' : undefined,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                {styleValues.color === c && <CheckIcon sx={{ color: '#fff', fontSize: 16 }} />}
              </Box>
            ))}
          </Box>

          <Typography variant="body2" gutterBottom>Line Weight: {styleValues.weight || 2}</Typography>
          <Slider
            value={styleValues.weight || 2} min={1} max={8} step={1}
            onChange={(_, v) => setStyleValues((prev) => ({ ...prev, weight: v }))}
            sx={{ mb: 2 }}
          />

          <Typography variant="body2" gutterBottom>Opacity: {Math.round((styleValues.opacity || 0.8) * 100)}%</Typography>
          <Slider
            value={styleValues.opacity || 0.8} min={0.1} max={1} step={0.1}
            onChange={(_, v) => setStyleValues((prev) => ({ ...prev, opacity: v }))}
            sx={{ mb: 2 }}
          />

          <Typography variant="body2" gutterBottom>Fill Opacity: {Math.round((styleValues.fillOpacity || 0.3) * 100)}%</Typography>
          <Slider
            value={styleValues.fillOpacity || 0.3} min={0} max={1} step={0.1}
            onChange={(_, v) => setStyleValues((prev) => ({ ...prev, fillOpacity: v }))}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStyleDialog(null)}>Cancel</Button>
          <Button variant="contained" onClick={saveStyleDialog}>Save Style</Button>
        </DialogActions>
      </Dialog>

      {/* ── Link Feature Dialog ── */}
      <Dialog open={!!linkDialog} onClose={() => setLinkDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Link Feature</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Link this feature to an existing field or farm area in your system.
          </Typography>
          <Autocomplete
            options={fields}
            getOptionLabel={(f) => f.name || f.id}
            value={fields.find((f) => f.id === linkFieldId) || null}
            onChange={(_, v) => setLinkFieldId(v?.id || '')}
            renderInput={(params) => <TextField {...params} label="Link to Field" size="small" />}
            sx={{ mb: 2 }}
          />
          <Autocomplete
            options={farmAreas}
            getOptionLabel={(a) => a.name || a.id}
            value={farmAreas.find((a) => a.id === linkAreaId) || null}
            onChange={(_, v) => setLinkAreaId(v?.id || '')}
            renderInput={(params) => <TextField {...params} label="Link to Farm Area" size="small" />}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLinkDialog(null)}>Cancel</Button>
          <Button variant="contained" onClick={handleLinkFeature}>Link</Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirmation — makes the non-destructive consequences explicit
          and offers "Hide" as the safer default action. */}
      <Dialog open={Boolean(layerToDelete)} onClose={() => !deleting && setLayerToDelete(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Delete GIS layer?</DialogTitle>
        <DialogContent dividers>
          {layerToDelete && (
            <>
              <Typography sx={{ mb: 2 }}>
                You're about to delete the layer <strong>{layerToDelete.name}</strong>.
              </Typography>
              <InfoNote mode="line" severity="info" sx={{ mb: 2 }}>
                <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                  This removes the map polygons only.
                </Typography>
                <Typography variant="body2">
                  Fields, zones, sites, farm areas, and all data entries
                  (EC/pH, fertigation, scouting, harvests, tasks…) are <strong>kept</strong>.
                  If you reconnect the same ArcGIS source later, the polygons reappear
                  automatically and re-link to your existing fields by name.
                </Typography>
              </InfoNote>
              <Alert severity="warning">
                If you just want to stop seeing this layer on the map,
                click <strong>Hide</strong> instead. Nothing is lost.
              </Alert>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLayerToDelete(null)} disabled={deleting}>Cancel</Button>
          {layerToDelete?.isVisible && (
            <Button onClick={hideLayerFromDialog} disabled={deleting} variant="outlined">
              Hide instead
            </Button>
          )}
          <Button onClick={confirmDeleteLayer} color="error" variant="contained" disabled={deleting}>
            {deleting ? 'Deleting…' : 'Delete layer'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* GIS orphan review */}
      <Dialog open={orphansOpen} onClose={() => setOrphansOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Fields with missing GIS polygon</DialogTitle>
        <DialogContent>
          <InfoNote mode="line" severity="info" sx={{ mb: 2 }}>
            These fields are still in the database — all readings, harvests,
            and history are intact. Only their polygon on the map is gone
            because the corresponding feature was renamed or deleted on the
            ArcGIS source.
            <br /><br />
            <strong>To fix:</strong> re-sync the GIS layer that still has the
            polygon, or use "Link to field" on the map to point a different
            feature at this field. If the field really is retired, you can
            soft-delete it from the Fields page.
          </InfoNote>
          <List dense>
            {orphans.map((o) => (
              <ListItem key={o.id} divider>
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <strong>{o.name}</strong>
                      <Chip size="small" label={o.farm_area_name} variant="outlined" />
                    </Box>
                  }
                  secondary={
                    <>
                      {o.zone_name} / {o.site_name}
                      {' • '}
                      External id: <code>{o.gis_external_id}</code>
                    </>
                  }
                />
              </ListItem>
            ))}
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={loadOrphans}>Refresh</Button>
          <Button onClick={() => setOrphansOpen(false)} variant="contained">Close</Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snack.open}
        autoHideDuration={5000}
        onClose={() => setSnack((p) => ({ ...p, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snack.severity} onClose={() => setSnack((p) => ({ ...p, open: false }))}>
          {snack.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
