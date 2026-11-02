import { matchMasterOption } from './masterDataFuzzyMatch';

const JUSTIFICATION_CATEGORIES = new Set(['pest', 'disease', 'preventative']);

const CATEGORY_ORDER = { pest: 0, disease: 1, preventative: 2 };

const PREFIX_RULES = [
  { pattern: /^pest\s*:\s*/i, category: 'pest' },
  { pattern: /^disease\s*:\s*/i, category: 'disease' },
  { pattern: /^preventative\s*:\s*/i, category: 'preventative' },
  { pattern: /^preventive\s*:\s*/i, category: 'preventative' },
];

export function normJustification(value) {
  return String(value || '').trim().toLowerCase();
}

export function isBarePreventativeName(name) {
  return /^prevent(?:ative|ive)$/i.test(String(name || '').trim());
}

export function parseJustificationInput(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return { bareName: '', categoryHint: null };

  for (const rule of PREFIX_RULES) {
    if (rule.pattern.test(trimmed)) {
      return { bareName: trimmed.replace(rule.pattern, '').trim(), categoryHint: rule.category };
    }
  }
  return { bareName: trimmed, categoryHint: null };
}

export function catalogJustificationLabel(entry) {
  if (!entry) return '';
  const name = String(entry.name || '').trim();
  if (!name) return '';
  if (entry.category === 'pest') return `Pest : ${name}`;
  if (entry.category === 'disease') return `Disease : ${name}`;
  if (entry.category === 'preventative') {
    if (isBarePreventativeName(name)) return 'Preventative';
    return `Preventative : ${name}`;
  }
  return name;
}

function justificationEntries(catalog) {
  return (catalog || []).filter((entry) => (
    entry
    && JUSTIFICATION_CATEGORIES.has(entry.category)
    && entry.is_active !== false
  ));
}

export function justificationOptionsFromCatalog(catalog) {
  return justificationEntries(catalog)
    .slice()
    .sort((a, b) => {
      const byCategory = (CATEGORY_ORDER[a.category] ?? 9) - (CATEGORY_ORDER[b.category] ?? 9);
      if (byCategory !== 0) return byCategory;
      if (a.category === 'preventative') {
        const aSeed = isBarePreventativeName(a.name);
        const bSeed = isBarePreventativeName(b.name);
        if (aSeed !== bSeed) return aSeed ? -1 : 1;
      }
      return String(a.name || '').localeCompare(String(b.name || ''), undefined, { numeric: true });
    })
    .map(catalogJustificationLabel)
    .filter(Boolean);
}

export function applyJustificationColumnOptions(columns, optionString) {
  if (!optionString) return columns || [];
  return (columns || []).map((col) => (
    col.key === 'justification' ? { ...col, options: optionString } : col
  ));
}

function findPreventativeSeed(catalog) {
  return justificationEntries(catalog).find((entry) => (
    entry.category === 'preventative' && isBarePreventativeName(entry.name)
  ));
}

function matchesBareName(entry, bareName) {
  return normJustification(entry.name) === normJustification(bareName);
}

function catalogMatchOptions(entries) {
  return entries.map((entry) => ({
    id: entry.id || catalogJustificationLabel(entry),
    name: entry.name,
    entry,
  }));
}

function findFuzzyCatalogEntry(bareName, entries, categoryHint) {
  const pool = categoryHint
    ? entries.filter((entry) => entry.category === categoryHint)
    : entries;
  const options = catalogMatchOptions(pool.length ? pool : entries);
  const hit = matchMasterOption(bareName, options, { maxDistance: 2 });
  if (!hit) return null;
  return options.find((opt) => opt.id === hit.id)?.entry || null;
}

export function catalogEntryById(catalog, id) {
  if (!id) return null;
  return justificationEntries(catalog).find((entry) => entry.id === id) || null;
}

