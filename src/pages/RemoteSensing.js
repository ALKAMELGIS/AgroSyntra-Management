import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useConfirmDialog } from '../components/ConfirmDialog';
import { useActiveSite } from '../contexts/ActiveSiteContext';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { canEditFields } from '../utils/roleAccess';
import {
  Container,
  Paper,
  Typography,
  Box,
  Grid,
  Card,
  CardContent,
  Button,
  Chip,
  CircularProgress,
  Alert,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  ToggleButton,
  ToggleButtonGroup,
  Slider,
  Drawer,
  IconButton,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Switch,
  FormControlLabel,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Snackbar,
} from '@mui/material';
import {
  MapContainer,
  Polygon,
  WMSTileLayer,
  Popup,
  Pane,
  Marker,
} from 'react-leaflet';
import {
  CloseOutlined as CloseIcon,
  LayersOutlined as LayersIcon,
  SatelliteOutlined as SatelliteIcon,
  TimelineOutlined as TimelineIcon,
  CompareArrowsOutlined as CompareIcon,
  DownloadOutlined as DownloadIcon,
  RefreshOutlined as RefreshIcon,
  SettingsOutlined as SettingsIcon,
  EditOutlined as EditIcon,
  DeleteOutlined as DeleteIcon,
  DrawOutlined as DrawIcon,
  SaveOutlined as SaveIcon,
  CancelOutlined as CancelIcon,
  PlayArrow as PlayArrowIcon,
  Pause as PauseIcon,
  SkipNextOutlined as SkipNextIcon,
  SkipPreviousOutlined as SkipPreviousIcon,
} from '@mui/icons-material';
import { loadMasterData, saveMasterData, generateId } from '../utils/masterDataUtils';
import { updateField } from '../utils/backendApi';
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { useNotification } from '../contexts/NotificationContext';
import { fetchCurrentWeather } from '../utils/weatherService';
import {
  isSentinelHubConfigured,
  getWMSUrl,
  getAvailableLayers,
  getWMSBaseURL,
  getWMSLayersFromCapabilities,
  generateTimeSeriesDates,
} from '../utils/sentinelhubService';
import { FitBounds, DrawingTool, MapWidgets, BasemapLayer, MapLifecycle, MapResizeInvalidator } from './remoteSensing/MapComponents';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import L from 'leaflet';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

