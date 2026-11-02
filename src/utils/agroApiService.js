// Agro API Service — proxied through backend (OpenWeather key stored server-side)
import { apiRequest } from './api';
import { fetchCurrentWeather, fetchWeatherApiStatus } from './weatherService';

export const createAgroPolygon = async (name, coordinates, cropType = '') => {
  if (!coordinates || coordinates.length < 3) {
    throw new Error('Polygon must have at least 3 coordinates');
  }

  const geoJsonCoords = coordinates.map((coord) => [coord[1], coord[0]]);
  if (geoJsonCoords[0][0] !== geoJsonCoords[geoJsonCoords.length - 1][0]
      || geoJsonCoords[0][1] !== geoJsonCoords[geoJsonCoords.length - 1][1]) {
    geoJsonCoords.push(geoJsonCoords[0]);
  }

  const polygonData = {
    name,
    geo_json: {
      type: 'Polygon',
      coordinates: [geoJsonCoords],
    },
  };
  if (cropType) polygonData.crop_type = cropType;

  return apiRequest('/weather/agro/polygons', {
    method: 'POST',
    body: JSON.stringify(polygonData),
  });
};

export const getNDVIData = async (polygonId, startDate, endDate) => {
  if (!polygonId) {
    throw new Error('Polygon ID is required. Register polygon with Agro API first.');
  }
  return apiRequest(
    `/weather/agro/ndvi/history?polyid=${encodeURIComponent(polygonId)}&start=${encodeURIComponent(startDate)}&end=${encodeURIComponent(endDate)}`
  );
};

export const getSatelliteImagery = async (polygonId, date) => {
  if (!polygonId) {
    throw new Error('Polygon ID is required. Register polygon with Agro API first.');
  }
  return apiRequest(
    `/weather/agro/image/search?polyid=${encodeURIComponent(polygonId)}&date=${encodeURIComponent(date)}`
  );
};

export const getSoilHealthData = async (polygonId) => {
  if (!polygonId) return null;
  try {
    return await apiRequest(`/weather/agro/soil?polyid=${encodeURIComponent(polygonId)}`);
  } catch (error) {
    console.error('Error fetching soil health data:', error);
    return null;
  }
};

export const getRegisteredPolygons = async () => {
  return apiRequest('/weather/agro/polygons');
};

export const getHistoricalNDVI = async (polygonId, days = 30) => {
  if (!polygonId) throw new Error('Polygon ID is required');

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  return getNDVIData(
    polygonId,
    startDate.toISOString().split('T')[0],
    endDate.toISOString().split('T')[0]
  );
};

export const getComprehensiveFieldData = async (lat, lon, polygonId = null) => {
  const [weatherResult, soilResult, ndviResult] = await Promise.allSettled([
    fetchCurrentWeather(lat, lon),
    polygonId ? getSoilHealthData(polygonId) : Promise.resolve(null),
    polygonId ? getNDVIData(
      polygonId,
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      new Date().toISOString().split('T')[0]
    ).catch(() => null) : Promise.resolve(null),
  ]);

  return {
    weather: weatherResult.status === 'fulfilled' ? weatherResult.value : null,
    soil: soilResult.status === 'fulfilled' ? soilResult.value : null,
    ndvi: ndviResult.status === 'fulfilled' ? ndviResult.value : null,
  };
};

let cachedAgroAvailable = null;

export const isAgroAPIAvailable = async () => {
  if (cachedAgroAvailable != null) return cachedAgroAvailable;
  try {
    const status = await fetchWeatherApiStatus();
    cachedAgroAvailable = status.configured;
    return cachedAgroAvailable;
  } catch {
    cachedAgroAvailable = false;
    return false;
  }
};

export const clearAgroAvailabilityCache = () => {
  cachedAgroAvailable = null;
};
