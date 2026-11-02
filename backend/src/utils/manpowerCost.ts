/**
 * Manpower cost = approved hours × rate per hour.
 * Rate on a day: the worker's personal rate if one is in force, else the group rate
 * (worker's home site × category). Rate lookup happens in SQL; this file turns the
 * looked-up rows into the cost page and dashboard figures.
 */

export type RateSource = 'personal' | 'group';

export type CostInputRow = {
  recordId: string;
  date: string;
  workerId: string;
  employeeId: string;
  workerName: string;
  category: string;
  siteId: string | null;
  siteName: string;
  activity: string;
  hours: number;
  /** A personal-rate row is in force on this day (its rate may be null = back on group rate). */
  personalRateFound: boolean;
  personalRate: number | null;
  groupRate: number | null;
};

export type CostedRow = CostInputRow & {
  rate: number | null;
  rateSource: RateSource | null;
  cost: number;
};

export type WorkerCostLine = {
  workerId: string;
  employeeId: string;
  workerName: string;
  category: string;
  siteId: string | null;
  siteName: string;
  rate: number | null;
  rateSource: RateSource | null;
  firstDate: string;
  lastDate: string;
  hours: number;
  cost: number;
};

export type CostBucket = { key: string; label: string; hours: number; cost: number };

export type OffGroupWorker = {
  workerId: string;
  employeeId: string;
  workerName: string;
  category: string;
  siteName: string;
  personalRates: number[];
  groupRate: number | null;
  hours: number;
  cost: number;
  /** cost − what the same hours would cost on the group rate (null when no group rate). */
  differenceVsGroup: number | null;
};

export type MissingRateWorker = {
  workerId: string;
  employeeId: string;
  workerName: string;
  category: string;
  siteName: string;
  hours: number;
  firstDate: string;
  lastDate: string;
};

export type CostSummary = {
  totals: { cost: number; hours: number; costedHours: number; missingRateHours: number; workers: number };
  byCategory: CostBucket[];
  byActivity: CostBucket[];
  bySite: CostBucket[];
  offGroupRate: OffGroupWorker[];
  missingRate: MissingRateWorker[];
};

export const UNASSIGNED_ACTIVITY = '';
export const NO_SITE = '';

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function resolveRate(row: Pick<CostInputRow, 'personalRateFound' | 'personalRate' | 'groupRate'>): {
  rate: number | null;
  rateSource: RateSource | null;
} {
  if (row.personalRateFound && row.personalRate != null) {
    return { rate: row.personalRate, rateSource: 'personal' };
  }
  if (row.groupRate != null) {
    return { rate: row.groupRate, rateSource: 'group' };
  }
  return { rate: null, rateSource: null };
}

export function costRows(rows: CostInputRow[]): CostedRow[] {
  return rows.map((row) => {
    const { rate, rateSource } = resolveRate(row);
    return {
      ...row,
      rate,
      rateSource,
      cost: rate == null ? 0 : row.hours * rate,
    };
  });
}

/** One line per worker × rate used — a worker whose rate changed mid-period gets two lines. */
export function buildWorkerCostLines(rows: CostedRow[]): WorkerCostLine[] {
  const lines = new Map<string, WorkerCostLine>();
  for (const row of rows) {
    const key = `${row.workerId}|${row.rateSource ?? 'none'}|${row.rate ?? ''}`;
    const line = lines.get(key);
    if (line) {
      line.hours += row.hours;
      line.cost += row.cost;
      if (row.date < line.firstDate) line.firstDate = row.date;
      if (row.date > line.lastDate) line.lastDate = row.date;
    } else {
      lines.set(key, {
        workerId: row.workerId,
        employeeId: row.employeeId,
        workerName: row.workerName,
        category: row.category,
        siteId: row.siteId,
        siteName: row.siteName,
        rate: row.rate,
        rateSource: row.rateSource,
        firstDate: row.date,
        lastDate: row.date,
        hours: row.hours,
        cost: row.cost,
      });
    }
  }
  return [...lines.values()]
    .map((l) => ({ ...l, hours: round2(l.hours), cost: round2(l.cost) }))
    .sort((a, b) => (
      a.workerName.localeCompare(b.workerName)
      || a.employeeId.localeCompare(b.employeeId)
      || a.firstDate.localeCompare(b.firstDate)
    ));
}

