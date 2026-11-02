import { sumInspectionFromDb } from './bumbleBeeInspection';
import { asExportNumber, excelSheetName, formatExportDate } from './excelSheetName';

export function sortIncomingOrdersForExport(orders) {
  return [...(orders || [])].sort((a, b) => {
    const hist = (o) => o.status === 'received' || o.status === 'cancelled';
    const aHist = hist(a);
    const bHist = hist(b);
    if (aHist !== bHist) return aHist ? -1 : 1;
    if (a.status === 'pending' && b.status === 'pending') {
      return new Date(a.expected_delivery_date) - new Date(b.expected_delivery_date);
    }
    const da = new Date(a.received_at || a.order_date || a.created_at);
    const db = new Date(b.received_at || b.order_date || b.created_at);
    return db - da;
  });
}

export function buildBumbleBeeSummaryRows(summary) {
  const last = summary?.lastDeploy;
  return [{
    'Boxes on hand': asExportNumber(summary?.onHand ?? 0),
    'Projected total': asExportNumber(summary?.projectedTotal ?? 0),
    'Avg boxes removed / week': summary?.avgBoxesRemovedPerWeek == null
      ? ''
      : asExportNumber(summary.avgBoxesRemovedPerWeek),
    'Last deploy date': formatExportDate(last?.date),
    'Last deploy field': last?.fieldName || '',
    'Last deploy added': last ? asExportNumber(last.boxesAdded) : '',
    'Last deploy removed': last ? asExportNumber(last.boxesRemoved) : '',
  }];
}

export function buildBumbleBeeDeploymentRows(deployments) {
  return (deployments || []).map((dep) => ({
    Field: dep.field_name || '',
    'Deployment date': formatExportDate(dep.date_placed),
    'Before visit': asExportNumber(dep.boxes_before),
    Removed: asExportNumber(dep.boxes_removed ?? 0),
    Added: asExportNumber(dep.boxes_added ?? dep.box_count),
    'Total on field': asExportNumber(dep.box_count_total ?? dep.display_box_total ?? dep.box_count),
    'Days since last': asExportNumber(dep.days_since_last),
    Notes: dep.notes || '',
  }));
}

export function buildBumbleBeeInspectionRows(inspections) {
  return (inspections || []).map((insp) => ({
    Field: insp.field_name || '',
    'Inspection date': formatExportDate(insp.inspection_date),
    '100%': asExportNumber(insp.boxes_100 ?? 0),
    '80%': asExportNumber(insp.boxes_80 ?? 0),
    '60%': asExportNumber(insp.boxes_60 ?? 0),
    '40%': asExportNumber(insp.boxes_40 ?? 0),
    '20%': asExportNumber(insp.boxes_20 ?? 0),
    '0%': asExportNumber(insp.boxes_0 ?? 0),
    'Total boxes': asExportNumber(sumInspectionFromDb(insp)),
    Notes: insp.notes || '',
  }));
}

function boxesReceived(order) {
  if (order.quantity_received != null) return asExportNumber(order.quantity_received);
  if (order.status === 'received') return asExportNumber(order.quantity_expected);
  return '';
}

export function buildBumbleBeeInventoryRows(orders) {
  return sortIncomingOrdersForExport(orders).map((order) => ({
    'Boxes ordered': asExportNumber(order.quantity_expected),
    'Order date': formatExportDate(order.order_date || order.created_at),
    'Expected delivery': formatExportDate(order.expected_delivery_date),
    'Date received': formatExportDate(order.received_at),
    'Boxes received': boxesReceived(order),
    'On hand (before)': asExportNumber(order.quantity_on_hand_before),
    'On hand (after)': asExportNumber(order.quantity_on_hand_after),
    Status: order.status || '',
    Notes: order.notes || '',
  }));
}

export function buildBumbleBeesSheets({
  summary,
  deployments = [],
  inspections = [],
  incomingOrders = [],
} = {}) {
  const used = new Set();
  const sheets = [];
  const summaryRows = buildBumbleBeeSummaryRows(summary);
  if (summaryRows.length) {
    sheets.push({ sheetName: excelSheetName('Summary', used), rows: summaryRows });
  }
  const deploymentRows = buildBumbleBeeDeploymentRows(deployments);
  if (deploymentRows.length) {
    sheets.push({ sheetName: excelSheetName('Deployments', used), rows: deploymentRows });
  }
  const inspectionRows = buildBumbleBeeInspectionRows(inspections);
  if (inspectionRows.length) {
    sheets.push({ sheetName: excelSheetName('Inspection', used), rows: inspectionRows });
  }
  const inventoryRows = buildBumbleBeeInventoryRows(incomingOrders);
  if (inventoryRows.length) {
    sheets.push({ sheetName: excelSheetName('Inventory', used), rows: inventoryRows });
  }
  return sheets;
}
