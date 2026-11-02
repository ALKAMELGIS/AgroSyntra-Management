import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';

/**
 * Generate a PDF report for harvest data
 */
export function generateHarvestReport(harvests, options = {}) {
  const {
    title = 'Harvest Report',
    subtitle = '',
    dateRange = null,
  } = options;

  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header
  doc.setFontSize(20);
  doc.setTextColor(46, 125, 50); // Primary green
  doc.text('Al Maha Farm', pageWidth / 2, 20, { align: 'center' });

  doc.setFontSize(16);
  doc.setTextColor(0, 0, 0);
  doc.text(title, pageWidth / 2, 30, { align: 'center' });

  if (subtitle) {
    doc.setFontSize(12);
    doc.setTextColor(100, 100, 100);
    doc.text(subtitle, pageWidth / 2, 38, { align: 'center' });
  }

  if (dateRange) {
    doc.setFontSize(10);
    doc.text(`Period: ${dateRange}`, pageWidth / 2, 45, { align: 'center' });
  }

  // Report generated date
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text(`Generated: ${format(new Date(), 'PPpp')}`, pageWidth - 15, 10, { align: 'right' });

  // Table data
  const tableData = harvests.map(h => [
    format(new Date(h.date), 'yyyy-MM-dd'),
    h.fieldName || h.field_name || '-',
    h.variety || '-',
    `${h.quantity || h.total_quantity || 0} kg`,
    h.grade || '-',
    h.notes || '-',
  ]);

  // Calculate totals
  const totalQuantity = harvests.reduce((sum, h) => sum + (h.quantity || h.total_quantity || 0), 0);

  // Table
  const harvestTable = autoTable(doc, {
    startY: 55,
    head: [['Date', 'Field', 'Variety', 'Quantity', 'Grade', 'Notes']],
    body: tableData,
    foot: [['', '', 'Total:', `${totalQuantity.toLocaleString()} kg`, '', '']],
    theme: 'striped',
    headStyles: {
      fillColor: [46, 125, 50],
      textColor: 255,
      fontStyle: 'bold',
    },
    footStyles: {
      fillColor: [240, 240, 240],
      textColor: 0,
      fontStyle: 'bold',
    },
    styles: {
      fontSize: 9,
      cellPadding: 3,
    },
    columnStyles: {
      0: { cellWidth: 25 },
      3: { halign: 'right' },
    },
  });

  // Summary section
  const finalY = (harvestTable?.finalY ?? doc.lastAutoTable?.finalY ?? 70) + 15;
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  doc.text('Summary', 14, finalY);

  doc.setFontSize(10);
  doc.text(`Total Records: ${harvests.length}`, 14, finalY + 8);
  doc.text(`Total Harvest: ${totalQuantity.toLocaleString()} kg`, 14, finalY + 14);
  doc.text(`Average per Entry: ${harvests.length ? Math.round(totalQuantity / harvests.length).toLocaleString() : 0} kg`, 14, finalY + 20);

  // Footer
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Page ${i} of ${pageCount}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: 'center' }
    );
  }

  return doc;
}

/**
 * Generate a PDF report for fertigation data
 * Accepts flattened rows (one row per fertilizer)
 */
