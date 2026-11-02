import { formatDate, toIsoDate } from '../dashboardUtils';

describe('toIsoDate', () => {
  test('keeps YYYY-MM-DD and strips a time suffix', () => {
    expect(toIsoDate('2025-09-01')).toBe('2025-09-01');
    expect(toIsoDate('2025-09-01T00:00:00.000Z')).toBe('2025-09-01');
  });

  test('reads Date objects as UTC calendar days', () => {
    expect(toIsoDate(new Date(Date.UTC(2025, 8, 1)))).toBe('2025-09-01');
  });

  test('does not split Date.toString() on the T in GMT', () => {
    expect(toIsoDate('Mon Sep 01 2025 00:00:00 GMT+0000 (Coordinated Universal Time)')).toBe('2025-09-01');
  });
});

describe('formatDate', () => {
  test('formats ISO days as dd/Mon/yy', () => {
    expect(formatDate('2025-09-01')).toBe('01/Sep/25');
  });

  test('does not emit Invalid Date for Date.toString() values', () => {
    expect(formatDate('Mon Sep 01 2025 00:00:00 GMT+0000')).toBe('01/Sep/25');
  });

  test('passes through already formatted labels', () => {
    expect(formatDate('01/Sep/25')).toBe('01/Sep/25');
  });
});
