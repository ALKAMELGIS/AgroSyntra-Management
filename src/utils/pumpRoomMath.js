export function parsePumpsFromRow(row) {
  if (row?.pumps && Array.isArray(row.pumps)) {
    return row.pumps.map((p) => ({
      reading: p?.reading != null ? Number(p.reading) : null,
      usage: p?.usage != null ? Number(p.usage) : null,
    }));
  }
  const legacy = [];
  if (row?.reading_1 != null || row?.usage_1 != null) {
    legacy.push({
      reading: row.reading_1 != null ? Number(row.reading_1) : null,
      usage: row.usage_1 != null ? Number(row.usage_1) : null,
    });
  }
  if (row?.reading_2 != null || row?.usage_2 != null) {
    legacy.push({
      reading: row.reading_2 != null ? Number(row.reading_2) : null,
      usage: row.usage_2 != null ? Number(row.usage_2) : null,
    });
  }
  return legacy;
}

export function pumpCellUsage(currPump, prevPump, isFirstRow) {
  if (isFirstRow) return null;
  const reading = currPump?.reading ?? null;
  const prevReading = prevPump?.reading ?? null;
  if (reading != null && prevReading != null) return reading - prevReading;
  return currPump?.usage ?? null;
}

export function computePumpTotals(records, pumpCount) {
  const totals = Array.from({ length: pumpCount }, () => 0);
  for (let i = 1; i < records.length; i += 1) {
    const curr = parsePumpsFromRow(records[i]);
    const prev = parsePumpsFromRow(records[i - 1]);
    for (let p = 0; p < pumpCount; p += 1) {
      const c = curr[p]?.reading;
      const pr = prev[p]?.reading;
      if (c != null && pr != null) totals[p] += c - pr;
    }
  }
  return totals;
}

export function recordMonthKey(record) {
  const date = String(record?.record_date || '').split('T')[0];
  return date ? date.slice(0, 7) : '';
}
