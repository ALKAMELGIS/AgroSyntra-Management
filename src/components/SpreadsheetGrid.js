import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Box, IconButton, Tooltip, Typography, Button, Chip, Checkbox, CircularProgress, LinearProgress,
  useTheme, useMediaQuery,
} from '@mui/material';
import { pestJustification } from '../utils/pestExcelExport';
import { dropdownOptionsWithValue } from '../utils/dropdownOptions';
import { formatPercentSeen } from '../utils/percentSeen';
import {
  Add as AddIcon,
  SaveOutlined as SaveIcon,
  DeleteOutlined as DeleteIcon,
  ContentCopyOutlined as CopyIcon,
  MergeTypeOutlined as MixtureIcon,
  FilterListOffOutlined as ClearFilterIcon,
  DeleteSweepOutlined as BulkDeleteIcon,
} from '@mui/icons-material';
import SegmentSelector, { SegmentColumnFilter } from './SegmentSelector';
import { cropNameFromField, resolveVarietyFromSegmentId } from '../utils/plantingSegment';
import {
  MAX_PRODUCTS_PER_MIXTURE, SHEET_LOCKED_KEYS, alignMixtures, canAddMixture, duplicateMixtureGroup, mixtureInsertIndex,
  mixtureMembers, orderMixtureGroups,
} from '../utils/mixtureGroups';

// ─── Excel-like colour palette ─────────────────────────────────────
// Greens mirror palette.table in src/theme.js, which is the source of truth.
// They are literals here because this grid draws with plain inline styles
// rather than MUI sx, so it has no theme to read from.
const cellBorder = '1px solid #c8c8c8';
const headerBg = '#1d5a3c'; // = theme palette.table.headerBg
const headerColor = '#fff';
// The pinned Actions column sits darker so it reads as a separate band where it
// meets the rest of the header.
const headerPinnedBg = '#164a31';
const frozenBg = '#f2f2f2';
const focusBg = '#d5e7d9';
// Deliberately a warm neutral rather than a green. Calculated cells are tinted
// green, and a green stripe underneath them would swallow that signal.
const altRowBg = '#eff1ed';
const readonlyBg = '#f0f0f0';
const calcBg = '#e8f5e9';
const dirtyBg = '#fff8e1';
const activeRowBg = '#dfeee3';
const activeCellBg = '#c6dfcd';
const bannerBg = '#143d29';
const bannerColor = '#ffffff';
const bannerSubBg = '#1d5a3c';
const mixtureBorderColor = '#1f7a4d';
const mixtureChildBg = '#eef4ef';
const filterBarBg = '#e9e5e0';

// ─── Frozen columns ────────────────────────────────────────────────
// Widths of the two gutter columns. Named because the sticky offset of every
// frozen column after them is measured from their sum, so a width edited in one
// place and not the other silently misaligns the whole band.
const GUTTER_CHECKBOX_W = 36;
const GUTTER_ROWNUM_W = 44;
const GUTTER_W = GUTTER_CHECKBOX_W + GUTTER_ROWNUM_W;

// Columns that say which row you are looking at. These grids run past twenty
// columns, and once Crop and Field scroll away every row looks alike.
const IDENTITY_KEYS = ['cropName', 'variety', 'fieldId', 'fieldName'];

// Reads as the scrolling columns passing underneath the frozen ones rather than
// stopping at a line. Matches freezeColumnsSx in components/table/ExcelTable.js.
const FROZEN_EDGE_SHADOW = { boxShadow: '4px 0 6px -4px rgba(0,0,0,0.28)' };

const headerCellStyle = {
  border: cellBorder, padding: '4px 6px', fontSize: '0.7rem', lineHeight: 1.3,
  height: 32, background: headerBg, color: headerColor, fontWeight: 700,
  textAlign: 'center', whiteSpace: 'nowrap',
};
const bodyCellStyle = {
  border: cellBorder, padding: 0, height: 28, verticalAlign: 'middle',
};
const inputBaseStyle = {
  width: '100%', border: 'none', outline: 'none', padding: '3px 4px',
  fontSize: '0.75rem', background: 'transparent', height: '100%',
  boxSizing: 'border-box', fontFamily: 'inherit',
};
const readonlyStyle = { ...inputBaseStyle, background: readonlyBg, color: '#666', cursor: 'default' };
const calcStyle = { ...inputBaseStyle, background: calcBg, fontWeight: 600, color: '#1f7a4d', cursor: 'default', textAlign: 'right' };
const filterSelectStyle = {
  border: '1px solid #bbb', borderRadius: 3, padding: '3px 4px', fontSize: '0.72rem',
  background: '#fff', fontFamily: 'inherit', minWidth: 0, maxWidth: 140,
};
const filterInputStyle = {
  ...filterSelectStyle, width: 110,
};

// ─── Data mapping ──────────────────────────────────────────────────
const SNAKE_TO_CAMEL = {
  field_id: 'fieldId', product_id: 'productId', crop_name: 'cropName',
  segment_id: 'segmentId', application_date: 'applicationDate',
  scouting_date: 'scoutingDate', percent_seen: 'percentSeen',
  application_start_time: 'applicationStartTime', application_end_time: 'applicationEndTime',
  active_ingredient: 'activeIngredient', unit_price: 'unitPrice',
  total_quantity_applied: 'totalQuantityApplied', machinery_used: 'machineryUsed',
  weather_conditions: 'weatherConditions', operator_name: 'operatorName',
  verified_by: 'verifiedBy', phi_days: 'phiDays', phi_end_date: 'clearToHarvestDate',
  template_id: 'templateId', dosage_unit: 'uom', total_water_qty: 'totalWaterQty',
  rate_per_ha: 'ratePerHa', field_name: 'fieldId_display', product_name: 'productId_display',
  group_id: 'groupId', is_mixture_child: 'isMixtureChild',
};
const DATE_KEYS = new Set(['applicationDate', 'scoutingDate']);
const DATETIME_KEYS = new Set(['clearToHarvestDate']);

