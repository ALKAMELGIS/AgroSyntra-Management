import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Typography, Paper, Button, TextField, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Tabs, Tab, CircularProgress, IconButton, Tooltip, Checkbox,
  Dialog, DialogTitle, DialogContent, DialogActions,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useConfirmDialog } from '../../components/ConfirmDialog';
import {
  DeleteOutlined as Delete, SaveOutlined as SaveIcon, FileDownloadOutlined as FileDownload, FileUploadOutlined as FileUpload, AddCircleOutlineOutlined as AddCircleOutline,
  CheckCircleOutlined as CheckCircle, CheckCircleOutlineOutlined as CheckCircleOutline,
} from '@mui/icons-material';
import { apiRequest } from '../../utils/api';
import { useNotification } from '../../contexts/NotificationContext';
import { useAuth } from '../../contexts/AuthContext';
import {
  OPENING_FIELDS, CLOSING_FIELDS,
  emptyOpeningRow, emptyClosingRow,
  openingServerToRow, closingServerToRow,
  rowToOpeningPayload, rowToClosingPayload,
  applySiteDefaults,
} from '../../utils/plantationWorkbookRows';
import { workbookRowVisible } from '../../utils/cropPageFieldFilter';
import { unionPlantationImportFields } from '../../utils/plantationWorkbookImport';
import { excelTableSx, freezeColumnsSx, GutterCell, GUTTER_WIDTH } from '../../components/table/ExcelTable';
import PlantationWorkbookImporter from '../../components/PlantationWorkbookImporter';
import useOpsExcelExport from '../../hooks/useOpsExcelExport';
import { OPS_EXPORT } from '../../utils/companyExcelExport';
import { buildPlantationExportSheets } from '../../utils/cropHistoryExcelExport';
import InfoNote from '../../components/InfoNote';

const CREATE_NEW_VALUE = '__CREATE_NEW__';
const PWB_CHECK_WIDTH = 42;
const PWB_FROZEN_WIDTHS = [PWB_CHECK_WIDTH, 110, 100, 80];
const headerCheckboxSx = (t) => ({
  color: t.palette.table.headerText,
  '&.Mui-checked, &.MuiCheckbox-indeterminate': { color: t.palette.table.headerText },
});
const twoRowHeadSx = {
  '&& thead tr:first-of-type .MuiTableCell-head': { top: 0 },
  '&& thead tr:nth-of-type(2) .MuiTableCell-head': { top: 40 },
};
// Row tints carry state (docs/TABLE_DESIGN_SPEC.md): draft yellow, pending
// amber, rejected red. Draft wins so an edited row reads as unsaved.
const pwbRowStateSx = (t) => ({
  '&&& .MuiTableBody-root .MuiTableRow-root.row-pending .MuiTableCell-root:not(.table-gutter)': {
    backgroundColor: t.palette.mode === 'dark' ? 'rgba(255,193,7,0.14)' : '#fff8e1',
  },
  '&&& .MuiTableBody-root .MuiTableRow-root.row-rejected .MuiTableCell-root:not(.table-gutter)': {
    backgroundColor: t.palette.table.errorBg,
  },
  '&&& .MuiTableBody-root .MuiTableRow-root.row-draft .MuiTableCell-root:not(.table-gutter)': {
    backgroundColor: '#fffde7',
  },
});

const APPROVED_LOCK_TIP = 'Approved — undo the approval to edit';
const CLOSING_APPROVED_TIP = 'Approved — only the operation manager can change it';
const CLOSING_VIEW_ONLY_TIP = 'View only';
const CLOSING_DELETE_TIP = 'You can delete only your own rows that are not approved yet';

/**
 * Opening rows: only the operation manager, agronomist and data-entry worker
 * type them (CEO and farm manager watch, `access.canWriteOpening === false`),
 * and rows approved by an Operation Manager are read-only until the approval
 * is undone. Closing rows: view-only users change nothing; the site OM changes
 * anything; workers and agronomists change only rows that are not approved.
 */
function openingViewOnly(access) {
  return access?.canWriteOpening === false;
}

function isRowLocked(row, isClosing, closingAccess) {
  if (!isClosing) return openingViewOnly(closingAccess) || Boolean(row?.farmManagerApproved);
  if (!closingAccess?.canWrite) return true;
  if (closingAccess.isOm || !row?._serverId) return false;
  return row.approvalStatus === 'approved';
}

function canDeleteRow(row, isClosing, closingAccess) {
  if (!isClosing) return !openingViewOnly(closingAccess) && !row?.farmManagerApproved;
  if (!closingAccess?.canWrite) return false;
  if (closingAccess.isOm || !row?._serverId) return true;
  return row.approvalStatus !== 'approved' && row.submittedBy === closingAccess.userId;
}

function lockTip(isClosing, closingAccess) {
  if (!isClosing) return openingViewOnly(closingAccess) ? CLOSING_VIEW_ONLY_TIP : APPROVED_LOCK_TIP;
  return closingAccess?.canWrite ? CLOSING_APPROVED_TIP : CLOSING_VIEW_ONLY_TIP;
}

/** Mirrors the API: opening rows are written by OM, agronomist and worker. */
const OPENING_WRITER_ROLES = ['operation_manager', 'agronomist', 'worker'];

function closingRowClass(row, isClosing) {
  if (row._dirty) return 'row-draft';
  if (!isClosing || !row._serverId) return undefined;
  if (row.approvalStatus === 'pending') return 'row-pending';
  if (row.approvalStatus === 'rejected') return 'row-rejected';
  return undefined;
}