export function generateFertigationReport(fertigations, options = {}) {
  const {
    title = 'Fertigation Report',
    subtitle = '',
    dateRange = null,
  } = options;

  const doc = new jsPDF('landscape');
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header
  doc.setFontSize(20);
  doc.setTextColor(46, 125, 50);
  doc.text('Al Maha Farm', pageWidth / 2, 20, { align: 'center' });

  doc.setFontSize(16);
  doc.setTextColor(0, 0, 0);
  doc.text(title, pageWidth / 2, 30, { align: 'center' });

  if (subtitle) {
    doc.setFontSize(12);
    doc.setTextColor(100, 100, 100);
    doc.text(subtitle, pageWidth / 2, 38, { align: 'center' });
  }

  if (dateRange) {
    doc.setFontSize(10);
    doc.text(`Period: ${dateRange}`, pageWidth / 2, 45, { align: 'center' });
  }

  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text(`Generated: ${format(new Date(), 'PPpp')}`, pageWidth - 15, 10, { align: 'right' });

  // Table
  const tableData = fertigations.map(f => [
    f.date ? format(new Date(f.date), 'yyyy-MM-dd') : '-',
    f.field || f.fieldName || f.field_name || '-',
    f.recipeName || f.recipe_name || '-',
    f.flowRate ?? '-',
    f.frequency ?? '-',
    f.dailyWater ?? '-',
    f.fertilizer || '-',
    f.amount ?? '-',
    f.totalFertilizer ?? '-',
  ]);

  // Calculate total fertilizer
  const totalFert = fertigations.reduce((sum, f) => sum + (Number(f.amount) || 0), 0);

  const fertTable = autoTable(doc, {
    startY: 55,
    head: [['Date', 'Field', 'Recipe', 'Flow Rate', 'Freq', 'Daily Water', 'Fertilizer', 'Amount (kg)', 'Total Fert (kg)']],
    body: tableData,
    foot: [['', '', '', '', '', '', 'Total:', totalFert.toFixed(2), '']],
    theme: 'striped',
    headStyles: {
      fillColor: [46, 125, 50],
      textColor: 255,
      fontStyle: 'bold',
    },
    footStyles: {
      fillColor: [240, 240, 240],
      textColor: 0,
      fontStyle: 'bold',
    },
    styles: {
      fontSize: 8,
      cellPadding: 2,
    },
    columnStyles: {
      7: { halign: 'right' },
      8: { halign: 'right' },
    },
  });

  // Summary section
  const finalY = (fertTable?.finalY ?? doc.lastAutoTable?.finalY ?? 70) + 15;
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  doc.text('Summary', 14, finalY);

  doc.setFontSize(10);
  doc.text(`Total Records: ${fertigations.length}`, 14, finalY + 8);
  doc.text(`Total Fertilizer: ${totalFert.toFixed(2)} kg`, 14, finalY + 14);

  // Footer
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Page ${i} of ${pageCount}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: 'center' }
    );
  }

  return doc;
}

/**
 * Generate a PDF report for EC/pH readings
 * Accepts flattened rows (one row per valve reading)
 */
