"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toYmd = toYmd;
exports.inSeasonWindow = inSeasonWindow;
exports.classifyFieldAvailability = classifyFieldAvailability;
exports.occupancyTokensFromSegment = occupancyTokensFromSegment;
const plantingSegmentTokens_1 = require("./plantingSegmentTokens");
function toYmd(value) {
    if (value == null)
        return null;
    if (typeof value === 'string') {
        const sliced = value.slice(0, 10);
        return /^\d{4}-\d{2}-\d{2}$/.test(sliced) ? sliced : null;
    }
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}
function inSeasonWindow(date, start, end) {
    const d = toYmd(date);
    if (!d)
        return false;
    return d >= start && d <= end;
}
function classifyFieldAvailability(input) {
    const occupied = (input.occupied || []).filter(Boolean);
    const occupiedAll = occupied.includes(plantingSegmentTokens_1.ALL_SEGMENTS);
    const concreteOccupied = occupied.filter((token) => token !== plantingSegmentTokens_1.ALL_SEGMENTS);
    const universe = (input.universe || []).filter((token) => token && token !== plantingSegmentTokens_1.ALL_SEGMENTS);
    const occupiedSet = new Set(occupiedAll ? universe : concreteOccupied);
    if (occupiedAll)
        return null;
    if (universe.length > 0 && universe.every((token) => occupiedSet.has(token)))
        return null;
    if (universe.length === 0 && occupiedSet.size > 0)
        return null;
    const uprootedFree = (input.uprootedInWindow?.tokens || []).filter((token) => token && token !== plantingSegmentTokens_1.ALL_SEGMENTS && !occupiedSet.has(token));
    const freeFromUniverse = universe.filter((token) => !occupiedSet.has(token));
    const freeTokens = [...new Set([...freeFromUniverse, ...uprootedFree])];
    const lastCrop = input.uprootedInWindow
        ? [input.uprootedInWindow.cropName, input.uprootedInWindow.varietyName].filter(Boolean).join(' · ') || null
        : null;
    if (occupiedSet.size === 0) {
        const kind = input.uprootedInWindow ? 'uprooted' : 'never_planted';
        return {
            availability: 'Vacant',
            kind,
            occupiedTokens: [],
            freeTokens: [],
            plantedInWindow: Boolean(input.plantedInWindow),
            lastCrop,
            uprootedAt: input.uprootedInWindow?.at ?? null,
            uprootReason: input.uprootedInWindow?.reason ?? null,
        };
    }
    return {
        availability: 'Partial',
        kind: 'partial',
        occupiedTokens: [...occupiedSet],
        freeTokens,
        plantedInWindow: Boolean(input.plantedInWindow),
        lastCrop,
        uprootedAt: input.uprootedInWindow?.at ?? null,
        uprootReason: input.uprootedInWindow?.reason ?? null,
    };
}
function occupancyTokensFromSegment(segment) {
    return (0, plantingSegmentTokens_1.parseSegmentTokens)(segment);
}