function getTodayDateStr() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function mapRowFromApi(apiRow) {
  const row = { id: apiRow.id, _saved: true, _id: apiRow.id };
  Object.entries(apiRow).forEach(([k, v]) => {
    const camel = SNAKE_TO_CAMEL[k] || k;
    if (v != null) {
      if (DATE_KEYS.has(camel) && typeof v === 'string' && v.includes('T')) {
        row[camel] = v.split('T')[0];
      } else if (DATETIME_KEYS.has(camel) && typeof v === 'string' && v.includes('T')) {
        const d = new Date(v);
        const day = String(d.getDate()).padStart(2, '0');
        const mon = d.toLocaleString('en', { month: 'short' });
        const yr = d.getFullYear();
        if (d.getHours() || d.getMinutes()) {
          const hh = String(d.getHours()).padStart(2, '0');
          const mm = String(d.getMinutes()).padStart(2, '0');
          row[camel] = `${day} ${mon} ${yr}, ${hh}:${mm}`;
        } else {
          row[camel] = `${day} ${mon} ${yr}`;
        }
      } else {
        row[camel] = String(v);
      }
    }
  });
  if (apiRow.field_id) row.fieldId = apiRow.field_id;
  if (apiRow.product_id) row.productId = apiRow.product_id;
  if (apiRow.group_id) row.groupId = apiRow.group_id;
  if (apiRow.is_mixture_child) row.isMixtureChild = true;
  // Raw creation time keeps a mixture group's rows in the order they were added.
  if (apiRow.created_at) row._createdAt = apiRow.created_at;
  const justification = pestJustification(apiRow);
  if (justification) row.justification = justification;
  if (row.percentSeen) row.percentSeen = formatPercentSeen(row.percentSeen);
  return row;
}

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ─── Component ─────────────────────────────────────────────────────

