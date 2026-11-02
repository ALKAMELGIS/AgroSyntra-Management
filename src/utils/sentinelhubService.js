// SentinelHub Service for WMS and Process API Integration
// This service handles satellite imagery and remote sensing data

import { API_BASE } from '../config/api';

const SENTINELHUB_INSTANCE_ID = process.env.REACT_APP_SENTINELHUB_INSTANCE_ID || '';
const SENTINELHUB_WMS_URL = process.env.REACT_APP_SENTINELHUB_WMS_URL || '';

const SENTINELHUB_PROCESS_API_URL = 'https://services.sentinel-hub.com/api/v1/process';

// WMS base URL (will be constructed from instance ID)
export const getWMSBaseURL = () => {
  if (SENTINELHUB_WMS_URL) {
    return SENTINELHUB_WMS_URL;
  }
  if (SENTINELHUB_INSTANCE_ID) {
    return `https://services.sentinel-hub.com/ogc/wms/${SENTINELHUB_INSTANCE_ID}`;
  }
  return null;
};

/**
 * Get OAuth2 access token for Process API via backend proxy
 * (secrets stay on the server, never exposed to the browser)
 * @returns {Promise<string>} Access token
 */
export const getAccessToken = async () => {
  try {
    const token = localStorage.getItem('almaha_access_token');
    const response = await fetch(`${API_BASE}/satellite/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    if (!response.ok) {
      throw new Error(`OAuth authentication failed: ${response.statusText}`);
    }

    const json = await response.json();
    return json.data.access_token;
  } catch (error) {
    console.error('Error getting access token:', error);
    throw error;
  }
};

/**
 * Generate WMS URL for Sentinel-2 imagery
 * @param {Object} params - Parameters for WMS request
 * @param {Array<number>} params.bbox - Bounding box [minX, minY, maxX, maxY]
 * @param {number} params.width - Image width in pixels
 * @param {number} params.height - Image height in pixels
 * @param {string} params.layer - Layer name (e.g., 'TRUE_COLOR', 'NDVI')
 * @param {string} params.time - Time range (ISO 8601 format)
 * @param {number} params.maxcc - Maximum cloud coverage (0-1)
 * @returns {string} WMS URL
 */
export const getWMSUrl = (params) => {
  const wmsBaseUrl = getWMSBaseURL();
  if (!wmsBaseUrl) {
    throw new Error('SentinelHub WMS URL or Instance ID not configured');
  }

  const {
    bbox,
    width = 512,
    height = 512,
    layer = 'TRUE_COLOR',
    time = '2020-01-01/2024-12-31',
    maxcc = 0.3,
  } = params;

  if (!bbox || bbox.length !== 4) {
    throw new Error('Bounding box is required and must have 4 values [minX, minY, maxX, maxY]');
  }

  const [minX, minY, maxX, maxY] = bbox;
  const url = new URL(wmsBaseUrl);
  
  url.searchParams.set('SERVICE', 'WMS');
  url.searchParams.set('REQUEST', 'GetMap');
  url.searchParams.set('VERSION', '1.3.0');
  url.searchParams.set('LAYERS', layer);
  url.searchParams.set('BBOX', `${minX},${minY},${maxX},${maxY}`);
  url.searchParams.set('CRS', 'EPSG:3857');
  url.searchParams.set('WIDTH', width.toString());
  url.searchParams.set('HEIGHT', height.toString());
  url.searchParams.set('FORMAT', 'image/png');
  url.searchParams.set('TIME', time);
  url.searchParams.set('MAXCC', maxcc.toString());

  return url.toString();
};

/**
 * Generate Process API request for custom indices
 * @param {Object} params - Parameters for Process API
 * @param {Array<Array<number>>} params.geometry - GeoJSON geometry coordinates
 * @param {string} params.evalscript - EVALSCRIPT for custom processing
 * @param {string} params.dataSource - Data source (e.g., 'SENTINEL_2_L2A')
 * @param {string} params.timeRange - Time range (ISO 8601 format)
 * @param {number} params.maxcc - Maximum cloud coverage (0-1)
 * @returns {Promise<Object>} Processed data
 */
export const processCustomIndex = async (params) => {
  const {
    geometry,
    evalscript,
    dataSource = 'SENTINEL_2_L2A',
    timeRange = { from: '2020-01-01T00:00:00Z', to: '2024-12-31T23:59:59Z' },
    maxcc = 0.3,
  } = params;

  if (!evalscript) {
    throw new Error('EVALSCRIPT is required for custom processing');
  }

  if (!geometry) {
    throw new Error('Geometry is required');
  }

  try {
    const accessToken = await getAccessToken();
    
    const requestBody = {
      input: {
        bounds: {
          bbox: geometry,
          properties: {
            crs: 'http://www.opengis.net/def/crs/EPSG/0/4326',
          },
        },
        data: [
          {
            type: dataSource,
            dataFilter: {
              timeRange: timeRange,
              maxCloudCoverage: maxcc,
            },
          },
        ],
      },
      output: {
        width: 512,
        height: 512,
        responses: [
          {
            identifier: 'default',
            format: {
              type: 'image/png',
            },
          },
        ],
      },
      evalscript: evalscript,
    };

    const response = await fetch(SENTINELHUB_PROCESS_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Process API error: ${response.status} - ${errorText}`);
    }

    const blob = await response.blob();
    return {
      imageUrl: URL.createObjectURL(blob),
      blob: blob,
    };
  } catch (error) {
    console.error('Error processing custom index:', error);
    throw error;
  }
};

