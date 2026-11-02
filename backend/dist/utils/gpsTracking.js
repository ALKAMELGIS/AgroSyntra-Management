"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EQUIPMENT_TYPES = exports.GPS_POSITION_LIMIT = void 0;
exports.isEquipmentType = isEquipmentType;
exports.isUuid = isUuid;
exports.parseIsoDate = parseIsoDate;
exports.dubaiTodayYmd = dubaiTodayYmd;
exports.dubaiDayBounds = dubaiDayBounds;
exports.dubaiRangeBounds = dubaiRangeBounds;
exports.parseLatLng = parseLatLng;
exports.parseOptionalNumber = parseOptionalNumber;
exports.parseOptionalRecordedAt = parseOptionalRecordedAt;
exports.resolveEquipmentLookup = resolveEquipmentLookup;
exports.GPS_POSITION_LIMIT = 2000;
exports.EQUIPMENT_TYPES = ['tractor', 'sprayer', 'harvester', 'drone', 'vehicle', 'other'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DUBAI_UTC_OFFSET_HOURS = 4;
function isEquipmentType(value) {
    return typeof value === 'string' && exports.EQUIPMENT_TYPES.includes(value);
}
function isUuid(value) {
    return typeof value === 'string' && UUID_RE.test(value);
}
function parseIsoDate(value) {
    if (value == null || value === '')
        return null;
    const ymd = String(value).slice(0, 10);
    return ISO_DATE.test(ymd) ? ymd : null;
}
function dubaiTodayYmd(now = new Date()) {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Dubai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(now);
    const lookup = (type) => (parts.find((part) => part.type === type)?.value || '');
    return `${lookup('year')}-${lookup('month')}-${lookup('day')}`;
}
function dubaiDayBounds(ymd) {
    const [year, month, day] = ymd.split('-').map(Number);
    const start = new Date(Date.UTC(year, month - 1, day, -DUBAI_UTC_OFFSET_HOURS, 0, 0, 0));
    const endExclusive = new Date(Date.UTC(year, month - 1, day + 1, -DUBAI_UTC_OFFSET_HOURS, 0, 0, 0));
    return { start, endExclusive };
}
function dubaiRangeBounds(fromYmd, toYmd) {
    const start = dubaiDayBounds(fromYmd).start;
    const endExclusive = dubaiDayBounds(toYmd).endExclusive;
    return { start, endExclusive };
}
function parseLatLng(latitude, longitude) {
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng))
        return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180)
        return null;
    return { latitude: lat, longitude: lng };
}
function parseOptionalNumber(value, min, max) {
    if (value == null || value === '')
        return undefined;
    const n = Number(value);
    if (!Number.isFinite(n) || n < min || n > max) {
        throw new RangeError(`Expected a number between ${min} and ${max}`);
    }
    return n;
}
function parseOptionalRecordedAt(value) {
    if (value == null || value === '')
        return undefined;
    const d = new Date(String(value));
    if (Number.isNaN(d.getTime())) {
        throw new RangeError('recorded_at must be a valid date');
    }
    return d;
}
function resolveEquipmentLookup(body) {
    const rawId = body.equipment_id ?? body.equipmentId;
    const rawIdent = typeof body.identifier === 'string' ? body.identifier.trim() : '';
    if (isUuid(rawId))
        return { id: rawId };
    if (rawIdent)
        return { identifier: rawIdent };
    if (rawId != null && String(rawId).trim())
        return { identifier: String(rawId).trim() };
    return {};
}
