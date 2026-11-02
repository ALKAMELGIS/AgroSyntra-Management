export const OPENING_FIELDS = [
  { key: 'requestedDate', label: 'Requested date', type: 'date' },
  { key: 'siteCode', label: 'Site', type: 'readonly' },
  { key: 'fiscalYear', label: 'Fiscal year', type: 'number' },
  { key: 'structureType', label: 'Type of Structure', type: 'text' },
  { key: 'farmName', label: 'Farm', type: 'readonly' },
  { key: 'fieldId', label: 'Field (GH/NH/Pivot)', type: 'field' },
  { key: 'section', label: 'Section /Number', type: 'text' },
  { key: 'cropId', label: 'Family Code', type: 'crop' },
  { key: 'varietyId', label: 'Variety Sown Code', type: 'variety' },
  { key: 'plantsOrKg', label: 'No: Plants or Kg', type: 'number' },
  { key: 'surfaceUnit', label: 'Surface Unit (Area)', type: 'text' },
  { key: 'surfaceArea', label: 'Surface Area', type: 'number' },
  { key: 'budgeted', label: 'Budgeted (Yes/ No)', type: 'text' },
  { key: 'remarks', label: 'Remarks', type: 'text' },
  { key: 'requestorName', label: 'Requestor', type: 'text' },
  { key: 'requestorRole', label: 'Admin / Agronomist / other', type: 'text' },
  { key: 'requestorEndorsed', label: 'Endorsed (Yes / No)', type: 'text' },
  { key: 'farmManagerApproval', label: 'Operation Manager approval', type: 'fmApproval' },
];

/** Opening columns on closing sheets (no FM approval control) */
export const OPENING_FIELDS_CLOSING = OPENING_FIELDS.filter((f) => f.type !== 'fmApproval');

export const CLOSING_EXTRA_FIELDS = [
  { key: 'financeEndorsed', label: 'Finance Endorsed', type: 'text' },
  { key: 'financeName', label: 'Finance Name', type: 'text' },
  { key: 'financeAddedDate', label: 'Added Date', type: 'date' },
  { key: 'sageCreatedDate', label: 'SAGE Created Date', type: 'date' },
  { key: 'sageCreatedBy', label: 'Created by', type: 'text' },
  { key: 'plantationCode', label: 'Plantation Code', type: 'text' },
  { key: 'plantationDescription', label: 'Plantation Description', type: 'text' },
  { key: 'closureRequestDate', label: 'Request date', type: 'date' },
  { key: 'closureRequestBy', label: 'Request by', type: 'text' },
  { key: 'closureFmEndorsed', label: 'FM Endorsed', type: 'text' },
  { key: 'closureFmName', label: 'FM Name', type: 'text' },
  { key: 'closureHooEndorsed', label: 'HoO Endorsed', type: 'text' },
  { key: 'closureHooName', label: 'HoO Name', type: 'text' },
  { key: 'closureFinanceEndorsed', label: 'Finance officer Endorsed', type: 'text' },
  { key: 'closureFinanceName', label: 'Finance officer Name', type: 'text' },
  { key: 'closedDate', label: 'Closed Date', type: 'date' },
  { key: 'sageClosedBy', label: 'SAGE Name', type: 'text' },
];

export const CLOSING_FIELDS = [...OPENING_FIELDS_CLOSING, ...CLOSING_EXTRA_FIELDS];

export function siteDefaultsForRow(siteMeta) {
  if (!siteMeta) return { siteCode: '', farmName: '' };
  const label = siteMeta.name || '';
  return { siteCode: label, farmName: label };
}

export function applySiteDefaults(row, siteMeta) {
  const d = siteDefaultsForRow(siteMeta);
  return { ...row, siteCode: d.siteCode, farmName: d.farmName };
}

function dateStr(v) {
  if (!v) return '';
  if (typeof v === 'string') return v.split('T')[0];
  return String(v);
}

export function emptyOpeningRow() {
  return {
    _key: `new-${Date.now()}-${Math.random()}`,
    _isNew: true,
    _dirty: false,
    requestedDate: '',
    siteCode: '',
    fiscalYear: '',
    structureType: '',
    farmName: '',
    fieldId: '',
    section: '',
    cropId: '',
    varietyId: '',
    plantsOrKg: '',
    surfaceUnit: 'Ha',
    surfaceArea: '',
    budgeted: '',
    remarks: '',
    requestorName: '',
    requestorRole: '',
    requestorEndorsed: '',
    farmManagerApproved: false,
    farmManagerName: '',
    farmManagerDate: '',
    plantationCode: '',
  };
}

export function emptyClosingRow(cropId = '') {
  const base = emptyOpeningRow();
  base.cropId = cropId;
  CLOSING_EXTRA_FIELDS.forEach((f) => {
    base[f.key] = '';
  });
  return base;
}

