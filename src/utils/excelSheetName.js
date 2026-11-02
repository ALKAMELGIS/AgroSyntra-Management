export function excelSheetName(name, used = new Set()) {
  const cleaned = String(name || 'Sheet')
    .replace(/[\\/*?:[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 31) || 'Sheet';
  let candidate = cleaned;
  let n = 2;
  while (used.has(candidate.toLowerCase())) {
    const suffix = ` (${n})`;
    candidate = `${cleaned.slice(0, Math.max(1, 31 - suffix.length))}${suffix}`;
    n += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

export function uniqueColumnLabel(name, used = new Map()) {
  const base = String(name || '').trim() || 'Column';
  const key = base.toLowerCase();
  const count = (used.get(key) || 0) + 1;
  used.set(key, count);
  return count > 1 ? `${base} #${count}` : base;
}

export function formatExportDate(value) {
  if (value == null || value === '') return '';
  const match = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  return String(value);
}

export function asExportNumber(value) {
  if (value === '' || value == null) return '';
  const n = Number(value);
  return Number.isFinite(n) ? n : value;
}

export function safeExportFilename(name) {
  const cleaned = String(name || 'export')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || 'export';
}