function rejectedTip(row) {
  return `Rejected${row.rejectedByName ? ` by ${row.rejectedByName}` : ''}: ${row.rejectedReason || 'no reason given'}`;
}

function ClosingStatusCell({ row, isOm, onApprove, onReject }) {
  if (!row._serverId) {
    return <Typography variant="caption" color="text.secondary">Not saved</Typography>;
  }
  const status = row.approvalStatus;
  if (status === 'approved') {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, whiteSpace: 'nowrap' }}>
        <CheckCircle color="success" fontSize="small" />
        <Typography variant="caption">Approved</Typography>
      </Box>
    );
  }
  const rejected = status === 'rejected';
  const tip = rejected
    ? rejectedTip(row)
    : `Waiting for operation manager approval${row.submittedByName ? ` · submitted by ${row.submittedByName}` : ''}`;
  const actionTip = row._dirty ? 'Save your changes first' : '';
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, whiteSpace: 'nowrap' }}>
      <Tooltip title={tip}>
        <Typography
          variant="caption"
          sx={{ fontWeight: 600, color: rejected ? 'error.main' : 'warning.dark', cursor: 'help' }}
        >
          {rejected ? 'Rejected' : 'Pending'}
        </Typography>
      </Tooltip>
      {isOm && (
        <Tooltip title={actionTip} describeChild>
          <span>
            <Button
              size="small"
              color="success"
              disabled={row._dirty}
              sx={{ minWidth: 0, px: 0.75, py: 0, fontSize: '0.6875rem' }}
              onClick={() => onApprove?.(row)}
            >
              Approve
            </Button>
          </span>
        </Tooltip>
      )}
      {isOm && !rejected && (
        <Tooltip title={actionTip} describeChild>
          <span>
            <Button
              size="small"
              color="error"
              disabled={row._dirty}
              sx={{ minWidth: 0, px: 0.75, py: 0, fontSize: '0.6875rem' }}
              onClick={() => onReject?.(row)}
            >
              Reject
            </Button>
          </span>
        </Tooltip>
      )}
    </Box>
  );
}

function CellInput({ value, onChange, type = 'text', rowIdx, colIdx, onAddRow, dataAttr = 'pwb', disabled = false }) {
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const targetRow = rowIdx + 1;
      setTimeout(() => {
        const next = document.querySelector(`[data-${dataAttr}="${targetRow}-${colIdx}"]`);
        if (next) { next.focus(); if (next.select) next.select(); }
      }, 30);
    }
    if (e.key === 'Tab' && colIdx >= 0 && !e.shiftKey) {
      onAddRow?.();
    }
  };
  return (
    <TextField
      size="small"
      variant="standard"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      type={type}
      onKeyDown={handleKeyDown}
      disabled={disabled}
      InputProps={{ sx: { fontSize: '0.8125rem' } }}
      sx={{ width: '100%', minWidth: 72 }}
      inputProps={{ 'data-pwb': `${rowIdx}-${colIdx}` }}
    />
  );
}

function CellSelect({ value, onChange, options, rowIdx, colIdx, dataAttr = 'pwb', disabled = false }) {
  return (
    <TextField
      size="small"
      select
      variant="standard"
      disabled={disabled}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      SelectProps={{ native: true, inputProps: { 'data-pwb': `${rowIdx}-${colIdx}` } }}
      sx={{ width: '100%', minWidth: 88 }}
    >
      <option value="" />
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </TextField>
  );
}

function FormBanner({ title }) {
  return (
    <Box sx={{ mb: 1 }}>
      <Typography variant="caption" display="block" sx={{ fontWeight: 600 }}>
        ELITE AGRO LLC — EAG/ERP/IMS/RC-001
      </Typography>
      <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'table.headerBg' }}>
        {title}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        Use dropdowns for family and variety, or choose &quot;+ Create New&quot; to add master data.
      </Typography>
    </Box>
  );
}

function frozenFieldClass(idx) {
  return idx < 3 ? `col-frozen-${idx + 1}` : undefined;
}