/**
 * Get NDVI using Process API
 * @param {Array<Array<number>>} geometry - GeoJSON geometry coordinates
 * @param {string} timeRange - Time range (ISO 8601 format)
 * @returns {Promise<Object>} NDVI data with image
 */
export const getNDVI = async (geometry, timeRange = null) => {
  const ndviEvalscript = `
    //VERSION=3
    function setup() {
      return {
        input: ["B04", "B08"],
        output: { bands: 1 }
      };
    }
    function evaluatePixel(samples) {
      let ndvi = (samples.B08 - samples.B04) / (samples.B08 + samples.B04);
      return [ndvi];
    }
  `;

  const defaultTimeRange = {
    from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    to: new Date().toISOString(),
  };

  return processCustomIndex({
    geometry,
    evalscript: ndviEvalscript,
    timeRange: timeRange || defaultTimeRange,
  });
};

/**
 * Get multiple vegetation indices
 * @param {Array<Array<number>>} geometry - GeoJSON geometry coordinates
 * @param {string} timeRange - Time range (ISO 8601 format)
 * @returns {Promise<Object>} Object with multiple indices
 */
export const getVegetationIndices = async (geometry, timeRange = null) => {
  const indicesEvalscript = `
    //VERSION=3
    function setup() {
      return {
        input: ["B02", "B03", "B04", "B08", "B11", "B12"],
        output: { bands: 6 }
      };
    }
    function evaluatePixel(samples) {
      // NDVI
      let ndvi = (samples.B08 - samples.B04) / (samples.B08 + samples.B04);
      
      // NDMI (Normalized Difference Moisture Index)
      let ndmi = (samples.B08 - samples.B11) / (samples.B08 + samples.B11);
      
      // NDRE (Normalized Difference Red Edge)
      let ndre = (samples.B08 - samples.B05) / (samples.B08 + samples.B05);
      
      // MSAVI (Modified Soil-Adjusted Vegetation Index)
      let msavi = (2 * samples.B08 + 1 - Math.sqrt(Math.pow(2 * samples.B08 + 1, 2) - 8 * (samples.B08 - samples.B04))) / 2;
      
      // RECI (Red Edge Chlorophyll Index)
      let reci = (samples.B08 / samples.B05) - 1;
      
      // NDWI (Normalized Difference Water Index)
      let ndwi = (samples.B03 - samples.B08) / (samples.B03 + samples.B08);
      
      return [ndvi, ndmi, ndre, msavi, reci, ndwi];
    }
  `;

  const defaultTimeRange = {
    from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    to: new Date().toISOString(),
  };

  return processCustomIndex({
    geometry,
    evalscript: indicesEvalscript,
    timeRange: timeRange || defaultTimeRange,
  });
};

/**
 * Generate time-series date steps between two dates.
 * Interval auto-adjusts based on date range length to keep ~15-25 snapshots.
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @param {number} [intervalDays] - Optional override for interval in days
 * @returns {Array<{date: string, timeParam: string}>} Date steps with WMS TIME parameters
 */
