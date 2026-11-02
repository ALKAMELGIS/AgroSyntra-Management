import {
  listFertigationAll,
  listFertAppRecordsAll,
  listIrrigationRecordsAll,
} from '../../utils/backendApi';

function getWeekNumber(dateStr) {
  if (!dateStr) return undefined;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return undefined;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
}

/** Map RC-132 pivot record into the shape expected by fertigation dashboard charts/tables. */
export function normalizePivotFertAppRecord(record) {
  const totalKg = Number(record.totalKg) || 0;
  const fertilizerName = (record.fertilizerName || 'Unknown').trim();
  const date = (record.date || '').toString().split('T')[0];

  return {
    id: record.id,
    source: 'pivot',
    fieldId: record.fieldId,
    fieldName: record.fieldName,
    siteId: record.siteId,
    date,
    weekNumber: getWeekNumber(date),
    totalFertilizer: totalKg,
    fertilizers: totalKg > 0 ? { [fertilizerName]: totalKg } : {},
    segmentId: record.segmentId,
    crop: record.crop,
    ratePerHa: record.ratePerHa,
  };
}

/** Map RC-133 pivot irrigation record — supplies dailyWater (m³) for dashboard water charts. */
export function normalizePivotIrrigationRecord(record) {
  const volume = Number(record.volumeM3) || 0;
  if (volume <= 0) return null;
  const date = (record.date || '').toString().split('T')[0];
  if (!date) return null;

  return {
    id: record.id,
    source: 'pivot-irrigation',
    fieldId: record.fieldId,
    fieldName: record.fieldName,
    date,
    weekNumber: getWeekNumber(date),
    dailyWater: volume,
    flowRate: record.flowRateM3Hr != null ? Number(record.flowRateM3Hr) : undefined,
  };
}

export function mergeFertigationDashboardData(nhEntries = [], pivotRecords = []) {
  const nh = nhEntries.map((entry) => ({ ...entry, source: entry.source || 'nethouse' }));
  const pivot = pivotRecords.map(normalizePivotFertAppRecord);
  return [...nh, ...pivot];
}

export async function fetchFertigationDashboardData(params = {}) {
  const siteId = params.site_id;
  const [nh, pivot, irrigation] = await Promise.all([
    listFertigationAll(params),
    siteId
      ? listFertAppRecordsAll(params).catch(() => [])
      : Promise.resolve([]),
    siteId
      ? listIrrigationRecordsAll(params).catch(() => [])
      : Promise.resolve([]),
  ]);

  const fertRows = mergeFertigationDashboardData(nh, pivot);
  const irrRows = (irrigation || [])
    .map(normalizePivotIrrigationRecord)
    .filter(Boolean);

  return [...fertRows, ...irrRows].sort((a, b) =>
    String(a.date || '').localeCompare(String(b.date || ''))
  );
}
