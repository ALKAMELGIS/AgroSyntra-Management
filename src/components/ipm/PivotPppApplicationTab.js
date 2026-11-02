import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Box, Table, TableHead, TableBody, TableRow, TableCell, TableContainer,
  Button, MenuItem, Typography, IconButton, Select, CircularProgress, Alert,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField,
} from '@mui/material';
import { AddOutlined as Add, DeleteOutlined as Delete, CheckOutlined as Check } from '@mui/icons-material';
import api from '../../utils/api';
import { listAllPesticideApplications } from '../../utils/listPesticideApplications';
import { useNotification } from '../../contexts/NotificationContext';
import { useAuth } from '../../contexts/AuthContext';
import {
  canDirectEditDeleteApplication,
  canRequestApplicationChange,
} from '../../utils/ipmAccess';
import { cropNameFromField } from '../../utils/plantingSegment';
import { formatPercentSeen } from '../../utils/percentSeen';
import useSameDaySprayWarn from './useSameDaySprayWarn';
import { DeleteSelectedButton, RowSelectCell, SelectAllCheckbox, deleteIdsSequentially } from '../table/BulkSelect';
import { useRowSelection } from '../../hooks/useRowSelection';

const FONT = '"Calibri", "Segoe UI", Arial, sans-serif';
const BORDER = '1px solid var(--sheet-border, #000)';
const HDR_BLUE = 'var(--sheet-tint-blue, #DBEEF4)';
const HDR_PEACH = 'var(--sheet-tint-peach, #FDEADA)';
const CALC_BG = 'var(--sheet-tint-green, #E2EFDA)';
const DOC_BG = 'var(--sheet-tint-blue, #E1F0FF)';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Pivot RC-109 — 15 columns per site screenshot (no Crop/Variety/Justification/Active Ingredient/Water)
const PIVOT_RC109_COLS = [
  { key: 'fieldId', label: 'Field ID (Pivot, NH/GH)', bg: HDR_BLUE, width: 118 },
  { key: 'segmentId', label: 'Segment ID (Bay, Section)', bg: HDR_BLUE, width: 108 },
  { key: 'scoutingDate', label: 'Scouting Date', bg: HDR_BLUE, width: 88 },
  { key: 'percentSeen', label: '%Seen & Variety / Expected Problem', bg: HDR_BLUE, width: 148 },
  { key: 'applicationDate', label: 'PPP Application Date (ddmmyyyy)', bg: HDR_BLUE, width: 118 },
  { key: 'applicationEndTime', label: 'Application End Time (24 Hr)', bg: HDR_BLUE, width: 108 },
  { key: 'productId', label: 'Name of PPP', bg: HDR_BLUE, width: 118 },
  { key: 'ratePerHa', label: 'Rate of Application/Ha', bg: HDR_PEACH, width: 88, calc: true },
  { key: 'totalQuantityApplied', label: 'Total Quality Applied', bg: HDR_PEACH, width: 88 },
  { key: 'uom', label: 'UoM', bg: HDR_BLUE, width: 48 },
  { key: 'applicationMethod', label: 'Machinery used', bg: HDR_BLUE, width: 88 },
  { key: 'phiDays', label: 'Pre-Harvest Interval (PHI)', bg: HDR_BLUE, width: 88, calc: true },
  { key: 'clearToHarvest', label: 'Clear to Harvest Date', bg: HDR_BLUE, width: 108, calc: true },
  { key: 'weatherConditions', label: 'Weather during Application', bg: HDR_BLUE, width: 118 },
  { key: 'operatorName', label: 'Equipment Operator', bg: HDR_BLUE, width: 100 },
];

const WEATHER_OPTIONS = ['Sunny', 'Cloudy', 'Windy', 'Rainy', 'Partly Cloudy', 'Hot', 'Humid', 'Calm'];
const UOM_OPTIONS = ['ML', 'GM', 'L', 'KG'];
const METHOD_OPTIONS = ['Spray', 'Drench', 'Fog', 'Granule', 'Other'];
const SEGMENT_OPTIONS = ['LS', 'RS', 'LS-RS', 'ALL'];

