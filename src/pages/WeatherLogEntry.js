import { useState, useEffect, useMemo, useRef } from 'react';
import { API_BASE, getAuthHeaders } from '../config/api';
import { useActiveSite } from '../contexts/ActiveSiteContext';
import { useActiveSeason } from '../contexts/ActiveSeasonContext';
import { useAuth } from '../contexts/AuthContext';
import ReadOnlyBanner from '../components/ReadOnlyBanner';
import useSeasonListDates from '../hooks/useSeasonListDates';
import {
  Container,
  Paper,
  Typography,
  Grid,
  TextField,
  Button,
  MenuItem,
  Alert,
  Box,
  Card,
  CardContent,
  CircularProgress,
  Chip,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
} from '@mui/material';
import { useNotification } from '../contexts/NotificationContext';
import {
  CloudDownloadOutlined as CloudDownload,
  CloudQueueOutlined as CloudQueue,
  LocationOnOutlined as LocationOn,
  RefreshOutlined as Refresh,
  SensorsOutlined as Sensors,
} from '@mui/icons-material';
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { loadMasterData } from '../utils/masterDataUtils';
import {
  fetchCurrentWeather,
  autoFetchWeatherForFields,
  getAPIKeyStatus,
  fetchWeatherApiStatus,
} from '../utils/weatherService';
import {
  listWeatherLogs,
  listWeatherLogsAll,
  createWeatherLog,
  updateWeatherLog,
} from '../utils/backendApi';
import WeatherCard from '../components/WeatherCard';
import SoilCard from '../components/SoilCard';
import { canWriteWeatherLogs } from '../utils/weatherLogAccess';

const weatherSchema = Yup.object().shape({
  date: Yup.string().required('Date is required'),
  siteId: Yup.string().required('Site is required'),
  maxTemp: Yup.number().min(-50, 'Temperature too low').max(60, 'Temperature too high').required('Max temperature is required'),
  minTemp: Yup.number().min(-50, 'Temperature too low').max(60, 'Temperature too high').required('Min temperature is required'),
  avgRH: Yup.number().min(0, 'Humidity must be between 0 and 100').max(100, 'Humidity must be between 0 and 100').required('Average RH is required'),
  rainfall: Yup.number().min(0, 'Rainfall cannot be negative').required('Rainfall is required'),
  notes: Yup.string(),
});

function coordsFromPolygon(polygon) {
  if (!polygon) return null;
  let ring = null;
  if (Array.isArray(polygon) && polygon.length > 0) {
    if (Array.isArray(polygon[0])) {
      const first = polygon[0];
      if (typeof first[0] === 'number' && Math.abs(first[0]) <= 90 && Math.abs(first[1]) <= 180) {
        ring = polygon.map(([lat, lng]) => [lng, lat]);
      } else {
        ring = polygon;
      }
    }
  } else if (polygon.type === 'Polygon') {
    ring = polygon.coordinates?.[0];
  } else if (polygon.type === 'MultiPolygon') {
    ring = polygon.coordinates?.[0]?.[0];
  }
  if (!ring?.length) return null;
  let sumLat = 0;
  let sumLng = 0;
  for (const [lng, lat] of ring) {
    sumLat += lat;
    sumLng += lng;
  }
  return {
    latitude: Number((sumLat / ring.length).toFixed(7)),
    longitude: Number((sumLng / ring.length).toFixed(7)),
  };
}

function getFieldCoordinates(field) {
  if (field.latitude && field.longitude) {
    return { latitude: Number(field.latitude), longitude: Number(field.longitude) };
  }
  return coordsFromPolygon(field.polygon);
}