export function generateECPHReport(readings, options = {}) {
  const {
    title = 'EC/pH Report',
    subtitle = '',
    dateRange = null,
  } = options;

  const doc = new jsPDF('landscape');
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header
  doc.setFontSize(20);
  doc.setTextColor(46, 125, 50);
  doc.text('Al Maha Farm', pageWidth / 2, 20, { align: 'center' });

  doc.setFontSize(16);
  doc.setTextColor(0, 0, 0);
  doc.text(title, pageWidth / 2, 30, { align: 'center' });

  if (subtitle) {
    doc.setFontSize(12);
    doc.setTextColor(100, 100, 100);
    doc.text(subtitle, pageWidth / 2, 38, { align: 'center' });
  }

  if (dateRange) {
    doc.setFontSize(10);
    doc.text(`Period: ${dateRange}`, pageWidth / 2, 45, { align: 'center' });
  }

  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text(`Generated: ${format(new Date(), 'PPpp')}`, pageWidth - 15, 10, { align: 'right' });

  // Table
  const tableData = readings.map(r => [
    r.date ? format(new Date(r.date), 'yyyy-MM-dd') : '-',
    r.time || '-',
    r.field || r.fieldName || r.field_name || '-',
    r.valve ?? '-',
    r.ecIn ?? '-',
    r.ecOut ?? '-',
    r.phIn ?? '-',
    r.phOut ?? '-',
    r.dripVolume ?? '-',
    r.drainVolume ?? '-',
    r.percentDrain ?? '-',
  ]);

  // Calculate averages for EC and pH
  const ecInValues = readings.filter(r => r.ecIn != null && r.ecIn !== '').map(r => Number(r.ecIn));
  const ecOutValues = readings.filter(r => r.ecOut != null && r.ecOut !== '').map(r => Number(r.ecOut));
  const phInValues = readings.filter(r => r.phIn != null && r.phIn !== '').map(r => Number(r.phIn));
  const phOutValues = readings.filter(r => r.phOut != null && r.phOut !== '').map(r => Number(r.phOut));

  const avg = (arr) => arr.length ? (arr.reduce((s, v) => s + v, 0) / arr.length).toFixed(2) : '-';

  const ecphTable = autoTable(doc, {
    startY: 55,
    head: [['Date', 'Time', 'Field', 'Valve', 'EC In', 'EC Out', 'pH In', 'pH Out', 'Drip (ml)', 'Drain (ml)', '% Drain']],
    body: tableData,
    foot: [['', '', '', 'Averages:', avg(ecInValues), avg(ecOutValues), avg(phInValues), avg(phOutValues), '', '', '']],
    theme: 'striped',
    headStyles: {
      fillColor: [46, 125, 50],
      textColor: 255,
      fontStyle: 'bold',
    },
    footStyles: {
      fillColor: [240, 240, 240],
      textColor: 0,
      fontStyle: 'bold',
    },
    styles: {
      fontSize: 8,
      cellPadding: 2,
    },
    columnStyles: {
      4: { halign: 'right' },
      5: { halign: 'right' },
      6: { halign: 'right' },
      7: { halign: 'right' },
      8: { halign: 'right' },
      9: { halign: 'right' },
      10: { halign: 'right' },
    },
  });

  // Summary section
  const finalY = (ecphTable?.finalY ?? doc.lastAutoTable?.finalY ?? 70) + 15;
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  doc.text('Summary', 14, finalY);

  doc.setFontSize(10);
  doc.text(`Total Records: ${readings.length}`, 14, finalY + 8);
  doc.text(`Avg EC In: ${avg(ecInValues)}  |  Avg EC Out: ${avg(ecOutValues)}`, 14, finalY + 14);
  doc.text(`Avg pH In: ${avg(phInValues)}  |  Avg pH Out: ${avg(phOutValues)}`, 14, finalY + 20);

  // Footer
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Page ${i} of ${pageCount}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: 'center' }
    );
  }

  return doc;
}

/**
 * Professional IPM Costing Report PDF
 * Sections: Header, Executive Summary, Compliance, Operational Insights,
 * Weekly Breakdown, Detail Table (if <=50 rows), Product Summary, Crop Summary, Period Comparison
 */
