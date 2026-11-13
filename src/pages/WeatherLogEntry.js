import { useState, useEffect, useMemo, useRef } from 'react';
import FormikSubmitFeedback from '../components/FormikSubmitFeedback';
import { API_BASE, getAuthHeaders } from '../config/api';
import { useActiveSite } from '../contexts/ActiveSiteContext';
import { useActiveSeason } from '../contexts/ActiveSeasonContext';
import { useAuth } from '../contexts/AuthContext';
import ReadOnlyBanner from '../components/ReadOnlyBanner';
import useSeasonListDates from '../hooks/useSeasonListDates';
import {
  Container,
  Typography,
  TextField,
  Button,
  MenuItem,
  Box,
  CircularProgress,
  Chip,
  Divider,
  Tooltip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import { useNotification } from '../contexts/NotificationContext';
import {
  CloudDownloadOutlined as CloudDownload,
  CloudQueueOutlined as CloudQueue,
  LocationOnOutlined as LocationOn,
  RefreshOutlined as Refresh,
  SensorsOutlined as Sensors,
  ExpandMoreOutlined as ExpandMore,
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
import InfoNote from '../components/InfoNote';
import PageTitle from '../components/PageTitle';
import { FormSection, FormStack, FormGrid, FormActions, GroupLabel, HintLabel, calcFieldSx, span } from '../components/form/FormLayout';

// Date and site are chosen above the form (component state, not Formik values),
// so they are checked in handleSubmit. Listing them here made every save fail
// with "Date is required".
const weatherSchema = Yup.object().shape({
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
    if (!selectedSite) { notify.warning('Select a site first'); return; }
    if (!selectedDate) { notify.warning('Date is required'); return; }
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

  const avgTemp = (v) => (v.maxTemp !== '' && v.minTemp !== '' && v.maxTemp != null && v.minTemp != null
    ? ((parseFloat(v.maxTemp) + parseFloat(v.minTemp)) / 2).toFixed(1)
    : '');

  return (
    <Container maxWidth="xl">
      <PageTitle help="Enter daily weather data for climate-contextual efficiency analysis. You can manually enter data or auto-fetch from OpenWeatherMap API using field coordinates." sx={{ mb: 3 }}>
        Weather & Soil Data Entry
      </PageTitle>

      {!canWrite && <ReadOnlyBanner />}

      {existingEntry && (
        <InfoNote mode="line" severity="info" sx={{ mb: 3 }}>
          An entry already exists for this site and date. Updating will replace the existing entry.
          {existingEntry.source === 'openweathermap' && ' This entry was auto-fetched from OpenWeatherMap.'}
        </InfoNote>
      )}

      <FormStack>
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
              <FormikSubmitFeedback />
              <FormSection
                title="Daily weather"
                action={selectedSite && canWrite ? (
                  <Tooltip title="Fill from a connected weather station (Admin → API Integrations), not OpenWeatherMap" arrow>
                    <span>
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={loadingStationFill ? <CircularProgress size={14} /> : <Sensors />}
                        onClick={() => handleStationAutoFill(setFieldValue)}
                        disabled={loadingStationFill}
                      >
                        {loadingStationFill ? 'Loading…' : 'Auto-fill from station'}
                      </Button>
                    </span>
                  </Tooltip>
                ) : null}
              >
                {stationAutoFill && (
                  <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: -1, mb: 3 }}>
                    Last filled from <strong>{stationAutoFill.source}</strong> ({stationAutoFill.field_name})
                  </Typography>
                )}
                <FormGrid columns={{ xs: 2, md: 4 }}>
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
                    sx={span(2)}
                  >
                    {selectedCountryData?.sites.map((site) => (
                      <MenuItem key={site.id} value={site.id}>
                        {site.name}
                      </MenuItem>
                    ))}
                  </TextField>

                  <GroupLabel>Conditions</GroupLabel>
                  <TextField
                    fullWidth
                    type="number"
                    label="Max °C"
                    name="maxTemp"
                    value={values.maxTemp}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    error={touched.maxTemp && !!errors.maxTemp}
                    helperText={touched.maxTemp && errors.maxTemp}
                    inputProps={{ step: 0.1, inputMode: 'decimal', 'aria-label': 'Max temperature (°C)' }}
                  />
                  <TextField
                    fullWidth
                    type="number"
                    label="Min °C"
                    name="minTemp"
                    value={values.minTemp}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    error={touched.minTemp && !!errors.minTemp}
                    helperText={touched.minTemp && errors.minTemp}
                    inputProps={{ step: 0.1, inputMode: 'decimal', 'aria-label': 'Min temperature (°C)' }}
                  />
                  <TextField
                    fullWidth
                    label={<HintLabel hint="(Max + Min) ÷ 2">Avg °C</HintLabel>}
                    value={avgTemp(values)}
                    InputLabelProps={{ shrink: true }}
                    InputProps={{ readOnly: true }}
                    sx={calcFieldSx}
                  />
                  <TextField
                    fullWidth
                    type="number"
                    label="Avg RH (%)"
                    name="avgRH"
                    value={values.avgRH}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    error={touched.avgRH && !!errors.avgRH}
                    helperText={touched.avgRH && errors.avgRH}
                    inputProps={{ min: 0, max: 100, step: 0.1, inputMode: 'decimal', 'aria-label': 'Average relative humidity (%)' }}
                  />
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
                    inputProps={{ min: 0, step: 0.1, inputMode: 'decimal' }}
                  />
                  <TextField
                    fullWidth
                    multiline
                    minRows={1}
                    maxRows={4}
                    label="Notes"
                    name="notes"
                    value={values.notes}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    placeholder="Windy, heat wave, cloudy…"
                    sx={span({ xs: 2, md: 3 })}
                  />
                </FormGrid>
                <Divider sx={{ my: 3 }} />
                <FormActions>
                  <Button
                    type="submit"
                    variant="contained"
                    color="primary"
                    disabled={!selectedSite || !canWrite}
                  >
                    {existingEntry ? 'Update entry' : 'Save entry'}
                  </Button>
                </FormActions>
              </FormSection>
            </Form>
          );
          }}
        </Formik>

        <FormSection
          title="OpenWeatherMap"
          action={(
            <Chip
              size="small"
              variant="outlined"
              color={apiStatus.configured ? 'success' : 'warning'}
              icon={<CloudQueue />}
              label={apiStatus.configured ? 'Connected' : 'Not set up'}
            />
          )}
        >
          <Typography variant="body2" color="text.secondary">{apiStatus.message}</Typography>
          {selectedSite && fieldsWithCoordinates.length > 0 && (
            <Box sx={{ mt: 3, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(3, minmax(0, 1fr))' }, gap: 2 }}>
              {fieldsWithCoordinates.map((field) => (
                <Box
                  key={field.id || field.name}
                  sx={{ display: 'flex', alignItems: 'center', gap: 2, px: 3, py: 1.5, border: 1, borderColor: 'divider', borderRadius: 2, minWidth: 0 }}
                >
                  <LocationOn sx={{ fontSize: 18, color: 'text.secondary' }} />
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography variant="body2" noWrap sx={{ fontWeight: 500 }}>{field.name}</Typography>
                    <Typography variant="caption" color="text.secondary" noWrap component="div" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                      {field.latitude}°N, {field.longitude}°E{field.farmAreaName ? ` · ${field.farmAreaName}` : ''}
                    </Typography>
                  </Box>
                  {apiStatus.configured && canWrite && (
                    <Button size="small" startIcon={<Refresh />} onClick={() => handleFetchForSelectedField(field)} disabled={fetching}>
                      Fetch
                    </Button>
                  )}
                </Box>
              ))}
            </Box>
          )}
          {selectedSite && fieldsWithCoordinates.length === 0 && (
            <InfoNote mode="line" severity="info" sx={{ mt: 3 }}>
              No fields with coordinates for this site. GIS-linked fields get coordinates automatically on sync;
              re-run GIS auto-link or add latitude/longitude in Field Types & Names.
            </InfoNote>
          )}
          {apiStatus.configured && selectedSite && canWrite && fieldsWithCoordinates.length > 0 && (
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mt: 3 }}>
              <Button
                variant="outlined"
                size="small"
                startIcon={fetching ? <CircularProgress size={14} /> : <CloudDownload />}
                onClick={handleAutoFetch}
                disabled={fetching || !selectedSite}
              >
                Fetch for first field
              </Button>
              <Button
                variant="outlined"
                size="small"
                startIcon={fetching ? <CircularProgress size={14} /> : <CloudDownload />}
                onClick={handleAutoFetchAllFields}
                disabled={fetching || !selectedSite}
              >
                Fetch for all fields ({fieldsWithCoordinates.length})
              </Button>
            </Box>
          )}
          <Accordion sx={{ mt: 3 }}>
            <AccordionSummary expandIcon={<ExpandMore />} sx={{ minHeight: 40, '& .MuiAccordionSummary-content': { my: 2 } }}>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>How location-specific weather works</Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0 }}>
              <Typography variant="body2" component="div" color="text.secondary">
                <ul style={{ margin: 0, paddingInlineStart: 20 }}>
                  <li>
                    <strong>GPS coordinates = exact location.</strong> Each field's latitude/longitude (e.g., 24.45°N, 54.38°E)
                    is a specific point on Earth; the API fetches weather from the nearest station.
                  </li>
                  <li>
                    <strong>Location-specific data.</strong> OpenWeatherMap returns data for that exact location, accounting for local
                    microclimates, elevation and proximity to water.
                  </li>
                  <li>
                    <strong>Accuracy.</strong> Temperature is typically within ±1–2 °C, enough for efficiency calculations.
                  </li>
                  <li>
                    <strong>Setup.</strong> Add latitude/longitude in <strong>Master Data → Field Types & Names</strong>,
                    then add the key in <strong>Admin → API Keys → Weather Map API Key</strong>.
                  </li>
                </ul>
              </Typography>
            </AccordionDetails>
          </Accordion>
        </FormSection>

        {selectedSite && fieldsWithCoordinates.length > 0 && (
          <FormSection
            title="Current weather by field"
            action={apiStatus.configured ? (
              <Button
                size="small"
                variant="outlined"
                startIcon={loadingCards ? <CircularProgress size={14} /> : <Refresh />}
                onClick={handleRefreshAllCards}
                disabled={loadingCards}
              >
                {loadingCards ? 'Refreshing…' : 'Refresh all'}
              </Button>
            ) : null}
          >
            {loadingCards && weatherCards.length === 0 ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                <CircularProgress size={28} />
              </Box>
            ) : (
              <Box sx={{ display: 'grid', gap: { xs: 3, md: 4 }, gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' } }}>
                {weatherCards.map((card) => {
                  const soilData = soilReadings.find((s) => s.field_name === card.fieldName) || null;
                  return [
                    <WeatherCard
                      key={`w-${card.fieldName}`}
                      fieldName={card.fieldName}
                      latitude={card.latitude}
                      longitude={card.longitude}
                      weatherData={card.weatherData}
                    />,
                    <SoilCard key={`s-${card.fieldName}`} fieldName={card.fieldName} soilData={soilData} />,
                  ];
                })}
              </Box>
            )}
          </FormSection>
        )}
      </FormStack>
    </Container>
  );
}

export default WeatherLogEntry;
