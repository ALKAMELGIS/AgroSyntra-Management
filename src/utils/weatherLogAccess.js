// Only these roles may add, change or delete weather logs; the backend
// (/weather-logs) enforces the same list. Every other role watches.
export const WEATHER_LOG_WRITER_ROLES = ['worker', 'operation_manager'];

export function canWriteWeatherLogs(role) {
  return WEATHER_LOG_WRITER_ROLES.includes(role);
}