export function openingServerToRow(r) {
  return {
    _key: r.id,
    _isNew: false,
    _dirty: false,
    _serverId: r.id,
    requestedDate: dateStr(r.requested_date),
    siteCode: r.site_code || '',
    fiscalYear: r.fiscal_year != null ? String(r.fiscal_year) : '',
    structureType: r.structure_type || '',
    farmName: r.farm_name || '',
    fieldId: r.field_id || '',
    fieldName: r.field_name || '',
    section: r.section || '',
    cropId: r.crop_id || '',
    cropName: r.crop_name || '',
    varietyId: r.variety_id || '',
    varietyName: r.variety_name || '',
    plantsOrKg: r.plants_or_kg != null ? String(r.plants_or_kg) : '',
    surfaceUnit: r.surface_unit || '',
    surfaceArea: r.surface_area != null ? String(r.surface_area) : '',
    budgeted: r.budgeted || '',
    remarks: r.remarks || '',
    requestorName: r.requestor_name || '',
    requestorRole: r.requestor_role || '',
    requestorEndorsed: r.requestor_endorsed || '',
    farmManagerApproved: Boolean(r.farm_manager_approved),
    farmManagerName: r.farm_manager_name || '',
    farmManagerDate: dateStr(r.farm_manager_date),
    plantationCode: r.plantation_code || '',
  };
}

export function closingServerToRow(r) {
  const base = openingServerToRow(r);
  base.financeEndorsed = r.finance_endorsed || '';
  base.financeName = r.finance_name || '';
  base.financeAddedDate = dateStr(r.finance_added_date);
  base.sageCreatedDate = dateStr(r.sage_created_date);
  base.sageCreatedBy = r.sage_created_by || '';
  base.plantationDescription = r.plantation_description || '';
  base.closureRequestDate = dateStr(r.closure_request_date);
  base.closureRequestBy = r.closure_request_by || '';
  base.closureFmEndorsed = r.closure_fm_endorsed || '';
  base.closureFmName = r.closure_fm_name || '';
  base.closureHooEndorsed = r.closure_hoo_endorsed || '';
  base.closureHooName = r.closure_hoo_name || '';
  base.closureFinanceEndorsed = r.closure_finance_endorsed || '';
  base.closureFinanceName = r.closure_finance_name || '';
  base.closedDate = dateStr(r.closed_date);
  base.sageClosedBy = r.sage_closed_by || '';
  base._closingSheetId = r.closing_sheet_id;
  base.approvalStatus = r.approval_status || 'approved';
  base.submittedBy = r.submitted_by || '';
  base.submittedByName = r.submitted_by_name || '';
  base.rejectedReason = r.rejected_reason || '';
  base.rejectedByName = r.rejected_by_name || '';
  return base;
}

export function rowToOpeningPayload(row, siteId) {
  return {
    siteId,
    requestedDate: row.requestedDate || null,
    siteCode: row.siteCode || null,
    fiscalYear: row.fiscalYear || null,
    structureType: row.structureType || null,
    farmName: row.farmName || null,
    fieldId: row.fieldId || null,
    section: row.section || null,
    cropId: row.cropId || null,
    varietyId: row.varietyId || null,
    plantsOrKg: row.plantsOrKg || null,
    surfaceUnit: row.surfaceUnit || null,
    surfaceArea: row.surfaceArea || null,
    budgeted: row.budgeted || null,
    remarks: row.remarks || null,
    requestorName: row.requestorName || null,
    requestorRole: row.requestorRole || null,
    requestorEndorsed: row.requestorEndorsed || null,
    plantationCode: row.plantationCode || null,
  };
}

export function rowToClosingPayload(row) {
  const payload = rowToOpeningPayload(row, null);
  delete payload.siteId;
  CLOSING_EXTRA_FIELDS.forEach((f) => {
    payload[f.key] = row[f.key] || null;
  });
  return payload;
}

/** Excel serial or ISO string → YYYY-MM-DD */
export function excelDateToIso(v) {
  if (v === '' || v == null) return '';
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  const n = Number(v);
  if (Number.isFinite(n) && n > 30000) {
    const utc = new Date(Date.UTC(1899, 11, 30 + n));
    return utc.toISOString().slice(0, 10);
  }
  return String(v);
}

export function cropIdFromFamilyName(family, cropOptions) {
  if (!family) return '';
  const norm = String(family).trim().toLowerCase();
  const hit = cropOptions.find(
    (c) => c.label.trim().toLowerCase() === norm
      || norm.includes(c.label.trim().toLowerCase()),
  );
  return hit?.value || '';
}

export function varietyIdFromName(name, cropId, getVarieties) {
  if (!name || !cropId) return '';
  const list = getVarieties(cropId) || [];
  const norm = String(name).trim().toLowerCase();
  const hit = list.find((v) => v.name.trim().toLowerCase() === norm);
  return hit?.id || '';
}

export function fieldIdFromName(name, fieldOptions) {
  if (!name) return '';
  const norm = String(name).trim().toLowerCase();
  const hit = fieldOptions.find(
    (f) => f.label.trim().toLowerCase() === norm
      || f.label.replace(/\s/g, '').toLowerCase() === norm.replace(/\s/g, ''),
  );
  return hit?.value || '';
}