export function generateCostingReport(reportData) {
  const {
    siteName = 'Al Maha Farm',
    dateRange = '',
    subtitle = 'All Applications',
    generatedBy = '',
    logoDataUrl = null,
    // KPIs
    totalCost = 0, totalQty = 0, totalApps = 0, uniqueProducts = 0,
    // Period comparison
    prevPeriod = null,
    // Sections
    details = [],
    productSummary = [],
    cropSummary = [],
    phiCompliance = null,
    activeIngredients = [],
    costPerField = [],
    frequencyByField = [],
    top5Days = [],
    weeklyBreakdown = [],
  } = reportData;

  const HEADER_GREEN = [30, 68, 41];
  const TABLE_GREEN = [61, 124, 79];
  const ALT_ROW = [245, 243, 240];
  const KPI_FILL = [232, 245, 233];
  const headOpts = { fillColor: TABLE_GREEN, textColor: 255, fontSize: 8, fontStyle: 'bold' };
  const bodyOpts = { fontSize: 7.5 };
  const altOpts = { fillColor: ALT_ROW };
  const margins = { left: 14, right: 14 };

  const doc = new jsPDF('landscape');
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();

  const fmtCost = (v) => Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtQty = (v) => Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

  const drawBanner = (y, text) => {
    doc.setFillColor(...HEADER_GREEN);
    doc.rect(14, y, pw - 28, 8, 'F');
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text(text, 18, y + 5.8);
    doc.setTextColor(0, 0, 0);
    return y + 12;
  };

  const ensureSpace = (curY, needed) => {
    const pageH = doc.internal.pageSize.getHeight();
    if (curY + needed > pageH - 20) {
      doc.addPage();
      return 20;
    }
    return curY;
  };

  doc.setFillColor(...HEADER_GREEN);
  doc.rect(0, 0, pw, 36, 'F');
  if (logoDataUrl) {
    try {
      const format = /image\/jpe?g/i.test(logoDataUrl) ? 'JPEG' : 'PNG';
      doc.addImage(logoDataUrl, format, 10, 7, 22, 22);
    } catch {
      // Skip a bad or unsupported logo rather than failing the report.
    }
  }
  doc.setFontSize(22);
  doc.setTextColor(255, 255, 255);
  doc.text(siteName, pw / 2, 14, { align: 'center' });
  doc.setFontSize(14);
  doc.text('IPM COSTING REPORT', pw / 2, 23, { align: 'center' });
  doc.setFontSize(9);
  doc.setTextColor(200, 220, 200);
  doc.text(subtitle + (dateRange ? `  |  Period: ${dateRange}` : ''), pw / 2, 31, { align: 'center' });

  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  const metaParts = [`Generated: ${format(new Date(), 'dd MMM yyyy HH:mm')}`];
  if (generatedBy) metaParts.push(`By: ${generatedBy}`);
  metaParts.push('All values in AED');
  doc.text(metaParts.join('   |   '), pw / 2, 42, { align: 'center' });

  // ═══════════════════════════════════════════════════════════════
  // SECTION 2: EXECUTIVE SUMMARY (KPI boxes)
  // ═══════════════════════════════════════════════════════════════
  let y = 50;
  y = drawBanner(y, 'EXECUTIVE SUMMARY');

  const kpis = [
    { label: 'Total Cost (AED)', value: fmtCost(totalCost) },
    { label: 'Total Qty Applied', value: fmtQty(totalQty) },
    { label: 'Applications', value: String(totalApps) },
    { label: 'Products Used', value: String(uniqueProducts) },
  ];
  const boxW = (pw - 28 - 12) / 4;
  kpis.forEach((kpi, i) => {
    const bx = 14 + i * (boxW + 4);
    doc.setFillColor(...KPI_FILL);
    doc.roundedRect(bx, y, boxW, 18, 2, 2, 'F');
    doc.setFontSize(14);
    doc.setTextColor(...HEADER_GREEN);
    doc.text(kpi.value, bx + boxW / 2, y + 10, { align: 'center' });
    doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);
    doc.text(kpi.label, bx + boxW / 2, y + 15.5, { align: 'center' });
  });
  y += 24;

  // Period comparison
  if (prevPeriod) {
    const delta = totalCost - prevPeriod.cost;
    const pct = prevPeriod.cost > 0 ? ((delta / prevPeriod.cost) * 100).toFixed(1) : 'N/A';
    const arrow = delta > 0 ? '+' : '';
    doc.setFontSize(8);
    doc.setTextColor(80, 80, 80);
    doc.text(
      `Period Comparison: Previous ${prevPeriod.label}: AED ${fmtCost(prevPeriod.cost)} (${prevPeriod.apps} apps)  |  This Period: AED ${fmtCost(totalCost)} (${totalApps} apps)  |  Change: ${arrow}${pct}%`,
      pw / 2, y, { align: 'center' }
    );
    y += 8;
  }

  // ═══════════════════════════════════════════════════════════════
  // SECTION 3: COMPLIANCE / SAFETY
  // ═══════════════════════════════════════════════════════════════
  y = ensureSpace(y, 50);
  y = drawBanner(y, 'COMPLIANCE / SAFETY');

  // PHI Compliance
  if (phiCompliance) {
    doc.setFontSize(9);
    doc.setTextColor(...HEADER_GREEN);
    doc.text('PHI Compliance Summary', 18, y + 4);
    doc.setFontSize(8);
    doc.setTextColor(0, 0, 0);
    doc.text(`Within PHI (active): ${phiCompliance.active}   |   Cleared: ${phiCompliance.cleared}   |   No PHI data: ${phiCompliance.noPhi}`, 18, y + 10);
    y += 16;
  }

  // Active Ingredient Totals
  if (activeIngredients.length > 0) {
    doc.setFontSize(9);
    doc.setTextColor(...HEADER_GREEN);
    doc.text('Active Ingredient Usage', 18, y + 4);
    y += 8;

    const aiResult = autoTable(doc, {
      startY: y,
      head: [['Active Ingredient', 'Times Used', 'Total Qty Applied']],
      body: activeIngredients.map(a => [a.name, a.count, fmtQty(a.totalQty)]),
      headStyles: headOpts,
      bodyStyles: bodyOpts,
      alternateRowStyles: altOpts,
      margin: margins,
      tableWidth: pw * 0.55,
    });
    y = (aiResult?.finalY ?? doc.lastAutoTable?.finalY ?? y + 20) + 8;
  }

  // ═══════════════════════════════════════════════════════════════
  // SECTION 4: OPERATIONAL INSIGHTS
  // ═══════════════════════════════════════════════════════════════
  doc.addPage();
  y = 20;
  y = drawBanner(y, 'OPERATIONAL INSIGHTS');

  // Cost per field (cap at 15)
  if (costPerField.length > 0) {
    const cfSlice = costPerField.slice(0, 15);
    const cfLabel = costPerField.length > 15 ? `Cost per Field (top 15 of ${costPerField.length})` : 'Cost per Field';
    doc.setFontSize(9);
    doc.setTextColor(...HEADER_GREEN);
    doc.text(cfLabel, 18, y + 4);
    y += 8;
    const cfResult = autoTable(doc, {
      startY: y,
      head: [['Field', 'Applications', 'Total Qty', 'Total Cost (AED)', '% of Total']],
      body: cfSlice.map(f => [f.field, f.count, fmtQty(f.totalQty), fmtCost(f.totalCost), f.pct + '%']),
      headStyles: headOpts,
      bodyStyles: bodyOpts,
      alternateRowStyles: altOpts,
      margin: margins,
    });
    y = (cfResult?.finalY ?? doc.lastAutoTable?.finalY ?? y + 20) + 8;
  }

  // Application frequency
  if (frequencyByField.length > 0) {
    y = ensureSpace(y, 60);
    doc.setFontSize(9);
    doc.setTextColor(...HEADER_GREEN);
    doc.text('Application Frequency by Field (top 10)', 18, y + 4);
    y += 8;
    const freqResult = autoTable(doc, {
      startY: y,
      head: [['Field', 'Applications', 'Distinct Products', 'Avg Cost per Application']],
      body: frequencyByField.map(f => [f.field, f.count, f.distinctProducts, fmtCost(f.avgCost)]),
      headStyles: headOpts,
      bodyStyles: bodyOpts,
      alternateRowStyles: altOpts,
      margin: margins,
      tableWidth: pw * 0.65,
    });
    y = (freqResult?.finalY ?? doc.lastAutoTable?.finalY ?? y + 20) + 8;
  }

  // Top 5 costliest days
  if (top5Days.length > 0) {
    y = ensureSpace(y, 50);
    doc.setFontSize(9);
    doc.setTextColor(...HEADER_GREEN);
    doc.text('Top 5 Costliest Days', 18, y + 4);
    y += 8;
    const t5Result = autoTable(doc, {
      startY: y,
      head: [['Date', 'Applications', 'Products Used', 'Total Cost (AED)']],
      body: top5Days.map(d => [d.date, d.count, d.products, fmtCost(d.totalCost)]),
      headStyles: headOpts,
      bodyStyles: bodyOpts,
      alternateRowStyles: altOpts,
      margin: margins,
      tableWidth: pw * 0.55,
    });
    y = (t5Result?.finalY ?? doc.lastAutoTable?.finalY ?? y + 20) + 8;
  }

  // ═══════════════════════════════════════════════════════════════
  // SECTION 5: WEEKLY BREAKDOWN
  // ═══════════════════════════════════════════════════════════════
  if (weeklyBreakdown.length > 0) {
    doc.addPage();
    y = 20;
    y = drawBanner(y, 'WEEKLY BREAKDOWN (MON–MON)');
    const wkResult = autoTable(doc, {
      startY: y,
      head: [['Week', 'Applications', 'Total Qty', 'Total Cost (AED)']],
      body: weeklyBreakdown.map(w => [w.label, w.count, fmtQty(w.totalQty), fmtCost(w.totalCost)]),
      headStyles: headOpts,
      bodyStyles: bodyOpts,
      alternateRowStyles: altOpts,
      margin: margins,
      tableWidth: pw * 0.6,
    });
    y = (wkResult?.finalY ?? doc.lastAutoTable?.finalY ?? y + 20) + 8;
  }

  // ═══════════════════════════════════════════════════════════════
  // SECTION 6: DETAIL TABLE (only if <= 50 rows)
  // ═══════════════════════════════════════════════════════════════
  doc.addPage();
  y = 20;
  y = drawBanner(y, 'APPLICATION DETAILS');

  if (details.length <= 50) {
    autoTable(doc, {
      startY: y,
      head: [['Date', 'Field', 'Product', 'Active Ingredient', 'Type', 'Crop', 'Qty', 'Unit Price', 'Cost']],
      body: details.map(r => [
        r.date, r.field, r.product, r.activeIngredient || '', r.type, r.crop,
        fmtQty(r.qty), fmtCost(r.unitPrice), fmtCost(r.cost),
      ]),
      headStyles: headOpts,
      bodyStyles: { fontSize: 7 },
      alternateRowStyles: altOpts,
      margin: margins,
      columnStyles: {
        0: { cellWidth: 28 },
        1: { cellWidth: 22 },
        2: { cellWidth: 35 },
        3: { cellWidth: 45, overflow: 'linebreak' },
        4: { cellWidth: 18 },
        5: { cellWidth: 28 },
        6: { cellWidth: 22, halign: 'right' },
        7: { cellWidth: 22, halign: 'right' },
        8: { cellWidth: 22, halign: 'right' },
      },
      foot: [['', '', '', '', '', 'TOTAL', fmtQty(totalQty), '', fmtCost(totalCost)]],
      footStyles: { fillColor: HEADER_GREEN, textColor: 255, fontStyle: 'bold', fontSize: 8 },
    });
  } else {
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    doc.text(
      `${details.length} application records in this period — use Excel export for the full line-by-line detail.`,
      18, y + 4
    );
    y += 12;
    // Show a compact top-20 preview
    const preview = details.slice(0, 20);
    autoTable(doc, {
      startY: y,
      head: [['Date', 'Field', 'Product', 'Type', 'Crop', 'Qty', 'Cost']],
      body: preview.map(r => [r.date, r.field, r.product, r.type, r.crop, fmtQty(r.qty), fmtCost(r.cost)]),
      headStyles: headOpts,
      bodyStyles: { fontSize: 7 },
      alternateRowStyles: altOpts,
      margin: margins,
      foot: [[`Showing 20 of ${details.length}`, '', '', '', 'PERIOD TOTAL', fmtQty(totalQty), fmtCost(totalCost)]],
      footStyles: { fillColor: HEADER_GREEN, textColor: 255, fontStyle: 'bold', fontSize: 7 },
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // SECTION 7: PRODUCT SUMMARY
  // ═══════════════════════════════════════════════════════════════
  doc.addPage();
  y = 20;
  y = drawBanner(y, 'PRODUCT SUMMARY');

  if (productSummary.length > 0) {
    const psResult = autoTable(doc, {
      startY: y,
      head: [['Product', 'Times Used', 'Total Qty', 'Total Cost (AED)', '% of Total']],
      body: productSummary.map(r => [r.product, r.count, fmtQty(r.totalQty), fmtCost(r.totalCost), r.pct + '%']),
      headStyles: headOpts,
      bodyStyles: bodyOpts,
      alternateRowStyles: altOpts,
      margin: margins,
    });
    y = (psResult?.finalY ?? doc.lastAutoTable?.finalY ?? y + 20) + 12;
  }

  // ═══════════════════════════════════════════════════════════════
  // SECTION 8: CROP SUMMARY
  // ═══════════════════════════════════════════════════════════════
  y = ensureSpace(y, 50);
  y = drawBanner(y, 'CROP SUMMARY');

  if (cropSummary.length > 0) {
    const csResult = autoTable(doc, {
      startY: y,
      head: [['Crop', 'Applications', 'Total Qty', 'Total Cost (AED)', '% of Total']],
      body: cropSummary.map(r => [r.crop, r.count, fmtQty(r.totalQty), fmtCost(r.totalCost), r.pct + '%']),
      headStyles: headOpts,
      bodyStyles: bodyOpts,
      alternateRowStyles: altOpts,
      margin: margins,
    });
    y = (csResult?.finalY ?? doc.lastAutoTable?.finalY ?? y + 20) + 12;
  }

  // ═══════════════════════════════════════════════════════════════
  // SECTION 9: PERIOD COMPARISON
  // ═══════════════════════════════════════════════════════════════
  if (prevPeriod) {
    y = ensureSpace(y, 50);
    y = drawBanner(y, 'PERIOD COMPARISON');

    const delta = totalCost - prevPeriod.cost;
    const qtyDelta = totalQty - prevPeriod.qty;
    const appsDelta = totalApps - prevPeriod.apps;
    const pctCost = prevPeriod.cost > 0 ? ((delta / prevPeriod.cost) * 100).toFixed(1) : 'N/A';
    const pctQty = prevPeriod.qty > 0 ? ((qtyDelta / prevPeriod.qty) * 100).toFixed(1) : 'N/A';
    const pctApps = prevPeriod.apps > 0 ? ((appsDelta / prevPeriod.apps) * 100).toFixed(1) : 'N/A';
    const sign = (v) => (Number(v) > 0 ? '+' : '');

    autoTable(doc, {
      startY: y,
      head: [['Metric', `Previous (${prevPeriod.label})`, 'This Period', 'Change']],
      body: [
        ['Total Cost (AED)', fmtCost(prevPeriod.cost), fmtCost(totalCost), `${sign(pctCost)}${pctCost}%`],
        ['Total Qty Applied', fmtQty(prevPeriod.qty), fmtQty(totalQty), `${sign(pctQty)}${pctQty}%`],
        ['Applications', String(prevPeriod.apps), String(totalApps), `${sign(pctApps)}${pctApps}%`],
      ],
      headStyles: headOpts,
      bodyStyles: { fontSize: 9 },
      alternateRowStyles: altOpts,
      margin: margins,
      tableWidth: pw * 0.55,
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // PAGE FOOTER: page numbers + site name
  // ═══════════════════════════════════════════════════════════════
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text(siteName, 14, ph - 8);
    doc.text(`Page ${i} of ${pageCount}`, pw - 14, ph - 8, { align: 'right' });
  }

  return doc;
}

/**
 * Download PDF with given filename
 */
export function downloadPDF(doc, filename) {
  doc.save(filename);
}

/**
 * Open PDF in new tab
 */
export function openPDFInNewTab(doc) {
  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
}
