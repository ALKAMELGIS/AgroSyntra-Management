import { apiRequest } from '../../../utils/api';
import { API_BASE } from '../../../config/api';

/** Map tiles go through the server; the configuration ID never reaches the browser. */
export const WMS_URL = `${API_BASE}/satellite/wms`;

export const getStatus = () => apiRequest('/satellite/status');
export const getIndices = () => apiRequest('/satellite/indices');
export const getTileKey = () => apiRequest('/satellite/tile-key');
export const searchScenes = ({ bbox, from, to, maxcc }) =>
  apiRequest(`/satellite/scenes?bbox=${bbox.map((n) => n.toFixed(5)).join(',')}&from=${from}&to=${to}&maxcc=${maxcc}`);
export const getStats = (body) => apiRequest('/satellite/stats', { method: 'POST', body: JSON.stringify(body) });

export const getSettings = () => apiRequest('/settings/sentinelhub');
export const testSettings = (body) => apiRequest('/settings/sentinelhub/test', { method: 'POST', body: JSON.stringify(body) });
export const saveSettings = (body) => apiRequest('/settings/sentinelhub', { method: 'PUT', body: JSON.stringify(body) });
