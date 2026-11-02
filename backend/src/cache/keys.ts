export const cacheKeys = {
  weatherCurrent: (lat: number, lon: number) => `weather:current:${lat.toFixed(4)}:${lon.toFixed(4)}`,
  weatherForecast: (lat: number, lon: number) => `weather:forecast:${lat.toFixed(4)}:${lon.toFixed(4)}`,
  sentinelLayers: (instanceId: string) => `sentinelhub:layers:${instanceId}`,
  sentinelNdvi: (hash: string) => `sentinelhub:ndvi:${hash}`,
  weatherStationCurrent: (stationId: string) => `weatherstation:current:${stationId}`,
  weatherStationForecast: (stationId: string) => `weatherstation:forecast:${stationId}`,
  analyticsMonthlySummary: (scope: string) => `analytics:monthly:summary:${scope}`,
};
