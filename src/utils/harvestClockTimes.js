export function harvestClockTimesError(startTime, endTime) {
  const start = String(startTime || '').trim();
  const end = String(endTime || '').trim();
  if (!start || !end) return 'Start time and end time are required';
  if (end < start) return 'End time must be after start time';
  return null;
}
