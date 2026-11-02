"use strict";
/** Labels and layout for manpower "detail summary" / workers count pivot (matches farm Excel). */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PREFERRED_CROP_ORDER = exports.VALID_PIVOT_COLUMN_KEYS = exports.WORKERS_COUNT_GRID_COLUMNS = exports.ALL_PIVOT_ACTIVITIES = exports.GENERAL_ACTIVITIES = exports.FIELD_ACTIVITIES = void 0;
exports.buildActivityPivotColumnMap = buildActivityPivotColumnMap;
exports.normalizeActivity = normalizeActivity;
exports.isGeneralActivity = isGeneralActivity;
exports.normalizeCrop = normalizeCrop;
exports.normalizeVariety = normalizeVariety;
exports.resolveRecordCrop = resolveRecordCrop;
exports.sortCropsForPivot = sortCropsForPivot;
exports.fieldCropsOrdered = fieldCropsOrdered;
exports.isoDateToExcelSerial = isoDateToExcelSerial;
exports.excelSerialToIso = excelSerialToIso;
exports.normalizeRecordDate = normalizeRecordDate;
exports.resolveAndNormalizeRows = resolveAndNormalizeRows;
exports.filterRowsForCell = filterRowsForCell;
exports.groupRowsForDrillDown = groupRowsForDrillDown;
exports.buildPivotMapsFromRows = buildPivotMapsFromRows;
exports.pivotMapsToCells = pivotMapsToCells;
exports.productivityForCells = productivityForCells;
exports.getCellCounts = getCellCounts;
exports.sumCropForDate = sumCropForDate;
exports.FIELD_ACTIVITIES = [
    'Bed Making/Mulching',
    'Clipping',
    'Harvesting',
    'Hook Making',
    'Lowering',
    'Planting',
    'Pruning',
    'Trellising',
    'Uprooting/Cleaning',
    'Weeding',
];
exports.GENERAL_ACTIVITIES = [
    'Crate Washing',
    'IPM',
    'Irrigation',
    'Maintenance',
    'Nursary',
    'Operator',
    'Supervisor',
    'Office',
];
exports.ALL_PIVOT_ACTIVITIES = [...exports.FIELD_ACTIVITIES, ...exports.GENERAL_ACTIVITIES];
/** Workers count grid columns (17); keep in sync with manpowerDetailPivotConstants.js */
exports.WORKERS_COUNT_GRID_COLUMNS = [
    { key: 'Supervisor', label: 'Supervisor' },
    { key: 'Operator', label: 'Operator' },
    { key: 'Irrigation', label: 'Irrigation' },
    { key: 'IPM', label: 'IPM' },
    { key: 'Maintenance', label: 'Maintenance' },
    { key: 'Nursary', label: 'Nursery' },
    { key: 'Crate Washing', label: 'Crate Washing' },
    { key: 'Hook Making', label: 'Hook Making' },
    { key: 'Uprooting/Cleaning', label: 'Uprooting/Cleaning' },
    { key: 'Bed Making/Mulching', label: 'Bed Making/Mulching' },
    { key: 'Planting', label: 'Planting' },
    { key: 'Clipping', label: 'Clipping' },
    { key: 'Trellising', label: 'Trellising' },
    { key: 'Pruning', label: 'Pruning' },
    { key: 'Lowering', label: 'Lowering' },
    { key: 'Weeding', label: 'Weeding' },
    { key: 'Harvesting', label: 'Harvesting' },
];
exports.VALID_PIVOT_COLUMN_KEYS = exports.WORKERS_COUNT_GRID_COLUMNS.map((c) => c.key);
/** Preferred column order for crop blocks; extra crops from data append before General. */
exports.PREFERRED_CROP_ORDER = [
    'Blackberry',
    'Chilli',
    'Eggplant',
    'Fig',
    'Melon (R&D)',
    'No Crop',
    'Snack Cucumber',
    'Tomato Cherry',
    'Tomato Plum',
    'Tomato Table',
    'Zucchini Green',
    'Zucchini Yellow',
    'Broccoli',
    'Cauliflower',
    'Iceberg lettuce',
    'Red cabbage',
    'Tomato Beef',
    'Tomato Bunch',
    'Sweetcorn',
    'White Cabbage',
    'General',
];
const ACTIVITY_ALIASES = {
    nursery: 'Nursary',
    'nursary': 'Nursary',
    'bed making': 'Bed Making/Mulching',
    'bed making/mulching': 'Bed Making/Mulching',
    'mulching': 'Bed Making/Mulching',
    'uprooting': 'Uprooting/Cleaning',
    'uprooting/cleaning': 'Uprooting/Cleaning',
    'cleaning': 'Uprooting/Cleaning',
    'hook making': 'Hook Making',
    'crate washing': 'Crate Washing',
};
function normalizeKey(s) {
    return s.trim().toLowerCase().replace(/\s+/g, ' ');
}
function buildActivityPivotColumnMap(catalogRows) {
    const map = new Map();
    for (const row of catalogRows) {
        if (row.pivot_column) {
            map.set(normalizeKey(row.name), row.pivot_column);
        }
    }
    return map;
}
function normalizeActivity(raw, columnMap) {
    const t = (raw || '').trim();
    if (!t)
        return '(blank)';
    const key = normalizeKey(t);
    if (columnMap) {
        const fromCatalog = columnMap.get(key);
        if (fromCatalog)
            return fromCatalog;
    }
    const alias = ACTIVITY_ALIASES[key];
    if (alias)
        return alias;
    for (const a of exports.ALL_PIVOT_ACTIVITIES) {
        if (normalizeKey(a) === key)
            return a;
    }
    for (const a of exports.ALL_PIVOT_ACTIVITIES) {
        if (key.includes(normalizeKey(a)) || normalizeKey(a).includes(key))
            return a;
    }
    return t;
}
function isGeneralActivity(activity) {
    return exports.GENERAL_ACTIVITIES.includes(activity);
}
function normalizeCrop(variety, activity) {
    if (isGeneralActivity(activity))
        return 'General';
    const v = (variety || '').trim();
    if (!v)
        return 'No Crop';
    const key = normalizeKey(v);
    for (const c of exports.PREFERRED_CROP_ORDER) {
        if (c === 'General')
            continue;
        if (normalizeKey(c) === key)
            return c;
    }
    return v;
}
function normalizeVariety(variety, activity) {
    if (isGeneralActivity(activity))
        return 'General';
    const v = (variety || '').trim();
    return v || 'No Variety';
}
function resolveRecordCrop(row, columnMap) {
    const activity = normalizeActivity(row.activity, columnMap);
    if (isGeneralActivity(activity))
        return 'General';
    const fieldCrop = (row.field_crop_name || '').trim();
    if (fieldCrop)
        return fieldCrop;
    const varietyCrop = (row.variety_crop_name || '').trim();
    if (varietyCrop)
        return varietyCrop;
    return normalizeCrop(row.variety, activity);
}
function sortCropsForPivot(cropsFromData) {
    const set = new Set(cropsFromData.filter(Boolean));
    const hasGeneral = set.has('General');
    set.delete('General');
    const ordered = [];
    for (const c of exports.PREFERRED_CROP_ORDER) {
        if (c === 'General')
            continue;
        if (set.has(c)) {
            ordered.push(c);
            set.delete(c);
        }
    }
    const rest = [...set].sort((a, b) => a.localeCompare(b));
    const result = [...ordered, ...rest];
    if (hasGeneral)
        result.push('General');
    return result;
}
function fieldCropsOrdered(allCrops) {
    return allCrops.filter((c) => c !== 'General');
}
/** ISO date YYYY-MM-DD → Excel serial (1900 date system). */
function isoDateToExcelSerial(isoDate) {
    const [y, m, d] = isoDate.split('-').map(Number);
    const utc = Date.UTC(y, m - 1, d);
    const epoch = Date.UTC(1899, 11, 30);
    return Math.floor((utc - epoch) / 86400000);
}
function excelSerialToIso(serial) {
    const epoch = Date.UTC(1899, 11, 30);
    const ms = epoch + serial * 86400000;
    const dt = new Date(ms);
    const y = dt.getUTCFullYear();
    const mo = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const day = String(dt.getUTCDate()).padStart(2, '0');
    return `${y}-${mo}-${day}`;
}
/** Normalize DB/API record_date to YYYY-MM-DD for pivot keys. */
function normalizeRecordDate(recordDate) {
    if (recordDate == null || recordDate === '')
        return '';
    if (recordDate instanceof Date && !Number.isNaN(recordDate.getTime())) {
        return recordDate.toISOString().split('T')[0];
    }
    const s = String(recordDate).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s))
        return s.slice(0, 10);
    const parsed = Date.parse(s);
    if (!Number.isNaN(parsed)) {
        return new Date(parsed).toISOString().split('T')[0];
    }
    return s.split('T')[0];
}
function emptyBucket() {
    return {
        casual: new Set(),
        eag: new Set(),
        casualHours: 0,
        eagHours: 0,
        actual: 0,
        units: new Set(),
        missingHours: 0,
    };
}
function parseHours(value) {
    const n = Number(value);
    if (!Number.isFinite(n))
        return 0;
    return Math.max(0, n);
}
function parseActual(value) {
    const n = Number(value);
    if (!Number.isFinite(n))
        return 0;
    return n;
}
/** Resolve crop/activity/hours for each raw DB row (shared by pivot grid and drill-down). */
function resolveAndNormalizeRows(rows, columnMap) {
    const resolved = [];
    for (const row of rows) {
        const date = normalizeRecordDate(row.record_date);
        if (!date)
            continue;
        const activity = normalizeActivity(row.activity, columnMap);
        const crop = resolveRecordCrop(row, columnMap);
        const variety = normalizeVariety(row.variety, activity);
        const hoursMissing = Boolean(row.hours_missing);
        const hasActual = row.actual != null && row.actual !== '';
        resolved.push({
            date,
            crop,
            variety,
            activity,
            location: (row.location || '').trim(),
            section: (row.section || '').trim(),
            workerId: row.worker_id,
            workerCategory: (row.worker_category || '').trim(),
            workerName: (row.worker_name || '').trim(),
            employeeId: (row.employee_id || '').trim(),
            hours: hoursMissing ? 0 : parseHours(row.hours),
            hoursMissing,
            actual: parseActual(row.actual),
            unit: (row.unit || '').trim(),
            hasActual,
            totalHours: parseHours(row.total_hours),
        });
    }
    return resolved;
}
function filterRowsForCell(rows, opts) {
    const groupBy = opts.groupBy || 'crop';
    return rows.filter((row) => {
        if (row.activity !== opts.activity)
            return false;
        if (groupBy === 'variety') {
            const v = opts.variety || row.variety;
            return row.variety === v;
        }
        return row.crop === opts.crop;
    });
}
/** Group resolved rows by date + location + section (after JS crop/activity filter). */
function groupRowsForDrillDown(rows) {
    const map = new Map();
    for (const row of rows) {
        const key = `${row.date}|${row.location}|${row.section}|${row.activity}|${row.crop}|${row.variety}`;
        if (!map.has(key)) {
            map.set(key, {
                date: row.date,
                location: row.location,
                section: row.section,
                activity: row.activity,
                crop: row.crop,
                variety: row.variety,
                eag: new Set(),
                casual: new Set(),
                hours: 0,
                actual: 0,
                units: new Set(),
                workers: new Map(),
            });
        }
        const g = map.get(key);
        if (row.workerCategory === 'Permanent') {
            g.eag.add(row.workerId);
        }
        else {
            g.casual.add(row.workerId);
        }
        g.hours += row.hours;
        if (row.actual) {
            g.actual += row.actual;
            if (row.unit)
                g.units.add(row.unit);
        }
        const wKey = row.workerId;
        if (!g.workers.has(wKey)) {
            g.workers.set(wKey, {
                name: row.workerName,
                employeeId: row.employeeId,
                category: row.workerCategory,
                hours: 0,
            });
        }
        g.workers.get(wKey).hours += row.hours;
    }
    return [...map.values()]
        .map((g) => ({
        date: g.date,
        location: g.location,
        section: g.section,
        activity: g.activity,
        crop: g.crop,
        variety: g.variety,
        eagWorkers: g.eag.size,
        casualWorkers: g.casual.size,
        hours: Math.round(g.hours * 100) / 100,
        actual: g.actual,
        units: [...g.units].sort(),
        workers: [...g.workers.values()].sort((a, b) => a.name.localeCompare(b.name)),
    }))
        .sort((a, b) => {
        const d = a.date.localeCompare(b.date);
        if (d !== 0)
            return d;
        return a.location.localeCompare(b.location);
    });
}
function buildPivotMapsFromRows(rows, columnMap) {
    const buckets = new Map();
    const dateSet = new Set();
    const cropSet = new Set();
    let missingHoursCount = 0;
    for (const row of resolveAndNormalizeRows(rows, columnMap)) {
        dateSet.add(row.date);
        cropSet.add(row.crop);
        if (row.hoursMissing)
            missingHoursCount += 1;
        const key = `${row.date}|${row.crop}|${row.variety}|${row.activity}`;
        if (!buckets.has(key)) {
            buckets.set(key, emptyBucket());
        }
        const bucket = buckets.get(key);
        if (row.workerCategory === 'Permanent') {
            bucket.eag.add(row.workerId);
            bucket.eagHours += row.hours;
        }
        else {
            bucket.casual.add(row.workerId);
            bucket.casualHours += row.hours;
        }
        if (row.hoursMissing)
            bucket.missingHours += 1;
        if (row.actual) {
            bucket.actual += row.actual;
            if (row.unit)
                bucket.units.add(row.unit);
        }
    }
    const dates = [...dateSet].sort();
    const crops = sortCropsForPivot([...cropSet]);
    return { buckets, dates, crops, missingHoursCount };
}
function pivotMapsToCells(maps) {
    const cells = [];
    for (const [key, bucket] of maps.buckets) {
        const [date, crop, variety, activity] = key.split('|');
        cells.push({
            date,
            crop,
            variety,
            activity,
            casual: bucket.casual.size,
            eag: bucket.eag.size,
            casualHours: Math.round(bucket.casualHours * 100) / 100,
            eagHours: Math.round(bucket.eagHours * 100) / 100,
            actual: bucket.actual,
            unit: bucket.units.size === 1 ? [...bucket.units][0] : '',
            units: [...bucket.units].sort(),
            missingHours: bucket.missingHours,
        });
    }
    return cells;
}
function productivityForCells(cells, rowKey, activity, groupBy = 'crop') {
    let hours = 0;
    let actual = 0;
    const units = new Set();
    let recordsWithActual = 0;
    let totalRecords = 0;
    for (const c of cells) {
        const key = groupBy === 'variety' ? (c.variety || c.crop) : c.crop;
        if (key !== rowKey || c.activity !== activity)
            continue;
        totalRecords += 1;
        hours += (c.casualHours || 0) + (c.eagHours || 0);
        if (c.actual) {
            actual += c.actual;
            recordsWithActual += 1;
            for (const u of c.units || (c.unit ? [c.unit] : [])) {
                if (u)
                    units.add(u);
            }
        }
    }
    const mixedUnits = units.size > 1;
    const unit = units.size === 1 ? [...units][0] : '';
    const hoursPerUnit = !mixedUnits && actual > 0
        ? Math.round((hours / actual) * 100) / 100
        : null;
    return {
        hours: Math.round(hours * 100) / 100,
        actual,
        unit,
        hoursPerUnit,
        mixedUnits,
        recordsWithActual,
        totalRecords,
    };
}
function getCellCounts(maps, date, crop, variety, activity) {
    const key = `${date}|${crop}|${variety}|${activity}`;
    const b = maps.buckets.get(key);
    if (!b)
        return { casual: 0, eag: 0 };
    return { casual: b.casual.size, eag: b.eag.size };
}
function sumCropForDate(maps, date, crop, variety, activities) {
    let casual = 0;
    let eag = 0;
    for (const activity of activities) {
        const c = getCellCounts(maps, date, crop, variety, activity);
        casual += c.casual;
        eag += c.eag;
    }
    return { casual, eag };
}
