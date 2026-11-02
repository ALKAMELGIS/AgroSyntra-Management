// Weather Service via Backend API
import { API_BASE } from '../config/api';

const DEFAULT_API_STATUS = {
  configured: false,
  message: 'OpenWeatherMap API key not configured. Add it in Admin → API Keys → Weather Map API Key.',
};

/**
 * Fetch current weather for a location
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @returns {Promise<Object>} Weather data
 */
export const fetchCurrentWeather = async (lat, lon, { refresh = false } = {}) => {
  if (!lat || !lon) {
    throw new Error('Latitude and longitude are required');
  }

  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
  });
  if (refresh) params.set('refresh', '1');

  const response = await fetch(
    `${API_BASE}/weather/current?${params.toString()}`
  );
  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error?.message || 'Weather API error');
  }

  const payload = data.data;
  return {
    date: payload.date,
    maxTemp: payload.temperature?.max ?? payload.maxTemp,
    minTemp: payload.temperature?.min ?? payload.minTemp,
    avgTemp: payload.temperature?.avg ?? payload.avgTemp,
    feelsLike: payload.temperature?.feelsLike ?? payload.feelsLike,
    avgRH: payload.humidity ?? payload.avgRH,
    rainfall: payload.rainfall ?? 0,
    pressure: payload.pressure ?? 0,
    windSpeed: payload.windSpeed ?? 0,
    windDirection: payload.windDirection ?? 0,
    clouds: payload.clouds ?? 0,
    description: payload.description ?? '',
    icon: payload.icon ?? '',
    source: 'backend',
    fetchedAt: new Date().toISOString(),
  };
};

/**
 * Fetch historical weather data (requires One Call API 3.0 subscription)
 * For free tier, we can use current weather and store it daily
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @param {string} date - Date in YYYY-MM-DD format
 * @returns {Promise<Object>} Weather data
 */
export const fetchHistoricalWeather = async (lat, lon, _date) => {
  return fetchCurrentWeather(lat, lon);
};

/**
 * Fetch weather forecast (5-day, 3-hour intervals)
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @returns {Promise<Array>} Forecast data
 */
export const fetchWeatherForecast = async (lat, lon) => {
  const response = await fetch(
    `${API_BASE}/weather/forecast?lat=${lat}&lon=${lon}`
  );
  const data = await response.json();
  if (!data.success) {
    throw new Error(data.error?.message || 'Weather API error');
  }
  return data.data.map((day) => ({
    date: day.date,
    maxTemp: day.temperature?.max ?? day.maxTemp,
    minTemp: day.temperature?.min ?? day.minTemp,
    avgTemp: day.temperature?.avg ?? day.avgTemp,
    avgRH: day.humidity ?? day.avgRH,
    rainfall: day.rainfall ?? 0,
    avgPressure: day.pressure ?? day.avgPressure ?? 0,
    source: 'backend',
    forecast: true,
  }));
};

/**
 * Auto-fetch weather for all fields with coordinates
 * This can be called daily via a scheduled job or manual trigger
 * @param {Object} masterData - Master data containing fields
 * @param {string} siteId - Site ID to filter fields
 * @returns {Promise<Array>} Array of weather entries
 */
export const autoFetchWeatherForFields = async (masterData, siteId = null) => {
  const weatherEntries = [];
  const today = new Date().toISOString().split('T')[0];

  // Get all fields with coordinates
  for (const country of masterData.countries || []) {
    for (const site of country.sites || []) {
      if (siteId && site.id !== siteId) continue;

      for (const farmArea of site.farmAreas || []) {
        for (const field of farmArea.fields || []) {
          if (field.latitude && field.longitude) {
            try {
              const weather = await fetchCurrentWeather(field.latitude, field.longitude);
              
              weatherEntries.push({
                id: Date.now() + Math.random(),
                date: today,
                countryId: country.id,
                siteId: site.id,
                fieldId: field.id || field.name,
                latitude: field.latitude,
                longitude: field.longitude,
                maxTemp: weather.maxTemp,
                minTemp: weather.minTemp,
                avgTemp: weather.avgTemp,
                feelsLike: weather.feelsLike,
                avgRH: weather.avgRH,
                rainfall: weather.rainfall,
                pressure: weather.pressure,
                windSpeed: weather.windSpeed,
                windDirection: weather.windDirection,
                clouds: weather.clouds,
                description: weather.description,
                source: 'openweathermap',
                notes: `Auto-fetched from OpenWeatherMap for ${field.name}`,
                createdAt: Date.now(),
                updatedAt: Date.now(),
              });

              // Rate limiting: wait 1 second between API calls to avoid hitting free tier limits
              await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (error) {
              console.error(`Error fetching weather for field ${field.name}:`, error);
              // Continue with other fields even if one fails
            }
          }
        }
      }
    }
  }

  return weatherEntries;
};

/**
 * Check whether OpenWeather is configured on the backend
 */
export const fetchWeatherApiStatus = async () => {
  try {
    const response = await fetch(`${API_BASE}/weather/status`);
    const data = await response.json();
    if (data.success && data.data?.configured) {
      return {
        configured: true,
        message: 'OpenWeatherMap API configured — auto-fetch available',
      };
    }
    return DEFAULT_API_STATUS;
  } catch {
    return DEFAULT_API_STATUS;
  }
};

/**
 * Check if API key is configured (sync fallback — prefer fetchWeatherApiStatus)
 */
export const isWeatherAPIConfigured = () => false;

/**
 * Get API key status (sync fallback — prefer fetchWeatherApiStatus)
 */
export const getAPIKeyStatus = () => DEFAULT_API_STATUS;