function RemoteSensing() {
  const notify = useNotification();
  const { t } = useTranslation();
  const { user } = useAuth();
  // Field boundaries are a field edit: OM and worker only; farm manager and CEO watch (the API returns 403 for others).
  const canSavePolygons = canEditFields(user);
  const { activeSiteId } = useActiveSite();
  const appliedActiveSite = useRef(false);
  const [confirm, confirmDialog] = useConfirmDialog();
  const [masterDataState, setMasterDataState] = useState({ countries: [], crops: [], fieldTypes: [] });
  useEffect(() => {
    let mounted = true;
    loadMasterData().then((loaded) => {
      if (mounted) {
        setMasterDataState(loaded);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);
  const [selectedCountry, setSelectedCountry] = useState('');
  const [selectedSite, setSelectedSite] = useState('');

  useEffect(() => {
    if (activeSiteId && masterDataState.countries.length && !appliedActiveSite.current) {
      for (const c of masterDataState.countries) {
        const s = c.sites?.find((st) => st.id === activeSiteId);
        if (s) {
          appliedActiveSite.current = true;
          setSelectedCountry(c.id);
          setSelectedSite(s.id);
          break;
        }
      }
    }
  }, [activeSiteId, masterDataState.countries]);

  const [fields, setFields] = useState([]);
  const [selectedField, setSelectedField] = useState(null);
  const [loading, setLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [selectedLayer, setSelectedLayer] = useState('TRUE_COLOR');
  const [wmsLayers, setWmsLayers] = useState([]); // From GetCapabilities when WMS configured
  const [timeRange, setTimeRange] = useState([0, 100]); // Percentage of available time range
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]); // Current date for imagery
  const [showFieldBoundaries, setShowFieldBoundaries] = useState(true);
  const [showProductivityZones, setShowProductivityZones] = useState(false);
  const [environmentData, setEnvironmentData] = useState({});
  const [vegetationData, setVegetationData] = useState({});
  const [sentinelHubStatus, setSentinelHubStatus] = useState(null);
  const [drawingMode, setDrawingMode] = useState(false);
  const [drawnPolygon, setDrawnPolygon] = useState(null);
  const [fieldAssignmentDialog, setFieldAssignmentDialog] = useState(false);
  const [editingField, setEditingField] = useState(null);
  const [baseMap, setBaseMap] = useState('satellite');
  const [showSentinelOverlay, setShowSentinelOverlay] = useState(true);
  const [searchResultLatLng, setSearchResultLatLng] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const drawRef = useRef(null);
  const mapRef = useRef(null);

  // Time-series state
  const [timeSeriesStartDate, setTimeSeriesStartDate] = useState(
    new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [timeSeriesEndDate, setTimeSeriesEndDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [timeSeriesSteps, setTimeSeriesSteps] = useState([]);
  const [timeSeriesIndex, setTimeSeriesIndex] = useState(0);
  const [timeSeriesPlaying, setTimeSeriesPlaying] = useState(false);

  // Time-series playback: auto-advance every 1.5s
  useEffect(() => {
    if (!timeSeriesPlaying || timeSeriesSteps.length === 0) return;
    const timer = setInterval(() => {
      setTimeSeriesIndex((prev) => {
        const next = prev + 1;
        return next >= timeSeriesSteps.length ? 0 : next;
      });
    }, 1500);
    return () => clearInterval(timer);
  }, [timeSeriesPlaying, timeSeriesSteps.length]);

  // Sync selectedDate when time-series index changes
  useEffect(() => {
    if (timeSeriesSteps.length > 0 && timeSeriesIndex >= 0 && timeSeriesIndex < timeSeriesSteps.length) {
      setSelectedDate(timeSeriesSteps[timeSeriesIndex].date);
    }
  }, [timeSeriesIndex, timeSeriesSteps]);

  const handleGenerateTimeline = useCallback(() => {
    const steps = generateTimeSeriesDates(timeSeriesStartDate, timeSeriesEndDate);
    if (steps.length > 0) {
      setTimeSeriesSteps(steps);
      setTimeSeriesIndex(0);
      setSelectedDate(steps[0].date);
    }
  }, [timeSeriesStartDate, timeSeriesEndDate]);

  const handleStopTimeline = useCallback(() => {
    setTimeSeriesSteps([]);
    setTimeSeriesIndex(0);
    setTimeSeriesPlaying(false);
    setSelectedDate(new Date().toISOString().split('T')[0]);
  }, []);

  // OneSoil-style behavior: map is always available.
  // We still keep Country/Site filters as optional (for convenience), but NOT required for drawing.
  const allFieldsWithLocation = useMemo(() => {
    const allFields = [];
    for (const country of masterDataState.countries || []) {
      for (const site of country.sites || []) {
        for (const farmArea of site.farmAreas || []) {
          for (const field of farmArea.fields || []) {
            const hasPolygon = field.polygon && Array.isArray(field.polygon) && field.polygon.length > 0;
            const hasPoint = field.latitude && field.longitude;
            if (!hasPolygon && !hasPoint) continue;
            allFields.push({
              ...field,
              farmAreaName: farmArea.name,
              siteName: site.name,
              siteId: site.id,
              countryName: country.name,
              countryId: country.id,
            });
          }
        }
      }
    }
    return allFields;
  }, [masterDataState]);

  // Visible fields are optionally filtered by Country/Site (if selected), otherwise show all.
  const availableFields = useMemo(() => {
    return allFieldsWithLocation.filter((f) => {
      if (selectedCountry && f.countryId !== selectedCountry) return false;
      if (selectedSite && f.siteId !== selectedSite) return false;
      return true;
    });
  }, [allFieldsWithLocation, selectedCountry, selectedSite]);

  useEffect(() => {
    const status = isSentinelHubConfigured();
    setSentinelHubStatus(status);
  }, []);

  // Fetch actual WMS layer list from instance (GetCapabilities) so dropdown matches instance config
  useEffect(() => {
    if (!sentinelHubStatus?.hasWMS || !getWMSBaseURL()) return;
    let cancelled = false;
    getWMSLayersFromCapabilities()
      .then((layers) => {
        if (!cancelled && layers.length > 0) {
          setWmsLayers(layers);
          // Sync selectedLayer so it's always one of the instance layers (avoids MUI "out-of-range" warning)
          setSelectedLayer((prev) =>
            layers.some((l) => l.id === prev) ? prev : (layers[0]?.id ?? prev)
          );
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [sentinelHubStatus?.hasWMS]);

  const loadFieldData = useCallback(async () => {
    setLoading(true);
    const envData = {};
    const vegData = {};

    for (const field of availableFields) {
      if (field.latitude && field.longitude) {
        try {
          // Fetch weather/environment data
          const weather = await fetchCurrentWeather(field.latitude, field.longitude);
          envData[field.id || field.name] = {
            temperature: weather.avgTemp,
            humidity: weather.avgRH,
            precipitation: weather.rainfall,
            windSpeed: weather.windSpeed,
            pressure: weather.pressure,
            date: weather.date,
          };

          // Vegetation indices via Process API are skipped in the browser: Sentinel Hub's
          // OAuth endpoint (oauth/token) does not allow CORS from localhost, so Process API
          // calls would fail. The WMS map layer (NDVI, True Color, etc.) works without OAuth
          // using your WMS URL. To use Process API, call it from a backend proxy.
          // if (sentinelHubStatus?.hasOAuth && field.polygon && Array.isArray(field.polygon)) { ... }

          await new Promise((resolve) => setTimeout(resolve, 300));
        } catch (error) {
          console.error(`Error fetching data for ${field.name}:`, error);
        }
      }
    }

    setEnvironmentData(envData);
    setVegetationData(vegData);
    setLoading(false);
  }, [availableFields]);

  useEffect(() => {
    setFields(availableFields);
    if (availableFields.length > 0) {
      loadFieldData();
    }
  }, [availableFields, loadFieldData]);

  const getBoundingBox = (coordinates) => {
    const lngs = coordinates.map((coord) => coord[0]);
    const lats = coordinates.map((coord) => coord[1]);
    return [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)];
  };

  const getPolygonCoordinates = (field) => {
    if (field.polygon && Array.isArray(field.polygon)) {
      if (field.polygon[0] && Array.isArray(field.polygon[0])) {
        return field.polygon;
      }
      if (field.polygon.coordinates) {
        return field.polygon.coordinates[0].map((coord) => [coord[1], coord[0]]);
      }
    }
    return null;
  };

  const getNDVIColor = (ndviValue) => {
    if (!ndviValue || ndviValue < 0) return '#8B4513';
    if (ndviValue < 0.2) return '#D2B48C';
    if (ndviValue < 0.4) return '#9ACD32';
    if (ndviValue < 0.6) return '#32CD32';
    return '#228B22';
  };

  // NDVI legend scale (same breaks as getNDVIColor)
  const ndviLegendItems = [
    { label: '< 0', color: '#8B4513' },
    { label: '0 – 0.2', color: '#D2B48C' },
    { label: '0.2 – 0.4', color: '#9ACD32' },
    { label: '0.4 – 0.6', color: '#32CD32' },
    { label: '≥ 0.6', color: '#228B22' },
  ];
  const showNdviLegend = (selectedLayer === 'NDVI' || selectedLayer === '3_NDVI') && showSentinelOverlay;

  // Get all existing fields for dropdown
  const getAllFields = useMemo(() => {
    const allFields = [];
    for (const country of masterDataState.countries || []) {
      for (const site of country.sites || []) {
        for (const farmArea of site.farmAreas || []) {
          for (const field of farmArea.fields || []) {
            allFields.push({
              id: field.id,
              name: field.name,
              type: field.type,
              farmAreaId: farmArea.id,
              farmAreaName: farmArea.name,
              siteId: site.id,
              siteName: site.name,
              countryId: country.id,
              countryName: country.name,
            });
          }
        }
      }
    }
    return allFields.sort((a, b) => a.name.localeCompare(b.name));
  }, [masterDataState]);

  // Get all farm areas for the selected site
  const getFarmAreasForSite = useMemo(() => {
    if (!selectedSite) return [];
    const farmAreas = [];
    for (const country of masterDataState.countries || []) {
      if (selectedCountry && country.id !== selectedCountry) continue;
      for (const site of country.sites || []) {
        if (site.id === selectedSite) {
          for (const farmArea of site.farmAreas || []) {
            farmAreas.push(farmArea);
          }
        }
      }
    }
    return farmAreas;
  }, [selectedSite, selectedCountry, masterDataState]);

  // Get all crops
  const getAllCrops = useMemo(() => {
    return (masterDataState.crops || [])
      .map((crop) => {
        if (typeof crop === 'object' && crop !== null) {
          return crop.name || String(crop);
        }
        return String(crop);
      })
      .filter((crop) => crop && crop.trim() !== ''); // Filter out empty strings
  }, [masterDataState]);

  // Get all field types
  const getAllFieldTypes = useMemo(() => {
    return (masterDataState.fieldTypes || []).map((ft) => ft.name);
  }, [masterDataState]);

  // Handle polygon drawn on map
  const handlePolygonDrawn = (polygonCoords) => {
    // Convert from Leaflet format [lat, lng] to our format
    const formattedCoords = polygonCoords.map((coord) => [coord[0], coord[1]]);
    setDrawnPolygon(formattedCoords);
    setFieldAssignmentDialog(true);
    setDrawingMode(false);
  };

  const saveDrawnField = async (values) => {
    if (!drawnPolygon) return;

    const selectedFieldData = getAllFields.find((f) => f.id === values.fieldId);
    if (!selectedFieldData) {
      notify.error('Field not found');
      return;
    }

    try {
      await updateField(selectedFieldData.id, { polygon: drawnPolygon });

      const updatedData = { ...masterDataState };
      for (const country of updatedData.countries || []) {
        for (const site of country.sites || []) {
          for (const farmArea of site.farmAreas || []) {
            for (const field of farmArea.fields || []) {
              if (field.id === selectedFieldData.id) {
                field.polygon = drawnPolygon;
              }
            }
          }
        }
      }
      setMasterDataState(updatedData);
      saveMasterData(updatedData);

      notify.success(`Field ${selectedFieldData.name} updated with polygon boundary!`);
      setFieldAssignmentDialog(false);
      setDrawnPolygon(null);
      setFields(availableFields);
    } catch (err) {
      notify.error(`Failed to save polygon: ${err.message}`);
    }
  };

  const handleDeleteFieldPolygon = async (field) => {
    if (!(await confirm(`Are you sure you want to remove the polygon boundary for ${field.name}?`, { title: 'Remove Polygon' }))) {
      return;
    }

    try {
      await updateField(field.id, { polygon: [] });

      const updatedData = { ...masterDataState };
      for (const country of updatedData.countries || []) {
        for (const site of country.sites || []) {
          for (const farmArea of site.farmAreas || []) {
            for (const f of farmArea.fields || []) {
              if (f.id === field.id) {
                delete f.polygon;
              }
            }
          }
        }
      }
      setMasterDataState(updatedData);
      saveMasterData(updatedData);
      notify.success(`Polygon boundary removed for ${field.name}`);
      setFields(availableFields);
    } catch (err) {
      notify.error(`Failed to remove polygon: ${err.message}`);
    }
  };

  // Field assignment schema
  const fieldAssignmentSchema = Yup.object().shape({
    fieldId: Yup.string().required('Field ID is required'),
    fieldType: Yup.string(),
    currentCrop: Yup.string(),
    valveCount: Yup.number().min(0),
  });

  const selectedCountryData = masterDataState.countries.find((c) => c.id === selectedCountry);
  const selectedSiteData = selectedCountryData?.sites.find((s) => s.id === selectedSite);
  const availableLayers = wmsLayers.length > 0 ? wmsLayers : getAvailableLayers();

  // Effective layer: always one of available options (avoids MUI "out-of-range" and invalid WMS requests)
  const effectiveSelectedLayer = availableLayers.some((l) => l.id === selectedLayer)
    ? selectedLayer
    : (availableLayers[0]?.id ?? '');

  // Ensure selected layer exists in instance; otherwise pick first available
  useEffect(() => {
    if (availableLayers.length === 0) return;
    const hasSelection = availableLayers.some((l) => l.id === selectedLayer);
    if (!hasSelection) setSelectedLayer(availableLayers[0].id);
  }, [availableLayers, selectedLayer]);

  // TIME range: 30 days before selected date to selected date (more likely to get imagery)
  const timeRangeStart = useMemo(() => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  }, [selectedDate]);

  // Effective WMS time parameter: use time-series step's narrow window when active, else default 30-day window
  const effectiveWmsTime = useMemo(() => {
    if (timeSeriesSteps.length > 0 && timeSeriesIndex >= 0 && timeSeriesIndex < timeSeriesSteps.length) {
      return timeSeriesSteps[timeSeriesIndex].timeParam;
    }
    return `${timeRangeStart}/${selectedDate}`;
  }, [timeSeriesSteps, timeSeriesIndex, timeRangeStart, selectedDate]);

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      {/* Header */}
      <Paper elevation={3} sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 3, mb: 2 }}>
          <Typography variant="h4">Remote Sensing</Typography>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button
              variant="outlined"
              startIcon={loading ? <CircularProgress size={16} /> : <RefreshIcon />}
              onClick={loadFieldData}
              disabled={loading || availableFields.length === 0}
            >
              {loading ? 'Loading...' : 'Refresh'}
            </Button>
            {canSavePolygons && (
              <Button
                variant={drawingMode ? 'contained' : 'outlined'}
                color={drawingMode ? 'error' : 'primary'}
                startIcon={drawingMode ? <CancelIcon /> : <DrawIcon />}
                onClick={() => {
                  if (drawingMode) {
                    setDrawingMode(false);
                    setDrawnPolygon(null);
                  } else {
                    setBaseMap('satellite');
                    setDrawingMode(true);
                  }
                }}
              >
                {drawingMode ? 'Cancel Drawing' : 'Draw Field'}
              </Button>
            )}
            <Button
              variant="outlined"
              startIcon={<SettingsIcon />}
              onClick={() => setDrawerOpen(!drawerOpen)}
            >
              Controls
            </Button>
          </Box>
        </Box>

        {/* Filters */}
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <FormControl fullWidth>
              <InputLabel>Layer / Vegetation Index</InputLabel>
              <Select
                value={effectiveSelectedLayer}
                label="Layer / Vegetation Index"
                onChange={(e) => setSelectedLayer(e.target.value)}
              >
                {availableLayers.map((layer) => (
                  <MenuItem key={layer.id} value={layer.id}>
                    {layer.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            {sentinelHubStatus?.hasWMS && (
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                {wmsLayers.length > 0
                  ? 'Layers from your instance'
                  : 'If the map is blank, add layers (e.g. NDVI) in Sentinel Hub Configurator.'}
              </Typography>
            )}
          </Grid>
        </Grid>

        {/* Status Alerts */}
        {sentinelHubStatus && !sentinelHubStatus.configured && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            {sentinelHubStatus.message}
          </Alert>
        )}

        {availableFields.length === 0 && (
          <Alert severity="info" sx={{ mt: 2 }}>
            No field boundaries found yet. Click <strong>Draw Field</strong> to draw a polygon and assign it to an existing Field ID.
            Use the <strong>Satellite</strong> base map to trace boundaries from aerial imagery.
          </Alert>
        )}
      </Paper>

      {/* Main Content Area */}
      <Grid container spacing={3}>
        {/* Map Section */}
        <Grid size={{ xs: 12, md: drawerOpen ? 8 : 12 }}>
          <Paper elevation={3} sx={{ overflow: 'hidden' }}>
            <Box sx={{ height: '75vh', position: 'relative' }}>
              {searchError && (
                <Snackbar open autoHideDuration={4000} onClose={() => setSearchError(null)} message={searchError} sx={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', zIndex: 1100 }} />
              )}
              <MapContainer
                center={
                  availableFields[0]?.polygon && availableFields[0]?.polygon.length > 0
                    ? availableFields[0].polygon[0]
                    : availableFields[0]?.latitude && availableFields[0]?.longitude
                    ? [availableFields[0].latitude, availableFields[0].longitude]
                    : [24.45, 54.38]
                }
                zoom={availableFields.length > 0 ? 13 : 11}
                style={{ height: '100%', width: '100%' }}
                zoomControl={false}
              >
                <MapLifecycle />
                <MapResizeInvalidator revision={drawerOpen} />
                <BasemapLayer baseMap={baseMap} />
                {sentinelHubStatus?.configured && sentinelHubStatus.hasWMS && getWMSBaseURL() && showSentinelOverlay && (
                  <Pane name="sentinel-wms-pane" style={{ zIndex: 350 }}>
                    <WMSTileLayer
                      key={`sentinel-${effectiveSelectedLayer}-${selectedDate}`}
                      url={getWMSBaseURL()}
                      params={{
                        layers: effectiveSelectedLayer,
                        format: 'image/png',
                        transparent: true,
                        version: '1.3.0',
                        maxcc: 30,
                        time: effectiveWmsTime,
                      }}
                      uppercase
                      opacity={1}
                    />
                  </Pane>
                )}

                <MapWidgets
                  fields={availableFields}
                  baseMap={baseMap}
                  setBaseMap={setBaseMap}
                  showSentinelOverlay={showSentinelOverlay}
                  setShowSentinelOverlay={setShowSentinelOverlay}
                  sentinelConfigured={!!(sentinelHubStatus?.configured && sentinelHubStatus?.hasWMS && getWMSBaseURL())}
                  setSearchLoading={setSearchLoading}
                  searchLoading={searchLoading}
                  onGeocodeSuccess={setSearchResultLatLng}
                  onClearSearch={() => setSearchResultLatLng(null)}
                  setSearchError={setSearchError}
                />

                {searchResultLatLng && (
                  <Marker position={searchResultLatLng} />
                )}

                {availableFields.length > 0 && <FitBounds fields={availableFields} />}

                {/* Drawing Tool */}
                {drawingMode && (
                  <DrawingTool
                    drawingMode={drawingMode}
                    onPolygonDrawn={handlePolygonDrawn}
                  />
                )}

                {/* Field Polygons */}
                {availableFields.map((field) => {
                  const polygonCoords = getPolygonCoordinates(field);
                  const vegData = vegetationData[field.id || field.name];
                  const ndviValue = vegData?.ndvi;

                  return (
                    polygonCoords && (
                      <Polygon
                        key={field.id || field.name}
                        positions={polygonCoords}
                        pathOptions={{
                          color: showFieldBoundaries
                            ? (selectedLayer === 'NDVI' || selectedLayer === '3_NDVI') && ndviValue
                              ? getNDVIColor(ndviValue)
                              : '#3388ff'
                            : 'transparent',
                          fillColor:
                            (selectedLayer === 'NDVI' || selectedLayer === '3_NDVI') && ndviValue
                              ? getNDVIColor(ndviValue)
                              : '#3388ff',
                          fillOpacity: showFieldBoundaries ? 0.4 : 0,
                          weight: 2,
                        }}
                        eventHandlers={{
                          click: () => setSelectedField(field),
                        }}
                      >
                        <Popup>
                          <Box>
                            <Typography variant="subtitle2">{field.name}</Typography>
                            <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                              {field.farmAreaName} • {typeof field.currentCrop === 'object' && field.currentCrop !== null ? field.currentCrop.name : (field.currentCrop || 'No crop')}
                            </Typography>
                            {canSavePolygons ? (
                              <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                                <Button
                                  size="small"
                                  variant="outlined"
                                  startIcon={<EditIcon />}
                                  onClick={() => {
                                    setEditingField(field);
                                    setDrawnPolygon(polygonCoords);
                                    setFieldAssignmentDialog(true);
                                  }}
                                >
                                  Edit
                                </Button>
                                <Button
                                  size="small"
                                  variant="outlined"
                                  color="error"
                                  startIcon={<DeleteIcon />}
                                  onClick={() => handleDeleteFieldPolygon(field)}
                                >
                                  Delete
                                </Button>
                              </Box>
                            ) : (
                              <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
                                {t('fieldsAccess.polygonViewOnly')}
                              </Typography>
                            )}
                          </Box>
                        </Popup>
                      </Polygon>
                    )
                  );
                })}
              </MapContainer>

              {/* Legend – bottom right */}
              <Paper
                elevation={2}
                sx={{
                  position: 'absolute',
                  bottom: 10,
                  right: 10,
                  zIndex: 1000,
                  p: 1.5,
                  maxWidth: 200,
                }}
              >
                <Typography variant="caption" fontWeight={600} display="block" gutterBottom>
                  Legend
                </Typography>
                {showNdviLegend && (
                  <>
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
                      NDVI (field boundaries)
                    </Typography>
                    {ndviLegendItems.map(({ label, color }) => (
                      <Box key={label} sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.25 }}>
                        <Box sx={{ width: 14, height: 14, borderRadius: 0.5, bgcolor: color, flexShrink: 0 }} />
                        <Typography variant="caption">{label}</Typography>
                      </Box>
                    ))}
                    <Divider sx={{ my: 0.75 }} />
                  </>
                )}
                {showFieldBoundaries && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.25 }}>
                    <Box sx={{ width: 14, height: 14, border: '2px solid #3388ff', borderRadius: 0.5, bgcolor: 'rgba(51,136,255,0.4)', flexShrink: 0 }} />
                    <Typography variant="caption">Field boundary</Typography>
                  </Box>
                )}
                {searchResultLatLng && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#3388ff', border: '2px solid #fff', boxShadow: 1, flexShrink: 0 }} />
                    <Typography variant="caption">Search / GPS location</Typography>
                  </Box>
                )}
              </Paper>

              {/* Time-Series Timeline Playback Overlay */}
              {timeSeriesSteps.length > 0 && (
                <Paper
                  elevation={3}
                  sx={{
                    position: 'absolute',
                    bottom: 10,
                    left: 10,
                    right: 220,
                    zIndex: 1000,
                    p: 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.5,
                  }}
                >
                  <IconButton
                    size="small"
                    onClick={() => setTimeSeriesIndex((prev) => Math.max(0, prev - 1))}
                    disabled={timeSeriesIndex === 0}
                    title="Previous"
                  >
                    <SkipPreviousIcon fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small"
                    onClick={() => setTimeSeriesPlaying((prev) => !prev)}
                    color={timeSeriesPlaying ? 'error' : 'primary'}
                    title={timeSeriesPlaying ? 'Pause' : 'Play'}
                  >
                    {timeSeriesPlaying ? <PauseIcon fontSize="small" /> : <PlayArrowIcon fontSize="small" />}
                  </IconButton>
                  <IconButton
                    size="small"
                    onClick={() => setTimeSeriesIndex((prev) => Math.min(timeSeriesSteps.length - 1, prev + 1))}
                    disabled={timeSeriesIndex === timeSeriesSteps.length - 1}
                    title="Next"
                  >
                    <SkipNextIcon fontSize="small" />
                  </IconButton>
                  <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.25,
                      overflow: 'auto',
                      flex: 1,
                      py: 0.25,
                      '&::-webkit-scrollbar': { height: 4 },
                      '&::-webkit-scrollbar-thumb': { bgcolor: 'action.disabled', borderRadius: 2 },
                    }}
                  >
                    {timeSeriesSteps.map((step, idx) => (
                      <Chip
                        key={step.date}
                        label={step.date.slice(5)}
                        size="small"
                        color={idx === timeSeriesIndex ? 'primary' : 'default'}
                        variant={idx === timeSeriesIndex ? 'filled' : 'outlined'}
                        onClick={() => {
                          setTimeSeriesIndex(idx);
                          setTimeSeriesPlaying(false);
                        }}
                        sx={{
                          cursor: 'pointer',
                          minWidth: 'auto',
                          height: 24,
                          '& .MuiChip-label': { px: 0.75, fontSize: '0.7rem' },
                        }}
                      />
                    ))}
                  </Box>
                  <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
                  <Typography variant="caption" sx={{ whiteSpace: 'nowrap', fontWeight: 600, minWidth: 80, textAlign: 'center' }}>
                    {timeSeriesSteps[timeSeriesIndex]?.date || ''}
                  </Typography>
                </Paper>
              )}
            </Box>
          </Paper>
        </Grid>

        {/* Side Panel */}
        {drawerOpen && (
          <Grid size={{ xs: 12, md: 4 }}>
            <Paper elevation={3} sx={{ p: 2, height: '75vh', overflow: 'auto' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6">Field Analysis</Typography>
                <IconButton size="small" onClick={() => setDrawerOpen(false)}>
                  <CloseIcon />
                </IconButton>
              </Box>

              <Divider sx={{ mb: 2 }} />

              {/* Date Selection */}
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle2" gutterBottom>
                  Imagery Date
                </Typography>
                <TextField
                  type="date"
                  fullWidth
                  size="small"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  InputLabelProps={{
                    shrink: true,
                  }}
                  sx={{ mb: 2 }}
                />
                <Typography variant="caption" color="text.secondary" display="block">
                  Select date for satellite imagery (Sentinel-2 updates every 3-5 days)
                </Typography>
              </Box>

              {/* Time-Series Analysis */}
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle2" gutterBottom>
                  Time-Series Analysis
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
                  <TextField
                    type="date"
                    size="small"
                    label="Start"
                    value={timeSeriesStartDate}
                    onChange={(e) => setTimeSeriesStartDate(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    sx={{ flex: 1 }}
                    disabled={timeSeriesSteps.length > 0}
                  />
                  <TextField
                    type="date"
                    size="small"
                    label="End"
                    value={timeSeriesEndDate}
                    onChange={(e) => setTimeSeriesEndDate(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    sx={{ flex: 1 }}
                    disabled={timeSeriesSteps.length > 0}
                  />
                </Box>
                {timeSeriesSteps.length === 0 ? (
                  <Button
                    variant="outlined"
                    size="small"
                    fullWidth
                    startIcon={<TimelineIcon />}
                    onClick={handleGenerateTimeline}
                    disabled={
                      !timeSeriesStartDate ||
                      !timeSeriesEndDate ||
                      new Date(timeSeriesEndDate) <= new Date(timeSeriesStartDate)
                    }
                  >
                    Generate Timeline
                  </Button>
                ) : (
                  <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                      <Chip
                        icon={<TimelineIcon />}
                        label={`${timeSeriesSteps.length} snapshots`}
                        size="small"
                        color="primary"
                      />
                      <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
                        {timeSeriesSteps[timeSeriesIndex]?.date}
                      </Typography>
                    </Box>
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                      Step {timeSeriesIndex + 1} of {timeSeriesSteps.length}
                    </Typography>
                    <Button
                      variant="outlined"
                      size="small"
                      color="error"
                      fullWidth
                      onClick={handleStopTimeline}
                    >
                      Stop Timeline
                    </Button>
                  </Box>
                )}
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
                  {timeSeriesSteps.length > 0
                    ? 'Use playback controls at the bottom of the map to animate through dates.'
                    : 'Browse satellite imagery changes over time. Select a date range and generate the timeline.'}
                </Typography>
              </Box>

              {/* Display Options */}
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle2" gutterBottom>
                  Display Options
                </Typography>
                <FormControlLabel
                  control={
                    <Switch
                      checked={showFieldBoundaries}
                      onChange={(e) => setShowFieldBoundaries(e.target.checked)}
                    />
                  }
                  label="Field Boundaries"
                />
                <FormControlLabel
                  control={
                    <Switch
                      checked={showProductivityZones}
                      onChange={(e) => setShowProductivityZones(e.target.checked)}
                    />
                  }
                  label="Productivity Zones"
                />
              </Box>

              {/* Selected Field Details */}
              {selectedField && (
                <Box>
                  <Typography variant="h6" gutterBottom>
                    {selectedField.name}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    {selectedField.farmAreaName} • {typeof selectedField.currentCrop === 'object' && selectedField.currentCrop !== null ? selectedField.currentCrop.name : (selectedField.currentCrop || 'No crop')}
                  </Typography>

                  <Divider sx={{ my: 2 }} />

                  {/* Environment Indicators */}
                  {environmentData[selectedField.id || selectedField.name] && (
                    <Box sx={{ mb: 2 }}>
                      <Typography variant="subtitle2" gutterBottom>
                        Environment Indicators
                      </Typography>
                      <Grid container spacing={1}>
                        <Grid size={6}>
                          <Card variant="outlined" sx={{ p: 1 }}>
                            <Typography variant="caption" color="text.secondary">
                              Temperature
                            </Typography>
                            <Typography variant="h6">
                              {environmentData[selectedField.id || selectedField.name].temperature?.toFixed(1)}°C
                            </Typography>
                          </Card>
                        </Grid>
                        <Grid size={6}>
                          <Card variant="outlined" sx={{ p: 1 }}>
                            <Typography variant="caption" color="text.secondary">
                              Humidity
                            </Typography>
                            <Typography variant="h6">
                              {environmentData[selectedField.id || selectedField.name].humidity}%
                            </Typography>
                          </Card>
                        </Grid>
                        <Grid size={6}>
                          <Card variant="outlined" sx={{ p: 1 }}>
                            <Typography variant="caption" color="text.secondary">
                              Precipitation
                            </Typography>
                            <Typography variant="h6">
                              {environmentData[selectedField.id || selectedField.name].precipitation?.toFixed(1)} mm
                            </Typography>
                          </Card>
                        </Grid>
                        <Grid size={6}>
                          <Card variant="outlined" sx={{ p: 1 }}>
                            <Typography variant="caption" color="text.secondary">
                              Wind Speed
                            </Typography>
                            <Typography variant="h6">
                              {environmentData[selectedField.id || selectedField.name].windSpeed?.toFixed(1)} m/s
                            </Typography>
                          </Card>
                        </Grid>
                      </Grid>
                    </Box>
                  )}

                  {/* Vegetation Indices */}
                  {vegetationData[selectedField.id || selectedField.name] && (
                    <Box sx={{ mb: 2 }}>
                      <Typography variant="subtitle2" gutterBottom>
                        Vegetation Indices
                      </Typography>
                      <List dense>
                        <ListItem>
                          <ListItemText
                            primary="NDVI"
                            secondary={vegetationData[selectedField.id || selectedField.name].ndvi?.toFixed(3)}
                          />
                        </ListItem>
                        <ListItem>
                          <ListItemText
                            primary="NDMI"
                            secondary={vegetationData[selectedField.id || selectedField.name].ndmi?.toFixed(3)}
                          />
                        </ListItem>
                        <ListItem>
                          <ListItemText
                            primary="NDRE"
                            secondary={vegetationData[selectedField.id || selectedField.name].ndre?.toFixed(3)}
                          />
                        </ListItem>
                      </List>
                    </Box>
                  )}
                </Box>
              )}

              {!selectedField && (
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mt: 4 }}>
                  Click on a field to view details
                </Typography>
              )}
            </Paper>
          </Grid>
        )}
      </Grid>

      {/* Field Assignment Dialog */}
      <Dialog
        open={fieldAssignmentDialog}
        onClose={() => {
          setFieldAssignmentDialog(false);
          setDrawnPolygon(null);
          setEditingField(null);
        }}
        maxWidth="sm"
        fullWidth
      >
        <Formik
          initialValues={{
            fieldId: editingField?.id || '',
            fieldType: editingField?.type || '',
            currentCrop: typeof editingField?.currentCrop === 'object' && editingField?.currentCrop !== null 
              ? editingField.currentCrop.name 
              : (editingField?.currentCrop || ''),
            valveCount: editingField?.valves || 0,
          }}
          validationSchema={fieldAssignmentSchema}
          onSubmit={(values) => {
            saveDrawnField(values);
          }}
        >
          {({ values, errors, touched, handleChange, handleBlur, setFieldValue }) => (
            <Form>
              <DialogTitle>
                {editingField ? `Edit Field: ${editingField.name}` : 'Assign Field to Drawn Polygon'}
              </DialogTitle>
              <DialogContent>
                <Box sx={{ pt: 2 }}>
                  <Grid container spacing={2}>
                    <Grid size={12}>
                      <FormControl fullWidth error={touched.fieldId && !!errors.fieldId}>
                        <InputLabel>Field ID *</InputLabel>
                        <Select
                          name="fieldId"
                          value={values.fieldId}
                          onChange={handleChange}
                          onBlur={handleBlur}
                          label="Field ID *"
                          disabled={!!editingField}
                        >
                          {getAllFields.map((field) => (
                            <MenuItem key={field.id} value={field.id}>
                              {field.name} ({field.type || 'Unknown'}) - {field.farmAreaName}
                            </MenuItem>
                          ))}
                        </Select>
                        {touched.fieldId && errors.fieldId && (
                          <Typography variant="caption" color="error" sx={{ mt: 0.5, display: 'block' }}>
                            {errors.fieldId}
                          </Typography>
                        )}
                      </FormControl>
                    </Grid>

                    <Grid size={{ xs: 12, sm: 6 }}>
                      <FormControl fullWidth>
                        <InputLabel>Field Type</InputLabel>
                        <Select
                          name="fieldType"
                          value={values.fieldType}
                          onChange={handleChange}
                          onBlur={handleBlur}
                          label="Field Type"
                        >
                          {getAllFieldTypes.map((type) => (
                            <MenuItem key={type} value={type}>
                              {type}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </Grid>

                    <Grid size={{ xs: 12, sm: 6 }}>
                      <FormControl fullWidth>
                        <InputLabel>Current Crop</InputLabel>
                        <Select
                          name="currentCrop"
                          value={values.currentCrop}
                          onChange={handleChange}
                          onBlur={handleBlur}
                          label="Current Crop"
                        >
                          {getAllCrops.map((crop) => (
                            <MenuItem key={String(crop)} value={String(crop)}>
                              {String(crop)}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </Grid>

                    <Grid size={12}>
                      <TextField
                        fullWidth
                        type="number"
                        name="valveCount"
                        label="Valve Count"
                        value={values.valveCount}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        inputProps={{ min: 0, step: 1 }}
                      />
                    </Grid>

                    {drawnPolygon && (
                      <Grid size={12}>
                        <Alert severity="info">
                          <Typography variant="body2">
                            Polygon with {drawnPolygon.length} points will be saved to the selected field.
                          </Typography>
                        </Alert>
                      </Grid>
                    )}
                  </Grid>
                </Box>
              </DialogContent>
              <DialogActions>
                <Button
                  onClick={() => {
                    setFieldAssignmentDialog(false);
                    setDrawnPolygon(null);
                    setEditingField(null);
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="contained" startIcon={<SaveIcon />}>
                  {editingField ? 'Update Field' : 'Save Field'}
                </Button>
              </DialogActions>
            </Form>
          )}
        </Formik>
      </Dialog>
      {confirmDialog}
    </Container>
  );
}

export default RemoteSensing;