function hdr(bg, extra = {}) {
  return {
    backgroundColor: `${bg} !important`,
    color: 'var(--sheet-ink, #000) !important',
    fontFamily: FONT,
    fontWeight: 700,
    fontSize: '10px',
    textAlign: 'center',
    textTransform: 'none',
    border: BORDER,
    whiteSpace: 'pre-line',
    py: '4px',
    px: '3px',
    lineHeight: 1.15,
    verticalAlign: 'middle',
    ...extra,
  };
}

const dCell = {
  fontFamily: FONT,
  fontSize: '11px',
  border: BORDER,
  py: '2px',
  px: '3px',
  lineHeight: 1.3,
  textAlign: 'center',
  backgroundColor: 'var(--sheet-bg, #fff)',
};

const inputSx = {
  width: '100%',
  height: '22px',
  border: 'none',
  outline: 'none',
  fontFamily: FONT,
  fontSize: '11px',
  backgroundColor: 'transparent',
  padding: '1px 3px',
  boxSizing: 'border-box',
};

const selectSx = {
  fontFamily: FONT,
  fontSize: '11px',
  height: '22px',
  width: '100%',
  '& .MuiSelect-select': { py: 0, px: '3px', fontSize: '11px', fontFamily: FONT },
  '& .MuiOutlinedInput-notchedOutline': { border: 'none' },
};

function isoToDisplay(iso) {
  if (!iso) return '';
  const s = String(iso).split('T')[0];
  const [y, m, d] = s.split('-');
  if (!y || !m || !d) return iso;
  const mi = parseInt(m, 10) - 1;
  const yy = y.length >= 4 ? y.slice(-2) : y;
  return `${parseInt(d, 10)}-${MONTHS[mi] || m}-${yy}`;
}

