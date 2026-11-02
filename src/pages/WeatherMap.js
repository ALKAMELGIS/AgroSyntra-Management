import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Container, Paper, Typography, Box, Grid, Card, CardContent, Button, Chip, CircularProgress, Alert, Select, MenuItem, FormControl, InputLabel, ToggleButton, ToggleButtonGroup } from '@mui/material';
import { useActiveSite } from '../contexts/ActiveSiteContext';
import { MapContainer, TileLayer, Marker, Popup, Polygon, LayersControl, LayerGroup } from 'react-leaflet';
import { MapLifecycle, SafeFitBounds } from '../utils/leafletSafe';
import { Icon } from 'leaflet';
import { RefreshOutlined as Refresh, LayersOutlined as Layers, SatelliteOutlined as Satellite, TerrainOutlined as Terrain } from '@mui/icons-material';
import { loadMasterData } from '../utils/masterDataUtils';
import { fetchCurrentWeather } from '../utils/weatherService';
import { getNDVIData, getSoilHealthData, isAgroAPIAvailable, createAgroPolygon, getRegisteredPolygons } from '../utils/agroApiService';
import 'leaflet/dist/leaflet.css';

// Fix for default marker icons in react-leaflet
import L from 'leaflet';
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Component to fit map bounds to show all fields — see SafeFitBounds in leafletSafe.js

