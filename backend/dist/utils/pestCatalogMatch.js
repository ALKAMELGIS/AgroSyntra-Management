"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizePestCatalogName = normalizePestCatalogName;
exports.compactPestCatalogName = compactPestCatalogName;
exports.isBarePreventativeName = isBarePreventativeName;
exports.catalogJustificationLabel = catalogJustificationLabel;
exports.parseJustificationBareName = parseJustificationBareName;
exports.pickExistingCatalogEntry = pickExistingCatalogEntry;
exports.findExistingCatalogEntry = findExistingCatalogEntry;
exports.hideCatalogStrategy = hideCatalogStrategy;
exports.expandCatalogIdsForQuery = expandCatalogIdsForQuery;
exports.justificationLabelsForIds = justificationLabelsForIds;
const PREFIX_RULES = [
    { pattern: /^pest\s*:\s*/i, category: 'pest' },
    { pattern: /^disease\s*:\s*/i, category: 'disease' },
    { pattern: /^preventative\s*:\s*/i, category: 'preventative' },
    { pattern: /^preventive\s*:\s*/i, category: 'preventative' },
];
function normalizePestCatalogName(value) {
    return String(value ?? '')
        .trim()
        .toLowerCase()
        .replace(/[-_/]+/g, ' ')
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}
function compactPestCatalogName(value) {
    return normalizePestCatalogName(value).replace(/\s+/g, '');
}
function isBarePreventativeName(name) {
    return /^prevent(?:ative|ive)$/i.test(String(name || '').trim());
}
function catalogJustificationLabel(entry) {
    if (!entry)
        return '';
    const name = String(entry.name || '').trim();
    if (!name)
        return '';
    if (entry.category === 'pest')
        return `Pest : ${name}`;
    if (entry.category === 'disease')
        return `Disease : ${name}`;
    if (entry.category === 'preventative') {
        if (isBarePreventativeName(name))
            return 'Preventative';
        return `Preventative : ${name}`;
    }
    return name;
}
function parseJustificationBareName(raw) {
    const trimmed = String(raw || '').trim();
    if (!trimmed)
        return { bareName: '', categoryHint: null };
    for (const rule of PREFIX_RULES) {
        if (rule.pattern.test(trimmed)) {
            return { bareName: trimmed.replace(rule.pattern, '').trim(), categoryHint: rule.category };
        }
    }
    return { bareName: trimmed, categoryHint: null };
}
function levenshtein(a, b) {
    const s = String(a ?? '');
    const t = String(b ?? '');
    if (s === t)
        return 0;
    if (!s.length)
        return t.length;
    if (!t.length)
        return s.length;
    const prev = new Array(t.length + 1);
    const curr = new Array(t.length + 1);
    for (let j = 0; j <= t.length; j += 1)
        prev[j] = j;
    for (let i = 1; i < s.length + 1; i += 1) {
        curr[0] = i;
        for (let j = 1; j <= t.length; j += 1) {
            const cost = s[i - 1] === t[j - 1] ? 0 : 1;
            curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
        }
        for (let j = 0; j <= t.length; j += 1)
            prev[j] = curr[j];
    }
    return prev[t.length];
}
function namesMatchExact(raw, entryName) {
    const needleNorm = normalizePestCatalogName(raw);
    const needleCompact = compactPestCatalogName(raw);
    const n = normalizePestCatalogName(entryName);
    const c = compactPestCatalogName(entryName);
    return Boolean(needleNorm) && (n === needleNorm || c === needleCompact);
}
function uniqueCloseMatch(raw, entries, maxDistance = 2) {
    const needleNorm = normalizePestCatalogName(raw);
    const needleCompact = compactPestCatalogName(raw);
    if (!needleNorm)
        return null;
    const scored = [];
    for (const entry of entries) {
        const name = String(entry.name || '');
        const n = normalizePestCatalogName(name);
        const c = compactPestCatalogName(name);
        if (Math.min(needleCompact.length, c.length) < 5)
            continue;
        const dist = Math.min(levenshtein(needleNorm, n), levenshtein(needleCompact, c));
        if (dist <= maxDistance)
            scored.push({ entry, dist });
    }
    if (!scored.length)
        return null;
    scored.sort((a, b) => a.dist - b.dist);
    const best = scored[0].dist;
    const winners = scored.filter((s) => s.dist === best);
    if (winners.length !== 1)
        return null;
    return winners[0].entry;
}
function pickExistingCatalogEntry(matches, organizationId, category) {
    if (!matches.length)
        return null;
    const sameCat = category
        ? matches.filter((entry) => entry.category === category)
        : matches;
    const pool = sameCat.length ? sameCat : matches;
    if (organizationId) {
        const orgOwned = pool.find((entry) => entry.organization_id === organizationId);
        if (orgOwned)
            return orgOwned;
    }
    const foundation = pool.find((entry) => entry.organization_id == null);
    return foundation || pool[0];
}
function findExistingCatalogEntry(rawName, catalog, opts = {}) {
    const active = (catalog || []).filter((entry) => entry && entry.is_active !== false);
    const exact = active.filter((entry) => namesMatchExact(rawName, String(entry.name || '')));
    if (exact.length >= 1) {
        return pickExistingCatalogEntry(exact, opts.organizationId, opts.category);
    }
    const close = uniqueCloseMatch(rawName, active);
    if (!close)
        return null;
    if (opts.category && close.category && close.category !== opts.category)
        return null;
    return close;
}
function hideCatalogStrategy(entry, organizationId) {
    if (entry.organization_id === organizationId)
        return 'deactivate';
    if (entry.organization_id == null)
        return 'org_hidden';
    return 'forbidden';
}
function expandCatalogIdsForQuery(query, entries, links) {
    const needle = String(query || '').trim().toLowerCase();
    if (!needle)
        return [];
    const matched = new Set();
    for (const entry of entries) {
        const name = String(entry.name || '').toLowerCase();
        const label = catalogJustificationLabel(entry).toLowerCase();
        if (name.includes(needle) || label.includes(needle)) {
            matched.add(entry.id);
        }
    }
    for (const link of links) {
        if (matched.has(link.groupId))
            matched.add(link.memberId);
    }
    return [...matched];
}
function justificationLabelsForIds(ids, entries) {
    const wanted = new Set(ids);
    return entries
        .filter((entry) => entry.id && wanted.has(entry.id))
        .map((entry) => catalogJustificationLabel(entry))
        .filter(Boolean);
}
