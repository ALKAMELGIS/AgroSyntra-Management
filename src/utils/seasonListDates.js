/** Farm calendar day in Asia/Dubai (not the browser or Railway local zone). */
export function farmTodayYmd(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dubai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const lookup = (type) => parts.find((part) => part.type === type)?.value || '';
  return `${lookup('year')}-${lookup('month')}-${lookup('day')}`;
}
export function toSeasonYmd(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : '';
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, '0');
    const d = String(value.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return '';
}

/** Inclusive list window for the sidebar season. */
export function seasonListDateRange(season) {
  if (!season) return { startDate: '', endDate: '' };
  const startDate = toSeasonYmd(season.start_date ?? season.startDate);
  const endDate = toSeasonYmd(season.end_date ?? season.endDate)
    || toSeasonYmd(season.planned_end_date ?? season.plannedEndDate);
  return { startDate, endDate };
}

export function clampDateToSeason(value, startDate, endDate) {
  if (!value) return value || '';
  if (startDate && value < startDate) return startDate;
  if (endDate && value > endDate) return endDate;
  return value;
}

/** Ended with End Season (auditor lock). Historical years are closed with no closer. */
export function isEndedSeason(season) {
  if (!season) return false;
  if (season.status === 'open') return false;
  if (season.status === 'reopen_pending') return true;
  return Boolean(season.closed_by ?? season.closedBy);
}

/** Ended, reopen-pending, or Historical that an auditor has not unlocked. */
export function isSeasonLocked(season) {
  if (!season) return false;
  if (season.status === 'open') return false;
  if (season.status === 'reopen_pending') return true;
  if (season.status !== 'closed') return false;
  if (season.closed_by ?? season.closedBy) return true;
  return !(season.reopened_at ?? season.reopenedAt);
}

export function pickDefaultSeasonId(seasons, preferredId) {
  const list = seasons || [];
  if (preferredId && list.some((row) => row.id === preferredId)) {
    return preferredId;
  }
  const open = list.find((row) => row.status === 'open');
  if (open) return open.id;
  return list[0]?.id || '';
}

export function csvEscape(value) {
  const text = String(value ?? '');
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function seasonsToCsv(seasons) {
  const header = 'name,start_date,planned_end_date,end_date,status';
  const lines = (seasons || []).map((season) => [
    csvEscape(season.name || ''),
    csvEscape(toSeasonYmd(season.start_date ?? season.startDate)),
    csvEscape(toSeasonYmd(season.planned_end_date ?? season.plannedEndDate)),
    csvEscape(toSeasonYmd(season.end_date ?? season.endDate)),
    csvEscape(season.status || ''),
  ].join(','));
  return [header, ...lines].join('\n');
}

/** First unused farm year before the current Sep–Jul window. */
export function unusedPastSeasonWindow(existing = [], today = new Date()) {
  const taken = new Set((existing || []).map((season) => season.name));
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth() + 1;
  let startYear = (month >= 8 ? year : year - 1) - 1;
  for (let i = 0; i < 30; i += 1) {
    const name = `${startYear}-${startYear + 1}`;
    if (!taken.has(name)) {
      return {
        name,
        startDate: `${startYear}-09-01`,
        plannedEndDate: `${startYear + 1}-07-31`,
      };
    }
    startYear -= 1;
  }
  return {
    name: `${startYear}-${startYear + 1}`,
    startDate: `${startYear}-09-01`,
    plannedEndDate: `${startYear + 1}-07-31`,
  };
}

export function intersectDateRange(range, bounds) {
  const startCandidates = [range.startDate, bounds.startDate].filter(Boolean);
  const endCandidates = [range.endDate, bounds.endDate].filter(Boolean);
  const startDate = startCandidates.length ? startCandidates.sort().pop() : '';
  const endDate = endCandidates.length ? endCandidates.sort()[0] : '';
  if (startDate && endDate && startDate > endDate) {
    return { startDate: bounds.startDate || '', endDate: bounds.endDate || '' };
  }
  return { startDate, endDate };
}