function WeatherMap() {
  const { activeSiteId } = useActiveSite();
  const appliedActiveSite = useRef(false);
  const [masterData, setMasterData] = useState({ countries: [], crops: [], fieldTypes: [] });
  useEffect(() => {
    let mounted = true;
    loadMasterData().then((loaded) => {
      if (mounted) {
        setMasterData(loaded);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);
  const [selectedCountry, setSelectedCountry] = useState('');
  const [selectedSite, setSelectedSite] = useState('');

  useEffect(() => {
    if (activeSiteId && masterData.countries.length && !appliedActiveSite.current) {
      for (const c of masterData.countries) {
        const s = c.sites?.find((st) => st.id === activeSiteId);
        if (s) {
          appliedActiveSite.current = true;
          setSelectedCountry(c.id);
          setSelectedSite(s.id);
          break;
        }
      }
    }
  }, [activeSiteId, masterData.countries]);

  const [fields, setFields] = useState([]);
  const [fieldWeatherData, setFieldWeatherData] = useState({});
  const [fieldSoilData, setFieldSoilData] = useState({});
  const [fieldNDVIData, setFieldNDVIData] = useState({});
  const [fieldPolygonIds, setFieldPolygonIds] = useState({}); // Store Agro API polygon IDs
  const [loading, setLoading] = useState(false);
  const [agroPolygons, setAgroPolygons] = useState([]); // Registered polygons from Agro API
  const [mapLayers, setMapLayers] = useState({
    weather: true,
    boundaries: true,
    ndvi: false,
    satellite: false,
  });
  const [selectedField, setSelectedField] = useState(null);

  // Get all fields with coordinates/polygons for selected site
  const availableFields = useMemo(() => {
    if (!selectedSite) return [];

    const allFields = [];
    for (const country of masterData.countries || []) {
      if (selectedCountry && country.id !== selectedCountry) continue;
      for (const site of country.sites || []) {
        if (site.id !== selectedSite) continue;
        for (const farmArea of site.farmAreas || []) {
          for (const field of farmArea.fields || []) {
            // Include fields with coordinates OR polygons
            if (field.latitude && field.longitude) {
              allFields.push({
                ...field,
                farmAreaName: farmArea.name,
                siteName: site.name,
                countryName: country.name,
              });
            }
          }
        }
      }
    }
    return allFields;
  }, [selectedSite, selectedCountry, masterData]);

  const [agroAvailable, setAgroAvailable] = useState(false);

  useEffect(() => {
    isAgroAPIAvailable().then(setAgroAvailable);
  }, []);

  const loadFieldData = useCallback(async () => {
    setLoading(true);
    const weatherData = {};
    const soilData = {};
    const ndviData = {};

    // Fetch registered polygons first so we have polygon IDs before fetching NDVI.
    // Previously, loadAgroPolygons ran async alongside loadFieldData, so polygonIds
    // were often empty when we tried to fetch NDVI.
    let polygonMap = {};
    if (agroAvailable) {
      try {
        const registered = await getRegisteredPolygons();
        setAgroPolygons(registered);
        registered.forEach((poly) => {
          const matchingField = availableFields.find(
            (f) => f.name === poly.name || f.id === poly.name
          );
          if (matchingField) {
            polygonMap[matchingField.id || matchingField.name] = poly.id;
          }
        });
        setFieldPolygonIds(polygonMap);
      } catch (e) {
        console.error('Error loading Agro polygons:', e);
      }
    }

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];

    for (const field of availableFields) {
      if (field.latitude && field.longitude) {
        try {
          const weather = await fetchCurrentWeather(field.latitude, field.longitude);
          weatherData[field.id || field.name] = weather;

          if (agroAvailable) {
            let polygonId = polygonMap[field.id || field.name];

            if (!polygonId && field.polygon && Array.isArray(field.polygon) && field.polygon.length > 0) {
              try {
                const registered = await createAgroPolygon(
                  field.name,
                  field.polygon,
                  field.currentCrop || ''
                );
                if (registered?.id) {
                  polygonMap = { ...polygonMap, [field.id || field.name]: registered.id };
                  setFieldPolygonIds((prev) => ({ ...prev, [field.id || field.name]: registered.id }));
                  polygonId = registered.id;
                }
              } catch (regError) {
                console.error(`Error registering polygon for ${field.name}:`, regError);
              }
            }

            if (polygonId) {
              try {
                const ndvi = await getNDVIData(polygonId, startStr, endStr);
                if (ndvi && (Array.isArray(ndvi) ? ndvi.length : ndvi.data?.length)) {
                  ndviData[field.id || field.name] = ndvi;
                }
                const soil = await getSoilHealthData(polygonId);
                if (soil) soilData[field.id || field.name] = soil;
              } catch (agroError) {
                console.error(`Error fetching agro data for ${field.name}:`, agroError);
              }
            }
          }

          await new Promise((resolve) => setTimeout(resolve, 500));
        } catch (error) {
          console.error(`Error fetching data for ${field.name}:`, error);
        }
      }
    }

    setFieldWeatherData(weatherData);
    setFieldSoilData(soilData);
    setFieldNDVIData(ndviData);
    setLoading(false);
  }, [availableFields, agroAvailable]);

  useEffect(() => {
    setFields(availableFields);
    if (availableFields.length > 0) {
      loadFieldData();
    }
  }, [availableFields, loadFieldData]);

  // Get NDVI color based on value (0-1 scale)
  const getNDVIColor = (ndviValue) => {
    if (!ndviValue || ndviValue < 0) return '#8B4513'; // Brown - no vegetation
    if (ndviValue < 0.2) return '#D2B48C'; // Tan - sparse vegetation
    if (ndviValue < 0.4) return '#9ACD32'; // Yellow-green - moderate
    if (ndviValue < 0.6) return '#32CD32'; // Green - healthy
    return '#228B22'; // Dark green - very healthy
  };

  // Agro API returns array of { dt, mean, median, data, ... }. Use last item's mean (or median).
  const getLatestNDVIValue = (ndvi) => {
    if (!ndvi) return null;
    const arr = Array.isArray(ndvi) ? ndvi : ndvi.data;
    if (!arr?.length) return null;
    const last = arr[arr.length - 1];
    const v = last?.mean ?? last?.median ?? last?.value ?? (typeof last?.data === 'number' ? last.data : null);
    return typeof v === 'number' && !Number.isNaN(v) ? v : null;
  };

  // Get polygon coordinates in Leaflet format [lat, lng]
  const getPolygonCoordinates = (field) => {
    if (field.polygon && Array.isArray(field.polygon)) {
      // If polygon is array of [lat, lng] pairs
      if (field.polygon[0] && Array.isArray(field.polygon[0])) {
        return field.polygon;
      }
      // If polygon is GeoJSON format
      if (field.polygon.coordinates) {
        return field.polygon.coordinates[0].map((coord) => [coord[1], coord[0]]); // GeoJSON is [lng, lat]
      }
    }
    return null;
  };

  const selectedCountryData = masterData.countries.find((c) => c.id === selectedCountry);

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      <Paper elevation={3} sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 3, mb: 2 }}>
          <Typography variant="h4">Field Map</Typography>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button
              variant="outlined"
              startIcon={loading ? <CircularProgress size={16} /> : <Refresh />}
              onClick={loadFieldData}
              disabled={loading || availableFields.length === 0}
            >
              {loading ? 'Loading...' : 'Refresh Data'}
            </Button>
          </Box>
        </Box>

        {/* Filters */}
        <Grid container spacing={2} sx={{ mb: 2 }}>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <FormControl fullWidth>
              <InputLabel id="weathermap-zone-label-1">Zone</InputLabel>
              <Select labelId="weathermap-zone-label-1"
                value={selectedCountry}
                label="Zone"
                onChange={(e) => {
                  setSelectedCountry(e.target.value);
                  setSelectedSite('');
                }}
              >
                {masterData.countries.map((country) => (
                  <MenuItem key={country.id} value={country.id}>
                    {country.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <FormControl fullWidth>
              <InputLabel id="weathermap-site-label-2">Site</InputLabel>
              <Select labelId="weathermap-site-label-2"
                value={selectedSite}
                label="Site"
                onChange={(e) => setSelectedSite(e.target.value)}
                disabled={!selectedCountry}
              >
                {selectedCountryData?.sites.map((site) => (
                  <MenuItem key={site.id} value={site.id}>
                    {site.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 6 }}>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
              <Typography variant="body2">Layers:</Typography>
              <ToggleButtonGroup
                value={Object.keys(mapLayers).filter((key) => mapLayers[key])}
                onChange={(e, newLayers) => {
                  const updated = { ...mapLayers };
                  Object.keys(updated).forEach((key) => {
                    updated[key] = newLayers.includes(key);
                  });
                  setMapLayers(updated);
                }}
                size="small"
              >
                <ToggleButton value="weather">
                  <Layers fontSize="small" sx={{ mr: 0.5 }} />
                  Weather
                </ToggleButton>
                <ToggleButton value="boundaries">
                  <Terrain fontSize="small" sx={{ mr: 0.5 }} />
                  Boundaries
                </ToggleButton>
                <ToggleButton value="ndvi">
                  <Satellite fontSize="small" sx={{ mr: 0.5 }} />
                  NDVI
                </ToggleButton>
                <ToggleButton value="satellite">
                  <Satellite fontSize="small" sx={{ mr: 0.5 }} />
                  Satellite
                </ToggleButton>
              </ToggleButtonGroup>
            </Box>
          </Grid>
        </Grid>

        {!agroAvailable && (
          <Alert severity="info" sx={{ mb: 2 }}>
            Agro API features (NDVI, Satellite, Soil Health) require an OpenWeatherMap API key.
            Add it in <strong>Admin → API Keys → Weather Map API Key</strong>.
          </Alert>
        )}

        {agroAvailable && availableFields.length > 0 && (
          <Alert severity="info" sx={{ mb: 2 }}>
            <Typography variant="body2" gutterBottom>
              <strong>NDVI Display Requirements:</strong>
            </Typography>
            <Typography variant="body2" component="div">
              <ul style={{ marginTop: 4, marginBottom: 4, paddingLeft: 20 }}>
                <li>Fields need <strong>polygon boundaries</strong> (not just coordinates)</li>
                <li>Polygons are automatically registered with Agro API when you click "Refresh Data"</li>
                <li>NDVI color overlays appear on field polygons when NDVI layer is enabled</li>
                <li>Add polygon coordinates in <strong>Master Data → Field Types & Names</strong> (Edit field)</li>
              </ul>
            </Typography>
          </Alert>
        )}

        {availableFields.length === 0 && selectedSite && (
          <Alert severity="warning">
            No fields with coordinates found for this site. Add latitude/longitude to fields in Master Data.
          </Alert>
        )}
      </Paper>

      {/* Map Container */}
      {selectedSite && availableFields.length > 0 && (
        <Paper elevation={3} sx={{ overflow: 'hidden' }}>
          <Box sx={{ height: '70vh', position: 'relative' }}>
            <MapContainer
              center={availableFields[0]?.latitude && availableFields[0]?.longitude
                ? [availableFields[0].latitude, availableFields[0].longitude]
                : [24.45, 54.38]}
              zoom={13}
              style={{ height: '100%', width: '100%' }}
            >
              <MapLifecycle />
              <LayersControl position="topright">
                <LayersControl.BaseLayer checked name="OpenStreetMap">
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                </LayersControl.BaseLayer>
                {mapLayers.satellite && (
                  <LayersControl.BaseLayer name="Satellite">
                    <TileLayer
                      attribution='&copy; <a href="https://www.esri.com/">Esri</a>'
                      url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                    />
                  </LayersControl.BaseLayer>
                )}
              </LayersControl>

              <SafeFitBounds fields={availableFields} options={{ padding: [50, 50] }} />

              {/* Field Markers and Polygons */}
              {availableFields.map((field) => {
                const weather = fieldWeatherData[field.id || field.name];
                const soil = fieldSoilData[field.id || field.name];
                const ndvi = fieldNDVIData[field.id || field.name];
                const polygonCoords = getPolygonCoordinates(field);
                const latestNDVI = getLatestNDVIValue(ndvi);

                return (
                  <LayerGroup key={field.id || field.name}>
                    {/* Field Polygon */}
                    {mapLayers.boundaries && polygonCoords && (
                      <Polygon
                        positions={polygonCoords}
                        pathOptions={{
                          color: mapLayers.ndvi && latestNDVI
                            ? getNDVIColor(latestNDVI)
                            : '#3388ff',
                          fillColor: mapLayers.ndvi && latestNDVI
                            ? getNDVIColor(latestNDVI)
                            : '#3388ff',
                          fillOpacity: mapLayers.ndvi && latestNDVI ? 0.6 : 0.2,
                          weight: 2,
                        }}
                        eventHandlers={{
                          click: () => setSelectedField(field),
                        }}
                      >
                        <Popup>
                          <Typography variant="subtitle2">{field.name}</Typography>
                          {latestNDVI && (
                            <Typography variant="caption">
                              NDVI: {latestNDVI.toFixed(2)}
                            </Typography>
                          )}
                        </Popup>
                      </Polygon>
                    )}

                    {/* Field Marker (if no polygon or as backup) */}
                    {mapLayers.weather && field.latitude && field.longitude && (
                      <Marker
                        position={[field.latitude, field.longitude]}
                        eventHandlers={{
                          click: () => setSelectedField(field),
                        }}
                      >
                        <Popup>
                          <Box>
                            <Typography variant="h6" gutterBottom>
                              {field.name}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                              {field.farmAreaName} • {field.currentCrop || 'No crop'}
                            </Typography>
                            {weather && (
                              <Box sx={{ mt: 1 }}>
                                <Typography variant="body2">
                                  <strong>Temperature:</strong> {weather.avgTemp?.toFixed(1)}°C
                                </Typography>
                                <Typography variant="body2">
                                  <strong>Humidity:</strong> {weather.avgRH}%
                                </Typography>
                                <Typography variant="body2">
                                  <strong>Wind:</strong> {weather.windSpeed?.toFixed(1)} m/s
                                </Typography>
                              </Box>
                            )}
                            {soil && (
                              <Box sx={{ mt: 1 }}>
                                <Typography variant="body2">
                                  <strong>Soil Moisture:</strong> {soil.moistureLevel || 'N/A'}
                                </Typography>
                                <Typography variant="body2">
                                  <strong>Soil Type:</strong> {soil.soilType || 'N/A'}
                                </Typography>
                              </Box>
                            )}
                            {latestNDVI && (
                              <Box sx={{ mt: 1 }}>
                                <Typography variant="body2">
                                  <strong>NDVI:</strong> {latestNDVI.toFixed(2)}
                                  <Chip
                                    label={latestNDVI > 0.6 ? 'Healthy' : latestNDVI > 0.4 ? 'Moderate' : 'Low'}
                                    size="small"
                                    color={latestNDVI > 0.6 ? 'success' : latestNDVI > 0.4 ? 'warning' : 'error'}
                                    sx={{ ml: 1 }}
                                  />
                                </Typography>
                              </Box>
                            )}
                          </Box>
                        </Popup>
                      </Marker>
                    )}
                  </LayerGroup>
                );
              })}
            </MapContainer>
          </Box>
        </Paper>
      )}

      {/* Field Details Panel */}
      {selectedField && (
        <Paper elevation={3} sx={{ mt: 3, p: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 3, mb: 2 }}>
            <Typography variant="h5">{selectedField.name}</Typography>
            <Button onClick={() => setSelectedField(null)}>Close</Button>
          </Box>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 4 }}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>Weather</Typography>
                  {fieldWeatherData[selectedField.id || selectedField.name] ? (
                    <Box>
                      <Typography variant="body2">
                        Temp: {fieldWeatherData[selectedField.id || selectedField.name].avgTemp?.toFixed(1)}°C
                      </Typography>
                      <Typography variant="body2">
                        Feels like: {fieldWeatherData[selectedField.id || selectedField.name].feelsLike?.toFixed(1)}°C
                      </Typography>
                      <Typography variant="body2">
                        Humidity: {fieldWeatherData[selectedField.id || selectedField.name].avgRH}%
                      </Typography>
                      <Typography variant="body2">
                        Wind: {fieldWeatherData[selectedField.id || selectedField.name].windSpeed?.toFixed(1)} m/s
                      </Typography>
                    </Box>
                  ) : (
                    <Typography variant="body2" color="text.secondary">No data</Typography>
                  )}
                </CardContent>
              </Card>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>Soil Health</Typography>
                  {fieldSoilData[selectedField.id || selectedField.name] ? (
                    <Box>
                      <Typography variant="body2">
                        Moisture: {fieldSoilData[selectedField.id || selectedField.name].moistureLevel || 'N/A'}
                      </Typography>
                      <Typography variant="body2">
                        Type: {fieldSoilData[selectedField.id || selectedField.name].soilType || 'N/A'}
                      </Typography>
                    </Box>
                  ) : (
                    <Typography variant="body2" color="text.secondary">No data</Typography>
                  )}
                </CardContent>
              </Card>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>Field Health (NDVI)</Typography>
                  {fieldNDVIData[selectedField.id || selectedField.name] ? (
                    <Box>
                      <Typography variant="body2">
                        Latest NDVI: {getLatestNDVIValue(fieldNDVIData[selectedField.id || selectedField.name])?.toFixed(2) ?? 'N/A'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Historical data available
                      </Typography>
                    </Box>
                  ) : (
                    <Typography variant="body2" color="text.secondary">No data</Typography>
                  )}
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Paper>
      )}
    </Container>
  );
}

export default WeatherMap;
