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

export function defaultHarvestDateRange(now = new Date()) {
  const to = farmTodayYmd(now);
  const [year, month] = to.split('-');
  return { from: `${year}-${month}-01`, to };
}

export function harvestDateRangeError(from, to) {
  if (from && to && to < from) return 'Date from must be on or before date to';
  return null;
}

export function harvestMatchesCrop(entry, cropName) {
  if (!cropName) return true;
  return String(entry?.cropName || '').trim().toLowerCase() === String(cropName).trim().toLowerCase();
}

export function harvestMatchesVariety(entry, variety) {
  if (!variety) return true;
  const want = String(variety).trim().toLowerCase();
  const names = (entry?.varieties || []).map((row) => String(row.variety || '').trim().toLowerCase());
  if (entry?.varietyName) names.push(String(entry.varietyName).trim().toLowerCase());
  return names.includes(want);
}

export function filterHarvestEntries(entries, { cropName, variety } = {}) {
  return (entries || []).filter((entry) => (
    harvestMatchesCrop(entry, cropName) && harvestMatchesVariety(entry, variety)
  ));
}

export function uniqueHarvestVarieties(plantingRecords = [], cropHistory = []) {
  const seen = new Map();
  [...plantingRecords, ...cropHistory].forEach((row) => {
    const name = (row?.variety_name || row?.varietyName || row?.variety || '').trim();
    if (!name) return;
    const key = name.toLowerCase();
    if (!seen.has(key)) seen.set(key, name);
  });
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}