function normalizeTimeInput(str) {
  if (!str || !str.trim()) return '';
  const s = str.trim();
  const ampm = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ampm) {
    let h = parseInt(ampm[1], 10);
    const m = ampm[2];
    if (ampm[3].toUpperCase() === 'PM' && h < 12) h += 12;
    if (ampm[3].toUpperCase() === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${m}`;
  }
  if (/^\d{1,2}:\d{2}$/.test(s)) {
    const [h, m] = s.split(':');
    return `${String(h).padStart(2, '0')}:${m}`;
  }
  const num = parseFloat(s);
  if (Number.isFinite(num) && num >= 0 && num < 1) {
    const totalMin = Math.round(num * 24 * 60);
    const hh = Math.floor(totalMin / 60);
    const mm = totalMin % 60;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }
  return s;
}

function addDays(isoDate, days) {
  if (!isoDate || days == null || days === '') return '';
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + Number(days));
  return d.toISOString().split('T')[0];
}

function computeRatePerHa(totalQty) {
  const q = parseFloat(totalQty);
  if (!Number.isFinite(q)) return '';
  return (q / 15).toFixed(2);
}

function mapApiToRow(r, productMap) {
  const product = productMap[r.product_id];
  return {
    id: r.id,
    fieldId: r.field_id || '',
    segmentId: r.segment_id || '',
    scoutingDate: r.scouting_date ? String(r.scouting_date).split('T')[0] : '',
    percentSeen: formatPercentSeen(r.percent_seen),
    applicationDate: r.application_date ? String(r.application_date).split('T')[0] : '',
    applicationEndTime: normalizeTimeInput(r.application_end_time || ''),
    productId: r.product_id || '',
    totalQuantityApplied: r.total_quantity_applied != null ? String(r.total_quantity_applied) : '',
    uom: r.uom || 'L',
    applicationMethod: r.application_method
      ? r.application_method.charAt(0).toUpperCase() + r.application_method.slice(1)
      : 'Spray',
    phiDays: r.phi_days ?? product?.phi_days ?? '',
    weatherConditions: r.weather_conditions || 'Calm',
    operatorName: r.operator_name || '',
    cropName: r.crop_name || '',
  };
}

function emptyRow() {
  const today = new Date().toISOString().split('T')[0];
  return {
    fieldId: '', segmentId: '', scoutingDate: '', percentSeen: '',
    applicationDate: today, applicationEndTime: '', productId: '',
    totalQuantityApplied: '', uom: 'L', applicationMethod: 'Spray',
    phiDays: '', weatherConditions: 'Calm', operatorName: '', cropName: '',
  };
}

function resolvePhiDays(productId, cropName, productMap, cropPhiMap) {
  if (!productId) return '';
  if (cropPhiMap && cropName) {
    const key = `${productId}|${cropName.toLowerCase()}`;
    if (cropPhiMap[key] != null) return cropPhiMap[key];
  }
  return productMap[productId]?.phi_days ?? '';
}

export default function PivotPppApplicationTab({
  templateId,
  pivotFields = [],
  products = [],
  cropPhiMap = null,
  activeSiteId,
  siteName = '',
  onRecordsChange,
}) {
  const notify = useNotification();
  const { confirmIfSameDay, dialog: sameDaySprayDialog } = useSameDaySprayWarn();
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [newRow, setNewRow] = useState(null);
  const [changeRequestDialog, setChangeRequestDialog] = useState({ open: false, action: 'update', entityId: null, entityIds: null, payload: null });
  const [changeRequestReason, setChangeRequestReason] = useState('');
  const [changeRequestSubmitting, setChangeRequestSubmitting] = useState(false);
  const selection = useRowSelection();

  const canDirectEdit = canDirectEditDeleteApplication(user);
  const canRequestChange = canRequestApplicationChange(user);
  const canModifyExisting = canDirectEdit || canRequestChange;

  const productMap = useMemo(() => {
    const m = {};
    products.forEach((p) => { m[p.id] = p; });
    return m;
  }, [products]);

  const fieldMap = useMemo(() => {
    const m = {};
    pivotFields.forEach((f) => { m[f.id] = f; });
    return m;
  }, [pivotFields]);

  const loadRows = useCallback(async () => {
    if (!templateId) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({ template_id: templateId });
      if (activeSiteId) params.set('site_id', activeSiteId);
      const { items: raw } = await listAllPesticideApplications(params);
      setRows(raw.map((r) => mapApiToRow(r, productMap)));
      onRecordsChange?.(raw);
    } catch (err) {
      notify.error(err.message || 'Failed to load pivot application records');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [templateId, activeSiteId, productMap, notify, onRecordsChange]);

  useEffect(() => { loadRows(); }, [loadRows]);

  const buildPayload = useCallback((row) => {
    const totalQty = row.totalQuantityApplied;
    return {
      templateId,
      fieldId: row.fieldId || null,
      segmentId: row.segmentId || null,
      scoutingDate: row.scoutingDate || null,
      cropName: row.cropName || null,
      percentSeen: row.percentSeen || null,
      applicationDate: row.applicationDate || null,
      applicationEndTime: row.applicationEndTime || null,
      productId: row.productId || null,
      totalQuantityApplied: totalQty ? Number(totalQty) : null,
      ratePerHa: totalQty ? Number(computeRatePerHa(totalQty)) : null,
      uom: row.uom || 'L',
      applicationMethod: (row.applicationMethod || 'Spray').toLowerCase(),
      operatorName: row.operatorName || null,
      weatherConditions: row.weatherConditions || null,
      siteId: activeSiteId,
    };
  }, [templateId, activeSiteId]);

  const submitChangeRequest = async () => {
    const { action, entityId, entityIds, payload } = changeRequestDialog;
    if (!changeRequestReason.trim()) {
      notify.error('Reason is required for change requests');
      return;
    }
    const ids = entityIds?.length ? entityIds : (entityId ? [entityId] : []);
    if (!ids.length) {
      notify.error('No records selected for this request');
      return;
    }
    setChangeRequestSubmitting(true);
    try {
      await api.post('/ipm/change-requests', {
        entityId: ids[0],
        entityIds: ids.length > 1 ? ids : undefined,
        action,
        reason: changeRequestReason.trim(),
        proposedPayload: action === 'update' ? payload : null,
        siteId: activeSiteId,
      });
      notify.success('Change request submitted for auditor review');
      setChangeRequestDialog({ open: false, action: 'update', entityId: null, entityIds: null, payload: null });
      setChangeRequestReason('');
    } catch (err) {
      notify.error(err.message || 'Failed to submit change request');
    } finally {
      setChangeRequestSubmitting(false);
    }
  };

  const handleSaveNew = async () => {
    if (!newRow?.fieldId) {
      notify.error('Field ID is required');
      return;
    }
    if (!newRow?.productId) {
      notify.error('Name of PPP is required');
      return;
    }
    const payload = buildPayload(newRow);
    const ok = await confirmIfSameDay({
      fieldId: payload.fieldId,
      dateYmd: payload.applicationDate,
    });
    if (!ok) return;
    setSavingId('new');
    try {
      await api.post('/ipm/pesticide-applications', payload);
      notify.success('Record saved');
      setNewRow(null);
      await loadRows();
    } catch (err) {
      notify.error(err.message || 'Failed to save record');
    } finally {
      setSavingId(null);
    }
  };

  const handleUpdateRow = async (row) => {
    if (!row.id) return;
    if (!canModifyExisting) {
      notify.error('You do not have permission to edit application records');
      return;
    }
    setSavingId(row.id);
    try {
      const payload = buildPayload(row);
      if (canDirectEdit) {
        await api.put(`/ipm/pesticide-applications/${row.id}`, payload);
        notify.success('Record updated');
        await loadRows();
      } else {
        setChangeRequestDialog({ open: true, action: 'update', entityId: row.id, entityIds: [row.id], payload });
      }
    } catch (err) {
      notify.error(err.message || 'Failed to update record');
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (id) => {
    if (!canModifyExisting) {
      notify.error('You do not have permission to delete application records');
      return;
    }
    try {
      if (canDirectEdit) {
        if (!window.confirm('Delete this application record?')) return;
        await api.delete(`/ipm/pesticide-applications/${id}`);
        notify.success('Record deleted');
        await loadRows();
      } else {
        setChangeRequestDialog({ open: true, action: 'delete', entityId: id, entityIds: [id], payload: null });
      }
    } catch (err) {
      notify.error(err.message || 'Failed to delete record');
    }
  };

  const handleBulkDelete = async () => {
    const ids = [...selection.selectedIds];
    if (!ids.length) return;
    if (canDirectEdit) {
      if (!window.confirm(`Delete ${ids.length} selected application record(s)?`)) return;
      const deleted = await deleteIdsSequentially(ids, (id) => api.delete(`/ipm/pesticide-applications/${id}`));
      selection.clear();
      notify.success(`Deleted ${deleted} record(s)`);
      await loadRows();
      return;
    }
    if (canRequestChange) {
      setChangeRequestDialog({ open: true, action: 'delete', entityId: ids[0], entityIds: ids, payload: null });
    }
  };

  const handleFieldChange = (rowSetter, fieldId) => {
    const field = fieldMap[fieldId];
    rowSetter((prev) => ({
      ...prev,
      fieldId,
      cropName: cropNameFromField(field) || prev.cropName,
    }));
  };

  const handleProductChange = (rowSetter, productId, cropName) => {
    rowSetter((prev) => ({
      ...prev,
      productId,
      phiDays: resolvePhiDays(productId, cropName || prev.cropName, productMap, cropPhiMap),
    }));
  };

  const renderCell = (col, row, rowSetter) => {
    if (col.key === 'ratePerHa') {
      return (
        <TableCell
          key={col.key}
          title="Auto-calculated from Total Quality Applied ÷ 15"
          sx={{ ...dCell, backgroundColor: CALC_BG, fontWeight: 600, cursor: 'default' }}
        >
          {computeRatePerHa(row.totalQuantityApplied)}
        </TableCell>
      );
    }
    if (col.key === 'phiDays') {
      const phi = row.phiDays !== '' && row.phiDays != null
        ? row.phiDays
        : resolvePhiDays(row.productId, row.cropName, productMap, cropPhiMap);
      return (
        <TableCell key={col.key} sx={{ ...dCell, backgroundColor: CALC_BG, fontWeight: 600 }}>
          {phi !== '' ? phi : ''}
        </TableCell>
      );
    }
    if (col.key === 'clearToHarvest') {
      const phi = row.phiDays !== '' && row.phiDays != null
        ? row.phiDays
        : resolvePhiDays(row.productId, row.cropName, productMap, cropPhiMap);
      return (
        <TableCell key={col.key} sx={{ ...dCell, backgroundColor: CALC_BG, fontWeight: 600 }}>
          {isoToDisplay(addDays(row.applicationDate, phi))}
        </TableCell>
      );
    }

    const peachBg = col.key === 'totalQuantityApplied' ? HDR_PEACH : undefined;
    const cellSx = { ...dCell, p: 0, ...(peachBg ? { backgroundColor: peachBg } : {}) };

    switch (col.key) {
      case 'fieldId':
        return (
          <TableCell key={col.key} sx={cellSx}>
            <Select size="small" value={row.fieldId} sx={selectSx}
              onChange={(e) => handleFieldChange(rowSetter, e.target.value)}>
              <MenuItem value="" sx={{ fontSize: '11px' }}>—</MenuItem>
              {pivotFields.map((f) => (
                <MenuItem key={f.id} value={f.id} sx={{ fontSize: '11px' }}>{f.name}</MenuItem>
              ))}
            </Select>
          </TableCell>
        );
      case 'segmentId':
        return (
          <TableCell key={col.key} sx={cellSx}>
            <Select size="small" value={row.segmentId} sx={selectSx}
              onChange={(e) => rowSetter((p) => ({ ...p, segmentId: e.target.value }))}>
              <MenuItem value="" sx={{ fontSize: '11px' }}>—</MenuItem>
              {SEGMENT_OPTIONS.map((s) => (
                <MenuItem key={s} value={s} sx={{ fontSize: '11px' }}>{s}</MenuItem>
              ))}
            </Select>
          </TableCell>
        );
      case 'scoutingDate':
      case 'applicationDate':
        return (
          <TableCell key={col.key} sx={cellSx}>
            <input
              type="date"
              value={row[col.key] || ''}
              onChange={(e) => rowSetter((p) => ({ ...p, [col.key]: e.target.value }))}
              style={inputSx}
            />
          </TableCell>
        );
      case 'applicationEndTime':
        return (
          <TableCell key={col.key} sx={cellSx}>
            <input
              type="time"
              value={row.applicationEndTime || ''}
              onChange={(e) => rowSetter((p) => ({ ...p, applicationEndTime: e.target.value }))}
              style={inputSx}
            />
          </TableCell>
        );
      case 'percentSeen':
      case 'totalQuantityApplied':
      case 'operatorName':
        return (
          <TableCell key={col.key} sx={cellSx}>
            <input value={row[col.key]} onChange={(e) => rowSetter((p) => ({ ...p, [col.key]: e.target.value }))} style={inputSx} />
          </TableCell>
        );
      case 'productId':
        return (
          <TableCell key={col.key} sx={cellSx}>
            <Select size="small" value={row.productId} sx={selectSx}
              onChange={(e) => handleProductChange(rowSetter, e.target.value, row.cropName)}>
              <MenuItem value="" sx={{ fontSize: '11px' }}>—</MenuItem>
              {products.map((p) => (
                <MenuItem key={p.id} value={p.id} sx={{ fontSize: '11px' }}>{p.name}</MenuItem>
              ))}
            </Select>
          </TableCell>
        );
      case 'uom':
        return (
          <TableCell key={col.key} sx={cellSx}>
            <Select size="small" value={row.uom} sx={selectSx}
              onChange={(e) => rowSetter((p) => ({ ...p, uom: e.target.value }))}>
              {UOM_OPTIONS.map((u) => <MenuItem key={u} value={u} sx={{ fontSize: '11px' }}>{u}</MenuItem>)}
            </Select>
          </TableCell>
        );
      case 'applicationMethod':
        return (
          <TableCell key={col.key} sx={cellSx}>
            <Select size="small" value={row.applicationMethod} sx={selectSx}
              onChange={(e) => rowSetter((p) => ({ ...p, applicationMethod: e.target.value }))}>
              {METHOD_OPTIONS.map((m) => <MenuItem key={m} value={m} sx={{ fontSize: '11px' }}>{m}</MenuItem>)}
            </Select>
          </TableCell>
        );
      case 'weatherConditions':
        return (
          <TableCell key={col.key} sx={cellSx}>
            <Select size="small" value={row.weatherConditions} sx={selectSx}
              onChange={(e) => rowSetter((p) => ({ ...p, weatherConditions: e.target.value }))}>
              {WEATHER_OPTIONS.map((w) => <MenuItem key={w} value={w} sx={{ fontSize: '11px' }}>{w}</MenuItem>)}
            </Select>
          </TableCell>
        );
      default:
        return <TableCell key={col.key} sx={dCell} />;
    }
  };

  const renderDataRow = (row, { isNew = false } = {}) => {
    const rowSetter = isNew ? setNewRow : (fn) => {
      setRows((prev) => prev.map((r) => (r.id === row.id ? (typeof fn === 'function' ? fn(r) : fn) : r)));
    };

    return (
      <TableRow key={row.id || 'new'} sx={isNew ? { backgroundColor: 'var(--sheet-alt, #FAFAFA)' } : undefined}>
        {canModifyExisting ? (
          isNew ? <TableCell padding="checkbox" /> : (
            <RowSelectCell
              id={row.id}
              selectedIds={selection.selectedIds}
              onToggle={selection.toggle}
              label={`Select pivot PPP ${row.id}`}
            />
          )
        ) : null}
        {PIVOT_RC109_COLS.map((col) => renderCell(col, row, rowSetter))}
        <TableCell sx={{ ...dCell, p: 0, width: 52, position: 'sticky', right: 0, backgroundColor: 'var(--sheet-bg, #fff)', zIndex: 1 }}>
          {isNew ? (
            <IconButton size="small" onClick={handleSaveNew} disabled={savingId === 'new'} sx={{ p: '2px' }}>
              {savingId === 'new' ? <CircularProgress size={14} /> : <Check sx={{ fontSize: 14, color: 'var(--sheet-accent, #1f7a4d)' }} />}
            </IconButton>
          ) : canModifyExisting ? (
            <Box sx={{ display: 'flex' }}>
              <IconButton size="small" onClick={() => handleUpdateRow(row)} disabled={savingId === row.id} sx={{ p: '2px' }}>
                {savingId === row.id ? <CircularProgress size={14} /> : <Check sx={{ fontSize: 14, color: 'var(--sheet-accent, #1f7a4d)' }} />}
              </IconButton>
              <IconButton size="small" onClick={() => handleDelete(row.id)} sx={{ p: '2px' }} aria-label="Delete">
                <Delete sx={{ fontSize: 14, color: 'var(--sheet-danger, #C62828)' }} />
              </IconButton>
            </Box>
          ) : null}
        </TableCell>
      </TableRow>
    );
  };

  const tableMinWidth = PIVOT_RC109_COLS.reduce((s, c) => s + c.width, 0) + 52 + (canModifyExisting ? 48 : 0);
  const tableColCount = PIVOT_RC109_COLS.length + 1 + (canModifyExisting ? 1 : 0);

  if (!templateId) {
    return (
      <Box sx={{ p: 3, fontFamily: FONT }}>
        <Typography color="text.secondary">
          Pivot RC-109 template is not configured. Run database migrations to enable this tab.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, fontFamily: FONT }}>
      <Box sx={{ flexShrink: 0, border: BORDER, backgroundColor: DOC_BG }}>
        <Box sx={{ display: 'flex' }}>
          <Box sx={{ flex: 1, borderRight: BORDER, p: '6px 10px', textAlign: 'center' }}>
            <Typography sx={{ fontFamily: FONT, fontWeight: 700, fontSize: '13px' }}>ELITE AGRO UAE LLC</Typography>
            <Typography sx={{ fontFamily: FONT, fontWeight: 700, fontSize: '11px' }}>
              PLANT PROTECTION PRODUCT (PPP) - APPLICATION RECORD
            </Typography>
            {siteName && (
              <Typography sx={{ fontFamily: FONT, fontSize: '10px', mt: 0.5 }}>{siteName}</Typography>
            )}
          </Box>
          <Box sx={{ width: 180, p: '6px 10px', textAlign: 'right' }}>
            <Typography sx={{ fontFamily: FONT, fontSize: '9px', fontWeight: 700 }}>EAG/AFO/IMS/RC-109</Typography>
            <Typography sx={{ fontFamily: FONT, fontSize: '9px' }}>Issue 03, 17-Sept-2020, Rev00</Typography>
          </Box>
        </Box>
      </Box>

      {pivotFields.length === 0 && (
        <Alert severity="warning" sx={{ flexShrink: 0, borderRadius: 0, py: 0.5, fontSize: '12px' }}>
          No pivot fields found for this site — Field ID dropdown will be empty until pivot fields are configured.
        </Alert>
      )}

      <TableContainer sx={{ flex: 1, minHeight: 0, border: BORDER, borderTop: 'none', overflow: 'auto' }}>
        <Table size="small" stickyHeader sx={{ borderCollapse: 'collapse', minWidth: tableMinWidth, tableLayout: 'fixed' }}>
          <TableHead>
            <TableRow>
              {canModifyExisting && (
                <TableCell padding="checkbox" sx={hdr(HDR_BLUE, { width: 42, minWidth: 42 })}>
                  <SelectAllCheckbox
                    ids={rows.map((r) => r.id)}
                    selectedIds={selection.selectedIds}
                    onToggleAll={selection.toggleAll}
                    label="Select all pivot PPP rows"
                  />
                </TableCell>
              )}
              {PIVOT_RC109_COLS.map((col) => (
                <TableCell key={col.key} sx={hdr(col.bg, { width: col.width, minWidth: col.width })}>
                  {col.label}
                </TableCell>
              ))}
              <TableCell sx={hdr(HDR_BLUE, { width: 52, minWidth: 52, position: 'sticky', right: 0, zIndex: 3 })} />
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={tableColCount} align="center"><CircularProgress size={20} /></TableCell>
              </TableRow>
            ) : (
              <>
                {rows.map((row) => renderDataRow(row))}
                {newRow && renderDataRow(newRow, { isNew: true })}
              </>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Box sx={{
        flexShrink: 0, py: 1, px: 0.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        borderTop: BORDER, backgroundColor: 'var(--sheet-bg, #fff)', position: 'relative', zIndex: 2,
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {canModifyExisting && (
            <DeleteSelectedButton
              count={selection.size}
              onClick={handleBulkDelete}
              label={canDirectEdit ? 'Delete selected' : 'Request deletion'}
            />
          )}
          <Typography sx={{ fontFamily: FONT, fontSize: '10px', color: 'var(--sheet-ink-2, #666)' }}>
            Rate = Total Quality Applied ÷ 15 · Clear to Harvest = Application Date + PHI
          </Typography>
        </Box>
        <Button
          size="small"
          variant="contained"
          startIcon={<Add sx={{ fontSize: 14 }} />}
          onClick={() => setNewRow(emptyRow())}
          disabled={!!newRow}
          sx={{ fontFamily: FONT, fontSize: '11px', textTransform: 'none' }}
        >
          Add Row
        </Button>
      </Box>

      {sameDaySprayDialog}

      <Dialog
        open={changeRequestDialog.open}
        onClose={() => setChangeRequestDialog({ open: false, action: 'update', entityId: null, entityIds: null, payload: null })}
      >
        <DialogTitle>
          {changeRequestDialog.action === 'delete' && (changeRequestDialog.entityIds?.length || 0) > 1
            ? `Request deletion of ${changeRequestDialog.entityIds.length} records`
            : `Request ${changeRequestDialog.action === 'delete' ? 'Deletion' : 'Edit'}`}
        </DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 2 }}>
            Your request will be sent to an auditor for review before the change is applied.
          </Alert>
          <TextField
            fullWidth
            multiline
            rows={3}
            label="Reason for change"
            value={changeRequestReason}
            onChange={(e) => setChangeRequestReason(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setChangeRequestDialog({ open: false, action: 'update', entityId: null, entityIds: null, payload: null });
              setChangeRequestReason('');
            }}
            disabled={changeRequestSubmitting}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={submitChangeRequest}
            disabled={!changeRequestReason.trim() || changeRequestSubmitting}
          >
            Submit Request
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
