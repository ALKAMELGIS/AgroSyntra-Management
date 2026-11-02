/**
 * Minimal RFC-4180-compatible CSV parser.
 *
 * Handles:
 *   - Quoted fields containing commas, newlines, and "" escapes
 *   - \r\n and \n line endings
 *   - Empty lines (dropped) and trailing lines without a newline
 *
 * Does NOT handle:
 *   - Non-comma delimiters (TSV, semicolon-separated)
 *   - BOM markers — caller can strip them if needed
 *
 * Returns a 2D array of strings. Use `parseCsvAsObjects` to get an
 * array of row objects keyed by header name.
 */
export function parseCsvRaw(text: string): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        row.push(field); field = '';
      } else if (c === '\n') {
        row.push(field); field = '';
        rows.push(row); row = [];
      } else if (c === '\r') {
        // Normalised out; CRLF line endings come through as \r\n and we
        // just drop the \r so the \n handler closes the row.
      } else {
        field += c;
      }
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Drop fully-empty trailing rows so an extra blank line at the
  // bottom of a CSV doesn't register as a "row".
  return rows.filter((r) => r.some((cell) => cell !== ''));
}

export function parseCsvAsObjects(text: string): {
  headers: string[];
  rows: Record<string, string>[];
} {
  const raw = parseCsvRaw(text);
  if (raw.length === 0) return { headers: [], rows: [] };
  const headers = raw[0].map((h) => h.trim());
  const rows = raw.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) {
      obj[headers[i]] = (r[i] ?? '').trim();
    }
    return obj;
  });
  return { headers, rows };
}