export function resolveJustificationLabel(raw, catalog, picks = null) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return { status: 'empty', label: '', bareName: '', categoryHint: null };

  const parsed = parseJustificationInput(trimmed);
  const pick = picks && parsed.bareName
    ? picks[normJustification(parsed.bareName)]
    : null;
  if (pick?.entry) {
    return {
      status: 'matched',
      label: catalogJustificationLabel(pick.entry),
      bareName: pick.entry.name,
      categoryHint: pick.entry.category,
      entry: pick.entry,
    };
  }
  if (pick?.matchId) {
    const matchedEntry = catalogEntryById(catalog, pick.matchId);
    if (matchedEntry) {
      return {
        status: 'matched',
        label: catalogJustificationLabel(matchedEntry),
        bareName: matchedEntry.name,
        categoryHint: matchedEntry.category,
        entry: matchedEntry,
      };
    }
  }

  const preventativeSeed = findPreventativeSeed(catalog);

  if (
    isBarePreventativeName(trimmed)
    || (parsed.categoryHint === 'preventative' && (!parsed.bareName || isBarePreventativeName(parsed.bareName)))
  ) {
    return {
      status: 'matched',
      label: preventativeSeed ? catalogJustificationLabel(preventativeSeed) : 'Preventative',
      bareName: preventativeSeed?.name || 'Preventative',
      categoryHint: 'preventative',
      entry: preventativeSeed || null,
    };
  }

  const entries = justificationEntries(catalog);
  const byLabel = entries.find((entry) => normJustification(catalogJustificationLabel(entry)) === normJustification(trimmed));
  if (byLabel) {
    return {
      status: 'matched',
      label: catalogJustificationLabel(byLabel),
      bareName: byLabel.name,
      categoryHint: byLabel.category,
      entry: byLabel,
    };
  }

  const nameMatches = entries.filter((entry) => matchesBareName(entry, parsed.bareName));
  const hinted = parsed.categoryHint
    ? nameMatches.filter((entry) => entry.category === parsed.categoryHint)
    : nameMatches;

  const preferred = hinted.find((entry) => entry.category === 'pest')
    || hinted.find((entry) => entry.category === 'disease')
    || hinted.find((entry) => entry.category === 'preventative')
    || hinted[0];

  if (preferred) {
    return {
      status: 'matched',
      label: catalogJustificationLabel(preferred),
      bareName: preferred.name,
      categoryHint: preferred.category,
      entry: preferred,
    };
  }

  const fuzzy = findFuzzyCatalogEntry(parsed.bareName, entries, parsed.categoryHint);
  if (fuzzy) {
    return {
      status: 'matched',
      label: catalogJustificationLabel(fuzzy),
      bareName: fuzzy.name,
      categoryHint: fuzzy.category,
      entry: fuzzy,
    };
  }

  return {
    status: 'unknown',
    label: trimmed,
    bareName: parsed.bareName,
    categoryHint: parsed.categoryHint,
    entry: null,
  };
}

export function uniqueUnknownJustifications(values, catalog) {
  const seen = new Set();
  const unknowns = [];
  (values || []).forEach((value) => {
    const resolved = resolveJustificationLabel(value, catalog);
    if (resolved.status !== 'unknown' || !resolved.bareName) return;
    const key = normJustification(resolved.bareName);
    if (seen.has(key)) return;
    seen.add(key);
    unknowns.push({
      bareName: resolved.bareName,
      categoryHint: resolved.categoryHint,
    });
  });
  return unknowns;
}

export function rewriteJustificationValue(value, catalog, picks = null) {
  const resolved = resolveJustificationLabel(value, catalog, picks);
  if (resolved.status === 'empty') return '';
  return resolved.label;
}

export function rewriteJustificationRecord(value, catalog, picks = null) {
  const resolved = resolveJustificationLabel(value, catalog, picks);
  if (resolved.status === 'empty') {
    return { justification: '', justificationCatalogId: null };
  }
  return {
    justification: resolved.label,
    justificationCatalogId: resolved.entry?.id || null,
  };
}