function SpreadsheetGrid({
  columns,
  rows,
  onSaveRow,
  onDeleteRow,
  onBulkDeleteRows,
  skipBulkDeleteConfirm = false,
  fields = [],
  farmAreas = [],
  products = [],
  plantingRecords = [],
  templateId,
  templateName = '',
  saving = false,
  cropPhiMap = null,
  loading = false,
}) {
  const theme = useTheme();
  const isCompact = useMediaQuery(theme.breakpoints.down('md'));
  const rowHeight = isCompact ? 24 : 28;
  const headerHeight = isCompact ? 28 : 32;
  const compactBodyCellStyle = { ...bodyCellStyle, height: rowHeight };
  const compactHeaderCellStyle = { ...headerCellStyle, height: headerHeight, padding: isCompact ? '2px 4px' : headerCellStyle.padding };

  const [editRows, setEditRows] = useState([]);
  const [activeRow, setActiveRow] = useState(null);
  const [dirty, setDirty] = useState(new Set());
  const [selectedRows, setSelectedRows] = useState(new Set());
  const gridRef = useRef(null);

  // Filter state
  const [filterFarmArea, setFilterFarmArea] = useState('');
  const [filterField, setFilterField] = useState('');
  const [filterProduct, setFilterProduct] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterSegment, setFilterSegment] = useState('');
  const [filterVariety, setFilterVariety] = useState('');
  const [filterJustification, setFilterJustification] = useState('');
  const [filterOperator, setFilterOperator] = useState('');

  const hasAnyFilter = filterFarmArea || filterField || filterProduct || filterDateFrom || filterDateTo
    || filterSegment || filterVariety || filterJustification || filterOperator;

  useEffect(() => {
    // Records load newest first; keep each mixture's main row first and its mixtures under it.
    // Mixtures also show their main row's times, machinery and operator (locked on mixture rows).
    const mapped = alignMixtures(
      orderMixtureGroups((rows || []).map((r) => mapRowFromApi(r))),
      SHEET_LOCKED_KEYS,
    ).rows;
    setEditRows(mapped);
    setDirty(new Set());
    setSelectedRows(new Set());
  }, [rows]);

  /**
   * Leading identity columns, keyed by column key, with the offset each one
   * sticks at.
   *
   * Only the leading run qualifies. Sticky offsets are cumulative, so a frozen
   * column with a scrolling one in front of it would sit in the wrong place.
   * Templates differ: spray and drench open with Crop, Variety and Field ID,
   * while the pesticide template has no Variety and calls its field fieldName,
   * so this takes whatever the template actually starts with.
   */
  const pinnedColumns = useMemo(() => {
    const map = new Map();
    let left = GUTTER_W;
    for (const col of columns || []) {
      if (!IDENTITY_KEYS.includes(col.key)) break;
      const width = col.width || 100;
      map.set(col.key, { left, width, isLast: false });
      left += width;
    }
    const last = [...map.values()].pop();
    if (last) last.isLast = true;
    return map;
  }, [columns]);

  const fieldMap = useMemo(() => {
    const m = {};
    fields.forEach((f) => { m[f.id] = f; });
    return m;
  }, [fields]);

  const productMap = useMemo(() => {
    const m = {};
    products.forEach((p) => { m[p.id] = p; });
    return m;
  }, [products]);

  // Backfill unit price from site catalog for rows saved without pricing (display only)
  useEffect(() => {
    if (!products.length) return;
    setEditRows((prev) => {
      let changed = false;
      const next = prev.map((row) => {
        if (!row.productId || (row.unitPrice != null && row.unitPrice !== '')) return row;
        const p = productMap[row.productId];
        if (p?.site_price == null) return row;
        changed = true;
        return { ...row, unitPrice: String(p.site_price) };
      });
      return changed ? next : prev;
    });
  }, [products, productMap]);

  // Farm area -> fields cascading
  const farmAreaFieldIds = useMemo(() => {
    if (!filterFarmArea) return null;
    const fa = farmAreas.find((a) => a.id === filterFarmArea);
    if (!fa) return null;
    return new Set((fa.fields || []).map((f) => f.id));
  }, [filterFarmArea, farmAreas]);

  const cascadedFields = useMemo(() => {
    if (!farmAreaFieldIds) return fields;
    return fields.filter((f) => farmAreaFieldIds.has(f.id));
  }, [fields, farmAreaFieldIds]);

  // ─── Filtering ───────────────────────────────────────────────────
  const filteredIndices = useMemo(() => {
    const indices = [];
    for (let i = 0; i < editRows.length; i++) {
      const r = editRows[i];
      if (filterFarmArea && farmAreaFieldIds && !farmAreaFieldIds.has(r.fieldId)) continue;
      if (filterField && r.fieldId !== filterField) continue;
      if (filterProduct && r.productId !== filterProduct) continue;
      if (filterDateFrom && r.applicationDate && r.applicationDate < filterDateFrom) continue;
      if (filterDateTo && r.applicationDate && r.applicationDate > filterDateTo) continue;
      if (filterSegment) {
        const seg = (r.segmentId || '').toLowerCase();
        if (filterSegment.includes('||')) {
          const allowed = filterSegment.split('||').map(s => s.toLowerCase());
          if (!allowed.some(a => seg.includes(a))) continue;
        } else if (!seg.includes(filterSegment.toLowerCase())) continue;
      }
      if (filterVariety && !(r.variety || '').toLowerCase().includes(filterVariety.toLowerCase())) continue;
      if (filterJustification && !(r.justification || '').toLowerCase().includes(filterJustification.toLowerCase())) continue;
      if (filterOperator && !(r.operatorName || '').toLowerCase().includes(filterOperator.toLowerCase())) continue;
      indices.push(i);
    }
    return indices;
  }, [editRows, filterFarmArea, filterField, filterProduct, filterDateFrom, filterDateTo, filterSegment, filterVariety, filterJustification, filterOperator, farmAreaFieldIds]);

  const visibleRows = useMemo(() => {
    if (!hasAnyFilter) return editRows.map((r, i) => ({ row: r, realIdx: i }));
    return filteredIndices.map((i) => ({ row: editRows[i], realIdx: i }));
  }, [editRows, filteredIndices, hasAnyFilter]);

  // ─── Mixture group numbering ─────────────────────────────────────
  const rowNumbering = useMemo(() => {
    const numbering = {};
    let mainNum = 0;
    let lastGroupId = null;
    let childCounter = 0;
    for (let i = 0; i < editRows.length; i++) {
      const r = editRows[i];
      const rowId = r._id || r.id;
      if (r.isMixtureChild && r.groupId && r.groupId === lastGroupId) {
        childCounter++;
        numbering[rowId] = `${mainNum}${String.fromCharCode(96 + childCounter)}`;
      } else {
        mainNum++;
        childCounter = 0;
        lastGroupId = r.groupId || null;
        numbering[rowId] = `${mainNum}`;
      }
    }
    return numbering;
  }, [editRows]);

  // ─── Row actions ─────────────────────────────────────────────────
  const addRow = useCallback(() => {
    const today = getTodayDateStr();
    const blank = {};
    columns.forEach((col) => {
      blank[col.key] = col.key === 'applicationDate' ? today : '';
    });
    blank._id = `new_${Date.now()}`;
    blank._saved = false;
    setEditRows((prev) => [...prev, blank]);
    setActiveRow(blank._id);
    setDirty((prev) => new Set(prev).add(blank._id));
    setTimeout(() => { if (gridRef.current) gridRef.current.scrollTop = gridRef.current.scrollHeight; }, 50);
  }, [columns]);

  const duplicateRow = useCallback((realIdx) => {
    const source = editRows[realIdx];
    if (!source) return;
    // A main row with mixtures is duplicated as a whole application (main + mixtures, new group).
    if (mixtureMembers(editRows, realIdx).length > 0) {
      let n = 0;
      const { rows: next, newIds } = duplicateMixtureGroup(editRows, realIdx, {
        newGroupId: generateUUID(),
        makeId: () => { n += 1; return `new_${Date.now()}_${n}`; },
      });
      setEditRows(next);
      setActiveRow(newIds[0]);
      setDirty((prev) => new Set([...prev, ...newIds]));
      return;
    }
    const dup = { ...source, _id: `new_${Date.now()}`, _saved: false, id: undefined, groupId: undefined, isMixtureChild: false };
    const next = [...editRows];
    next.splice(realIdx + 1, 0, dup);
    setEditRows(next);
    setActiveRow(dup._id);
    setDirty((prev) => new Set(prev).add(dup._id));
  }, [editRows]);

  // Called from the main row or from one of its mixtures; either way the new mixture joins that
  // application, after its last mixture. An application holds at most MAX_PRODUCTS_PER_MIXTURE products.
  const addMixture = useCallback((realIdx) => {
    const parent = editRows[realIdx];
    if (!parent || !canAddMixture(editRows, realIdx)) return;

    const groupId = parent.groupId || generateUUID();

    // Ensure parent gets the groupId
    if (!parent.groupId) {
      setEditRows((prev) => {
        const next = [...prev];
        next[realIdx] = { ...next[realIdx], groupId };
        return next;
      });
      const parentRowId = parent._id || parent.id;
      if (parentRowId) setDirty((prev) => new Set(prev).add(parentRowId));
    }

    const child = {};
    columns.forEach((col) => { child[col.key] = ''; });
    // Copy shared fields from parent
    const copyKeys = [
      'fieldId', 'cropName', 'variety', 'segmentId', 'applicationDate',
      'scoutingDate', 'justification', 'percentSeen',
      'applicationStartTime', 'applicationEndTime',
      'machineryUsed', 'weatherConditions', 'operatorName', 'verifiedBy',
      'totalWaterQty',
    ];
    copyKeys.forEach((k) => { if (parent[k]) child[k] = parent[k]; });
    // Product-specific fields left blank
    child.productId = '';
    child.activeIngredient = '';
    child.dosage = '';
    child.uom = '';
    child.totalQuantityApplied = '';
    child.unitPrice = '';
    child.phiDays = '';

    child._id = `mix_${Date.now()}`;
    child._saved = false;
    child.groupId = groupId;
    child.isMixtureChild = true;

    // Insert right after the last child of this group (or after parent)
    setEditRows((prev) => {
      const next = [...prev];
      // Ensure parent has groupId in the array
      if (!next[realIdx].groupId) next[realIdx] = { ...next[realIdx], groupId };
      next.splice(mixtureInsertIndex(next, realIdx), 0, child);
      return next;
    });
    setActiveRow(child._id);
    setDirty((prev) => new Set(prev).add(child._id));
  }, [editRows, columns]);

  const computeCalculated = useCallback((row, col) => {
    if (col.type !== 'calculated') return row[col.key] || '';
    const formula = col.formula || '';
    if (formula.includes('totalQuantityApplied') && formula.includes('unitPrice')) {
      const qty = parseFloat(row.totalQuantityApplied) || 0;
      const price = parseFloat(row.unitPrice) || 0;
      if (qty > 0 && price > 0) return ((qty * price) / 1000).toFixed(2);
      return '';
    }
    if (formula.includes('applicationEndTime') && formula.includes('phiDays')) {
      const dateStr = row.applicationDate || row.applicationEndTime;
      const phi = parseInt(row.phiDays, 10) || 0;
      if (!dateStr || !phi) return '';
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '';
      const timeStr = row.applicationEndTime || '';
      if (timeStr && timeStr.includes(':')) {
        const [h, m] = timeStr.split(':').map(Number);
        d.setHours(h || 0, m || 0);
      }
      d.setDate(d.getDate() + phi);
      const day = String(d.getDate()).padStart(2, '0');
      const mon = d.toLocaleString('en', { month: 'short' });
      const yr = d.getFullYear();
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      if (d.getHours() === 0 && d.getMinutes() === 0) return `${day} ${mon} ${yr}`;
      return `${day} ${mon} ${yr}, ${hh}:${mm}`;
    }
    return '';
  }, []);

  const handleCellChange = useCallback((realIdx, colKey, value) => {
    const isLockedKey = SHEET_LOCKED_KEYS.includes(colKey);
    if (isLockedKey && editRows[realIdx]?.isMixtureChild) return;
    // The main row's times, machinery and operator carry over to its mixtures.
    const followers = isLockedKey ? mixtureMembers(editRows, realIdx) : [];
    setEditRows((prev) => {
      const next = [...prev];
      followers.forEach((i) => { if (next[i]) next[i] = { ...next[i], [colKey]: value }; });
      const row = { ...next[realIdx] };
      row[colKey] = value;
      if (colKey === 'fieldId' && fieldMap[value]) {
        const f = fieldMap[value];
        row.cropName = cropNameFromField(f) || f.cropName || '';
        row.variety = f.varietyName || f.variety || '';
        row.segmentId = '';
      }
      if (colKey === 'segmentId' && row.fieldId) {
        const f = fieldMap[row.fieldId];
        const resolved = resolveVarietyFromSegmentId(
          row.fieldId,
          value,
          plantingRecords,
          f,
        );
        if (resolved.variety) row.variety = resolved.variety;
      }
      if (colKey === 'productId' && productMap[value]) {
        const p = productMap[value];
        row.activeIngredient = p.active_ingredient || '';
        row.unitPrice = p.site_price != null ? String(p.site_price) : '';
        row.phiDays = p.phi_days != null ? String(p.phi_days) : '';
      }
      if ((colKey === 'productId' || colKey === 'cropName' || colKey === 'fieldId') && cropPhiMap) {
        const pid = row.productId;
        const crop = row.cropName;
        if (pid && crop) {
          const key = `${pid}|${crop.toLowerCase()}`;
          if (cropPhiMap[key] != null) {
            row.phiDays = String(cropPhiMap[key]);
          }
        }
      }
      next[realIdx] = row;
      return next;
    });
    const changedIds = [realIdx, ...followers]
      .map((i) => editRows[i]?._id || editRows[i]?.id)
      .filter(Boolean);
    if (changedIds.length) setDirty((prev) => new Set([...prev, ...changedIds]));
  }, [fieldMap, productMap, editRows, cropPhiMap, plantingRecords]);

  const buildPayload = useCallback((row) => {
    const payload = {};
    columns.forEach((col) => {
      if (col.type === 'calculated') {
        payload[col.key] = computeCalculated(row, col);
      } else {
        payload[col.key] = row[col.key] != null && row[col.key] !== '' ? row[col.key] : null;
      }
    });
    payload.templateId = templateId;
    payload.groupId = row.groupId || null;
    payload.isMixtureChild = row.isMixtureChild || false;
    if (!payload.applicationDate) payload.applicationDate = getTodayDateStr();
    if (row.id && row._saved) payload.id = row.id;
    return payload;
  }, [columns, computeCalculated, templateId]);

  const handleSave = useCallback(async (realIdx) => {
    const row = editRows[realIdx];
    if (!row) return;

    // Collect group rows (parent + children) for group save
    const groupId = row.groupId;
    const toSave = [];
    if (groupId) {
      for (let i = 0; i < editRows.length; i++) {
        if (editRows[i].groupId === groupId) toSave.push(i);
      }
    } else {
      toSave.push(realIdx);
    }

    for (const idx of toSave) {
      const r = editRows[idx];
      const rowId = r._id || r.id;
      if (!dirty.has(rowId)) continue;
      const payload = buildPayload(r);
      const saved = await onSaveRow(payload);
      if (saved) {
        const mapped = mapRowFromApi(saved);
        setEditRows((prev) => {
          const next = [...prev];
          next[idx] = { ...next[idx], ...mapped, _saved: true, _id: saved.id };
          return next;
        });
        setDirty((prev) => { const next = new Set(prev); next.delete(rowId); return next; });
      }
    }
  }, [editRows, dirty, buildPayload, onSaveRow]);

  // Deleting a main row deletes its mixtures too, so none is left without its main product.
  // Deleting a mixture row deletes only that row.
  const handleDelete = useCallback(async (realIdx) => {
    const row = editRows[realIdx];
    if (!row) return;
    const members = mixtureMembers(editRows, realIdx);
    if (members.length === 0) {
      if (row._saved && row.id) {
        const removed = await onDeleteRow(row.id);
        if (removed === false) return;
      }
      setEditRows((prev) => prev.filter((_, i) => i !== realIdx));
      return;
    }

    const count = members.length;
    if (!window.confirm(`Delete this application and its ${count} mixture${count === 1 ? '' : 's'}?`)) return;
    const groupRows = [row, ...members.map((i) => editRows[i])];
    const savedIds = groupRows.filter((r) => r._saved && r.id).map((r) => r.id);
    try {
      if (savedIds.length > 0) {
        if (onBulkDeleteRows) {
          const removed = await onBulkDeleteRows(savedIds);
          if (removed === false) return;
        } else {
          for (const id of savedIds) {
            const removed = await onDeleteRow(id);
            if (removed === false) return;
          }
        }
      }
      const gone = new Set(groupRows.map((r) => r._id || r.id));
      setEditRows((prev) => prev.filter((r) => !gone.has(r._id || r.id)));
    } catch {
      // Keep rows visible when the server rejects the delete.
    }
  }, [editRows, onDeleteRow, onBulkDeleteRows]);

  const handleBulkDelete = useCallback(async () => {
    if (selectedRows.size === 0) return;
    // A selected main row takes its mixtures with it.
    const selectedIdx = editRows.reduce((acc, r, i) => {
      if (selectedRows.has(r._id || r.id)) acc.push(i);
      return acc;
    }, []);
    const deleteIdx = new Set(selectedIdx.flatMap((i) => [i, ...mixtureMembers(editRows, i)]));
    const extra = deleteIdx.size - selectedIdx.length;
    if (!skipBulkDeleteConfirm) {
      const withMix = extra > 0 ? ` and ${extra} mixture row${extra === 1 ? '' : 's'} with them` : '';
      if (!window.confirm(`Delete ${selectedRows.size} selected record${selectedRows.size === 1 ? '' : 's'}${withMix}?`)) return;
    }
    const toDelete = editRows.filter((_, i) => deleteIdx.has(i));
    const savedIds = toDelete.filter((r) => r._saved && r.id).map((r) => r.id);
    try {
      if (savedIds.length > 0) {
        if (onBulkDeleteRows) {
          const removed = await onBulkDeleteRows(savedIds);
          if (removed === false) return;
        } else {
          for (const id of savedIds) {
            const removed = await onDeleteRow(id);
            if (removed === false) return;
          }
        }
      }
      const gone = new Set(toDelete.map((r) => r._id || r.id));
      setEditRows((prev) => prev.filter((r) => !gone.has(r._id || r.id)));
      setSelectedRows(new Set());
    } catch {
      // Keep rows visible when the server rejects the delete.
    }
  }, [editRows, selectedRows, onDeleteRow, onBulkDeleteRows, skipBulkDeleteConfirm]);

  const toggleSelectRow = useCallback((rowId) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    const visibleIds = visibleRows.map(({ row }) => row._id || row.id);
    const allSelected = visibleIds.every((id) => selectedRows.has(id));
    if (allSelected) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(visibleIds));
    }
  }, [visibleRows, selectedRows]);

  const handleFocus = (rowId, colKey, e) => {
    setActiveRow(rowId);
    if (e?.target?.parentElement) e.target.parentElement.style.background = focusBg;
  };
  const handleBlur = (e) => {
    if (e?.target?.parentElement) e.target.parentElement.style.background = '';
  };

  const clearFilters = () => {
    setFilterFarmArea(''); setFilterField(''); setFilterProduct('');
    setFilterDateFrom(''); setFilterDateTo(''); setFilterSegment('');
    setFilterVariety(''); setFilterJustification(''); setFilterOperator('');
  };

  // ─── Cell renderer ───────────────────────────────────────────────
  /**
   * @param {string} rowBg opaque background for frozen cells. Body cells are
   *   normally transparent and let the row show through, but a sticky cell that
   *   does not paint lets the scrolling columns show through it instead.
   */
  const renderCell = (row, realIdx, col, rowBg) => {
    const value = row[col.key] || '';
    const rowId = row._id || row.id;

    // Width is fixed rather than a minimum: every frozen column after this one
    // is offset by the sum of the widths before it, so a cell that sizes to its
    // content puts the rest of the band in the wrong place.
    const pin = pinnedColumns.get(col.key);
    const pinStyle = pin ? {
      position: 'sticky', left: pin.left, zIndex: 1,
      width: pin.width, minWidth: pin.width, maxWidth: pin.width,
      ...(pin.isLast ? FROZEN_EDGE_SHADOW : {}),
    } : null;
    // Frozen data columns follow row state, unlike the flat gutter: a row that
    // lights up everywhere except its first columns just looks broken.
    const pinBg = pin ? { background: rowBg } : null;

    if (col.type === 'calculated') {
      const calc = computeCalculated(row, col);
      return (
        <td key={col.key} style={{ ...compactBodyCellStyle, background: calcBg, minWidth: col.width || 80, ...pinStyle }}>
          <div style={calcStyle}>{calc || ''}</div>
        </td>
      );
    }

    // A mixture row's times, machinery and operator come from its main row and are locked.
    if (col.readonly || (row.isMixtureChild && SHEET_LOCKED_KEYS.includes(col.key))) {
      return (
        <td key={col.key} style={{ ...compactBodyCellStyle, background: readonlyBg, minWidth: col.width || 80, ...pinStyle }}>
          <div style={readonlyStyle}>{value}</div>
        </td>
      );
    }

    if (col.type === 'dropdown') {
      if (col.key === 'fieldId' || col.key === 'productId') {
        const items = col.key === 'fieldId' ? cascadedFields : products;
        return (
          <td key={col.key} style={{ ...compactBodyCellStyle, minWidth: col.width || 120, padding: '0 2px', ...pinBg, ...pinStyle }}>
            <select value={value}
              onChange={(e) => handleCellChange(realIdx, col.key, e.target.value)}
              onFocus={(e) => handleFocus(rowId, col.key, e)} onBlur={handleBlur}
              style={{ ...inputBaseStyle, cursor: 'pointer', fontSize: '0.72rem' }}>
              <option value="">— select —</option>
              {items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </td>
        );
      }
      const options = dropdownOptionsWithValue(col.options, value);
      return (
        <td key={col.key} style={{ ...compactBodyCellStyle, minWidth: col.width || 100, padding: '0 2px', ...pinBg, ...pinStyle }}>
          <select value={value}
            onChange={(e) => handleCellChange(realIdx, col.key, e.target.value)}
            onFocus={(e) => handleFocus(rowId, col.key, e)} onBlur={handleBlur}
            style={{ ...inputBaseStyle, cursor: 'pointer', fontSize: '0.72rem' }}>
            <option value="">— select —</option>
            {options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        </td>
      );
    }

    if (col.key === 'segmentId') {
      return (
        <td key={col.key} style={{ ...compactBodyCellStyle, minWidth: col.width || 130, padding: '0 2px', ...pinBg, ...pinStyle }}>
          <SegmentSelector
            value={value}
            onChange={(v) => handleCellChange(realIdx, 'segmentId', v)}
            fieldId={row.fieldId}
            plantingRecords={plantingRecords}
            compact
          />
        </td>
      );
    }

    const inputType = col.type === 'number' ? 'number' : col.type === 'date' ? 'date' : col.type === 'time' ? 'time' : 'text';
    return (
      <td key={col.key} style={{ ...compactBodyCellStyle, minWidth: col.width || 80, ...pinBg, ...pinStyle }}>
        <input type={inputType} value={value}
          onChange={(e) => handleCellChange(realIdx, col.key, e.target.value)}
          onFocus={(e) => handleFocus(rowId, col.key, e)} onBlur={handleBlur}
          step={col.type === 'number' ? 'any' : undefined}
          min={col.type === 'number' ? 0 : undefined}
          style={{ ...inputBaseStyle, textAlign: col.type === 'number' ? 'right' : 'left' }}
        />
      </td>
    );
  };

  const hasDirty = dirty.size > 0;

  // ─── Render ──────────────────────────────────────────────────────
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* ── RC-109 Excel Banner ── */}
      <Box sx={{ flexShrink: 0 }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed' }}>
          <tbody>
            <tr>
              <td colSpan={3} style={{
                background: bannerBg, color: bannerColor, padding: '8px 16px',
                fontSize: '0.85rem', fontWeight: 700, letterSpacing: 0.5, borderBottom: `2px solid ${headerBg}`,
              }}>
                ELITE AGRO UAE LLC
                <span style={{ float: 'right', fontSize: '0.7rem', fontWeight: 400, opacity: 0.8 }}>
                  EAG/AFO/IMS/RC-109
                </span>
              </td>
            </tr>
            <tr>
              <td colSpan={3} style={{
                background: bannerSubBg, color: bannerColor, padding: '4px 16px',
                fontSize: '0.75rem', fontWeight: 600, borderBottom: cellBorder,
              }}>
                PLANT PROTECTION PRODUCT (PPP) — {templateName || 'APPLICATION RECORD'}
                <span style={{ float: 'right', fontSize: '0.65rem', fontWeight: 400, opacity: 0.7 }}>
                  Issue 03, 17-Sept-2020, Rev00
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </Box>

      {/* ── Filter Bar ── */}
      <Box sx={{
        display: 'flex', flexWrap: 'wrap', gap: 0.75, alignItems: 'center',
        px: 1, py: 0.5, bgcolor: filterBarBg, borderBottom: cellBorder, flexShrink: 0,
      }}>
        <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: '#555', mr: 0.5 }}>Filter:</Typography>

        {farmAreas.length > 0 && (
          <select value={filterFarmArea} onChange={(e) => { setFilterFarmArea(e.target.value); setFilterField(''); }}
            style={filterSelectStyle}>
            <option value="">All Farm Areas</option>
            {farmAreas.map((fa) => <option key={fa.id} value={fa.id}>{fa.name}</option>)}
          </select>
        )}

        <select value={filterField} onChange={(e) => setFilterField(e.target.value)} style={filterSelectStyle}>
          <option value="">All Fields</option>
          {cascadedFields.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>

        <select value={filterProduct} onChange={(e) => setFilterProduct(e.target.value)} style={filterSelectStyle}>
          <option value="">All Products</option>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>

        <input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)}
          title="From date" style={filterInputStyle} />
        <input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)}
          title="To date" style={filterInputStyle} />

        <input type="text" placeholder="Segment..." value={filterSegment}
          onChange={(e) => setFilterSegment(e.target.value)} style={{ ...filterInputStyle, width: 80 }} />

        <input type="text" placeholder="Variety..." value={filterVariety}
          onChange={(e) => setFilterVariety(e.target.value)} style={{ ...filterInputStyle, width: 90 }} />

        <input type="text" placeholder="Justification..." value={filterJustification}
          onChange={(e) => setFilterJustification(e.target.value)} style={{ ...filterInputStyle, width: 110 }} />

        <input type="text" placeholder="Operator..." value={filterOperator}
          onChange={(e) => setFilterOperator(e.target.value)} style={{ ...filterInputStyle, width: 90 }} />

        {hasAnyFilter && (
          <Tooltip title="Clear all filters">
            <IconButton size="small" onClick={clearFilters} sx={{ p: 0.3 }}>
              <ClearFilterIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        )}

        {hasAnyFilter && (
          <Chip label={`${visibleRows.length} of ${editRows.length}`}
            size="small" variant="outlined" sx={{ height: 20, fontSize: '0.65rem' }} />
        )}
      </Box>

      {/* ── Toolbar ── */}
      <Box sx={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexWrap: isCompact ? 'wrap' : 'nowrap', gap: isCompact ? 0.5 : 0,
        px: 1, py: 0.5, bgcolor: '#f5f5f5', borderBottom: cellBorder, flexShrink: 0,
        position: 'sticky', top: 0, zIndex: 20,
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={addRow}
            sx={{ textTransform: 'none', fontSize: isCompact ? '0.7rem' : '0.75rem', py: 0.3, bgcolor: headerBg, '&:hover': { bgcolor: headerPinnedBg } }}>
            Add Row
          </Button>
          {selectedRows.size > 0 && typeof onBulkDeleteRows === 'function' && (
            <Button size="small" variant="contained" startIcon={<BulkDeleteIcon />} onClick={handleBulkDelete}
              sx={{ textTransform: 'none', fontSize: '0.75rem', py: 0.3, bgcolor: '#d32f2f', '&:hover': { bgcolor: '#b71c1c' } }}>
              Delete Selected ({selectedRows.size})
            </Button>
          )}
          {hasDirty && (
            <Chip label={`${dirty.size} unsaved`} color="warning" size="small" variant="outlined"
              sx={{ height: 22, fontSize: '0.7rem' }} />
          )}
        </Box>
        <Typography sx={{ fontSize: '0.7rem', color: '#888' }}>
          {loading ? 'Loading records…' : `${editRows.length} record${editRows.length !== 1 ? 's' : ''}`}
        </Typography>
      </Box>

      {loading && <LinearProgress sx={{ flexShrink: 0, height: 3 }} />}

      {/* ── Spreadsheet Grid ── */}
      <Box ref={gridRef} sx={{ flex: 1, overflow: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: isCompact ? '0.7rem' : '0.75rem', width: 'max-content', minWidth: '100%' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
            <tr>
              <th style={{
                ...compactHeaderCellStyle, position: 'sticky', left: 0, zIndex: 12,
                minWidth: GUTTER_CHECKBOX_W, width: GUTTER_CHECKBOX_W,
              }}>
                <Checkbox size="small" sx={{ p: 0, color: '#fff', '&.Mui-checked': { color: '#fff' } }}
                  checked={visibleRows.length > 0 && visibleRows.every(({ row }) => selectedRows.has(row._id || row.id))}
                  indeterminate={visibleRows.some(({ row }) => selectedRows.has(row._id || row.id)) && !visibleRows.every(({ row }) => selectedRows.has(row._id || row.id))}
                  onChange={toggleSelectAll} />
              </th>
              <th style={{
                ...compactHeaderCellStyle, position: 'sticky', left: GUTTER_CHECKBOX_W, zIndex: 12,
                minWidth: GUTTER_ROWNUM_W, width: GUTTER_ROWNUM_W,
              }}>#</th>
              {columns.map((col) => {
                const pin = pinnedColumns.get(col.key);
                return (
                <th key={col.key} style={{
                  ...compactHeaderCellStyle,
                  minWidth: col.width || 100, width: col.width || 100,
                  // Sticky on both axes at once, so it has to clear the header
                  // band as well as the frozen columns.
                  ...(pin ? {
                    position: 'sticky', left: pin.left, zIndex: 12, maxWidth: pin.width,
                    ...(pin.isLast ? FROZEN_EDGE_SHADOW : {}),
                  } : {}),
                }}>
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                    {col.label}
                    {col.key === 'segmentId' && (
                      <SegmentColumnFilter
                        value={filterSegment}
                        onChange={setFilterSegment}
                        allSegments={editRows.map(r => r.segmentId).filter(Boolean)}
                      />
                    )}
                  </span>
                </th>
                );
              })}
              <th style={{
                ...compactHeaderCellStyle, position: 'sticky', right: 0, zIndex: 12, minWidth: 96, width: 96, background: headerPinnedBg,
              }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map(({ row, realIdx }, visIdx) => {
              const rowId = row._id || row.id;
              const isActive = rowId === activeRow;
              const isDirty = dirty.has(rowId);
              const isChild = row.isMixtureChild;
              const isGroupParent = row.groupId && !isChild;
              const isOdd = visIdx % 2 === 0;
              const baseBg = isChild ? mixtureChildBg : (isOdd ? 'transparent' : altRowBg);
              const rowBg = isDirty ? dirtyBg : baseBg;
              // Frozen cells cannot inherit the row's transparency, so odd rows
              // need the white they were showing through to.
              const opaqueBase = isChild ? mixtureChildBg : (isOdd ? '#fff' : altRowBg);
              const frozenCellBg = isDirty ? dirtyBg
                : (isActive ? activeRowBg : opaqueBase);

              // Group dirty: check if any row in this group is dirty
              const groupHasDirty = row.groupId
                ? editRows.some((r) => r.groupId === row.groupId && dirty.has(r._id || r.id))
                : isDirty;

              const displayNum = rowNumbering[rowId] || (visIdx + 1);

              return (
                <tr key={rowId || visIdx}
                  onClick={() => setActiveRow(rowId)}
                  style={{ background: isActive && !isDirty ? activeRowBg : rowBg, cursor: 'default' }}>

                  {/* Checkbox - frozen left */}
                  <td style={{
                    ...compactBodyCellStyle,
                    position: 'sticky', left: 0, zIndex: 1,
                    background: isActive ? activeCellBg : frozenBg,
                    textAlign: 'center', padding: '0 2px',
                  }}>
                    <Checkbox size="small" sx={{ p: 0 }}
                      checked={selectedRows.has(rowId)}
                      onChange={() => toggleSelectRow(rowId)}
                      onClick={(e) => e.stopPropagation()} />
                  </td>

                  {/* Row number - frozen, with mixture sidebar */}
                  <td style={{
                    ...compactBodyCellStyle,
                    position: 'sticky', left: GUTTER_CHECKBOX_W, zIndex: 1,
                    background: isActive ? activeCellBg : (isChild ? mixtureChildBg : frozenBg),
                    textAlign: 'center', fontWeight: 600, fontSize: '0.7rem',
                    color: isChild ? mixtureBorderColor : '#666',
                    padding: '2px 4px',
                    borderLeft: isChild ? `3px solid ${mixtureBorderColor}` : (isGroupParent ? `3px solid ${mixtureBorderColor}` : cellBorder),
                  }}>
                    {displayNum}
                  </td>

                  {/* Data cells */}
                  {columns.map((col) => renderCell(row, realIdx, col, frozenCellBg))}

                  {/* Actions - frozen right */}
                  <td style={{
                    ...compactBodyCellStyle,
                    position: 'sticky', right: 0, zIndex: 1,
                    background: isActive ? activeCellBg : frozenBg,
                    textAlign: 'center', padding: '0 1px',
                  }}>
                    <Box sx={{ display: 'flex', gap: 0, justifyContent: 'center' }}>
                      <Tooltip title={row.groupId ? 'Save group' : 'Save row'}>
                        <span>
                          <IconButton size="small"
                            sx={{ p: 0.3, color: groupHasDirty ? headerBg : '#ccc' }}
                            disabled={saving || !groupHasDirty}
                            onClick={(e) => { e.stopPropagation(); handleSave(realIdx); }}>
                            <SaveIcon sx={{ fontSize: 15 }} />
                          </IconButton>
                        </span>
                      </Tooltip>
                      {canAddMixture(editRows, realIdx) && (
                        <Tooltip title={isChild ? `Add another mixture (up to ${MAX_PRODUCTS_PER_MIXTURE} products)` : 'Add mixture'}>
                          <IconButton size="small" sx={{ p: 0.3, color: headerBg }}
                            onClick={(e) => { e.stopPropagation(); addMixture(realIdx); }}>
                            <MixtureIcon sx={{ fontSize: 15 }} />
                          </IconButton>
                        </Tooltip>
                      )}
                      <Tooltip title="Duplicate">
                        <IconButton size="small" sx={{ p: 0.3, color: '#888' }}
                          onClick={(e) => { e.stopPropagation(); duplicateRow(realIdx); }}>
                          <CopyIcon sx={{ fontSize: 14 }} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <IconButton size="small" sx={{ p: 0.3, color: '#d32f2f' }}
                          onClick={(e) => { e.stopPropagation(); handleDelete(realIdx); }}>
                          <DeleteIcon sx={{ fontSize: 14 }} />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </td>
                </tr>
              );
            })}
            {loading && visibleRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 3} style={{
                  ...compactBodyCellStyle, textAlign: 'center', padding: '40px 16px',
                  background: '#fafafa', color: '#888', fontSize: '0.85rem',
                }}>
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5 }}>
                    <CircularProgress size={28} />
                    <span>Loading records…</span>
                  </Box>
                </td>
              </tr>
            ) : visibleRows.length === 0 && (
              <tr>
                <td colSpan={columns.length + 3} style={{
                  ...compactBodyCellStyle, textAlign: 'center', padding: '40px 16px',
                  background: '#fafafa', color: '#888', fontSize: '0.85rem',
                }}>
                  {hasAnyFilter
                    ? 'No records match the current filters'
                    : <>No records yet — click <strong>Add Row</strong> to start entering data</>
                  }
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Box>
    </Box>
  );
}

export default SpreadsheetGrid;
