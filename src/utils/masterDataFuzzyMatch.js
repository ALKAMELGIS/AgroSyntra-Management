/**
 * Name matching for spreadsheet import: normalize, exact, then unique close match.
 * Does not substring-match (avoids "Tomato Sweetcorn" picking Tomato).
 */

export function normalizeMasterName(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[-_/]+/g, ' ')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function compactMasterName(value) {
  return normalizeMasterName(value).replace(/\s+/g, '');
}

export function levenshtein(a, b) {
  const s = String(a ?? '');
  const t = String(b ?? '');
  if (s === t) return 0;
  if (!s.length) return t.length;
  if (!t.length) return s.length;
  const prev = new Array(t.length + 1);
  const curr = new Array(t.length + 1);
  for (let j = 0; j <= t.length; j += 1) prev[j] = j;
  for (let i = 1; i <= s.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= t.length; j += 1) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= t.length; j += 1) prev[j] = curr[j];
  }
  return prev[t.length];
}

/**
 * @param {string} raw
 * @param {{ id: string, name: string }[]} options
 * @param {{ maxDistance?: number }} [opts]
 * @returns {{ id: string, name: string, confidence: 'exact' | 'close' } | null}
 */
export function matchMasterOption(raw, options, opts = {}) {
  const maxDistance = opts.maxDistance ?? 1;
  const needleNorm = normalizeMasterName(raw);
  const needleCompact = compactMasterName(raw);
  if (!needleNorm || !Array.isArray(options) || options.length === 0) return null;

  const exact = options.filter((opt) => {
    const n = normalizeMasterName(opt.name);
    const c = compactMasterName(opt.name);
    return n === needleNorm || c === needleCompact;
  });
  if (exact.length === 1) {
    return { id: exact[0].id, name: exact[0].name, confidence: 'exact' };
  }
  if (exact.length > 1) return null;

  const scored = [];
  options.forEach((opt) => {
    const n = normalizeMasterName(opt.name);
    const c = compactMasterName(opt.name);
    // Short codes (GH01 vs NH01) differ by one letter; require exact compact match.
    if (Math.min(needleCompact.length, c.length) < 5) return;
    const dist = Math.min(levenshtein(needleNorm, n), levenshtein(needleCompact, c));
    if (dist <= maxDistance) scored.push({ opt, dist });
  });
  if (!scored.length) return null;
  scored.sort((a, b) => a.dist - b.dist);
  const best = scored[0].dist;
  const winners = scored.filter((s) => s.dist === best);
  if (winners.length !== 1) return null;
  return { id: winners[0].opt.id, name: winners[0].opt.name, confidence: 'close' };
}