function addToBucket(map: Map<string, CostBucket>, key: string, label: string, hours: number, cost: number) {
  const bucket = map.get(key);
  if (bucket) {
    bucket.hours += hours;
    bucket.cost += cost;
  } else {
    map.set(key, { key, label, hours, cost });
  }
}

function finishBuckets(map: Map<string, CostBucket>): CostBucket[] {
  return [...map.values()]
    .map((b) => ({ ...b, hours: round2(b.hours), cost: round2(b.cost) }))
    .sort((a, b) => b.cost - a.cost || b.hours - a.hours || a.label.localeCompare(b.label));
}

export function buildCostSummary(rows: CostedRow[]): CostSummary {
  let cost = 0;
  let hours = 0;
  let costedHours = 0;
  let missingRateHours = 0;
  const workers = new Set<string>();
  const byCategory = new Map<string, CostBucket>();
  const byActivity = new Map<string, CostBucket>();
  const bySite = new Map<string, CostBucket>();
  const offGroup = new Map<string, OffGroupWorker & { groupCost: number; groupCostKnown: boolean }>();
  const missing = new Map<string, MissingRateWorker>();

  for (const row of rows) {
    hours += row.hours;
    workers.add(row.workerId);

    if (row.rate == null) {
      missingRateHours += row.hours;
      const m = missing.get(row.workerId);
      if (m) {
        m.hours += row.hours;
        if (row.date < m.firstDate) m.firstDate = row.date;
        if (row.date > m.lastDate) m.lastDate = row.date;
      } else {
        missing.set(row.workerId, {
          workerId: row.workerId,
          employeeId: row.employeeId,
          workerName: row.workerName,
          category: row.category,
          siteName: row.siteName,
          hours: row.hours,
          firstDate: row.date,
          lastDate: row.date,
        });
      }
      continue;
    }

    cost += row.cost;
    costedHours += row.hours;
    addToBucket(byCategory, row.category, row.category, row.hours, row.cost);
    const activity = row.activity.trim();
    addToBucket(byActivity, activity || UNASSIGNED_ACTIVITY, activity, row.hours, row.cost);
    addToBucket(bySite, row.siteId || NO_SITE, row.siteName, row.hours, row.cost);

    if (row.rateSource === 'personal') {
      const o = offGroup.get(row.workerId);
      const groupCost = row.groupRate == null ? 0 : row.hours * row.groupRate;
      if (o) {
        o.hours += row.hours;
        o.cost += row.cost;
        o.groupCost += groupCost;
        o.groupCostKnown = o.groupCostKnown && row.groupRate != null;
        if (!o.personalRates.includes(row.rate)) o.personalRates.push(row.rate);
        if (row.groupRate != null) o.groupRate = row.groupRate;
      } else {
        offGroup.set(row.workerId, {
          workerId: row.workerId,
          employeeId: row.employeeId,
          workerName: row.workerName,
          category: row.category,
          siteName: row.siteName,
          personalRates: [row.rate],
          groupRate: row.groupRate,
          hours: row.hours,
          cost: row.cost,
          differenceVsGroup: null,
          groupCost,
          groupCostKnown: row.groupRate != null,
        });
      }
    }
  }

  return {
    totals: {
      cost: round2(cost),
      hours: round2(hours),
      costedHours: round2(costedHours),
      missingRateHours: round2(missingRateHours),
      workers: workers.size,
    },
    byCategory: finishBuckets(byCategory),
    byActivity: finishBuckets(byActivity),
    bySite: finishBuckets(bySite),
    offGroupRate: [...offGroup.values()]
      .map(({ groupCost, groupCostKnown, ...o }) => ({
        ...o,
        personalRates: [...o.personalRates].sort((a, b) => a - b),
        hours: round2(o.hours),
        cost: round2(o.cost),
        differenceVsGroup: groupCostKnown ? round2(o.cost - groupCost) : null,
      }))
      .sort((a, b) => a.workerName.localeCompare(b.workerName)),
    missingRate: [...missing.values()]
      .map((m) => ({ ...m, hours: round2(m.hours) }))
      .sort((a, b) => b.hours - a.hours || a.workerName.localeCompare(b.workerName)),
  };
}
