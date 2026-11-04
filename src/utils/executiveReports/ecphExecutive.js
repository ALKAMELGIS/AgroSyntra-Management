import {
  avg, toNum, normalizePercentDrain, filterByDateRange, getPreviousPeriod,
  pctChange, formatDelta, topN, ecInRange, phInRange, drainInRange,
} from '../executiveReportUtils';

function flattenEcphEntries(entries, fieldInfoMap) {
  const rows = [];
  entries.forEach((entry) => {
    const fieldInfo = fieldInfoMap[entry.fieldId] || {};
    const fieldLabel = entry.fieldName || fieldInfo.name || entry.fieldId;
    const valves = entry.valveReadings || [];
    if (valves.length === 0) {
      rows.push({
        date: entry.date,
        field: fieldLabel,
        fieldId: entry.fieldId,
        ecIn: null, ecOut: null, phIn: null, phOut: null, percentDrain: null,
        totalWaterQty: toNum(entry.totalWaterQty),
      });
    } else {
      valves.forEach((v) => {
        rows.push({
          date: entry.date,
          field: fieldLabel,
          fieldId: entry.fieldId,
          ecIn: toNum(v.ecIn) || null,
          ecOut: toNum(v.ecOut ?? v.ec) || null,
          phIn: toNum(v.phIn) || null,
          phOut: toNum(v.phOut ?? v.ph) || null,
          percentDrain: normalizePercentDrain(v.percentDrain),
          totalWaterQty: toNum(v.totalWaterQty ?? entry.totalWaterQty),
        });
      });
    }
  });
  return rows;
}

function aggregate(rows) {
  const ecIns = rows.map((r) => r.ecIn).filter((v) => v > 0);
  const ecOuts = rows.map((r) => r.ecOut).filter((v) => v > 0);
  const phIns = rows.map((r) => r.phIn).filter((v) => v > 0);
  const phOuts = rows.map((r) => r.phOut).filter((v) => v > 0);
  const drains = rows.map((r) => r.percentDrain).filter((v) => v != null && v > 0);
  const fieldsLogged = new Set(rows.map((r) => r.fieldId)).size;
  const readingCount = rows.filter((r) => r.ecIn || r.ecOut || r.phIn || r.phOut).length;

  let inRangeCount = 0;
  let measuredCount = 0;
  rows.forEach((r) => {
    if (r.ecOut > 0) {
      measuredCount += 1;
      if (ecInRange(r.ecOut) && (!r.phOut || phInRange(r.phOut))) inRangeCount += 1;
    }
  });

  const byField = {};
  rows.forEach((r) => {
    if (!byField[r.field]) {
      byField[r.field] = { ecOut: [], drain: [], count: 0 };
    }
    byField[r.field].count += 1;
    if (r.ecOut > 0) byField[r.field].ecOut.push(r.ecOut);
    if (r.percentDrain != null) byField[r.field].drain.push(r.percentDrain);
  });

  return {
    readingCount,
    entryCount: new Set(rows.map((r) => `${r.date}|${r.fieldId}`)).size,
    fieldsLogged,
    avgEcIn: avg(ecIns),
    avgEcOut: avg(ecOuts),
    avgPhIn: avg(phIns),
    avgPhOut: avg(phOuts),
    avgDrain: avg(drains),
    totalWater: rows.reduce((s, r) => s + (r.totalWaterQty || 0), 0),
    inRangePct: measuredCount > 0 ? (inRangeCount / measuredCount) * 100 : null,
    byField,
  };
}

function buildTopFive(byField) {
  const fieldStats = Object.entries(byField).map(([field, data]) => ({
    field,
    avgEcOut: avg(data.ecOut),
    avgDrain: avg(data.drain),
    count: data.count,
  }));

  return [
    {
      title: 'Highest EC Out (fields)',
      items: topN(
        fieldStats.filter((f) => f.avgEcOut != null).sort((a, b) => b.avgEcOut - a.avgEcOut),
      ).map((f) => ({
        label: f.field,
        value: f.avgEcOut.toFixed(2),
        subtitle: 'avg EC out',
      })),
    },
    {
      title: 'Lowest Drain % (fields)',
      items: topN(
        fieldStats.filter((f) => f.avgDrain != null).sort((a, b) => a.avgDrain - b.avgDrain),
      ).map((f) => ({
        label: f.field,
        value: `${f.avgDrain.toFixed(1)}%`,
        subtitle: 'avg drain',
      })),
    },
    {
      title: 'Most Readings Logged',
      items: topN(fieldStats.sort((a, b) => b.count - a.count)).map((f) => ({
        label: f.field,
        value: String(f.count),
        subtitle: 'readings',
      })),
    },
  ];
}

