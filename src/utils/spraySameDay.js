import { formatClockTime } from './sprayCalendarPhi';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export function applicationDateYmd(app) {
  const raw = app?.application_date ?? app?.applicationDate ?? '';
  const s = String(raw);
  if (!s) return '';
  return s.includes('T') ? s.split('T')[0] : s.substring(0, 10);
}

export function fieldIdOf(app) {
  return app?.field_id ?? app?.fieldId ?? '';
}

export function sprayAppId(app) {
  return app?.id ?? app?._id ?? null;
}

function isRejected(app) {
  return String(app?.approval_status || app?.approvalStatus || '').toLowerCase() === 'rejected';
}

export function filterSameDaySprays(apps, { fieldId, dateYmd, excludeId } = {}) {
  if (!fieldId || !dateYmd) return [];
  return (apps || []).filter((app) => {
    if (isRejected(app)) return false;
    if (excludeId && String(sprayAppId(app)) === String(excludeId)) return false;
    if (String(fieldIdOf(app)) !== String(fieldId)) return false;
    return applicationDateYmd(app) === dateYmd;
  });
}

/** Product plus start time (end time if start is missing). */
export function formatSameDaySprayLine(app) {
  const product = app?.product_name || app?.productName || 'Unknown product';
  const clock = formatClockTime(
    app?.application_start_time
    || app?.applicationStartTime
    || app?.application_end_time
    || app?.applicationEndTime
  );
  return clock === '—' ? product : `${product} ${clock}`;
}

export async function fetchSameDaySprays(api, { fieldId, dateYmd, excludeId } = {}) {
  if (!fieldId || !UUID_RE.test(String(fieldId)) || !dateYmd || !YMD_RE.test(String(dateYmd))) {
    return [];
  }
  const params = new URLSearchParams({
    field_id: fieldId,
    start_date: dateYmd,
    end_date: dateYmd,
    limit: '100',
  });
  const res = await api.get(`/ipm/pesticide-applications?${params.toString()}`);
  const apps = res?.data?.data || [];
  return filterSameDaySprays(apps, { fieldId, dateYmd, excludeId });
}
