export type PumpReading = { reading?: number | null; usage?: number | null };

export function normalizePumps(row: Record<string, unknown>): PumpReading[] {
  const raw = row.pumps;
  if (Array.isArray(raw)) {
    return raw.map((p: any) => ({
      reading: p?.reading != null ? Number(p.reading) : null,
      usage: p?.usage != null ? Number(p.usage) : null,
    }));
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return normalizePumps({ pumps: parsed });
    } catch { /* fall through */ }
  }
  const legacy: PumpReading[] = [];
  if (row.reading_1 != null || row.usage_1 != null) {
    legacy.push({
      reading: row.reading_1 != null ? Number(row.reading_1) : null,
      usage: row.usage_1 != null ? Number(row.usage_1) : null,
    });
  }
  if (row.reading_2 != null || row.usage_2 != null) {
    legacy.push({
      reading: row.reading_2 != null ? Number(row.reading_2) : null,
      usage: row.usage_2 != null ? Number(row.usage_2) : null,
    });
  }
  return legacy;
}

export function pumpsToLegacyColumns(pumps: PumpReading[]) {
  return {
    reading_1: pumps[0]?.reading ?? null,
    usage_1: pumps[0]?.usage ?? null,
    reading_2: pumps[1]?.reading ?? null,
    usage_2: pumps[1]?.usage ?? null,
  };
}

export function formatRow(row: Record<string, unknown>) {
  const pumps = normalizePumps(row);
  const legacy = pumpsToLegacyColumns(pumps);
  return { ...row, pumps, ...legacy };
}

export function parsePumpsInput(body: {
  pumps?: PumpReading[];
  reading1?: number | null;
  usage1?: number | null;
  reading2?: number | null;
  usage2?: number | null;
}): PumpReading[] {
  if (body.pumps && Array.isArray(body.pumps)) {
    return body.pumps.map((p) => ({
      reading: p.reading ?? null,
      usage: p.usage ?? null,
    }));
  }
  const pumps: PumpReading[] = [];
  if (body.reading1 != null || body.usage1 != null) {
    pumps.push({ reading: body.reading1 ?? null, usage: body.usage1 ?? null });
  }
  if (body.reading2 != null || body.usage2 != null) {
    pumps.push({ reading: body.reading2 ?? null, usage: body.usage2 ?? null });
  }
  return pumps;
}

export function updatePumpAtIndex(existing: PumpReading[], pumpIndex: number, reading: number | null): PumpReading[] {
  const pumps = [...existing];
  while (pumps.length <= pumpIndex) pumps.push({ reading: null, usage: null });
  pumps[pumpIndex] = { ...pumps[pumpIndex], reading };
  return pumps;
}

export function defaultPumpLabels(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `Pump ${i + 1}`);
}

export const DEFAULT_CONFIG = {
  water_pump_count: 2,
  electricity_pump_count: 2,
  fogger_pump_count: 2,
  water_pump_labels: ['Pump 1', 'Pump 2'],
  electricity_pump_labels: ['Pump 1', 'Pump 2'],
  fogger_pump_labels: ['Pump 1', 'Pump 2'],
};