function SpreadsheetGrid({
  fields,
  rows,
  setRows,
  fieldOptions,
  cropOptions,
  getVarieties,
  isClosing,
  fixedCropId,
  siteMeta,
  farmManagerNames,
  canApproveOm,
  onApproveOm,
  onUndoApproveOm,
  onCreateCrop,
  onCreateVariety,
  showRequestorGroupHeader,
  rowVisible,
  selectedKeys,
  onToggleSelect,
  onToggleSelectAll,
  onDeleteRows,
  closingAccess,
  onApproveClosing,
  onRejectClosing,
}) {
  const canAddRows = isClosing ? Boolean(closingAccess?.canWrite) : !openingViewOnly(closingAccess);
  const markDirty = (key, patch) => {
    setRows((prev) => prev.map((r) => (r._key === key ? { ...r, ...patch, _dirty: true } : r)));
  };

  const addRow = () => {
    if (!canAddRows) return;
    const blank = isClosing ? emptyClosingRow(fixedCropId) : emptyOpeningRow();
    setRows((prev) => [...prev, applySiteDefaults(blank, siteMeta)]);
  };

  const visibleRows = rows.filter((r) => !rowVisible || rowVisible(r));
  const visibleKeys = visibleRows.map((r) => r._key);
  const selectedVisibleCount = visibleKeys.filter((k) => selectedKeys?.has(k)).length;
  const allVisibleSelected = visibleKeys.length > 0 && selectedVisibleCount === visibleKeys.length;
  const someVisibleSelected = selectedVisibleCount > 0 && selectedVisibleCount < visibleKeys.length;

  const requestorStartIdx = fields.findIndex((f) => f.key === 'requestorName');

  return (
    <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: '70vh', overflow: 'auto' }}>
      <Table
        size="small"
        sx={[
          excelTableSx,
          freezeColumnsSx(PWB_FROZEN_WIDTHS, GUTTER_WIDTH),
          showRequestorGroupHeader ? twoRowHeadSx : {},
          pwbRowStateSx,
        ]}
      >
        <TableHead>
          {showRequestorGroupHeader && requestorStartIdx >= 0 && (
            <TableRow>
              <TableCell className="table-gutter" />
              <TableCell className="col-frozen-0" />
              {fields.map((f, idx) => {
                if (idx < requestorStartIdx) {
                  return <TableCell key={`g-${f.key}`} className={frozenFieldClass(idx)} />;
                }
                if (idx === requestorStartIdx) {
                  return (
                    <TableCell key="grp-requestor" colSpan={3} align="center">
                      Requestor
                    </TableCell>
                  );
                }
                if (idx === requestorStartIdx + 1 || idx === requestorStartIdx + 2) {
                  return null;
                }
                return <TableCell key={`g-${f.key}`} />;
              })}
              <TableCell />
            </TableRow>
          )}
          <TableRow>
            <GutterCell />
            <TableCell padding="checkbox" className="col-frozen-0">
              <Checkbox
                size="small"
                sx={headerCheckboxSx}
                checked={allVisibleSelected}
                indeterminate={someVisibleSelected}
                disabled={visibleKeys.length === 0}
                onChange={() => onToggleSelectAll?.(visibleKeys)}
                inputProps={{ 'aria-label': 'Select all plantation rows' }}
              />
            </TableCell>
            {fields.map((f, idx) => (
              <TableCell key={f.key} className={frozenFieldClass(idx)}>{f.label}</TableCell>
            ))}
            {isClosing && <TableCell>Approval</TableCell>}
            <TableCell />
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row, rowIdx) => (
            rowVisible && !rowVisible(row) ? null : (
            <TableRow
              key={row._key}
              hover
              selected={selectedKeys?.has(row._key)}
              className={closingRowClass(row, isClosing)}
              title={isClosing && row._serverId && row.approvalStatus === 'rejected' ? rejectedTip(row) : undefined}
            >
              <GutterCell index={rowIdx + 1} />
              <TableCell padding="checkbox" className="col-frozen-0">
                <Checkbox
                  size="small"
                  checked={Boolean(selectedKeys?.has(row._key))}
                  onChange={() => onToggleSelect?.(row._key)}
                  inputProps={{ 'aria-label': `Select plantation row ${rowIdx + 1}` }}
                />
              </TableCell>
              {fields.map((f, colIdx) => {
                const val = row[f.key];
                const locked = isRowLocked(row, isClosing, closingAccess);
                const onChange = (v) => markDirty(row._key, { [f.key]: v });
                let cell;
                if (f.type === 'readonly') {
                  cell = (
                    <Typography variant="caption" sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                      {val || '—'}
                    </Typography>
                  );
                } else if (f.type === 'fmApproval') {
                  cell = (
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 0.5 }}>
                      <Typography variant="caption" sx={{ fontSize: '0.6875rem', color: 'text.secondary', maxWidth: 140 }}>
                        {farmManagerNames || 'No Operation Manager assigned to site'}
                      </Typography>
                      {row.farmManagerApproved ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <CheckCircle color="success" fontSize="small" />
                          <Typography variant="caption">
                            {row.farmManagerName}
                            {row.farmManagerDate ? ` · ${row.farmManagerDate}` : ''}
                          </Typography>
                          {canApproveOm && (
                            <Tooltip title="Undo approval (reason required)">
                              <Button
                                size="small"
                                color="warning"
                                sx={{ minWidth: 0, px: 0.75, py: 0, fontSize: '0.6875rem' }}
                                onClick={() => onUndoApproveOm?.(row)}
                              >
                                Undo
                              </Button>
                            </Tooltip>
                          )}
                        </Box>
                      ) : (
                        <Tooltip title={canApproveOm ? 'Approve as Operation Manager' : 'Awaiting Operation Manager approval'} describeChild>
                          <span>
                            <IconButton
                              size="small"
                              disabled={!canApproveOm || !row._serverId}
                              onClick={() => onApproveOm?.(row)}
                             aria-label={canApproveOm ? 'Approve as Operation Manager' : 'Awaiting Operation Manager approval'}>
                              <CheckCircleOutline fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                      )}
                    </Box>
                  );
                } else if (f.type === 'field') {
                  cell = (
                    <CellSelect
                      value={row.fieldId}
                      onChange={onChange}
                      options={fieldOptions}
                      rowIdx={rowIdx}
                      colIdx={colIdx}
                      disabled={locked}
                    />
                  );
                } else if (f.type === 'crop') {
                  const cropOpts = [...cropOptions, { value: CREATE_NEW_VALUE, label: '+ Create New Family' }];
                  cell = (
                    <CellSelect
                      value={isClosing ? fixedCropId : row.cropId}
                      onChange={(v) => {
                        if (v === CREATE_NEW_VALUE) {
                          onCreateCrop?.(rowIdx, row._key);
                          return;
                        }
                        if (!isClosing) onChange(v);
                      }}
                      options={isClosing ? cropOptions : cropOpts}
                      rowIdx={rowIdx}
                      colIdx={colIdx}
                      disabled={locked}
                    />
                  );
                } else if (f.type === 'variety') {
                  const cid = isClosing ? fixedCropId : row.cropId;
                  const vOpts = [
                    ...(getVarieties(cid) || []).map((v) => ({ value: v.id, label: v.name })),
                    { value: CREATE_NEW_VALUE, label: '+ Create New Variety' },
                  ];
                  cell = (
                    <CellSelect
                      value={row.varietyId}
                      onChange={(v) => {
                        if (v === CREATE_NEW_VALUE) {
                          onCreateVariety?.(rowIdx, row._key, cid);
                          return;
                        }
                        onChange(v);
                      }}
                      options={vOpts}
                      rowIdx={rowIdx}
                      colIdx={colIdx}
                      disabled={locked}
                    />
                  );
                } else {
                  cell = (
                    <CellInput
                      value={val}
                      onChange={onChange}
                      type={f.type === 'date' ? 'date' : f.type === 'number' ? 'number' : 'text'}
                      rowIdx={rowIdx}
                      colIdx={colIdx}
                      onAddRow={colIdx === fields.length - 1 && canAddRows ? addRow : undefined}
                      disabled={locked}
                    />
                  );
                }
                return (
                  <TableCell key={f.key} className={frozenFieldClass(colIdx)}>
                    {cell}
                  </TableCell>
                );
              })}
              {isClosing && (
                <TableCell>
                  <ClosingStatusCell
                    row={row}
                    isOm={Boolean(closingAccess?.isOm)}
                    onApprove={onApproveClosing}
                    onReject={onRejectClosing}
                  />
                </TableCell>
              )}
              <TableCell>
                {(() => {
                  const deletable = canDeleteRow(row, isClosing, closingAccess);
                  let tip = 'Delete row';
                  if (!deletable) {
                    tip = isClosing && closingAccess?.canWrite && row.approvalStatus !== 'approved'
                      ? CLOSING_DELETE_TIP
                      : lockTip(isClosing, closingAccess);
                  }
                  return (
                    <Tooltip title={tip} describeChild>
                      <span>
                        <IconButton
                          size="small"
                          disabled={!deletable}
                          onClick={() => onDeleteRows?.([row._key])}
                         aria-label={tip}>
                          <Delete fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  );
                })()}
              </TableCell>
            </TableRow>
            )
          ))}
        </TableBody>
      </Table>
      <Box sx={{ p: 1, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        {canAddRows && (
          <Button size="small" startIcon={<AddCircleOutline />} onClick={addRow}>Add row</Button>
        )}
        {canAddRows && selectedKeys?.size > 0 && (
          <Button
            size="small"
            color="error"
            startIcon={<Delete />}
            onClick={() => onDeleteRows?.([...selectedKeys])}
          >
            Delete selected ({selectedKeys.size})
          </Button>
        )}
      </Box>
    </TableContainer>
  );
}