export const generateTimeSeriesDates = (startDate, endDate, intervalDays = null) => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const rangeDays = Math.round((end - start) / (1000 * 60 * 60 * 24));

  if (rangeDays <= 0) return [];

  // Auto-interval: aim for ~15-25 snapshots depending on range
  const interval = intervalDays || (
    rangeDays <= 30 ? 3 :
    rangeDays <= 90 ? 5 :
    rangeDays <= 180 ? 10 : 15
  );

  const steps = [];
  const current = new Date(start);

  while (current <= end) {
    const dateStr = current.toISOString().split('T')[0];
    // Use a 5-day window before the date to catch nearest Sentinel-2 pass
    const windowStart = new Date(current);
    windowStart.setDate(windowStart.getDate() - 5);
    const windowStartStr = windowStart.toISOString().split('T')[0];

    steps.push({
      date: dateStr,
      timeParam: `${windowStartStr}/${dateStr}`,
    });

    current.setDate(current.getDate() + interval);
  }

  // Always include the end date if not already the last step
  const endStr = end.toISOString().split('T')[0];
  if (steps.length > 0 && steps[steps.length - 1].date !== endStr) {
    const windowStart = new Date(end);
    windowStart.setDate(windowStart.getDate() - 5);
    steps.push({
      date: endStr,
      timeParam: `${windowStart.toISOString().split('T')[0]}/${endStr}`,
    });
  }

  return steps;
};

/**
 * Get time series data for a field.
 * Returns date steps that can be used to browse WMS imagery over time.
 * @param {Array<Array<number>>} geometry - Polygon coordinates [[lat, lng], ...]
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @param {string} [index] - Layer/index name (default: 'NDVI')
 * @returns {Array<{date: string, timeParam: string}>} Time series date steps
 */
export const getTimeSeries = (geometry, startDate, endDate, index = 'NDVI') => {
  return generateTimeSeriesDates(startDate, endDate);
};

/**
 * Check if SentinelHub is configured
 * @returns {Object} Configuration status
 */
export const isSentinelHubConfigured = () => {
  const hasWMS = !!(SENTINELHUB_WMS_URL || SENTINELHUB_INSTANCE_ID);
  return {
    configured: hasWMS,
    hasWMS,
    hasOAuth: hasWMS,
    hasProcessAPI: hasWMS,
    message: hasWMS
      ? 'SentinelHub configured'
      : 'SentinelHub not configured. Please set REACT_APP_SENTINELHUB_INSTANCE_ID or REACT_APP_SENTINELHUB_WMS_URL in your .env file. OAuth credentials are managed on the backend.',
  };
};

/**
 * Fallback layer list when GetCapabilities is not available
 */
export const getAvailableLayers = () => {
  return [
    { id: 'TRUE_COLOR', name: 'True Color', description: 'Natural color satellite imagery (RGB)' },
    { id: 'FALSE_COLOR', name: 'False Color', description: 'False color composite (NIR, Red, Green)' },
    { id: 'NDVI', name: 'NDVI', description: 'Normalized Difference Vegetation Index' },
    { id: '3_NDVI', name: 'NDVI (3_NDVI)', description: 'Normalized Difference Vegetation Index (layer id 3_NDVI)' },
    { id: 'NDMI', name: 'NDMI', description: 'Normalized Difference Moisture Index' },
    { id: 'EVI', name: 'EVI', description: 'Enhanced Vegetation Index' },
    { id: 'NDRE', name: 'NDRE', description: 'Normalized Difference Red Edge' },
    { id: 'MSAVI', name: 'MSAVI', description: 'Modified Soil-Adjusted Vegetation Index' },
    { id: 'RECI', name: 'RECI', description: 'Red Edge Chlorophyll Index' },
    { id: 'NDWI', name: 'NDWI', description: 'Normalized Difference Water Index' },
  ];
};

/**
 * Fetch WMS GetCapabilities and return layer names from the instance.
 * Use this so the dropdown only shows layers that exist in your Sentinel Hub config.
 * @returns {Promise<Array<{ id: string, name: string }>>} Layers from instance, or [] on failure
 */
export const getWMSLayersFromCapabilities = async () => {
  const baseUrl = getWMSBaseURL();
  if (!baseUrl) return [];
  const url = `${baseUrl}?REQUEST=GetCapabilities&SERVICE=WMS&VERSION=1.3.0`;
  try {
    const res = await fetch(url);
    const xml = await res.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'text/xml');
    const names = doc.getElementsByTagName('Name');
    const seen = new Set();
    const layers = [];
    for (let i = 0; i < names.length; i++) {
      const name = (names[i].textContent || '').trim();
      if (name && !seen.has(name)) {
        seen.add(name);
        layers.push({ id: name, name: name });
      }
    }
    return layers;
  } catch (e) {
    return [];
  }
};