function WeatherLogEntry() {
  const notify = useNotification();
  const { activeSiteId } = useActiveSite();
  const { isSeasonReadOnly } = useActiveSeason();
  const { user } = useAuth();
  // Worker and operation manager enter weather; everyone else who can open the page watches.
  const canWrite = canWriteWeatherLogs(user?.role) && !isSeasonReadOnly;
  const { startDate: seasonFrom, endDate: seasonTo, isReady: seasonDatesReady } = useSeasonListDates();
  const appliedActiveSite = useRef(false);
  const [data, setData] = useState({ countries: [], crops: [], fieldTypes: [] });
  useEffect(() => {
    let mounted = true;
    loadMasterData().then((loaded) => {
      if (mounted) {
        setData(loaded);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);
  const [selectedCountry, setSelectedCountry] = useState('');
  const [selectedSite, setSelectedSite] = useState('');

  useEffect(() => {
    if (activeSiteId && data.countries.length && !appliedActiveSite.current) {
      for (const c of data.countries) {
        const s = c.sites?.find((st) => st.id === activeSiteId);
        if (s) {
          appliedActiveSite.current = true;
          setSelectedCountry(c.id);
          setSelectedSite(s.id);
          break;
        }
      }
    }
  }, [activeSiteId, data.countries]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [existingEntry, setExistingEntry] = useState(null);
  const [fetching, setFetching] = useState(false);
  const [apiStatus, setApiStatus] = useState(getAPIKeyStatus());
  const [weatherCards, setWeatherCards] = useState([]);
  const [loadingCards, setLoadingCards] = useState(false);
  const [stationAutoFill, setStationAutoFill] = useState(null);
  const [loadingStationFill, setLoadingStationFill] = useState(false);
  const [soilReadings, setSoilReadings] = useState([]);

  const selectedCountryData = data.countries.find((c) => c.id === selectedCountry);
  const selectedSiteData = selectedCountryData?.sites.find((s) => s.id === selectedSite);

  // Get fields with coordinates for the selected site
  const fieldsWithCoordinates = useMemo(() => {
    if (!selectedSite) return [];
    const fields = [];
    selectedCountryData?.sites
      .find((s) => s.id === selectedSite)
      ?.farmAreas?.forEach((fa) => {
        fa.fields?.forEach((field) => {
          const coords = getFieldCoordinates(field);
          if (coords) {
            fields.push({
              ...field,
              ...coords,
              farmAreaName: fa.name,
            });
          }
        });
      });
    return fields;
  }, [selectedSite, selectedCountryData]);

  useEffect(() => {
    checkExistingEntry();
    fetchWeatherApiStatus().then(setApiStatus);
    loadWeatherCards();
  }, [selectedDate, selectedSite, fieldsWithCoordinates, seasonFrom, seasonTo, seasonDatesReady]);

  // Load soil sensor data for cards
  const loadSoilData = async () => {
    if (!selectedSite) { setSoilReadings([]); return; }
    try {
      const apiUrl = API_BASE;
      const token = getAuthHeaders().Authorization?.split(' ')[1];
      const res = await fetch(
        `${apiUrl}/soil-sensor/latest?siteId=${selectedSite}&date=${selectedDate}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const data = await res.json();
      if (data.success) setSoilReadings(data.data || []);
      else setSoilReadings([]);
    } catch { setSoilReadings([]); }
  };

  // Load weather data for all fields to display in cards
  const loadWeatherCards = async () => {
    if (!selectedSite || fieldsWithCoordinates.length === 0) {
      setWeatherCards([]);
      return;
    }

    setLoadingCards(true);
    loadSoilData();
    const cards = [];

    let siteEntries = [];
    try {
      const startStr = seasonFrom || (() => {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);
        return startDate.toISOString().split('T')[0];
      })();
      const endStr = seasonTo || new Date().toISOString().split('T')[0];
      siteEntries = await listWeatherLogsAll({
        site_id: selectedSite,
        start_date: startStr,
        end_date: endStr,
      });
    } catch (error) {
      siteEntries = [];
    }

    // Get latest entry for this site
    siteEntries.sort((a, b) => new Date(b.date) - new Date(a.date));

    // For each field with coordinates, try to get weather data
    for (const field of fieldsWithCoordinates) {
      // Try to find weather entry for this field
      let weatherData = null;

      // Check if there's a field-specific entry
      const fieldEntry = siteEntries.find((e) => e.fieldId === field.id);

      if (fieldEntry) {
        weatherData = {
          avgTemp: fieldEntry.avgTemp,
          feelsLike: fieldEntry.feelsLike,
          windSpeed: fieldEntry.windSpeed,
          windDirection: fieldEntry.windDirection,
          avgRH: fieldEntry.avgRH,
          clouds: fieldEntry.clouds,
          pressure: fieldEntry.pressure,
          date: fieldEntry.date,
          source: fieldEntry.source || 'manual',
        };
      } else if (apiStatus.configured) {
        // If no stored data and API is configured, fetch fresh data
        try {
          const freshWeather = await fetchCurrentWeather(field.latitude, field.longitude);
          weatherData = {
            avgTemp: freshWeather.avgTemp,
            feelsLike: freshWeather.feelsLike,
            windSpeed: freshWeather.windSpeed,
            windDirection: freshWeather.windDirection,
            avgRH: freshWeather.avgRH,
            clouds: freshWeather.clouds,
            pressure: freshWeather.pressure,
            date: freshWeather.date,
            source: 'openweathermap',
          };
          // Small delay to avoid rate limiting
          await new Promise((resolve) => setTimeout(resolve, 200));
        } catch (error) {
          console.error(`Error fetching weather for ${field.name}:`, error);
          // Continue with next field even if one fails
        }
      }

      cards.push({
        fieldName: field.name,
        latitude: field.latitude,
        longitude: field.longitude,
        weatherData,
      });
    }

    setWeatherCards(cards);
    setLoadingCards(false);
  };

  // Refresh all weather cards
  const handleRefreshAllCards = async () => {
    if (!apiStatus.configured) {
      notify.error('OpenWeatherMap API key not configured. Add it in Admin → API Keys → Weather Map API Key.');
      return;
    }

    setLoadingCards(true);
    const cards = [];

    for (const field of fieldsWithCoordinates) {
      try {
        const weather = await fetchCurrentWeather(field.latitude, field.longitude);
        cards.push({
          fieldName: field.name,
          latitude: field.latitude,
          longitude: field.longitude,
          weatherData: {
            avgTemp: weather.avgTemp,
            feelsLike: weather.feelsLike,
            windSpeed: weather.windSpeed,
            windDirection: weather.windDirection,
            avgRH: weather.avgRH,
            clouds: weather.clouds,
            pressure: weather.pressure,
            date: weather.date,
            source: 'openweathermap',
          },
        });
        // Rate limiting delay
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`Error fetching weather for ${field.name}:`, error);
        cards.push({
          fieldName: field.name,
          latitude: field.latitude,
          longitude: field.longitude,
          weatherData: null,
        });
      }
    }

    setWeatherCards(cards);
    setLoadingCards(false);
    notify.success(`Weather data refreshed for ${cards.length} field(s)`);
  };

  const checkExistingEntry = async () => {
    if (!selectedSite || !selectedDate) {
      setExistingEntry(null);
      return;
    }
    try {
      const { data } = await listWeatherLogs({
        site_id: selectedSite,
        start_date: selectedDate,
        end_date: selectedDate,
        page: 1,
        limit: 100,
      });
      const existing = data.find((entry) => !entry.fieldId);
      setExistingEntry(existing || null);
    } catch (error) {
      setExistingEntry(null);
    }
  };

  const handleAutoFetch = async () => {
    if (!selectedSite) {
      notify.warning('Please select a site first');
      return;
    }

    if (!apiStatus.configured) {
      notify.error('OpenWeatherMap API key not configured. Add it in Admin → API Keys → Weather Map API Key.');
      return;
    }

    setFetching(true);
    try {
      // Get the first field with coordinates for this site (or use site center)
      const field = fieldsWithCoordinates[0];
      
      if (!field) {
        // If no field has coordinates, try to get site-level weather
        // For now, show error - user needs to add coordinates to fields
        notify.warning('No fields with coordinates found for this site. Please add latitude/longitude to at least one field.');
        setFetching(false);
        return;
      }

      const weather = await fetchCurrentWeather(field.latitude, field.longitude);
      
      // Auto-fill the form with fetched data
      const setFieldValue = window._setFieldValue;
      if (setFieldValue) {
        setFieldValue('maxTemp', weather.maxTemp.toFixed(1));
        setFieldValue('minTemp', weather.minTemp.toFixed(1));
        setFieldValue('avgRH', weather.avgRH.toFixed(1));
        setFieldValue('rainfall', weather.rainfall.toFixed(1));
        setFieldValue('notes', `Auto-fetched from OpenWeatherMap for ${field.name} (${field.latitude}°N, ${field.longitude}°E). ${weather.description || ''}`);
      }

      notify.success(`Weather data fetched successfully for ${field.name} (${field.latitude}°N, ${field.longitude}°E)`);
    } catch (error) {
      notify.error(`Error fetching weather: ${error.message}`);
    } finally {
      setFetching(false);
    }
  };

  const handleAutoFetchAllFields = async () => {
    if (!canWrite) return;
    if (!selectedSite) {
      notify.warning('Please select a site first');
      return;
    }

    if (!apiStatus.configured) {
      notify.error('OpenWeatherMap API key not configured. Add it in Admin → API Keys → Weather Map API Key.');
      return;
    }

    setFetching(true);
    try {
      const weatherEntries = await autoFetchWeatherForFields(data, selectedSite);
      
      if (weatherEntries.length === 0) {
        notify.warning('No fields with coordinates found for this site');
        setFetching(false);
        return;
      }

      const { data: existingEntries } = await listWeatherLogs({
        site_id: selectedSite,
        start_date: selectedDate,
        end_date: selectedDate,
        page: 1,
        limit: 500,
      });
      const existingByField = new Map(
        existingEntries
          .filter((entry) => entry.fieldId)
          .map((entry) => [entry.fieldId, entry])
      );

      for (const entry of weatherEntries) {
        const payload = {
          date: entry.date,
          countryId: entry.countryId,
          siteId: entry.siteId,
          fieldId: entry.fieldId,
          latitude: entry.latitude,
          longitude: entry.longitude,
          maxTemp: entry.maxTemp,
          minTemp: entry.minTemp,
          avgTemp: entry.avgTemp,
          feelsLike: entry.feelsLike,
          avgRH: entry.avgRH,
          rainfall: entry.rainfall,
          pressure: entry.pressure,
          windSpeed: entry.windSpeed,
          windDirection: entry.windDirection,
          clouds: entry.clouds,
          description: entry.description,
          source: entry.source,
          notes: entry.notes,
        };
        const existing = existingByField.get(entry.fieldId);
        if (existing) {
          await updateWeatherLog(existing.id, payload);
        } else {
          await createWeatherLog(payload);
        }
      }

      notify.success(`Successfully fetched weather for ${weatherEntries.length} field(s)`);

      checkExistingEntry();
      loadWeatherCards();
    } catch (error) {
      notify.error(`Error fetching weather: ${error.message}`);
    } finally {
      setFetching(false);
    }
  };

  const handleSubmit = async (values, { resetForm }) => {
    if (!canWrite) return;
    const payload = {
      date: selectedDate,
      countryId: selectedCountry,
      siteId: selectedSite,
      maxTemp: parseFloat(values.maxTemp),
      minTemp: parseFloat(values.minTemp),
      avgTemp: (parseFloat(values.maxTemp) + parseFloat(values.minTemp)) / 2,
      avgRH: parseFloat(values.avgRH),
      rainfall: parseFloat(values.rainfall),
      notes: values.notes || '',
      source: existingEntry?.source || 'manual',
    };

    try {
      if (existingEntry) {
        await updateWeatherLog(existingEntry.id, payload);
        notify.success('Weather entry updated successfully!');
      } else {
        await createWeatherLog(payload);
        notify.success('Weather entry saved successfully!');
      }
      checkExistingEntry();
      resetForm({
        values: {
          maxTemp: '',
          minTemp: '',
          avgRH: '',
          rainfall: '',
          notes: '',
        },
      });
    } catch (error) {
      notify.error(`Error saving entry: ${error.message}`);
    }
  };

  const handleFetchForSelectedField = async (field) => {
    if (!apiStatus.configured) {
      notify.error('OpenWeatherMap API key not configured. Add it in Admin → API Keys → Weather Map API Key.');
      return;
    }

    setFetching(true);
    try {
      const weather = await fetchCurrentWeather(field.latitude, field.longitude);

      // Auto-fill form with fetched data
      const formValues = {
        maxTemp: weather.maxTemp.toFixed(1),
        minTemp: weather.minTemp.toFixed(1),
        avgRH: weather.avgRH.toFixed(1),
        rainfall: weather.rainfall.toFixed(1),
        notes: `Auto-fetched from OpenWeatherMap for ${field.name}. ${weather.description || ''}`,
      };

      // Update form values (we'll need to use Formik's setFieldValue)
      notify.success(`Weather data fetched for ${field.name}. Please review and save.`);

      // Store in a way that form can access
      window.autoFetchedWeather = formValues;
    } catch (error) {
      notify.error(`Error fetching weather: ${error.message}`);
    } finally {
      setFetching(false);
    }
  };

  const handleStationAutoFill = async (setFieldValue) => {
    if (!selectedSite) return;
    setLoadingStationFill(true);
    try {
      const apiUrl = API_BASE;
      const token = getAuthHeaders().Authorization?.split(' ')[1];
      const res = await fetch(
        `${apiUrl}/api-integrations/weather-autofill?siteId=${selectedSite}&date=${selectedDate}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const data = await res.json();
      if (data.success && data.data) {
        const d = data.data;
        if (d.max_temp != null) setFieldValue('maxTemp', Number(d.max_temp).toFixed(1));
        if (d.min_temp != null) setFieldValue('minTemp', Number(d.min_temp).toFixed(1));
        if (d.avg_rh != null) setFieldValue('avgRH', Number(d.avg_rh).toFixed(1));
        if (d.rainfall != null) setFieldValue('rainfall', Number(d.rainfall).toFixed(1));
        setFieldValue('notes', `Auto-filled from weather station: ${d.source || 'API integration'}${d.date !== selectedDate ? ` (data from ${d.date})` : ''}`);
        setStationAutoFill(d);
        notify.success('Form auto-filled from weather station data');
      } else {
        notify.info('No weather station data for this site/date. Use OpenWeather auto-fetch above, or configure a station in Admin → API Integrations.');
      }
    } catch (err) {
      notify.error('Failed to fetch weather station data');
    } finally {
      setLoadingStationFill(false);
    }
  };

  const initialValues = existingEntry
    ? {
        maxTemp: existingEntry.maxTemp,
        minTemp: existingEntry.minTemp,
        avgRH: existingEntry.avgRH,
        rainfall: existingEntry.rainfall,
        notes: existingEntry.notes || '',
      }
    : window.autoFetchedWeather || {
        maxTemp: '',
        minTemp: '',
        avgRH: '',
        rainfall: '',
        notes: '',
      };

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      {/* Weather Cards Display Section */}
      {selectedSite && fieldsWithCoordinates.length > 0 && (
        <Paper elevation={3} sx={{ p: 4, mb: 4 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 3, mb: 3 }}>
            <Typography variant="h5" sx={{ fontWeight: 600 }}>
              Current Weather by Field
            </Typography>
            {apiStatus.configured && (
              <Button
                variant="outlined"
                startIcon={loadingCards ? <CircularProgress size={16} /> : <Refresh />}
                onClick={handleRefreshAllCards}
                disabled={loadingCards}
              >
                {loadingCards ? 'Refreshing...' : 'Refresh All'}
              </Button>
            )}
          </Box>
          {loadingCards && weatherCards.length === 0 ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : (
            <Grid container spacing={3}>
              {weatherCards.map((card) => {
                const soilData = soilReadings.find((s) => s.field_name === card.fieldName) || null;
                return (
                  <Grid size={12} key={card.fieldName}>
                    <Grid container spacing={2}>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <WeatherCard
                          fieldName={card.fieldName}
                          latitude={card.latitude}
                          longitude={card.longitude}
                          weatherData={card.weatherData}
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <SoilCard
                          fieldName={card.fieldName}
                          soilData={soilData}
                        />
                      </Grid>
                    </Grid>
                  </Grid>
                );
              })}
            </Grid>
          )}
        </Paper>
      )}

      {/* Weather Entry Form Section */}
      <Paper elevation={3} sx={{ p: 4 }}>
        <Typography variant="h4" gutterBottom>
          Weather & Soil Data Entry
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Enter daily weather data for climate-contextual efficiency analysis. You can manually enter data or auto-fetch from OpenWeatherMap API using field coordinates.
        </Typography>

        {!canWrite && <ReadOnlyBanner />}

        {/* How It Works Explanation */}
        <Alert severity="info" sx={{ mb: 3 }}>
          <Typography variant="subtitle2" gutterBottom>
            <strong>How OpenWeatherMap Gets Exact Weather for Your Area:</strong>
          </Typography>
          <Typography variant="body2" component="div">
            <ul style={{ marginTop: 8, marginBottom: 8, paddingLeft: 20 }}>
              <li>
                <strong>GPS Coordinates = Exact Location:</strong> Each field's latitude/longitude (e.g., 24.45°N, 54.38°E) 
                is a specific point on Earth. The API uses these coordinates to fetch weather from the nearest weather station.
              </li>
              <li>
                <strong>Location-Specific Data:</strong> OpenWeatherMap has a global network of weather stations. 
                When you provide coordinates, it returns weather data for that exact location, accounting for local 
                microclimates, elevation, and proximity to water bodies.
              </li>
              <li>
                <strong>Accuracy:</strong> Temperature accuracy is typically ±1-2°C, which is excellent for agricultural 
                efficiency calculations. Each field gets its own weather data based on its unique coordinates.
              </li>
              <li>
                <strong>Setup:</strong> Add latitude/longitude to your fields in <strong>Master Data → Field Types & Names</strong>, 
                then add your OpenWeatherMap API key in <strong>Admin → API Keys → Weather Map API Key</strong>.
              </li>
            </ul>
          </Typography>
        </Alert>

        {/* API Status */}
        <Alert
          severity={apiStatus.configured ? 'success' : 'warning'}
          sx={{ mb: 3 }}
          icon={apiStatus.configured ? <CloudQueue /> : <CloudQueue />}
        >
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="body2">
              {apiStatus.message}
            </Typography>
            {apiStatus.configured && fieldsWithCoordinates.length > 0 && (
              <Chip
                label={`${fieldsWithCoordinates.length} field(s) with coordinates`}
                size="small"
                color="success"
              />
            )}
          </Box>
        </Alert>

        {existingEntry && (
          <Alert severity="info" sx={{ mb: 3 }}>
            An entry already exists for this site and date. Updating will replace the existing entry.
            {existingEntry.source === 'openweathermap' && (
              <Typography variant="caption" display="block" sx={{ mt: 1 }}>
                This entry was auto-fetched from OpenWeatherMap API.
              </Typography>
            )}
          </Alert>
        )}

        {fieldsWithCoordinates.length > 0 && selectedSite && (
          <Card variant="outlined" sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Fields with Coordinates ({fieldsWithCoordinates.length})
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                These fields have GPS coordinates and can fetch location-specific weather:
              </Typography>
              <List dense>
                {fieldsWithCoordinates.slice(0, 5).map((field) => (
                  <ListItem key={field.id || field.name}>
                    <ListItemIcon>
                      <LocationOn color="primary" />
                    </ListItemIcon>
                    <ListItemText
                      primary={field.name}
                      secondary={`${field.latitude}°N, ${field.longitude}°E • ${field.farmAreaName}`}
                    />
                    {apiStatus.configured && canWrite && (
                      <Button
                        size="small"
                        startIcon={<Refresh />}
                        onClick={() => handleFetchForSelectedField(field)}
                        disabled={fetching}
                      >
                        Fetch
                      </Button>
                    )}
                  </ListItem>
                ))}
                {fieldsWithCoordinates.length > 5 && (
                  <ListItem>
                    <ListItemText
                      primary={`... and ${fieldsWithCoordinates.length - 5} more field(s)`}
                      primaryTypographyProps={{ variant: 'caption', color: 'text.secondary' }}
                    />
                  </ListItem>
                )}
              </List>
            </CardContent>
          </Card>
        )}

        {/* Auto-fetch Section */}
        {apiStatus.configured && selectedSite && canWrite && (
          <Card variant="outlined" sx={{ mb: 3, bgcolor: 'action.hover' }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Auto-Fetch from OpenWeatherMap API
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Fetch current weather data automatically using field coordinates. The API provides location-specific weather based on the latitude/longitude you've set for each field.
              </Typography>
              {fieldsWithCoordinates.length > 0 ? (
                <Box>
                  <Typography variant="body2" sx={{ mb: 1, fontWeight: 600 }}>
                    Fields with coordinates in this site:
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
                    {fieldsWithCoordinates.map((field) => (
                      <Chip
                        key={field.id || field.name}
                        label={`${field.name}: ${field.latitude}°N, ${field.longitude}°E`}
                        size="small"
                        variant="outlined"
                      />
                    ))}
                  </Box>
                  <Box sx={{ display: 'flex', gap: 2 }}>
                    <Button
                      variant="outlined"
                      startIcon={fetching ? <CircularProgress size={16} /> : <CloudDownload />}
                      onClick={handleAutoFetch}
                      disabled={fetching || !selectedSite}
                    >
                      Fetch for First Field
                    </Button>
                    <Button
                      variant="outlined"
                      startIcon={fetching ? <CircularProgress size={16} /> : <CloudDownload />}
                      onClick={handleAutoFetchAllFields}
                      disabled={fetching || !selectedSite}
                    >
                      Fetch for All Fields ({fieldsWithCoordinates.length})
                    </Button>
                  </Box>
                </Box>
              ) : (
                <Alert severity="info">
                  No fields with coordinates for this site. GIS-linked fields get coordinates automatically on sync;
                  re-run GIS auto-link or add latitude/longitude in Field Types & Names.
                </Alert>
              )}
            </CardContent>
          </Card>
        )}

        <Divider sx={{ my: 3 }} />

        <Formik
          initialValues={initialValues}
          validationSchema={weatherSchema}
          onSubmit={handleSubmit}
          enableReinitialize
        >
          {({ values, errors, touched, handleChange, handleBlur, setFieldValue }) => {
            // Store setFieldValue in component scope for handleAutoFetch
            window._setFieldValue = setFieldValue;
            return (
            <Form>
              {/* Auto-fill from Weather Station Integration */}
              {selectedSite && canWrite && (
                <Alert
                  severity="info"
                  sx={{ mb: 3 }}
                  icon={<Sensors />}
                  action={
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={loadingStationFill ? <CircularProgress size={14} /> : <Sensors />}
                      onClick={() => handleStationAutoFill(setFieldValue)}
                      disabled={loadingStationFill}
                    >
                      {loadingStationFill ? 'Loading...' : 'Auto-fill from Station'}
                    </Button>
                  }
                >
                  If this site has a connected weather station (Admin → API Integrations), use this to auto-fill from hardware — not OpenWeatherMap.
                  {stationAutoFill && (
                    <Typography variant="caption" display="block" sx={{ mt: 0.5 }}>
                      Last filled from: <strong>{stationAutoFill.source}</strong> ({stationAutoFill.field_name})
                    </Typography>
                  )}
                </Alert>
              )}
              <Grid container spacing={3}>
                <Grid size={12}>
                  <TextField
                    fullWidth
                    type="date"
                    label="Date"
                    name="date"
                    value={selectedDate}
                    onChange={(e) => {
                      setSelectedDate(e.target.value);
                      checkExistingEntry();
                    }}
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>

                <Grid size={12}>
                  <TextField
                    fullWidth
                    select
                    label="Zone"
                    value={selectedCountry}
                    onChange={(e) => {
                      setSelectedCountry(e.target.value);
                      setSelectedSite('');
                    }}
                  >
                    {data.countries.map((country) => (
                      <MenuItem key={country.id} value={country.id}>
                        {country.name}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>

                <Grid size={12}>
                  <TextField
                    fullWidth
                    select
                    label="Site"
                    value={selectedSite}
                    onChange={(e) => {
                      setSelectedSite(e.target.value);
                      checkExistingEntry();
                    }}
                    disabled={!selectedCountry}
                  >
                    {selectedCountryData?.sites.map((site) => (
                      <MenuItem key={site.id} value={site.id}>
                        {site.name}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>

                <Grid size={12}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="h6" gutterBottom>
                        Temperature
                      </Typography>
                      <Grid container spacing={2}>
                        <Grid size={6}>
                          <TextField
                            fullWidth
                            type="number"
                            label="Max Temperature (°C)"
                            name="maxTemp"
                            value={values.maxTemp}
                            onChange={handleChange}
                            onBlur={handleBlur}
                            error={touched.maxTemp && !!errors.maxTemp}
                            helperText={touched.maxTemp && errors.maxTemp}
                            inputProps={{ step: 0.1 }}
                          />
                        </Grid>
                        <Grid size={6}>
                          <TextField
                            fullWidth
                            type="number"
                            label="Min Temperature (°C)"
                            name="minTemp"
                            value={values.minTemp}
                            onChange={handleChange}
                            onBlur={handleBlur}
                            error={touched.minTemp && !!errors.minTemp}
                            helperText={touched.minTemp && errors.minTemp}
                            inputProps={{ step: 0.1 }}
                          />
                        </Grid>
                        {values.maxTemp && values.minTemp && (
                          <Grid size={12}>
                            <Typography variant="body2" color="text.secondary">
                              Average Temperature: {((parseFloat(values.maxTemp) + parseFloat(values.minTemp)) / 2).toFixed(1)}°C
                            </Typography>
                          </Grid>
                        )}
                      </Grid>
                    </CardContent>
                  </Card>
                </Grid>

                <Grid size={12}>
                  <TextField
                    fullWidth
                    type="number"
                    label="Average Relative Humidity (%)"
                    name="avgRH"
                    value={values.avgRH}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    error={touched.avgRH && !!errors.avgRH}
                    helperText={touched.avgRH && errors.avgRH}
                    inputProps={{ min: 0, max: 100, step: 0.1 }}
                  />
                </Grid>

                <Grid size={12}>
                  <TextField
                    fullWidth
                    type="number"
                    label="Rainfall (mm)"
                    name="rainfall"
                    value={values.rainfall}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    error={touched.rainfall && !!errors.rainfall}
                    helperText={touched.rainfall && errors.rainfall}
                    inputProps={{ min: 0, step: 0.1 }}
                  />
                </Grid>

                <Grid size={12}>
                  <TextField
                    fullWidth
                    multiline
                    rows={3}
                    label="Notes"
                    name="notes"
                    value={values.notes}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    placeholder="e.g., 'windy', 'heat wave', 'cloudy day'"
                    helperText="Optional: Add any relevant weather observations"
                  />
                </Grid>

                <Grid size={12}>
                  <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                    <Button
                      type="submit"
                      variant="contained"
                      color="primary"
                      size="large"
                      disabled={!selectedSite || !canWrite}
                    >
                      {existingEntry ? 'Update Entry' : 'Save Entry'}
                    </Button>
                  </Box>
                </Grid>
              </Grid>
            </Form>
          );
          }}
        </Formik>
      </Paper>
    </Container>
  );
}

export default WeatherLogEntry;
