import { harvestClockTimesError } from '../harvestClockTimes';

describe('harvestClockTimesError', () => {
  it('requires start and end', () => {
    expect(harvestClockTimesError('', '10:00')).toBe('Start time and end time are required');
    expect(harvestClockTimesError('08:00', '')).toBe('Start time and end time are required');
    expect(harvestClockTimesError('', '')).toBe('Start time and end time are required');
  });

  it('rejects end before start', () => {
    expect(harvestClockTimesError('16:00', '15:00')).toBe('End time must be after start time');
  });

  it('accepts a valid window', () => {
    expect(harvestClockTimesError('08:00', '12:00')).toBeNull();
  });
});
