export const MAX_BIO_WEEKS = 53;
export const DEFAULT_NEW_WEEK_COUNT = 36;

export function parseLocalDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  if (typeof value !== 'string' || !value) return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function toDateInputValue(value) {
  return formatIsoDate(mondayOf(value) || parseLocalDate(value));
}

export function formatIsoDate(date) {
  if (!date || Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function mondayOf(value) {
  const date = parseLocalDate(value);
  if (!date) return null;
  const day = date.getDay();
  date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day));
  return date;
}

export function januaryWeekStart(year, startWeek = 1) {
  const jan1 = new Date(Number(year), 0, 1);
  const firstMonday = new Date(Number(year), 0, 1 + ((8 - jan1.getDay()) % 7));
  const week = Math.max(1, Number(startWeek) || 1);
  firstMonday.setDate(firstMonday.getDate() + (week - 1) * 7);
  return firstMonday;
}

export function resolveWeek1Start({ startDate, year, startWeek } = {}) {
  return mondayOf(startDate) || januaryWeekStart(year || new Date().getFullYear(), startWeek);
}

export function weekToDateRange(weekNum, startDateOrYear, maybeYear) {
  const week = Math.max(1, Number(weekNum) || 1);
  const start = typeof startDateOrYear === 'number' || maybeYear != null
    ? januaryWeekStart(typeof startDateOrYear === 'number' ? startDateOrYear : maybeYear, 1)
    : resolveWeek1Start(
      typeof startDateOrYear === 'object' && startDateOrYear && !(startDateOrYear instanceof Date)
        ? startDateOrYear
        : { startDate: startDateOrYear, year: maybeYear },
    );
  const rangeStart = new Date(start);
  rangeStart.setDate(rangeStart.getDate() + (week - 1) * 7);
  const rangeEnd = new Date(rangeStart);
  rangeEnd.setDate(rangeEnd.getDate() + 6);
  const fmt = (date) => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${fmt(rangeStart)} – ${fmt(rangeEnd)}`;
}

export function weeksFromCount(count) {
  const n = Math.min(MAX_BIO_WEEKS, Math.max(1, Number(count) || DEFAULT_NEW_WEEK_COUNT));
  return Array.from({ length: n }, (_, i) => i + 1);
}

export function defaultNewStartDate() {
  return formatIsoDate(mondayOf(new Date()));
}

export function packCost(totalUnits, sitePrice) {
  const units = Number(totalUnits);
  const price = Number(sitePrice);
  if (!Number.isFinite(units) || !Number.isFinite(price)) return 0;
  return units * price;
}

export function formatPackCost(totalUnits, sitePrice) {
  const units = Number(totalUnits);
  if (!Number.isFinite(units) || units === 0) return '';
  if (sitePrice == null || sitePrice === '' || Number(sitePrice) === 0 || !Number.isFinite(Number(sitePrice))) {
    return '—';
  }
  return packCost(units, sitePrice).toFixed(2);
}

export function resolvedSitePrice(value) {
  if (value == null || value === '') return null;
  const price = Number(value);
  if (!Number.isFinite(price) || price === 0) return null;
  return price;
}

function seasonYmd(value) {
  if (!value) return '';
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : '';
  }
  return formatIsoDate(parseLocalDate(value));
}

function seasonBounds(season) {
  if (!season) return { start: '', end: '' };
  return {
    start: seasonYmd(season.start_date ?? season.startDate),
    end: seasonYmd(season.end_date ?? season.endDate)
      || seasonYmd(season.planned_end_date ?? season.plannedEndDate),
  };
}

export function seasonContainsDate(season, dateYmd) {
  const day = seasonYmd(dateYmd);
  const { start, end } = seasonBounds(season);
  return Boolean(day && start && end && day >= start && day <= end);
}

function laterSeasonStart(a, b) {
  const aStart = seasonBounds(a).start;
  const bStart = seasonBounds(b).start;
  return aStart >= bStart ? a : b;
}

export function pickSeasonForSetup({ startDate, year, seasons } = {}) {
  const list = Array.isArray(seasons) ? seasons.filter(Boolean) : [];
  if (list.length === 0) return null;

  const week1 = seasonYmd(startDate);
  if (week1) {
    const containing = list.filter((season) => seasonContainsDate(season, week1));
    if (containing.length) return containing.reduce(laterSeasonStart);
  }

  const jan1 = year ? `${Number(year)}-01-01` : '';
  if (jan1) {
    const containing = list.filter((season) => seasonContainsDate(season, jan1));
    if (containing.length) return containing.reduce(laterSeasonStart);
  }

  const ref = week1 || jan1;
  if (!ref) return list.reduce(laterSeasonStart);

  return list.reduce((best, season) => {
    if (!best) return season;
    const bestStart = seasonBounds(best).start;
    const seasonStart = seasonBounds(season).start;
    const bestDist = Math.abs(Date.parse(`${bestStart}T00:00:00`) - Date.parse(`${ref}T00:00:00`));
    const seasonDist = Math.abs(Date.parse(`${seasonStart}T00:00:00`) - Date.parse(`${ref}T00:00:00`));
    if (seasonDist < bestDist) return season;
    if (seasonDist === bestDist && seasonStart > bestStart) return season;
    return best;
  }, null);
}

export function weekDateSpan(weekNum, week1Start) {
  const week = Math.max(1, Number(weekNum) || 1);
  const start = resolveWeek1Start(
    typeof week1Start === 'object' && week1Start && !(week1Start instanceof Date)
      ? week1Start
      : { startDate: week1Start },
  );
  const rangeStart = new Date(start);
  rangeStart.setDate(rangeStart.getDate() + (week - 1) * 7);
  const rangeEnd = new Date(rangeStart);
  rangeEnd.setDate(rangeEnd.getDate() + 6);
  return { start: formatIsoDate(rangeStart), end: formatIsoDate(rangeEnd) };
}

export function weekOverlapsRange(weekNum, week1Start, from, to) {
  const span = weekDateSpan(weekNum, week1Start);
  if (from && span.end < from) return false;
  if (to && span.start > to) return false;
  return true;
}

export function programDateSpan(weekCount, week1Start) {
  const n = Math.min(MAX_BIO_WEEKS, Math.max(1, Number(weekCount) || DEFAULT_NEW_WEEK_COUNT));
  return {
    startDate: weekDateSpan(1, week1Start).start,
    endDate: weekDateSpan(n, week1Start).end,
  };
}

export function defaultNewStartDateForSeason(season, today = new Date()) {
  const todayMonday = formatIsoDate(mondayOf(today));
  if (todayMonday && seasonContainsDate(season, todayMonday)) return todayMonday;
  const { start } = seasonBounds(season);
  return formatIsoDate(mondayOf(start)) || defaultNewStartDate();
}
