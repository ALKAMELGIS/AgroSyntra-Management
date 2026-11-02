export function formatPercentSeen(value) {
  if (value == null || value === '') return '';
  const raw = String(value).trim();
  if (!raw) return '';
  if (raw.includes('%')) return raw;
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  if (n > 0 && n < 1) {
    const pct = parseFloat((n * 100).toPrecision(12));
    return `${pct}%`;
  }
  return raw;
}
