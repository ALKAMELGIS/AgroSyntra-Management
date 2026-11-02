export type ProductRef = { id: string; name: string };

export type MatchStatus = 'matched' | 'suggested' | 'unmatched';

export type FilenameMatch = {
  status: MatchStatus;
  productId: string | null;
  productName: string | null;
};

const NOISE_WORDS = new Set([
  'msds', 'sds', 'safety', 'data', 'sheet', 'label', 'ghs', 'en', 'aus', 'au',
  'new', 'of', 'the', 'and', 'all', 'doc', 'docs', 'final', 'insecticide',
  'fungicide', 'organic', 'insect', 'spray', 'cpa', 'sc', 'wp', 'wg', 'ec',
  'sl', 'od', 'cs', 'flowable', 'ml',
]);

const UNMATCHED: FilenameMatch = {
  status: 'unmatched',
  productId: null,
  productName: null,
};

export function normalizeMsdsText(input: string): string {
  return String(input || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 1 && !NOISE_WORDS.has(token) && !/^\d+$/.test(token))
    .join(' ')
    .trim();
}

export function basenameFromZipPath(entryName: string): string {
  const parts = String(entryName || '').split(/[/\\]/);
  return parts[parts.length - 1] || '';
}

function compact(value: string): string {
  return value.replace(/\s+/g, '');
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = new Array(b.length + 1);
  const curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) prev[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j += 1) prev[j] = curr[j];
  }
  return prev[b.length];
}

function scoreProduct(normFile: string, compactFile: string, productName: string): { score: number; exact: boolean } {
  const normName = normalizeMsdsText(productName);
  const compactName = compact(normName);
  if (!normName) return { score: 0, exact: false };

  const lengthBonus = Math.min(normName.length, 24) * 0.15;
  if (normName === normFile || compactName === compactFile) {
    return { score: 100 + lengthBonus, exact: true };
  }
  if (normName.length >= 4 && (normFile.includes(normName) || compactFile.includes(compactName))) {
    return { score: 80 + lengthBonus, exact: false };
  }
  if (normFile.length >= 4 && (normName.includes(normFile) || compactName.includes(compactFile))) {
    return { score: 70 + lengthBonus, exact: false };
  }

  const distance = levenshtein(compactName, compactFile);
  const maxLen = Math.max(compactName.length, compactFile.length, 1);
  if (maxLen >= 5 && distance <= 2) {
    return { score: 60 - distance + lengthBonus, exact: false };
  }
  if (maxLen >= 6 && distance / maxLen <= 0.25) {
    return { score: 50 - distance + lengthBonus, exact: false };
  }
  return { score: 0, exact: false };
}

export function matchFilenameToProducts(filename: string, products: ProductRef[]): FilenameMatch {
  const base = basenameFromZipPath(filename);
  const normFile = normalizeMsdsText(base);
  const compactFile = compact(normFile);
  if (!normFile || products.length === 0) return UNMATCHED;

  const ranked = products
    .map((product) => {
      const { score, exact } = scoreProduct(normFile, compactFile, product.name);
      return { product, score, exact };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score);

  if (ranked.length === 0) return UNMATCHED;

  const top = ranked[0];
  const tied = ranked.filter((row) => Math.abs(row.score - top.score) < 0.01 && row.product.id !== top.product.id);
  if (tied.length > 0 && !top.exact) return UNMATCHED;

  return {
    status: top.exact || top.score >= 90 ? 'matched' : 'suggested',
    productId: top.product.id,
    productName: top.product.name,
  };
}
