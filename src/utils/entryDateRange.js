import { intersectDateRange } from './seasonListDates';

export const DATE_PRESETS = [
  { id: 'season', label: 'This season' },
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This week' },
  { id: 'month', label: 'This month' },
  { id: '90days', label: 'Last 90 days' },
  { id: 'all', label: 'All time' },
];

function toISO(d) {
  return d.toISOString().split('T')[0];
}

export function getDateRangeForPreset(preset, seasonRange = {}) {
  const today = new Date();
  const todayStr = toISO(today);
  const bounds = {
    startDate: seasonRange.startDate || seasonRange.start_date || '',
    endDate: seasonRange.endDate || seasonRange.end_date || '',
  };

  let raw;
  switch (preset) {
    case 'season':
      raw = { startDate: bounds.startDate, endDate: bounds.endDate };
      break;
    case 'today':
      raw = { startDate: todayStr, endDate: todayStr };
      break;
    case 'week': {
      const day = today.getDay();
      const diff = today.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(today);
      monday.setDate(diff);
      raw = { startDate: toISO(monday), endDate: todayStr };
      break;
    }
    case 'month': {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      raw = { startDate: toISO(first), endDate: todayStr };
      break;
    }
    case '90days': {
      const d = new Date(today);
      d.setDate(d.getDate() - 90);
      raw = { startDate: toISO(d), endDate: todayStr };
      break;
    }
    case 'all':
      raw = { startDate: bounds.startDate, endDate: bounds.endDate };
      break;
    default:
      raw = { startDate: bounds.startDate, endDate: bounds.endDate };
      break;
  }

  const clipped = (preset === 'season' || preset === 'all' || !bounds.startDate)
    ? raw
    : intersectDateRange(raw, bounds);
  return {
    ...(clipped.startDate ? { start_date: clipped.startDate } : {}),
    ...(clipped.endDate ? { end_date: clipped.endDate } : {}),
  };
}
