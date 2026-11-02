import { fetchCurrentWeather, fetchWeatherApiStatus } from './weatherService';

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

export function getFieldCoordinates(field) {
  if (field.latitude && field.longitude) {
    return { latitude: Number(field.latitude), longitude: Number(field.longitude) };
  }
  return coordsFromPolygon(field.polygon);
}

export function getSiteFieldsWithCoordinates(masterData, siteId) {
  if (!siteId || !masterData?.countries) return [];
  const fields = [];
  for (const country of masterData.countries) {
    for (const site of country.sites || []) {
      if (site.id !== siteId) continue;
      for (const farmArea of site.farmAreas || []) {
        for (const field of farmArea.fields || []) {
          const coords = getFieldCoordinates(field);
          if (coords) {
            fields.push({ id: field.id, name: field.name, ...coords });
          }
        }
      }
    }
  }
  return fields;
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fetch live weather for all fields at a site that have coordinates.
 * @returns {Promise<Record<string, object>>} fieldId -> weather snapshot
 */
export async function fetchWeatherForSiteFields(masterData, siteId, { refresh = false } = {}) {
  const fields = getSiteFieldsWithCoordinates(masterData, siteId);
  if (fields.length === 0) return {};

  const apiStatus = await fetchWeatherApiStatus();
  if (!apiStatus.configured) return {};

  const weatherByFieldId = {};
  for (const field of fields) {
    try {
      const weather = await fetchCurrentWeather(field.latitude, field.longitude, { refresh });
      weatherByFieldId[field.id] = {
        avgTemp: weather.avgTemp,
        avgRH: weather.avgRH,
        windSpeed: weather.windSpeed,
        windDirection: weather.windDirection,
        clouds: weather.clouds,
        description: weather.description,
        fetchedAt: weather.fetchedAt || new Date().toISOString(),
      };
      await delay(200);
    } catch (err) {
      console.error(`Weather fetch failed for ${field.name}:`, err);
    }
  }
  return weatherByFieldId;
}

export function windDirectionLabel(degrees) {
  if (degrees == null || Number.isNaN(Number(degrees))) return '--';
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round(Number(degrees) / 22.5) % 16;
  return directions[index];
}
