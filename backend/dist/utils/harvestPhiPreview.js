"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SQL_HARVEST_PHI_CLASH = exports.SQL_HARVEST_AT = exports.SQL_PHI_END_LOCAL = exports.SQL_SPRAY_AT = exports.FARM_TIMEZONE = void 0;
exports.formatDateEnGb = formatDateEnGb;
exports.parseClockHm = parseClockHm;
exports.farmLocalEpochMs = farmLocalEpochMs;
exports.phiEndIso = phiEndIso;
exports.farmLocalPartsFromInstant = farmLocalPartsFromInstant;
exports.formatDateTimeEnGb = formatDateTimeEnGb;
exports.harvestClashesPhi = harvestClashesPhi;
exports.harvestRowClashesPhi = harvestRowClashesPhi;
exports.formatHarvestPhiPreviewBanner = formatHarvestPhiPreviewBanner;
exports.FARM_TIMEZONE = 'Asia/Dubai';
function ymd(value) {
    if (value instanceof Date)
        return value.toISOString().slice(0, 10);
    return String(value).slice(0, 10);
}
function formatDateEnGb(value) {
    const iso = ymd(value);
    const [year, month, day] = iso.split('-');
    if (!year || !month || !day)
        return iso;
    return `${day}/${month}/${year}`;
}
function parseClockHm(value) {
    if (value == null || String(value).trim() === '')
        return null;
    const match = String(value).trim().match(/^(\d{1,2}):(\d{2})/);
    if (!match)
        return null;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour > 23 || minute > 59)
        return null;
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}
/** Naive farm-local epoch so two clocks compare without the server timezone. */
function farmLocalEpochMs(dateYmd, timeHm) {
    const iso = ymd(dateYmd);
    const [year, month, day] = iso.split('-').map(Number);
    const clock = parseClockHm(timeHm) || '00:00';
    const [hour, minute] = clock.split(':').map(Number);
    return Date.UTC(year, month - 1, day, hour, minute, 0, 0);
}
/** Asia/Dubai is UTC+4 year-round (no DST). */
const DUBAI_UTC_OFFSET_HOURS = 4;
/**
 * PHI ends at spray clock + phiDays, in farm local time.
 * Clock is start time, else end time, else 00:00.
 */
function phiEndIso(applicationDate, startTime, endTime, phiDays) {
    const dateYmd = ymd(applicationDate);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateYmd))
        return null;
    const clock = parseClockHm(String(startTime ?? ''))
        || parseClockHm(String(endTime ?? ''))
        || '00:00';
    const [year, month, day] = dateYmd.split('-').map(Number);
    const [hour, minute] = clock.split(':').map(Number);
    const days = Number.isFinite(Number(phiDays)) && Number(phiDays) > 0 ? Math.floor(Number(phiDays)) : 0;
    const instant = new Date(Date.UTC(year, month - 1, day + days, hour - DUBAI_UTC_OFFSET_HOURS, minute, 0, 0));
    if (Number.isNaN(instant.getTime()))
        return null;
    return instant.toISOString();
}
function farmLocalPartsFromInstant(value) {
    const instant = value instanceof Date ? value : new Date(value);
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: exports.FARM_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(instant);
    const get = (type) => parts.find((part) => part.type === type)?.value || '';
    return { ymd: `${get('year')}-${get('month')}-${get('day')}`, hm: `${get('hour')}:${get('minute')}` };
}
function formatDateTimeEnGb(value) {
    const raw = String(value);
    if (value instanceof Date || raw.includes('T')) {
        const instant = value instanceof Date ? value : new Date(value);
        if (!Number.isNaN(instant.getTime())) {
            const { ymd: iso, hm } = farmLocalPartsFromInstant(instant);
            return `${formatDateEnGb(iso)} ${hm}`;
        }
    }
    return formatDateEnGb(value);
}
function harvestClashesPhi(harvestAt, sprayAt, phiEndsAt) {
    return harvestAt.getTime() >= sprayAt.getTime() && harvestAt.getTime() < phiEndsAt.getTime();
}
function harvestRowClashesPhi(opts) {
    const harvestClock = parseClockHm(opts.harvestStartTime);
    if (!harvestClock) {
        const harvestYmd = ymd(opts.harvestDate);
        const sprayYmd = ymd(opts.sprayDate);
        const phiYmd = opts.phiEnd instanceof Date || String(opts.phiEnd).includes('T')
            ? farmLocalPartsFromInstant(opts.phiEnd).ymd
            : ymd(opts.phiEnd);
        return harvestYmd >= sprayYmd && harvestYmd < phiYmd;
    }
    const sprayClock = parseClockHm(opts.sprayStartTime) || parseClockHm(opts.sprayEndTime) || '00:00';
    const harvestMs = farmLocalEpochMs(opts.harvestDate, harvestClock);
    const sprayMs = farmLocalEpochMs(opts.sprayDate, sprayClock);
    const phiParts = opts.phiEnd instanceof Date || String(opts.phiEnd).includes('T')
        ? farmLocalPartsFromInstant(opts.phiEnd)
        : { ymd: ymd(opts.phiEnd), hm: '00:00' };
    const phiMs = farmLocalEpochMs(phiParts.ymd, phiParts.hm);
    return harvestMs >= sprayMs && harvestMs < phiMs;
}
function formatHarvestPhiPreviewBanner(hits) {
    if (!hits.length)
        return '';
    const field = hits[0].fieldName;
    const details = hits.map((hit) => {
        const sprayClock = parseClockHm(hit.sprayTime);
        const spray = sprayClock
            ? `${formatDateEnGb(hit.sprayDate)} ${sprayClock}`
            : formatDateEnGb(hit.sprayDate);
        const end = formatDateTimeEnGb(hit.phiEndDate);
        return `${hit.productName} (spray ${spray}, PHI ends ${end})`;
    });
    const unique = [...new Set(details)].join(' / ');
    return `Clash — ${field} is still in PHI (${unique}). You can still save. This will show on PHI Audit for the auditor / operation manager.`;
}
const SQL_SPRAY_CLOCK = `COALESCE(
  NULLIF(substring(trim(COALESCE(pa.application_start_time::text, '')) from '^[0-9]{1,2}:[0-9]{2}'), '')::time,
  NULLIF(substring(trim(COALESCE(pa.application_end_time::text, '')) from '^[0-9]{1,2}:[0-9]{2}'), '')::time,
  TIME '00:00'
)`;
exports.SQL_SPRAY_AT = `(pa.application_date::timestamp + (${SQL_SPRAY_CLOCK}))`;
exports.SQL_PHI_END_LOCAL = `(timezone('${exports.FARM_TIMEZONE}', pa.phi_end_date))`;
exports.SQL_HARVEST_AT = `(h.date::timestamp + h.start_time)`;
exports.SQL_HARVEST_PHI_CLASH = `(
  CASE
    WHEN h.start_time IS NOT NULL THEN
      ${exports.SQL_HARVEST_AT} >= ${exports.SQL_SPRAY_AT}
      AND ${exports.SQL_HARVEST_AT} < ${exports.SQL_PHI_END_LOCAL}
    ELSE
      h.date >= pa.application_date
      AND h.date < (${exports.SQL_PHI_END_LOCAL})::date
  END
)`;
