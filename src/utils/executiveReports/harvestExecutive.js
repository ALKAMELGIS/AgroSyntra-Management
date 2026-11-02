import {
  toNum, filterByDateRange, getPreviousPeriod,
  pctChange, formatDelta, topN,
} from '../executiveReportUtils';

function aggregate(entries, fieldInfoMap) {
  let totalKg = 0;
  const byField = {};
  const byVariety = {};
  const byDate = {};
  const gradeTotals = { A: 0, B: 0, C: 0, other: 0 };
  let varietyLines = 0;

  entries.forEach((entry) => {
    const field = fieldInfoMap[entry.fieldId]?.name || entry.fieldName || entry.fieldId;
    const date = (entry.date || '').split('T')[0];
    const entryKg = toNum(entry.totalQuantity);

    totalKg += entryKg;
    byField[field] = (byField[field] || 0) + entryKg;
    byDate[date] = (byDate[date] || 0) + entryKg;

    (entry.varieties || []).forEach((v) => {
      const qty = toNum(v.quantity);
      const variety = v.variety || 'Unknown';
      byVariety[variety] = (byVariety[variety] || 0) + qty;
      varietyLines += 1;

      const grade = (v.grade || '').toString().toUpperCase();
      if (grade === 'A') gradeTotals.A += qty;
      else if (grade === 'B') gradeTotals.B += qty;
      else if (grade === 'C') gradeTotals.C += qty;
      else gradeTotals.other += qty;
    });
  });

  const harvestDays = Object.keys(byDate).length;
  const fieldsHarvested = Object.keys(byField).length;
  const gradedTotal = gradeTotals.A + gradeTotals.B + gradeTotals.C + gradeTotals.other;
  const gradeAPct = gradedTotal > 0 ? (gradeTotals.A / gradedTotal) * 100 : null;

  return {
    totalKg,
    entryCount: entries.length,
    harvestDays,
    fieldsHarvested,
    avgKgPerDay: harvestDays > 0 ? totalKg / harvestDays : null,
    gradeAPct,
    byField,
    byVariety,
    byDate,
    varietyLines,
  };
}

function buildTopFive(agg) {
  const fields = Object.entries(agg.byField)
    .map(([field, total]) => ({ field, total }))
    .sort((a, b) => b.total - a.total);

  const varieties = Object.entries(agg.byVariety)
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total);

  const days = Object.entries(agg.byDate)
    .map(([date, total]) => ({ date, total }))
    .sort((a, b) => b.total - a.total);

  return [
    {
      title: 'Top Fields by Harvest (kg)',
      items: topN(fields).map((f) => ({
        label: f.field,
        value: f.total.toLocaleString(undefined, { maximumFractionDigits: 0 }),
        subtitle: 'total kg',
      })),
    },
    {
      title: 'Top Varieties (kg)',
      items: topN(varieties).map((v) => ({
        label: v.name,
        value: v.total.toLocaleString(undefined, { maximumFractionDigits: 0 }),
        subtitle: 'total kg',
      })),
    },
    {
      title: 'Best Harvest Days (kg)',
      items: topN(days).map((d) => ({
        label: d.date,
        value: d.total.toLocaleString(undefined, { maximumFractionDigits: 0 }),
        subtitle: 'daily total',
      })),
    },
  ];
}

function buildInsights(current, allFieldCount) {
  const insights = [];

  if (current.entryCount === 0) {
    insights.push({ type: 'info', message: 'No harvest entries recorded for this period.' });
    return insights;
  }

  insights.push({
    type: 'success',
    message: `${current.totalKg.toLocaleString(undefined, { maximumFractionDigits: 0 })} kg harvested over ${current.harvestDays} day(s) from ${current.fieldsHarvested} field(s).`,
  });

  if (current.gradeAPct != null && current.gradeAPct >= 70) {
    insights.push({
      type: 'success',
      message: `Grade A represents ${current.gradeAPct.toFixed(0)}% of graded volume — strong quality mix.`,
    });
  } else if (current.gradeAPct != null && current.gradeAPct < 50) {
    insights.push({
      type: 'warning',
      message: `Grade A is only ${current.gradeAPct.toFixed(0)}% of volume — review crop stress or grading criteria.`,
    });
  }

  const topVariety = Object.entries(current.byVariety).sort((a, b) => b[1] - a[1])[0];
  if (topVariety) {
    insights.push({
      type: 'info',
      message: `${topVariety[0]} led varieties with ${topVariety[1].toLocaleString(undefined, { maximumFractionDigits: 0 })} kg.`,
    });
  }

  if (allFieldCount > 0 && current.fieldsHarvested < allFieldCount) {
    insights.push({
      type: 'info',
      message: `${allFieldCount - current.fieldsHarvested} field(s) had no harvest this period.`,
    });
  }

  return insights;
}

function buildSummary(current, prevAgg) {
  if (current.entryCount === 0) {
    return 'No harvest activity was recorded for the selected period.';
  }

  const parts = [
    `Total harvest was ${current.totalKg.toLocaleString(undefined, { maximumFractionDigits: 0 })} kg across ${current.harvestDays} harvest day(s), averaging ${current.avgKgPerDay != null ? current.avgKgPerDay.toFixed(0) : '—'} kg/day.`,
  ];

  if (prevAgg.entryCount > 0) {
    const delta = pctChange(current.totalKg, prevAgg.totalKg);
    if (delta != null && Math.abs(delta) >= 3) {
      parts.push(`Volume ${delta >= 0 ? 'increased' : 'decreased'} by ${Math.abs(delta).toFixed(0)}% compared to the previous period.`);
    }
  }

  return parts.join(' ');
}

export function buildHarvestExecutiveReport(entries, fieldInfoMap, dateFrom, dateTo) {
  const filtered = filterByDateRange(entries, dateFrom, dateTo);
  const current = aggregate(filtered, fieldInfoMap);
  const allFieldCount = Object.keys(fieldInfoMap).length;

  const prev = getPreviousPeriod(dateFrom, dateTo);
  const prevAgg = aggregate(filterByDateRange(entries, prev.from, prev.to), fieldInfoMap);

  const kpis = [
    {
      title: 'Total Harvest',
      value: `${current.totalKg.toLocaleString(undefined, { maximumFractionDigits: 0 })} kg`,
      delta: formatDelta(pctChange(current.totalKg, prevAgg.totalKg)),
      color: '#16a34a',
    },
    {
      title: 'Harvest Days',
      value: String(current.harvestDays),
      subtitle: `${current.entryCount} entries`,
      color: '#333',
    },
    {
      title: 'Fields Harvested',
      value: String(current.fieldsHarvested),
      color: '#3b82f6',
    },
    {
      title: 'Avg kg / Day',
      value: current.avgKgPerDay != null ? current.avgKgPerDay.toFixed(0) : '—',
      color: '#6366f1',
    },
    {
      title: 'Grade A Share',
      value: current.gradeAPct != null ? `${current.gradeAPct.toFixed(0)}%` : '—',
      subtitle: 'of graded volume',
      color: current.gradeAPct != null && current.gradeAPct >= 70 ? '#16a34a' : '#f59e0b',
    },
    {
      title: 'Varieties',
      value: String(Object.keys(current.byVariety).length),
      subtitle: `${current.varietyLines} lines`,
      color: '#64748b',
    },
  ];

  return {
    kpis,
    summary: buildSummary(current, prevAgg),
    insights: buildInsights(current, allFieldCount),
    topFive: buildTopFive(current),
    hasData: current.entryCount > 0,
  };
}
