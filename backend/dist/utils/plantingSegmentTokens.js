"use strict";
/**
 * Canonical segment tokens for the planting write path.
 *
 * The client helper in src/utils/plantingSegment.js parses segments tolerantly
 * for display: it drops text it does not recognise, treats a bare number as a
 * valve, and can invent valve options for a field that has none. That is fine
 * for rendering a picker and wrong for uproot, which splits planting rows and
 * must never lose, duplicate, or reassign land.
 *
 * Rules here:
 *  - tokens survive a parse/serialise round trip
 *  - unrecognised text is preserved verbatim rather than dropped
 *  - a bare number stays a bare number, because it is ambiguous between bay
 *    and valve and guessing would move land between segments
 *  - nothing is ever invented
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AmbiguousSegmentSplitError = exports.ALL_SEGMENTS = void 0;
exports.canonicalizeSegmentToken = canonicalizeSegmentToken;
exports.parseSegmentTokens = parseSegmentTokens;
exports.serializeSegmentTokens = serializeSegmentTokens;
exports.splitSegmentTokens = splitSegmentTokens;
/** Sentinel meaning the whole field. */
exports.ALL_SEGMENTS = 'ALL';
/** Planting rows separate segments with commas or ampersands. */
const SEPARATOR = /[,&]+/;
const ALL_PATTERN = /^(?:all|all segments|\*)$/i;
const BAY_PATTERN = /^(?:b|bay)[-\s]*(\d+)$/i;
const VALVE_PATTERN = /^(?:v|valve)[-\s]*(\d+)$/i;
const SPOT_PATTERN = /^(?:s|spot)[-\s]*(\d*)$/i;
class AmbiguousSegmentSplitError extends Error {
    constructor(message) {
        super(message);
        this.name = 'AmbiguousSegmentSplitError';
    }
}
exports.AmbiguousSegmentSplitError = AmbiguousSegmentSplitError;
/**
 * One segment fragment reduced to its canonical form. Unrecognised fragments
 * come back trimmed with collapsed whitespace and otherwise untouched.
 */
function canonicalizeSegmentToken(raw) {
    const trimmed = String(raw ?? '').trim().replace(/\s+/g, ' ');
    if (!trimmed)
        return '';
    if (ALL_PATTERN.test(trimmed))
        return exports.ALL_SEGMENTS;
    const bay = trimmed.match(BAY_PATTERN);
    if (bay)
        return `B${Number(bay[1])}`;
    const valve = trimmed.match(VALVE_PATTERN);
    if (valve)
        return `V${Number(valve[1])}`;
    const spot = trimmed.match(SPOT_PATTERN);
    if (spot)
        return spot[1] ? `S${Number(spot[1])}` : 'S';
    return trimmed;
}
/**
 * Canonical tokens for a stored segment string, in first-appearance order and
 * deduplicated. A row that mentions ALL collapses to ALL alone, since the
 * whole field subsumes any segment listed alongside it.
 */
function parseSegmentTokens(segment) {
    const tokens = [];
    for (const part of String(segment ?? '').split(SEPARATOR)) {
        const token = canonicalizeSegmentToken(part);
        if (!token)
            continue;
        if (token === exports.ALL_SEGMENTS)
            return [exports.ALL_SEGMENTS];
        if (!tokens.includes(token))
            tokens.push(token);
    }
    return tokens;
}
/** Stored form of a token list. */
function serializeSegmentTokens(tokens) {
    return tokens.join(', ');
}
/**
 * Partition a row's segments into the ones being uprooted and the ones left
 * growing.
 *
 * `universe` is the field's known segment list, needed only to expand a row
 * stored as ALL when the uproot is partial. Without it such a split is
 * ambiguous, and guessing would uproot a whole field, so it raises instead.
 */
function splitSegmentTokens(segment, remove, opts = {}) {
    const rowTokens = parseSegmentTokens(segment);
    const removeTokens = [];
    for (const entry of remove) {
        const token = canonicalizeSegmentToken(entry);
        if (token && !removeTokens.includes(token))
            removeTokens.push(token);
    }
    if (removeTokens.includes(exports.ALL_SEGMENTS)) {
        return { removed: rowTokens, remaining: [] };
    }
    if (removeTokens.length === 0) {
        return { removed: [], remaining: rowTokens };
    }
    let effective = rowTokens;
    if (rowTokens.includes(exports.ALL_SEGMENTS)) {
        const universe = (opts.universe ?? [])
            .map((entry) => canonicalizeSegmentToken(entry))
            .filter((token) => token && token !== exports.ALL_SEGMENTS);
        if (universe.length === 0) {
            throw new AmbiguousSegmentSplitError('Cannot partially uproot a planting stored as ALL without the field segment list.');
        }
        effective = [...new Set(universe)];
    }
    return {
        removed: effective.filter((token) => removeTokens.includes(token)),
        remaining: effective.filter((token) => !removeTokens.includes(token)),
    };
}
