"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cacheKeys = void 0;
exports.cacheKeys = {
    weatherCurrent: (lat, lon) => `weather:current:${lat.toFixed(4)}:${lon.toFixed(4)}`,
    weatherForecast: (lat, lon) => `weather:forecast:${lat.toFixed(4)}:${lon.toFixed(4)}`,
    sentinelLayers: (instanceId) => `sentinelhub:layers:${instanceId}`,
    sentinelNdvi: (hash) => `sentinelhub:ndvi:${hash}`,
    weatherStationCurrent: (stationId) => `weatherstation:current:${stationId}`,
    weatherStationForecast: (stationId) => `weatherstation:forecast:${stationId}`,
    analyticsMonthlySummary: (scope) => `analytics:monthly:summary:${scope}`,
};