export default function PlantationWorkbook({
  siteFilter,
  siteMeta,
  fields = [],
  pickerFields,
  fieldFilterId = '',
  structureFieldIds,
  structureToolbar,
  crops = [],
  allVarietiesByCrop = {},
  setAllVarietiesByCrop,
  refreshMaster,
}) {
  const notify = useNotification();
  const exportOpsExcel = useOpsExcelExport();
  const { user } = useAuth();
  const { t } = useTranslation();
  const [confirm, confirmDialog] = useConfirmDialog();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [sheetTab, setSheetTab] = useState('opening');
  const [openingRows, setOpeningRows] = useState([]);
  const [closingSheets, setClosingSheets] = useState([]);
  const [closingBySheet, setClosingBySheet] = useState({});
  const [siteOperationManagers, setSiteOperationManagers] = useState([]);
  const [createDialog, setCreateDialog] = useState({ open: false, type: '', rowKey: '', cropId: '' });
  const [createName, setCreateName] = useState('');
  const [creating, setCreating] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState(() => new Set());
  const [undoDialog, setUndoDialog] = useState({ open: false, row: null });
  const [undoReason, setUndoReason] = useState('');
  const [undoing, setUndoing] = useState(false);

  const currentUserId = user?.id || user?.userId;
  const canApproveOm = user?.role === 'operation_manager'
    && siteOperationManagers.some((u) => u.userId === currentUserId);
  // Closing sheets: the site OM writes live; workers and agronomists submit rows
  // for the OM's approval; everyone else (CEO, farm manager) is view-only.
  const canWriteClosing = canApproveOm || user?.role === 'worker' || user?.role === 'agronomist';
  const closingAccess = useMemo(
    () => ({ canWrite: canWriteClosing, isOm: canApproveOm, userId: currentUserId }),
    [canWriteClosing, canApproveOm, currentUserId],
  );
  // Opening rows: OM, agronomist and worker type them; CEO and farm manager watch.
  const canWriteOpening = OPENING_WRITER_ROLES.includes(user?.role);
  const openingAccess = useMemo(() => ({ canWriteOpening }), [canWriteOpening]);
  const [rejectDialog, setRejectDialog] = useState({ open: false, row: null });
  const [rejectReason, setRejectReason] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const farmManagerNames = useMemo(
    () => siteOperationManagers.map((u) => u.userName || u.user_name || u.email).filter(Boolean).join(', '),
    [siteOperationManagers],
  );

  const cropOptions = useMemo(
    () => crops.map((c) => ({ value: c.id, label: c.name })),
    [crops],
  );
  const scopedFields = pickerFields || fields.filter((f) => !siteFilter || f.siteId === siteFilter);
  const importFields = useMemo(
    () => unionPlantationImportFields(fields, pickerFields),
    [fields, pickerFields],
  );
  const fieldOptions = useMemo(
    () => scopedFields.map((f) => ({
      value: f.id,
      label: f.name,
    })),
    [scopedFields],
  );
  const rowVisible = useCallback(
    (row) => workbookRowVisible(row, { structureFieldIds, fieldId: fieldFilterId }),
    [structureFieldIds, fieldFilterId],
  );
  const getVarieties = useCallback(
    (cropId) => allVarietiesByCrop[cropId] || [],
    [allVarietiesByCrop],
  );

  useEffect(() => {
    if (!siteFilter) {
      setSiteOperationManagers([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await apiRequest(`/assignments/sites/${siteFilter}/users`);
        const list = (res || []).filter((u) => u.userRole === 'operation_manager');
        if (!cancelled) setSiteOperationManagers(list);
      } catch {
        if (!cancelled) setSiteOperationManagers([]);
      }
    })();
    return () => { cancelled = true; };
  }, [siteFilter]);

  const loadWorkbook = useCallback(async () => {
    if (!siteFilter) {
      setOpeningRows([]);
      setClosingSheets([]);
      setClosingBySheet({});
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await apiRequest(`/plantation-workbook/workbook?site_id=${siteFilter}`);
      const opening = (data.opening || []).map((r) => applySiteDefaults(openingServerToRow(r), siteMeta));
      setOpeningRows(opening.length ? opening : [applySiteDefaults(emptyOpeningRow(), siteMeta)]);
      setClosingSheets(data.closingSheets || []);
      const bySheet = {};
      (data.closingRecords || []).forEach((r) => {
        const sid = r.closing_sheet_id;
        if (!bySheet[sid]) bySheet[sid] = [];
        bySheet[sid].push(closingServerToRow(r));
      });
      (data.closingSheets || []).forEach((s) => {
        if (!bySheet[s.id]?.length) bySheet[s.id] = [emptyClosingRow(s.crop_id)];
      });
      setClosingBySheet(bySheet);
      setSelectedKeys(new Set());
    } catch (e) {
      notify.error(e.message || 'Failed to load plantation workbook');
    } finally {
      setLoading(false);
    }
  }, [siteFilter, siteMeta, notify]);

  useEffect(() => { loadWorkbook(); }, [loadWorkbook]);

  useEffect(() => {
    setSelectedKeys(new Set());
  }, [sheetTab]);

  const sheetTabs = useMemo(() => {
    const tabs = [{ id: 'opening', label: 'Plantations Opening' }];
    closingSheets.forEach((s) => {
      tabs.push({
        id: s.id,
        label: `${s.crop_name}-Plantations closing`,
        cropId: s.crop_id,
      });
    });
    return tabs;
  }, [closingSheets]);

  const saveOpening = async () => {
    if (!siteFilter) return;
    setSaving(true);
    try {
      for (const row of openingRows) {
        if (!row._dirty && !row._isNew) continue;
        const payload = rowToOpeningPayload(applySiteDefaults(row, siteMeta), siteFilter);
        if (row._isNew) {
          await apiRequest('/plantation-workbook/opening', { method: 'POST', body: JSON.stringify(payload) });
        } else if (row._serverId) {
          await apiRequest(`/plantation-workbook/opening/${row._serverId}`, {
            method: 'PUT',
            body: JSON.stringify(payload),
          });
        }
      }
      notify.success('Opening plantation saved');
      await loadWorkbook();
    } catch (e) {
      notify.error(e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleApproveOm = async (row) => {
    if (!row._serverId) {
      notify.error('Save the row first, then approve');
      return;
    }
    try {
      await apiRequest(`/plantation-workbook/opening/${row._serverId}/operation-manager-approval`, {
        method: 'PUT',
        body: JSON.stringify({}),
      });
      notify.success('Operation Manager approval recorded');
      await loadWorkbook();
    } catch (e) {
      notify.error(e.message || 'Approval failed');
    }
  };

  const openUndoApproval = (row) => {
    if (!row._serverId) return;
    setUndoReason('');
    setUndoDialog({ open: true, row });
  };

  const closeUndoApproval = () => {
    if (undoing) return;
    setUndoDialog({ open: false, row: null });
    setUndoReason('');
  };

  const handleUndoApproval = async () => {
    const reason = undoReason.trim();
    const row = undoDialog.row;
    if (!reason || !row?._serverId) return;
    setUndoing(true);
    try {
      await apiRequest(`/plantation-workbook/opening/${row._serverId}/operation-manager-approval/revoke`, {
        method: 'PUT',
        body: JSON.stringify({ reason }),
      });
      notify.success('Approval undone — the row can be edited again');
      setUndoDialog({ open: false, row: null });
      setUndoReason('');
      await loadWorkbook();
    } catch (e) {
      notify.error(e.message || 'Could not undo the approval');
    } finally {
      setUndoing(false);
    }
  };

  const handleCreateMaster = async () => {
    if (!createName.trim()) return;
    setCreating(true);
    try {
      const { type, rowKey, cropId } = createDialog;
      if (type === 'crop') {
        const newCrop = await apiRequest('/crops', { method: 'POST', body: JSON.stringify({ name: createName.trim() }) });
        setOpeningRows((prev) => prev.map((r) => (
          r._key === rowKey ? { ...r, cropId: newCrop.id, _dirty: true } : r
        )));
        refreshMaster?.();
        notify.success(`Family "${newCrop.name}" created`);
      } else if (type === 'variety') {
        if (!cropId) {
          notify.error('Select a family first');
          setCreating(false);
          return;
        }
        const newVar = await apiRequest(`/crops/${cropId}/varieties`, {
          method: 'POST',
          body: JSON.stringify({ name: createName.trim() }),
        });
        setAllVarietiesByCrop?.((prev) => ({
          ...prev,
          [cropId]: [...(prev[cropId] || []), newVar],
        }));
        setOpeningRows((prev) => prev.map((r) => (
          r._key === rowKey ? { ...r, varietyId: newVar.id, _dirty: true } : r
        )));
        notify.success(`Variety "${newVar.name}" created`);
      }
      setCreateDialog({ open: false, type: '', rowKey: '', cropId: '' });
      setCreateName('');
    } catch (e) {
      notify.error(e.message || 'Failed to create');
    } finally {
      setCreating(false);
    }
  };

  const toggleSelect = (key) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleSelectAll = (visibleKeys) => {
    setSelectedKeys((prev) => {
      const allOn = visibleKeys.length > 0 && visibleKeys.every((k) => prev.has(k));
      if (allOn) {
        const next = new Set(prev);
        visibleKeys.forEach((k) => next.delete(k));
        return next;
      }
      return new Set([...prev, ...visibleKeys]);
    });
  };

  const deleteRowsByKeys = async (keys) => {
    const keyList = Array.isArray(keys) ? keys : [...keys];
    if (!keyList.length) return;
    const current = sheetTab === 'opening'
      ? openingRows
      : (closingBySheet[sheetTab] || []);
    const kind = sheetTab === 'opening' ? 'opening' : 'closing';
    const picked = current.filter((r) => keyList.includes(r._key));
    const isClosingKind = kind === 'closing';
    const targets = picked.filter((r) => canDeleteRow(r, isClosingKind, closingAccess));
    const lockedCount = picked.length - targets.length;
    if (lockedCount > 0) {
      notify.warning(isClosingKind
        ? `${lockedCount} closing row${lockedCount === 1 ? '' : 's'} will not be deleted. ${
          closingAccess.canWrite ? CLOSING_DELETE_TIP : CLOSING_VIEW_ONLY_TIP
        }.`
        : `${lockedCount} approved row${lockedCount === 1 ? ' is' : 's are'} locked and will not be deleted. ${APPROVED_LOCK_TIP}.`);
    }
    if (!targets.length) return;
    const savedCount = targets.filter((r) => r._serverId).length;
    const ok = await confirm(
      savedCount
        ? `Delete ${targets.length} ${kind} request${targets.length === 1 ? '' : 's'}? Saved rows are removed permanently.`
        : `Remove ${targets.length} unsaved row${targets.length === 1 ? '' : 's'}?`,
      { title: 'Delete plantation requests', severity: 'warning' },
    );
    if (!ok) return;
    setDeleting(true);
    try {
      for (const row of targets) {
        if (!row._serverId) continue;
        await apiRequest(`/plantation-workbook/${kind}/${row._serverId}`, { method: 'DELETE' });
      }
      const drop = new Set(targets.map((r) => r._key));
      if (sheetTab === 'opening') {
        setOpeningRows((prev) => {
          const next = prev.filter((r) => !drop.has(r._key));
          return next.length ? next : [applySiteDefaults(emptyOpeningRow(), siteMeta)];
        });
      } else {
        const cropId = closingSheets.find((s) => s.id === sheetTab)?.crop_id;
        setClosingBySheet((prev) => {
          const next = (prev[sheetTab] || []).filter((r) => !drop.has(r._key));
          return {
            ...prev,
            [sheetTab]: next.length ? next : [applySiteDefaults(emptyClosingRow(cropId), siteMeta)],
          };
        });
      }
      setSelectedKeys(new Set());
      notify.success(targets.length === 1 ? 'Request deleted' : `${targets.length} requests deleted`);
    } catch (e) {
      notify.error(e.message || 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  const saveClosing = async (sheetId) => {
    if (!canWriteClosing) return;
    setSaving(true);
    try {
      const rows = closingBySheet[sheetId] || [];
      let pendingCount = 0;
      for (const row of rows) {
        // Untouched blank rows are placeholders, not requests.
        if (!row._dirty) continue;
        if (isRowLocked(row, true, closingAccess)) continue;
        const payload = { ...rowToClosingPayload(row), closingSheetId: sheetId };
        let result;
        if (row._isNew) {
          result = await apiRequest('/plantation-workbook/closing', { method: 'POST', body: JSON.stringify(payload) });
        } else if (row._serverId) {
          result = await apiRequest(`/plantation-workbook/closing/${row._serverId}`, {
            method: 'PUT',
            body: JSON.stringify(payload),
          });
        }
        if (result?.approvalStatus === 'pending') pendingCount += 1;
      }
      notify.success(pendingCount > 0
        ? 'Closing rows sent for operation manager approval'
        : 'Closing plantation saved');
      await loadWorkbook();
    } catch (e) {
      notify.error(e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleApproveClosing = async (row) => {
    if (!row?._serverId) return;
    setReviewing(true);
    try {
      await apiRequest(`/plantation-workbook/closing/${row._serverId}/approve`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      notify.success('Closing row approved');
      await loadWorkbook();
    } catch (e) {
      notify.error(e.message || 'Approval failed');
    } finally {
      setReviewing(false);
    }
  };

  const handleApproveAllClosing = async (sheetId, count) => {
    const ok = await confirm(
      `Approve all ${count} pending closing row${count === 1 ? '' : 's'} on this sheet?`,
      { title: 'Approve closing rows', severity: 'info' },
    );
    if (!ok) return;
    setReviewing(true);
    try {
      const res = await apiRequest('/plantation-workbook/closing/approve-all', {
        method: 'POST',
        body: JSON.stringify({ closingSheetId: sheetId }),
      });
      const n = res?.approved ?? count;
      notify.success(`${n} closing row${n === 1 ? '' : 's'} approved`);
      await loadWorkbook();
    } catch (e) {
      notify.error(e.message || 'Approval failed');
    } finally {
      setReviewing(false);
    }
  };

  const openRejectClosing = (row) => {
    if (!row?._serverId) return;
    setRejectReason('');
    setRejectDialog({ open: true, row });
  };

  const closeRejectClosing = () => {
    if (reviewing) return;
    setRejectDialog({ open: false, row: null });
    setRejectReason('');
  };

  const handleRejectClosing = async () => {
    const reason = rejectReason.trim();
    const row = rejectDialog.row;
    if (!reason || !row?._serverId) return;
    setReviewing(true);
    try {
      await apiRequest(`/plantation-workbook/closing/${row._serverId}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      notify.success('Closing row rejected — the submitter has been told why');
      setRejectDialog({ open: false, row: null });
      setRejectReason('');
      await loadWorkbook();
    } catch (e) {
      notify.error(e.message || 'Could not reject the row');
    } finally {
      setReviewing(false);
    }
  };

  const handleExportExcel = async () => {
    const opening = openingRows.filter((r) => !rowVisible || rowVisible(r));
    const closing = closingSheets.flatMap((sheet) => (
      (closingBySheet[sheet.id] || []).filter((r) => !rowVisible || rowVisible(r))
    ));
    if ([...opening, ...closing].some((r) => r._dirty)) {
      notify.warning('Unsaved plantation rows are not in the file.');
    }
    const varietyNameById = {};
    Object.values(allVarietiesByCrop).forEach((list) => {
      (list || []).forEach((v) => { varietyNameById[v.id] = v.name; });
    });
    const sheets = buildPlantationExportSheets({
      opening,
      closing,
      lookups: {
        cropNameById: Object.fromEntries(crops.map((c) => [c.id, c.name])),
        varietyNameById,
        fieldNameById: Object.fromEntries((pickerFields || fields).map((f) => [f.id, f.name])),
      },
    });
    if (!sheets.length) {
      notify.error('Nothing to export');
      return;
    }
    await exportOpsExcel([], {
      sheets,
      filename: 'Plantation-Workbook.xlsx',
      ...OPS_EXPORT.plantation,
    });
  };

  if (!siteFilter) {
    return <InfoNote mode="line" severity="info">Select a site to manage plantation opening / closing.</InfoNote>;
  }
  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>;
  }

  const activeClosingSheet = sheetTab !== 'opening' ? closingSheets.find((s) => s.id === sheetTab) : null;
  const openingReadOnly = sheetTab === 'opening' && !canWriteOpening;
  // Hides Save / Import / Delete when the open sheet is view-only for this role.
  const sheetReadOnly = (Boolean(activeClosingSheet) && !canWriteClosing) || openingReadOnly;
  const activePendingCount = activeClosingSheet
    ? (closingBySheet[sheetTab] || []).filter((r) => r._serverId && r.approvalStatus === 'pending').length
    : 0;

  return (
    <Box>
      {structureToolbar && (
        <Paper sx={{ p: 2, mb: 2, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }} variant="outlined">
          {structureToolbar}
        </Paper>
      )}
      <Box sx={{ display: 'flex', gap: 1, mb: 1, flexWrap: 'wrap', alignItems: 'center' }}>
        {!sheetReadOnly && (
          <Button
            variant="contained"
            size="small"
            startIcon={<SaveIcon />}
            disabled={saving}
            onClick={() => (sheetTab === 'opening' ? saveOpening() : saveClosing(sheetTab))}
          >
            Save
          </Button>
        )}
        <Button variant="outlined" size="small" startIcon={<FileDownload />} onClick={handleExportExcel}>
          Export
        </Button>
        {!sheetReadOnly && (
          <Button variant="outlined" size="small" startIcon={<FileUpload />} onClick={() => setImportOpen(true)}>
            Import workbook
          </Button>
        )}
        {!sheetReadOnly && (
          <Button
            color="error"
            variant="outlined"
            size="small"
            startIcon={<Delete />}
            disabled={selectedKeys.size === 0 || deleting}
            onClick={() => deleteRowsByKeys([...selectedKeys])}
          >
            Delete selected ({selectedKeys.size})
          </Button>
        )}
        {activeClosingSheet && canApproveOm && activePendingCount > 0 && (
          <Button
            color="success"
            variant="contained"
            size="small"
            startIcon={<CheckCircleOutline />}
            disabled={reviewing}
            onClick={() => handleApproveAllClosing(activeClosingSheet.id, activePendingCount)}
          >
            Approve all ({activePendingCount})
          </Button>
        )}
        {sheetReadOnly && !openingReadOnly && (
          <Typography variant="caption" color="text.secondary">
            View only — the site operation manager approves closing rows.
          </Typography>
        )}
        {openingReadOnly && (
          <Typography variant="caption" color="text.secondary">
            {t('dataEntryAccess.openingViewOnly')}
          </Typography>
        )}
      </Box>

      <Tabs
        value={sheetTab}
        onChange={(_, v) => setSheetTab(v)}
        variant="scrollable"
        scrollButtons="auto"
        sx={{ mb: 1, borderBottom: 1, borderColor: 'divider' }}
      >
        {sheetTabs.map((t) => (
          <Tab key={t.id} value={t.id} label={t.label} sx={{ textTransform: 'none', fontSize: '0.8125rem' }} />
        ))}
      </Tabs>

      {sheetTab === 'opening' && (
        <>
          <FormBanner title="PLANTATION OPENING REQUEST" />
          <SpreadsheetGrid
            fields={OPENING_FIELDS}
            rows={openingRows}
            setRows={setOpeningRows}
            fieldOptions={fieldOptions}
            cropOptions={cropOptions}
            getVarieties={getVarieties}
            isClosing={false}
            siteMeta={siteMeta}
            farmManagerNames={farmManagerNames}
            canApproveOm={canApproveOm}
            onApproveOm={handleApproveOm}
            onUndoApproveOm={openUndoApproval}
            onCreateCrop={(rowIdx, rowKey) => setCreateDialog({ open: true, type: 'crop', rowKey, cropId: '' })}
            onCreateVariety={(rowIdx, rowKey, cropId) => setCreateDialog({ open: true, type: 'variety', rowKey, cropId })}
            showRequestorGroupHeader
            rowVisible={rowVisible}
            selectedKeys={selectedKeys}
            onToggleSelect={toggleSelect}
            onToggleSelectAll={toggleSelectAll}
            onDeleteRows={deleteRowsByKeys}
            closingAccess={openingAccess}
          />
        </>
      )}

      {activeClosingSheet && (
        <>
          <FormBanner title="PLANTATION CLOSING REQUEST" />
          <SpreadsheetGrid
            fields={CLOSING_FIELDS}
            rows={closingBySheet[sheetTab] || [applySiteDefaults(emptyClosingRow(activeClosingSheet.crop_id), siteMeta)]}
            setRows={(updater) => {
              setClosingBySheet((prev) => {
                const current = prev[sheetTab] || [applySiteDefaults(emptyClosingRow(activeClosingSheet.crop_id), siteMeta)];
                const next = typeof updater === 'function' ? updater(current) : updater;
                return { ...prev, [sheetTab]: next };
              });
            }}
            fieldOptions={fieldOptions}
            cropOptions={cropOptions}
            getVarieties={getVarieties}
            isClosing
            fixedCropId={activeClosingSheet.crop_id}
            siteMeta={siteMeta}
            rowVisible={rowVisible}
            selectedKeys={selectedKeys}
            onToggleSelect={toggleSelect}
            onToggleSelectAll={toggleSelectAll}
            onDeleteRows={deleteRowsByKeys}
            closingAccess={closingAccess}
            onApproveClosing={reviewing ? undefined : handleApproveClosing}
            onRejectClosing={reviewing ? undefined : openRejectClosing}
          />
        </>
      )}

      <PlantationWorkbookImporter
        open={importOpen}
        onClose={() => setImportOpen(false)}
        siteId={siteFilter}
        siteMeta={siteMeta}
        fields={importFields}
        crops={crops}
        getVarieties={getVarieties}
        refreshMaster={refreshMaster}
        canWriteClosing={canWriteClosing}
        onImported={async () => {
          await loadWorkbook();
          notify.success('Workbook imported');
        }}
      />

      {confirmDialog}

      <Dialog open={undoDialog.open} onClose={closeUndoApproval} maxWidth="xs" fullWidth>
        <DialogTitle>Undo Operation Manager approval</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            The row becomes editable again and will need to be re-approved. The reason is saved in the audit log.
          </Typography>
          <TextField
            autoFocus
            fullWidth
            required
            multiline
            minRows={2}
            margin="dense"
            label="Reason"
            value={undoReason}
            onChange={(e) => setUndoReason(e.target.value)}
            disabled={undoing}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={closeUndoApproval} disabled={undoing}>Cancel</Button>
          <Button
            variant="contained"
            color="warning"
            onClick={handleUndoApproval}
            disabled={undoing || !undoReason.trim()}
          >
            Undo approval
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={rejectDialog.open} onClose={closeRejectClosing} maxWidth="xs" fullWidth>
        <DialogTitle>Reject closing row</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            The person who submitted it sees the reason and can correct the row, which sends it back for approval.
          </Typography>
          <TextField
            autoFocus
            fullWidth
            required
            multiline
            minRows={2}
            margin="dense"
            label="Reason"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            disabled={reviewing}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={closeRejectClosing} disabled={reviewing}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleRejectClosing}
            disabled={reviewing || !rejectReason.trim()}
          >
            Reject
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={createDialog.open} onClose={() => setCreateDialog({ open: false, type: '', rowKey: '', cropId: '' })} maxWidth="xs" fullWidth>
        <DialogTitle>{createDialog.type === 'crop' ? 'Create New Family (Crop)' : 'Create New Variety'}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            margin="dense"
            label={createDialog.type === 'crop' ? 'Family / crop name' : 'Variety name'}
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialog({ open: false, type: '', rowKey: '', cropId: '' })}>Cancel</Button>
          <Button variant="contained" onClick={handleCreateMaster} disabled={creating}>Create</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