function buildInsights(current, rows, allFieldCount) {
  const insights = [];

  if (rows.length === 0) {
    insights.push({ type: 'info', message: 'No EC/pH data recorded for this period.' });
    return insights;
  }

  if (current.inRangePct != null && current.inRangePct >= 80) {
    insights.push({
      type: 'success',
      message: `${current.inRangePct.toFixed(0)}% of EC/pH readings were within target range (EC 1.5–3.0, pH 5.5–6.5).`,
    });
  } else if (current.inRangePct != null) {
    insights.push({
      type: 'warning',
      message: `Only ${current.inRangePct.toFixed(0)}% of readings within target range — review fields with high EC out or pH drift.`,
    });
  }

  if (current.avgDrain != null && drainInRange(current.avgDrain)) {
    insights.push({
      type: 'success',
      message: `Average drain ${current.avgDrain.toFixed(1)}% is within the 15–30% target band.`,
    });
  } else if (current.avgDrain != null && current.avgDrain < 15) {
    insights.push({
      type: 'warning',
      message: `Average drain ${current.avgDrain.toFixed(1)}% is below 15% — risk of salt buildup; consider increasing leaching.`,
    });
  } else if (current.avgDrain != null && current.avgDrain > 30) {
    insights.push({
      type: 'warning',
      message: `Average drain ${current.avgDrain.toFixed(1)}% exceeds 30% — review irrigation duration and frequency.`,
    });
  }

  const highEcFields = Object.entries(current.byField)
    .filter(([, d]) => avg(d.ecOut) != null && avg(d.ecOut) > 3.0)
    .map(([f]) => f);
  if (highEcFields.length > 0) {
    insights.push({
      type: 'error',
      message: `${highEcFields.length} field(s) with avg EC out above 3.0: ${highEcFields.slice(0, 5).join(', ')}${highEcFields.length > 5 ? '…' : ''}.`,
    });
  }

  if (allFieldCount > 0 && current.fieldsLogged < allFieldCount) {
    const missing = allFieldCount - current.fieldsLogged;
    insights.push({
      type: 'info',
      message: `${missing} field(s) had no EC/pH logs this period — coverage ${current.fieldsLogged}/${allFieldCount}.`,
    });
  }

  return insights;
}

function buildSummary(current, dateFrom, dateTo, prevAgg) {
  if (current.readingCount === 0) {
    return 'No EC/pH readings were recorded for the selected period.';
  }

  const parts = [
    `During the selected period, ${current.readingCount} valve reading(s) were logged across ${current.fieldsLogged} field(s).`,
  ];

  if (current.avgEcOut != null) {
    parts.push(`Average EC out was ${current.avgEcOut.toFixed(2)}`);
    if (current.avgPhOut != null) parts[parts.length - 1] += ` and pH out ${current.avgPhOut.toFixed(2)}`;
    parts[parts.length - 1] += '.';
  }

  if (prevAgg && prevAgg.readingCount > 0 && current.avgEcOut != null && prevAgg.avgEcOut != null) {
    const ecDelta = current.avgEcOut - prevAgg.avgEcOut;
    if (Math.abs(ecDelta) >= 0.1) {
      parts.push(`EC out ${ecDelta > 0 ? 'increased' : 'decreased'} by ${Math.abs(ecDelta).toFixed(2)} compared to the previous period.`);
    }
  }

  return parts.join(' ');
}

export function buildEcphExecutiveReport(entries, fieldInfoMap, dateFrom, dateTo) {
  const filtered = filterByDateRange(entries, dateFrom, dateTo);
  const rows = flattenEcphEntries(filtered, fieldInfoMap);
  const current = aggregate(rows);
  const allFieldCount = Object.keys(fieldInfoMap).length;

  const prev = getPreviousPeriod(dateFrom, dateTo);
  const prevRows = flattenEcphEntries(filterByDateRange(entries, prev.from, prev.to), fieldInfoMap);
  const prevAgg = aggregate(prevRows);

  const kpis = [
    {
      title: 'Readings',
      value: String(current.readingCount),
      subtitle: `${current.fieldsLogged} fields`,
      color: '#333',
    },
    {
      title: 'Avg EC Out',
      value: current.avgEcOut != null ? current.avgEcOut.toFixed(2) : '—',
      delta: formatDelta(pctChange(current.avgEcOut, prevAgg.avgEcOut)),
      color: current.avgEcOut != null && !ecInRange(current.avgEcOut) ? '#e65100' : '#1f7a4d',
    },
    {
      title: 'Avg pH Out',
      value: current.avgPhOut != null ? current.avgPhOut.toFixed(2) : '—',
      delta: formatDelta(pctChange(current.avgPhOut, prevAgg.avgPhOut)),
      color: '#3b82f6',
    },
    {
      title: 'Avg Drain %',
      value: current.avgDrain != null ? `${current.avgDrain.toFixed(1)}%` : '—',
      color: current.avgDrain != null && !drainInRange(current.avgDrain) ? '#e65100' : '#2f6aa8',
    },
    {
      title: 'In Target Range',
      value: current.inRangePct != null ? `${current.inRangePct.toFixed(0)}%` : '—',
      subtitle: 'EC & pH readings',
      color: current.inRangePct != null && current.inRangePct >= 80 ? '#1f7a4d' : '#f59e0b',
    },
    {
      title: 'Total Water',
      value: current.totalWater > 0 ? `${current.totalWater.toFixed(1)} m³` : '—',
      color: '#64748b',
    },
  ];

  return {
    kpis,
    summary: buildSummary(current, dateFrom, dateTo, prevAgg),
    insights: buildInsights(current, rows, allFieldCount),
    topFive: buildTopFive(current.byField),
    hasData: rows.length > 0,
  };
}
