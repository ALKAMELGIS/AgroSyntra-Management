"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NORMAL_WORK_HOURS = void 0;
exports.matchReferenceRow = matchReferenceRow;
exports.matchReference = matchReference;
exports.buildVsTargetRows = buildVsTargetRows;
exports.buildWorkerSummary = buildWorkerSummary;
exports.buildOvertimeRows = buildOvertimeRows;
const manpowerDetailPivot_1 = require("./manpowerDetailPivot");
exports.NORMAL_WORK_HOURS = 10;
function blankKey(value) {
    return String(value || '').trim().toLowerCase();
}
function parseTarget(value) {
    if (value == null || value === '')
        return null;
    const n = Number(value);
    if (!Number.isFinite(n))
        return null;
    return n;
}
function eqLookup(a, b) {
    return blankKey(a) === blankKey(b);
}
function matchReferenceRow(refs, activity, crop, variety) {
    const act = (0, manpowerDetailPivot_1.normalizeActivity)(activity);
    const sameAct = refs.filter((r) => (0, manpowerDetailPivot_1.normalizeActivity)(r.activity) === act);
    if (sameAct.length === 0)
        return null;
    const exact = sameAct.find((r) => eqLookup(r.crop, crop) && eqLookup(r.variety, variety));
    if (exact)
        return exact;
    const cropOnly = sameAct.find((r) => eqLookup(r.crop, crop) && !blankKey(r.variety));
    if (cropOnly)
        return cropOnly;
    const activityOnly = sameAct.find((r) => !blankKey(r.crop) && !blankKey(r.variety));
    return activityOnly || null;
}
function matchReference(refs, activity, crop, variety) {
    const row = matchReferenceRow(refs, activity, crop, variety);
    if (!row || parseTarget(row.target) == null)
        return null;
    return row;
}
function statusFor(actual, target) {
    if (actual > target)
        return 'Over';
    if (actual < target)
        return 'Under';
    return 'On';
}
function buildVsTargetRows(rows, refs) {
    const buckets = new Map();
    for (const row of rows) {
        if (!row.hasActual)
            continue;
        const ref = matchReference(refs, row.activity, row.crop, row.variety);
        if (!ref)
            continue;
        const target = parseTarget(ref.target);
        if (target == null)
            continue;
        const key = `${row.workerId}|${row.date}|${row.activity}|${row.crop}|${row.variety}`;
        const existing = buckets.get(key);
        if (existing) {
            existing.actual += row.actual;
            if (!existing.unit && row.unit)
                existing.unit = row.unit;
        }
        else {
            buckets.set(key, {
                date: row.date,
                workerId: row.workerId,
                employeeId: row.employeeId,
                workerName: row.workerName,
                activity: row.activity,
                crop: row.crop,
                variety: row.variety,
                actual: row.actual,
                unit: row.unit || (ref.unit || '').trim(),
                target,
            });
        }
    }
    return [...buckets.values()]
        .map((b) => {
        const actual = Number(b.actual.toFixed(4));
        const variance = Number((actual - b.target).toFixed(4));
        return {
            date: b.date,
            workerId: b.workerId,
            employeeId: b.employeeId,
            workerName: b.workerName,
            activity: b.activity,
            crop: b.crop,
            variety: b.variety,
            actual,
            target: b.target,
            unit: b.unit || '',
            variance,
            status: statusFor(actual, b.target),
        };
    })
        .sort((a, b) => {
        const dateCmp = a.date.localeCompare(b.date);
        if (dateCmp !== 0)
            return dateCmp;
        const nameCmp = a.workerName.localeCompare(b.workerName);
        if (nameCmp !== 0)
            return nameCmp;
        return a.activity.localeCompare(b.activity);
    });
}
function dayOutcome(rows) {
    return rows.some((r) => r.status === 'Under') ? 'missed' : 'achieved';
}
function buildWorkerSummary(vsTarget) {
    const byWorker = new Map();
    for (const row of vsTarget) {
        const list = byWorker.get(row.workerId) || [];
        list.push(row);
        byWorker.set(row.workerId, list);
    }
    const summaries = [];
    for (const [workerId, rows] of byWorker) {
        const byDate = new Map();
        for (const row of rows) {
            const list = byDate.get(row.date) || [];
            list.push(row);
            byDate.set(row.date, list);
        }
        const dates = [...byDate.keys()].sort();
        let daysMissed = 0;
        let daysAchieved = 0;
        const outcomes = [];
        for (const date of dates) {
            const outcome = dayOutcome(byDate.get(date) || []);
            outcomes.push(outcome);
            if (outcome === 'missed')
                daysMissed += 1;
            else
                daysAchieved += 1;
        }
        let missStreak = 0;
        for (let i = outcomes.length - 1; i >= 0; i -= 1) {
            if (outcomes[i] !== 'missed')
                break;
            missStreak += 1;
        }
        const daysWithTarget = dates.length;
        const result = daysMissed === daysWithTarget
            ? `Missed ${daysMissed} of ${daysWithTarget} days`
            : `Achieved ${daysAchieved} of ${daysWithTarget} days`;
        summaries.push({
            workerId,
            employeeId: rows[0].employeeId,
            workerName: rows[0].workerName,
            daysWithTarget,
            daysAchieved,
            daysMissed,
            missStreak,
            result,
        });
    }
    summaries.sort((a, b) => {
        const aAllMissed = a.daysMissed === a.daysWithTarget && a.daysWithTarget > 0 ? 1 : 0;
        const bAllMissed = b.daysMissed === b.daysWithTarget && b.daysWithTarget > 0 ? 1 : 0;
        if (aAllMissed !== bAllMissed)
            return bAllMissed - aAllMissed;
        if (a.missStreak !== b.missStreak)
            return b.missStreak - a.missStreak;
        if (a.daysMissed !== b.daysMissed)
            return b.daysMissed - a.daysMissed;
        return a.workerName.localeCompare(b.workerName);
    });
    return summaries;
}
function buildOvertimeRows(rows) {
    const byWorkerDay = new Map();
    for (const row of rows) {
        const key = `${row.workerId}|${row.date}`;
        const existing = byWorkerDay.get(key);
        if (existing) {
            existing.blockHours += row.hours;
            existing.totalHours = Math.max(existing.totalHours, row.totalHours);
        }
        else {
            byWorkerDay.set(key, {
                date: row.date,
                workerId: row.workerId,
                employeeId: row.employeeId,
                workerName: row.workerName,
                workerCategory: row.workerCategory,
                blockHours: row.hours,
                totalHours: row.totalHours,
            });
        }
    }
    return [...byWorkerDay.values()]
        .map((b) => {
        const hours = b.totalHours > 0 ? b.totalHours : b.blockHours;
        return {
            date: b.date,
            workerId: b.workerId,
            employeeId: b.employeeId,
            workerName: b.workerName,
            workerCategory: b.workerCategory,
            hours: Number(hours.toFixed(2)),
            extraHours: Number((hours - exports.NORMAL_WORK_HOURS).toFixed(2)),
        };
    })
        .filter((r) => r.hours > exports.NORMAL_WORK_HOURS)
        .sort((a, b) => {
        const dateCmp = a.date.localeCompare(b.date);
        if (dateCmp !== 0)
            return dateCmp;
        return b.extraHours - a.extraHours;
    });
}
