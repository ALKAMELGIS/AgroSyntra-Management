import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import FitTableContainer from '../../components/table/FitTableContainer';
import { confirmAction } from '../../components/ConfirmDialog';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Box, Typography, Paper, Button, TextField, MenuItem, Chip, Alert,
  Table, TableBody, TableCell, TableHead, TableRow,
  Dialog, DialogTitle, DialogContent, DialogActions, IconButton, Tooltip,
  FormControl, InputLabel, Select, CircularProgress, Stack, Tabs, Tab,
} from '@mui/material';
import {
  EditOutlined as Edit, DeleteOutlined as Delete, FileUploadOutlined as FileUpload,
  SaveOutlined as SaveIcon, SpaOutlined as NurseryIcon, AddCircleOutlineOutlined as AddCircleOutline, SwapHorizOutlined as SwapHoriz,
} from '@mui/icons-material';
import { apiRequest } from '../../utils/api';
import { useNotification } from '../../contexts/NotificationContext';
import { useActiveSite } from '../../contexts/ActiveSiteContext';
import { useActiveSeason } from '../../contexts/ActiveSeasonContext';
import { useMasterData } from '../../utils/useMasterData';
import PlantingImporter from '../../components/PlantingImporter';
import GerminationRecord from './GerminationRecord';
import NurserySowingRecord from './NurserySowingRecord';
import PlantationWorkbook from './PlantationWorkbook';
import CropRotationTab from './CropRotationTab';
import StructureAndFieldToolbar from '../../components/planting/StructureAndFieldToolbar';
import { excelTableSx, freezeColumnsSx, GutterCell, GUTTER_WIDTH } from '../../components/table/ExcelTable';
import { DeleteSelectedButton, RowSelectCell, SelectAllHeadCell, deleteIdsSequentially } from '../../components/table/BulkSelect';
import { useRowSelection } from '../../hooks/useRowSelection';
import { useCropPageStructure } from '../../hooks/useCropPageStructure';
import {
  occupancyForPickerFields,
  plantingRowVisible,
} from '../../utils/cropPageFieldFilter';
import usePlantingOccupancy from '../../hooks/usePlantingOccupancy';
import {
  draftOccupancyOverlaps,
  formatOverlapWarning,
  PLANTING_OCCUPANCY_SOURCE,
} from '../../utils/plantingOccupancy';
import { openNativeDatePicker } from '../../utils/openNativeDatePicker';
import { applyOpenFieldSowingDates } from '../../utils/openFieldSowingDates';
import { isOpenFieldType } from '../../utils/fieldTypeHelpers';
import useOpsExcelExport from '../../hooks/useOpsExcelExport';
import { OPS_EXPORT } from '../../utils/companyExcelExport';
import { buildPlantingExportRows } from '../../utils/cropHistoryExcelExport';
import * as XLSX from 'xlsx';
import { useAuth } from '../../contexts/AuthContext';
import useReadOnlyMode from '../../hooks/useReadOnlyMode';
import ReadOnlyBanner from '../../components/ReadOnlyBanner';
import { isReadOnlyOnPage, PAGE_KEYS } from '../../utils/roleAccess';
import InfoNote from '../../components/InfoNote';
import PageTitle from '../../components/PageTitle';
import ExportButton from '../../components/ExportButton';

/** When true, every planting grid cell renders disabled (view-only roles, closed season). */
const CellReadOnlyContext = createContext(false);

/* ─── constants ─── */
const UOM_OPTIONS = ['pcs', 'Kg', 'MT'];

const PLANTING_FROZEN_WIDTHS = [148, 130, 130];
const PLANTING_FROZEN_WITH_SOWING = [180, 148, 130];

const plantingRowSx = {
  '&&& .MuiTableBody-root .MuiTableRow-root.row-draft .MuiTableCell-root:not(.table-gutter)': {
    backgroundColor: 'var(--sheet-tint-yellow)',
  },
  '&&& .MuiTableBody-root .MuiTableRow-root.row-nursery .MuiTableCell-root:not(.table-gutter)': {
    backgroundColor: 'rgba(46, 125, 50, 0.10)',
  },
};

const CREATE_NEW_VALUE = '__CREATE_NEW__';
const NO_OCCUPANCY_ROWS = [];

function emptyPlantingRow() {
  return {
    _key: `new-${Date.now()}-${Math.random()}`,
    _isNew: true,
    _dirty: false,
    seedingDate: '',
    fieldId: '',
    segment: '',
    totalArea: '',
    cropId: '',
    varietyId: '',
    cropSubClass: '',
    cropType: 'Annual',
    breeder: '',
    breederId: '',
    lotBatchNo: '',
    pmQuantity: '',
    uom: 'pcs',
    traysPerHec: '',
    ratePerHec: '',
    transplantDate: '',
    authorizedBy: '',
    sowingRecordId: '',
  };
}

function serverToRow(r) {
  return {
    _key: r.id,
    _isNew: false,
    _dirty: false,
    _serverId: r.id,
    seedingDate: r.seeding_date?.split('T')[0] || '',
    fieldId: r.field_id || '',
    fieldName: r.field_name || '',
    segment: r.segment || '',
    totalArea: r.total_area || '',
    cropId: r.crop_id || '',
    cropName: r.crop_name || '',
    varietyId: r.variety_id || '',
    varietyName: r.variety_name || '',
    cropSubClass: r.crop_sub_class || '',
    cropType: r.crop_type || 'Annual',
    breeder: r.breeder || '',
    breederId: r.breeder_id || '',
    lotBatchNo: r.lot_batch_no || '',
    pmQuantity: r.pm_quantity != null ? String(r.pm_quantity) : '',
    uom: r.uom || 'pcs',
    traysPerHec: r.trays_per_hec || '',
    ratePerHec: r.rate_per_hec || '',
    transplantDate: r.transplant_date?.split('T')[0] || '',
    authorizedBy: r.authorized_by || '',
    cropHistoryId: r.crop_history_id || null,
    sowingRecordId: r.sowing_record_id || r.sowingRecordId || '',
    status: r.status || 'active',
  };
}

function sowingBatchLabel(b, cropOptions, getVarieties) {
  const crop = cropOptions.find((c) => c.value === b.cropId)?.label || b.cropName || '';
  const variety = (getVarieties(b.cropId) || []).find((v) => v.id === b.varietyId)?.name || b.varietyName || '';
  const date = b.seedingDate?.split?.('T')[0] || b.seedingDate || '';
  const lot = b.seedBatch || '';
  return `${date} · ${crop} · ${variety} · ${lot}`.replace(/ · $/, '');
}

function plantingRowFromSowingSource(source, breederList) {
  const batchId = source._serverId || source.id;
  if (!batchId) return null;
  const breeder = breederList.find((br) => br.id === source.breederId);
  const newR = emptyPlantingRow();
  newR.sowingRecordId = batchId;
  newR.seedingDate = source.seedingDate?.split?.('T')[0] || source.seedingDate || '';
  newR.cropId = source.cropId || '';
  newR.varietyId = source.varietyId || '';
  newR.lotBatchNo = source.seedBatch || source.lotBatchNo || '';
  newR.breederId = source.breederId || '';
  newR.breeder = breeder?.name || source.breederName || source.breeder || '';
  newR._dirty = true;
  return newR;
}

/* ─── tiny cell input with keyboard nav ─── */
function CellInput({ value, onChange, type = 'text', placeholder, rowIdx, colIdx, totalCols, onAddRow, width, ...rest }) {
  const readOnly = useContext(CellReadOnlyContext);
  const handleKeyDown = (e) => {
    const { key, shiftKey } = e;
    let targetRow = null;
    let targetCol = colIdx;

    if (key === 'ArrowDown') { e.preventDefault(); targetRow = rowIdx + 1; }
    else if (key === 'ArrowUp' && rowIdx > 0) { e.preventDefault(); targetRow = rowIdx - 1; }
    else if (key === 'Enter' && !shiftKey) { e.preventDefault(); targetRow = rowIdx + 1; }
    else if (key === 'Enter' && shiftKey) { e.preventDefault(); targetRow = Math.max(0, rowIdx - 1); }
    else if (key === 'Tab' && !shiftKey && colIdx >= totalCols - 1) {
      e.preventDefault();
      onAddRow?.();
      targetRow = rowIdx + 1;
      targetCol = 0;
    }

    if (targetRow !== null) {
      setTimeout(() => {
        const next = document.querySelector(`[data-pr="${targetRow}-${targetCol}"]`);
        if (next) { next.focus(); if (next.select) next.select(); }
      }, 30);
    }
  };

  return (
    <TextField
      size="small"
      variant="standard"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      type={type}
      placeholder={placeholder}
      onKeyDown={handleKeyDown}
      onClick={type === 'date' ? openNativeDatePicker : undefined}
      InputProps={{ disableUnderline: false, sx: { fontSize: '0.8125rem' } }}
      sx={{ width: width || '100%', '& .MuiInput-input': { p: '2px 0' } }}
      inputProps={{ 'data-pr': `${rowIdx}-${colIdx}` }}
      {...rest}
      disabled={readOnly || rest.disabled}
    />
  );
}

/* ─── small select cell ─── */
function CellSelect({ value, onChange, options, rowIdx, colIdx, totalCols, onAddRow, allowEmpty, width }) {
  const readOnly = useContext(CellReadOnlyContext);
  const handleKeyDown = (e) => {
    const { key } = e;
    let targetRow = null;
    if (key === 'ArrowDown' && e.altKey) return;
    if (key === 'ArrowDown') { e.preventDefault(); targetRow = rowIdx + 1; }
    else if (key === 'ArrowUp' && rowIdx > 0) { e.preventDefault(); targetRow = rowIdx - 1; }
    if (targetRow !== null) {
      setTimeout(() => {
        const next = document.querySelector(`[data-pr="${targetRow}-${colIdx}"]`);
        if (next) next.focus();
      }, 30);
    }
  };
  return (
    <TextField
      size="small" select variant="standard"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={handleKeyDown}
      disabled={readOnly}
      InputProps={{ disableUnderline: false, sx: { fontSize: '0.8125rem' } }}
      sx={{ width: width || '100%', '& .MuiInput-input': { p: '2px 0' } }}
      SelectProps={{ native: true, inputProps: { 'data-pr': `${rowIdx}-${colIdx}` } }}
    >
      {allowEmpty && <option value="" />}
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </TextField>
  );
}

const CROP_HISTORY_TAB_DEFS = [
  { key: 'rotation', label: 'Crop Rotation' },
  { key: 'planting', label: 'Planting & Transplant', requiresTemplate: 'planting-standard' },
  { key: 'germination', label: 'Germination Record', requiresTemplate: 'germination-record' },
  { key: 'nursery-sowing', label: 'Sowing Record (RC-241)', requiresTemplate: 'nursery-sowing' },
  { key: 'plantation-workbook', label: 'Plantation Opening / Closing', requiresTemplate: 'plantation-opening-closing' },
];

function tabKeyToIndex(key, visibleTabs) {
  const i = visibleTabs.findIndex((t) => t.key === key);
  return i >= 0 ? i : 0;
}

export default function CropHistory() {
  const notify = useNotification();
  const exportOpsExcel = useOpsExcelExport();
  const notifyRef = useRef(notify);
  useEffect(() => { notifyRef.current = notify; }, [notify]);
  const { activeSiteId, allSites } = useActiveSite();
  const { isSeasonReadOnly } = useActiveSeason();
  const { t } = useTranslation();
  const { user } = useAuth();
  // Only workers and agronomists record planting; everyone else watches.
  // `plantingReadOnly` also covers a closed season.
  const plantingRoleReadOnly = isReadOnlyOnPage(user, PAGE_KEYS.DATA_ENTRY);
  const plantingReadOnly = useReadOnlyMode(PAGE_KEYS.DATA_ENTRY);
  const { data: masterData, refresh: refreshMaster } = useMasterData();
  const [searchParams, setSearchParams] = useSearchParams();

  const [siteTemplateSlugs, setSiteTemplateSlugs] = useState(() => new Set());

  const [pendingTransplantSowing, setPendingTransplantSowing] = useState(null);
  const pendingTransplantRef = useRef(null);
  const plantingLoadIdRef = useRef(0);
  const searchParamsRef = useRef(searchParams);
  useEffect(() => { searchParamsRef.current = searchParams; }, [searchParams]);
  const loadPlantingRecordsRef = useRef(async () => {});

  const [siteFilter, setSiteFilter] = useState(activeSiteId || '');
  useEffect(() => { if (activeSiteId) setSiteFilter(activeSiteId); }, [activeSiteId]);

  useEffect(() => {
    if (!siteFilter) {
      setSiteTemplateSlugs(new Set());
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await apiRequest(`/form-templates/site/${siteFilter}`);
        const slugs = new Set(
          (data || [])
            .filter((t) => t.is_visible !== false)
            .map((t) => t.slug)
            .filter(Boolean),
        );
        if (!cancelled) setSiteTemplateSlugs(slugs);
      } catch {
        if (!cancelled) setSiteTemplateSlugs(new Set());
      }
    })();
    return () => { cancelled = true; };
  }, [siteFilter]);

  const visibleTabs = useMemo(() => CROP_HISTORY_TAB_DEFS.filter((tab) => {
    if (!tab.requiresTemplate) return true;
    if (!siteFilter) return false;
    return siteTemplateSlugs.has(tab.requiresTemplate);
  }), [siteFilter, siteTemplateSlugs]);

  const urlTabKey = searchParams.get('tab') || 'rotation';
  const tabIndex = useMemo(
    () => tabKeyToIndex(urlTabKey, visibleTabs),
    [urlTabKey, visibleTabs]
  );
  const activeTabKey = visibleTabs[tabIndex]?.key ?? 'rotation';

  useEffect(() => {
    if (urlTabKey === 'nursery-transplant' || urlTabKey === 'openfield') {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('tab', 'planting');
        return next;
      }, { replace: true });
      return;
    }
    if (!searchParams.get('tab')) return;
    const valid = visibleTabs.some((t) => t.key === urlTabKey);
    if (!valid) {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete('tab');
        next.delete('sowingId');
        return next;
      }, { replace: true });
    }
  }, [urlTabKey, visibleTabs, searchParams, setSearchParams]);

  const setTabIndex = useCallback((idx) => {
    const key = visibleTabs[idx]?.key ?? 'rotation';
    if (key === 'rotation') setSearchParams({});
    else setSearchParams({ tab: key });
  }, [setSearchParams, visibleTabs]);

  const nurserySowingEnabled = Boolean(siteFilter && siteTemplateSlugs.has('nursery-sowing'));

  const handleStartTransplant = useCallback((sowingRow) => {
    pendingTransplantRef.current = sowingRow;
    setPendingTransplantSowing(sowingRow);
    setSearchParams({
      tab: 'planting',
      sowingId: sowingRow._serverId || sowingRow.id || '',
    });
  }, [setSearchParams]);

  /* ─── shared data ─── */
  const crops = masterData.crops || [];
  const allFields = useMemo(() => {
    const fields = [];
    masterData.countries?.forEach((c) =>
      c.sites?.forEach((s) =>
        s.farmAreas?.forEach((fa) =>
          fa.fields?.forEach((f) =>
            fields.push({ ...f, siteName: s.name, siteId: s.id, farmAreaName: fa.name })
          )
        )
      )
    );
    return fields;
  }, [masterData]);

  const filteredFields = useMemo(
    () => siteFilter ? allFields.filter((f) => f.siteId === siteFilter) : allFields,
    [allFields, siteFilter]
  );
  const {
    availableTabs: cropStructureTabs,
    structureId,
    setStructureId,
    fieldId: fieldFilterId,
    setFieldId: setFieldFilterId,
    pickerFields,
    structureFieldIds,
  } = useCropPageStructure(filteredFields);
  const [rotationReloadToken, setRotationReloadToken] = useState(0);
  const bumpRotationReload = useCallback(() => setRotationReloadToken((n) => n + 1), []);

  const [allVarietiesByCrop, setAllVarietiesByCrop] = useState({});
  useEffect(() => {
    const loadAll = async () => {
      const map = {};
      for (const c of crops) {
        const crop = typeof c === 'object' ? c : null;
        if (!crop?.id) continue;
        try {
          const data = await apiRequest(`/crops/${crop.id}/varieties`);
          map[crop.id] = data || [];
        } catch { /* ignore */ }
      }
      setAllVarietiesByCrop(map);
    };
    if (crops.length > 0) loadAll();
  }, [crops]);

  /* ========================================================================
     TAB 1 — PLANTING & TRANSPLANT SPREADSHEET
     ======================================================================== */
  const [pRows, setPRows] = useState([]);
  const [pLoading, setPLoading] = useState(false);
  const [pSaving, setPSaving] = useState(false);
  const plantingSelection = useRowSelection();
  const [plantingImporterOpen, setPlantingImporterOpen] = useState(false);
  const [nurseries, setNurseries] = useState([]);
  const [nurseryDialogOpen, setNurseryDialogOpen] = useState(false);
  const [nurseryField, setNurseryField] = useState('');
  const [breeders, setBreeders] = useState([]);
  const [createDialog, setCreateDialog] = useState({ open: false, type: '', rowIdx: -1, groupSpan: 1 });
  const [createName, setCreateName] = useState('');
  const [renameDialog, setRenameDialog] = useState({ open: false, type: '', id: '', cropId: '', currentName: '' });
  const [renameName, setRenameName] = useState('');
  const [reassignDialog, setReassignDialog] = useState({ open: false, oldVarietyId: '', cropId: '', oldName: '' });
  const [reassignTarget, setReassignTarget] = useState('');
  const [creating, setCreating] = useState(false);
  const importRef = useRef(null);
  const [nurserySowingBatches, setNurserySowingBatches] = useState([]);
  const { occupancyByField, reload: reloadOccupancy } =
    usePlantingOccupancy(
      PLANTING_OCCUPANCY_SOURCE.PLANTING_RECORDS,
      activeTabKey === 'planting' ? pRows : NO_OCCUPANCY_ROWS,
    );

  const plantingFilterScope = useMemo(
    () => ({ structureFieldIds, fieldId: fieldFilterId }),
    [structureFieldIds, fieldFilterId],
  );
  const visiblePlantingRows = useMemo(
    () => pRows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => plantingRowVisible(row, plantingFilterScope)),
    [pRows, plantingFilterScope],
  );
  const scopedOccupancy = useMemo(
    () => occupancyForPickerFields(occupancyByField, pickerFields, fieldFilterId),
    [occupancyByField, pickerFields, fieldFilterId],
  );
  const plantingOverlaps = useMemo(
    () => draftOccupancyOverlaps(visiblePlantingRows.map((item) => item.row), scopedOccupancy),
    [visiblePlantingRows, scopedOccupancy],
  );
  const fieldOptions = useMemo(() => {
    const seen = new Set();
    const options = [];
    const add = (f) => {
      if (!f || seen.has(f.id)) return;
      seen.add(f.id);
      options.push({ value: f.id, label: f.name, isNursery: f.isNursery, type: f.type });
    };
    pickerFields.forEach(add);
    visiblePlantingRows.forEach(({ row }) => {
      if (row.fieldId && !seen.has(row.fieldId)) {
        add(filteredFields.find((f) => f.id === row.fieldId));
      }
    });
    return options;
  }, [pickerFields, visiblePlantingRows, filteredFields]);

  const cropOptions = useMemo(() =>
    crops.map((c) => {
      const crop = typeof c === 'object' ? c : { id: c, name: c };
      return { value: crop.id, label: crop.name };
    }),
    [crops]
  );

  const loadPlantingRecords = useCallback(async () => {
    const loadId = ++plantingLoadIdRef.current;
    let sowingSource = pendingTransplantRef.current;
    const sowingIdParam = searchParamsRef.current.get('sowingId') || '';
    setPLoading(true);
    try {
      const params = siteFilter ? `?site_id=${siteFilter}` : '';
      const [data, nData, bData] = await Promise.all([
        apiRequest(`/planting-records${params}`),
        apiRequest(`/planting-records/nurseries${params}`).catch(() => []),
        apiRequest('/breeders').catch(() => []),
      ]);
      if (loadId !== plantingLoadIdRef.current) return;

      if (!sowingSource && sowingIdParam && siteFilter) {
        try {
          const nSowing = await apiRequest(`/nursery-sowing-records?site_id=${siteFilter}`);
          if (loadId !== plantingLoadIdRef.current) return;
          sowingSource = (nSowing || []).find((r) => String(r.id) === String(sowingIdParam)) || null;
        } catch {
          /* prefill fallback optional */
        }
      }

      const breederList = bData || [];
      const existing = (data || []).map(serverToRow);
      let rows = [...existing, emptyPlantingRow(), emptyPlantingRow(), emptyPlantingRow()];
      let appliedTransplantPrefill = false;

      if (sowingSource) {
        const prefill = plantingRowFromSowingSource(sowingSource, breederList);
        if (prefill) {
          const kept = existing.filter((r) => !(r._isNew && !r.seedingDate && !r.fieldId));
          rows = [prefill, ...kept, emptyPlantingRow(), emptyPlantingRow(), emptyPlantingRow()];
          appliedTransplantPrefill = true;
        }
      }

      if (loadId !== plantingLoadIdRef.current) return;
      setPRows(rows);
      setNurseries(nData || []);
      setBreeders(breederList);
      if (appliedTransplantPrefill) {
        pendingTransplantRef.current = null;
        setPendingTransplantSowing(null);
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev);
          next.delete('sowingId');
          return next;
        }, { replace: true });
      }
    } catch (err) {
      if (loadId !== plantingLoadIdRef.current) return;
      notifyRef.current.error(err.message || 'Failed to load planting records');
    } finally {
      if (loadId === plantingLoadIdRef.current) {
        setPLoading(false);
      }
    }
  }, [siteFilter, setSearchParams]);

  loadPlantingRecordsRef.current = loadPlantingRecords;

  useEffect(() => {
    apiRequest('/breeders').then((b) => setBreeders(b || [])).catch(() => setBreeders([]));
  }, []);

  useEffect(() => {
    if (activeTabKey !== 'planting') return undefined;
    loadPlantingRecordsRef.current();
    return () => {
      plantingLoadIdRef.current += 1;
    };
  }, [activeTabKey, siteFilter]);

  const loadNurserySowingBatches = useCallback(async () => {
    if (!siteFilter || !nurserySowingEnabled) {
      setNurserySowingBatches([]);
      return;
    }
    try {
      const data = await apiRequest(`/nursery-sowing-records?site_id=${siteFilter}`);
      setNurserySowingBatches(data || []);
    } catch {
      setNurserySowingBatches([]);
    }
  }, [siteFilter, nurserySowingEnabled]);

  useEffect(() => { loadNurserySowingBatches(); }, [loadNurserySowingBatches]);

  const applyPlantingSowingBatch = useCallback((idx, batchId) => {
    const batch = nurserySowingBatches.find((b) => b.id === batchId);
    setPRows((prev) => {
      const next = [...prev];
      const row = { ...next[idx], sowingRecordId: batchId || '', _dirty: true };
      if (batch) {
        const breeder = breeders.find((br) => br.id === batch.breederId);
        row.seedingDate = batch.seedingDate?.split?.('T')[0] || batch.seedingDate || '';
        row.cropId = batch.cropId || '';
        row.varietyId = batch.varietyId || '';
        row.lotBatchNo = batch.seedBatch || '';
        row.breederId = batch.breederId || '';
        row.breeder = breeder?.name || batch.breederName || '';
      }
      const fieldType = filteredFields.find((f) => f.id === row.fieldId)?.type;
      const dates = applyOpenFieldSowingDates(fieldType, row.seedingDate, row.transplantDate, 'seedingDate');
      row.seedingDate = dates.seedingDate;
      row.transplantDate = dates.transplantDate;
      next[idx] = row;
      return next;
    });
  }, [nurserySowingBatches, breeders, filteredFields]);

  const updatePRow = useCallback((idx, key, value) => {
    setPRows((prev) => {
      const next = [...prev];
      const row = { ...next[idx], [key]: value, _dirty: true };
      const fieldId = key === 'fieldId' ? value : row.fieldId;
      const fieldType = filteredFields.find((f) => f.id === fieldId)?.type;
      if (key === 'seedingDate' || key === 'transplantDate' || key === 'fieldId') {
        const dates = applyOpenFieldSowingDates(
          fieldType,
          key === 'seedingDate' ? value : row.seedingDate,
          key === 'transplantDate' ? value : row.transplantDate,
          key,
        );
        row.seedingDate = dates.seedingDate;
        row.transplantDate = dates.transplantDate;
      }
      if (key === 'fieldId' && isOpenFieldType(fieldType) && (!row.uom || row.uom === 'pcs')) {
        row.uom = 'Kg';
      }
      next[idx] = row;
      return next;
    });
  }, [filteredFields]);

  const addPRow = useCallback(() => {
    setPRows((prev) => [...prev, emptyPlantingRow()]);
  }, []);

  // Rows mirrored in a ref: the confirm and the delete run outside the state
  // updater (updaters can run twice), and the row stays if the delete fails.
  const pRowsRef = useRef(pRows);
  pRowsRef.current = pRows;
  const removePRow = useCallback(async (idx) => {
    const row = pRowsRef.current[idx];
    if (!row) return;
    if (row._serverId) {
      if (!(await confirmAction('Delete this planting record?'))) return;
      try {
        await apiRequest(`/planting-records/${row._serverId}`, { method: 'DELETE' });
      } catch (err) {
        notify.error(err?.message || 'Delete failed');
        return;
      }
    }
    setPRows((prev) => prev.filter((r) => r !== row));
  }, [notify]);

  const removePRowsByKeys = useCallback(async (keys) => {
    if (!keys.length) return;
    if (!(await confirmAction(`Delete ${keys.length} planting ${keys.length === 1 ? 'record' : 'records'}?`))) return;
    const keySet = new Set(keys);
    const rows = pRows.filter((r) => keySet.has(r._key));
    await deleteIdsSequentially(
      rows.filter((r) => r._serverId).map((r) => r._serverId),
      (id) => apiRequest(`/planting-records/${id}`, { method: 'DELETE' }),
    );
    setPRows((prev) => prev.filter((r) => !keySet.has(r._key)));
    plantingSelection.clear();
  }, [pRows, plantingSelection]);

  const autoFillFromPrevious = useCallback((idx) => {
    setPRows((prev) => {
      if (idx <= 0) return prev;
      const prevRow = prev[idx - 1];
      const curRow = prev[idx];
      if (!prevRow.cropId || curRow.cropId) return prev;
      const next = [...prev];
      next[idx] = {
        ...curRow,
        cropId: prevRow.cropId,
        varietyId: prevRow.varietyId,
        cropSubClass: prevRow.cropSubClass,
        cropType: prevRow.cropType,
        breeder: prevRow.breeder,
        breederId: prevRow.breederId,
        lotBatchNo: prevRow.lotBatchNo,
        pmQuantity: prevRow.pmQuantity,
        uom: prevRow.uom,
        seedingDate: prevRow.seedingDate,
        transplantDate: prevRow.transplantDate,
        authorizedBy: prevRow.authorizedBy,
        _dirty: true,
      };
      return next;
    });
  }, []);

  const varietyOptionsForCrop = useCallback((cropId) => {
    if (!cropId) return [];
    return (allVarietiesByCrop[cropId] || []).map((v) => ({ value: v.id, label: v.name }));
  }, [allVarietiesByCrop]);

  const breederOptions = useMemo(() =>
    breeders.map((b) => ({ value: b.id, label: b.name })),
    [breeders]
  );

  const savePlantingRecords = async () => {
    const dirtyRows = pRows.filter((r) => r._dirty && r.seedingDate);
    if (dirtyRows.length === 0) { notify.info('No changes to save'); return; }

    setPSaving(true);
    try {
      const newRows = dirtyRows.filter((r) => r._isNew);
      const existingRows = dirtyRows.filter((r) => !r._isNew && r._serverId);

      if (newRows.length > 0) {
        const entries = newRows.map((r) => ({
          seedingDate: r.seedingDate,
          fieldId: r.fieldId || null,
          segment: r.segment || null,
          totalArea: r.totalArea || null,
          cropId: r.cropId || null,
          varietyId: r.varietyId || null,
          cropSubClass: r.cropSubClass || null,
          cropType: r.cropType || 'Annual',
          breeder: r.breeder || null,
          breederId: r.breederId || null,
          lotBatchNo: r.lotBatchNo || null,
          pmQuantity: r.pmQuantity || null,
          uom: r.uom || null,
          traysPerHec: r.traysPerHec || null,
          ratePerHec: r.ratePerHec || null,
          transplantDate: r.transplantDate || r.seedingDate || null,
          authorizedBy: r.authorizedBy || null,
          sowingRecordId: r.sowingRecordId || null,
        }));
        await apiRequest('/planting-records/bulk', {
          method: 'POST', body: JSON.stringify({ entries }),
        });
      }

      for (const r of existingRows) {
        await apiRequest(`/planting-records/${r._serverId}`, {
          method: 'PUT',
          body: JSON.stringify({
            seedingDate: r.seedingDate,
            fieldId: r.fieldId || null,
            segment: r.segment || null,
            totalArea: r.totalArea || null,
            cropId: r.cropId || null,
            varietyId: r.varietyId || null,
            cropSubClass: r.cropSubClass || null,
            cropType: r.cropType || 'Annual',
            breeder: r.breeder || null,
            breederId: r.breederId || null,
            lotBatchNo: r.lotBatchNo || null,
            pmQuantity: r.pmQuantity || null,
            uom: r.uom || null,
            traysPerHec: r.traysPerHec || null,
            ratePerHec: r.ratePerHec || null,
            transplantDate: r.transplantDate || r.seedingDate || null,
            authorizedBy: r.authorizedBy || null,
            sowingRecordId: r.sowingRecordId || null,
          }),
        });
      }

      notify.success(`Saved ${dirtyRows.length} record(s)`);
      loadPlantingRecords();
      bumpRotationReload();
      reloadOccupancy();
    } catch (err) {
      notify.error(err.message || 'Failed to save');
    } finally {
      setPSaving(false);
    }
  };

  /* ─── Excel import for planting report ─── */
  const handlePlantingExcel = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const wb = XLSX.read(evt.target.result, { type: 'binary', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });

      let headerIdx = raw.findIndex((r) =>
        r.some((c) => typeof c === 'string' && c.toLowerCase().includes('seeding') && c.toLowerCase().includes('date'))
      );
      if (headerIdx < 0) headerIdx = raw.findIndex((r) =>
        r.some((c) => typeof c === 'string' && c.toLowerCase().includes('planting') && c.toLowerCase().includes('date'))
      );
      if (headerIdx < 0) { notify.error('Could not find header row'); return; }

      const headers = raw[headerIdx].map((h) => String(h).trim().toLowerCase());
      const dataRows = raw.slice(headerIdx + 1).filter((r) => r.some((c) => c !== ''));

      let lastCrop = {};
      const parsed = [];

      for (const row of dataRows) {
        const seedDateRaw = String(row[0] || '').trim();
        if (!seedDateRaw) continue;

        const seedDate = parseFlexDate(seedDateRaw);
        if (!seedDate) continue;

        const fieldNameRaw = String(row[1] || '').trim();
        const segment = String(row[2] || '').trim();
        const totalArea = String(row[3] || '').trim();
        const cropNameRaw = String(row[4] || '').trim();
        const varietyRaw = String(row[5] || '').trim();
        const subClass = String(row[6] || '').trim();
        const cType = String(row[7] || '').trim();
        const breeder = String(row[8] || '').trim();
        const lotBatch = String(row[9] || '').trim();
        const qty = String(row[10] || '').trim();
        const uom = String(row[11] || '').trim();
        const trays = String(row[12] || '').trim();
        const rate = String(row[13] || '').trim();
        const endDateRaw = String(row[14] || '').trim();
        const authBy = String(row[15] || '').trim();

        if (cropNameRaw) {
          const { cropId, varietyId } = resolveCropVariety(cropNameRaw, varietyRaw);
          lastCrop = { cropId, varietyId, cropNameRaw, varietyRaw, subClass, cType, breeder, lotBatch, qty, uom };
        }

        const field = matchField(fieldNameRaw);
        const transplantDate = parseFlexDate(endDateRaw);

        const newRow = emptyPlantingRow();
        newRow.seedingDate = seedDate;
        newRow.fieldId = field?.id || '';
        newRow.segment = segment;
        newRow.totalArea = totalArea;
        newRow.cropId = lastCrop.cropId || '';
        newRow.varietyId = lastCrop.varietyId || '';
        newRow.cropSubClass = cropNameRaw ? subClass : (lastCrop.subClass || '');
        newRow.cropType = cropNameRaw ? (cType || 'Annual') : (lastCrop.cType || 'Annual');
        newRow.breeder = cropNameRaw ? breeder : (lastCrop.breeder || '');
        newRow.lotBatchNo = cropNameRaw ? lotBatch : (lastCrop.lotBatch || '');
        newRow.pmQuantity = cropNameRaw ? qty : (lastCrop.qty || '');
        newRow.uom = cropNameRaw ? (uom || 'pcs') : (lastCrop.uom || 'pcs');
        newRow.traysPerHec = trays;
        newRow.ratePerHec = rate;
        newRow.transplantDate = transplantDate || '';
        newRow.authorizedBy = authBy;
        newRow._dirty = true;

        parsed.push(newRow);
      }

      if (parsed.length === 0) { notify.error('No data rows found in file'); return; }

      setPRows((prev) => {
        const existing = prev.filter((r) => !r._isNew);
        return [...existing, ...parsed, emptyPlantingRow(), emptyPlantingRow()];
      });
      notify.success(`Imported ${parsed.length} rows from Excel`);
    };
    reader.readAsBinaryString(file);
    if (importRef.current) importRef.current.value = '';
  };

  function parseFlexDate(str) {
    if (!str) return '';
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
    const parts = str.match(/(\d{1,2})[-\/](\w{3,})[-\/](\d{2,4})/);
    if (parts) {
      const months = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
      const mon = months[parts[2].toLowerCase().slice(0, 3)];
      if (mon) {
        let yr = parts[3].length === 2 ? `20${parts[3]}` : parts[3];
        return `${yr}-${mon}-${parts[1].padStart(2, '0')}`;
      }
    }
    return '';
  }

  function resolveCropVariety(cropNameRaw, varietyRaw) {
    const str = cropNameRaw.toLowerCase().trim();
    let matchedCrop = null;
    for (const c of crops) {
      const crop = typeof c === 'object' ? c : { name: c, id: null };
      if (!crop.name) continue;
      if (str.includes(crop.name.toLowerCase())) {
        if (!matchedCrop || crop.name.length > matchedCrop.name.length) matchedCrop = crop;
      }
    }
    if (!matchedCrop) return { cropId: null, varietyId: null };

    let varietyId = null;
    if (varietyRaw) {
      const vStr = varietyRaw.toLowerCase().trim();
      const cvs = allVarietiesByCrop[matchedCrop.id] || [];
      const v = cvs.find((v2) => v2.name && vStr.includes(v2.name.toLowerCase()));
      if (v) varietyId = v.id;
    }
    return { cropId: matchedCrop.id, varietyId };
  }

  function matchField(name) {
    if (!name) return null;
    const norm = (s) => s.toLowerCase().replace(/[\s\-_]+/g, '');
    return filteredFields.find((f) => norm(f.name) === norm(name)) || null;
  }

  /* ─── Create new crop / variety / breeder ─── */
  const openCreateDialog = (type, rowIdx, groupSpan = 1) => {
    setCreateDialog({ open: true, type, rowIdx, groupSpan });
    setCreateName('');
  };

  const handleCreate = async () => {
    if (!createName.trim()) return;
    setCreating(true);
    try {
      const { type, rowIdx, groupSpan } = createDialog;
      if (type === 'crop') {
        const res = await apiRequest('/crops', { method: 'POST', body: JSON.stringify({ name: createName.trim() }) });
        const newCrop = res;
        for (let g = 0; g < groupSpan; g++) updatePRow(rowIdx + g, 'cropId', newCrop.id);
        notify.success(`Crop "${newCrop.name}" created`);
      } else if (type === 'variety') {
        const row = pRows[rowIdx];
        if (!row.cropId) { notify.error('Select a crop first'); setCreating(false); return; }
        const res = await apiRequest(`/crops/${row.cropId}/varieties`, { method: 'POST', body: JSON.stringify({ name: createName.trim() }) });
        const newVar = res;
        for (let g = 0; g < groupSpan; g++) updatePRow(rowIdx + g, 'varietyId', newVar.id);
        setAllVarietiesByCrop((prev) => {
          const list = [...(prev[row.cropId] || []), newVar];
          return { ...prev, [row.cropId]: list };
        });
        notify.success(`Variety "${newVar.name}" created`);
      } else if (type === 'breeder') {
        const res = await apiRequest('/breeders', { method: 'POST', body: JSON.stringify({ name: createName.trim() }) });
        const newBreeder = res;
        for (let g = 0; g < groupSpan; g++) {
          updatePRow(rowIdx + g, 'breederId', newBreeder.id);
          updatePRow(rowIdx + g, 'breeder', newBreeder.name);
        }
        setBreeders((prev) => prev.some((b) => b.id === newBreeder.id) ? prev : [...prev, newBreeder]);
        notify.success(`Breeder "${newBreeder.name}" created`);
      }
      setCreateDialog({ open: false, type: '', rowIdx: -1, groupSpan: 1 });
    } catch (err) {
      notify.error(err.message || 'Failed to create');
    } finally {
      setCreating(false);
    }
  };

  const handleRename = async () => {
    if (!renameName.trim() || renameName.trim() === renameDialog.currentName) return;
    try {
      if (renameDialog.type === 'variety') {
        await apiRequest(`/crops/${renameDialog.cropId}/varieties/${renameDialog.id}`, {
          method: 'PUT',
          body: JSON.stringify({ name: renameName.trim() }),
        });
        setAllVarietiesByCrop((prev) => {
          const list = (prev[renameDialog.cropId] || []).map(v =>
            v.id === renameDialog.id ? { ...v, name: renameName.trim() } : v
          );
          return { ...prev, [renameDialog.cropId]: list };
        });
        notify.success(`Variety renamed to "${renameName.trim()}"`);
      } else if (renameDialog.type === 'crop') {
        await apiRequest(`/crops/${renameDialog.id}`, {
          method: 'PUT',
          body: JSON.stringify({ name: renameName.trim() }),
        });
        refreshMaster();
        notify.success(`Crop renamed to "${renameName.trim()}"`);
      }
      setRenameDialog({ open: false, type: '', id: '', cropId: '', currentName: '' });
    } catch (err) {
      notify.error(err.message || 'Failed to rename');
    }
  };

  const handleReassign = async () => {
    if (!reassignTarget || reassignTarget === reassignDialog.oldVarietyId) return;
    try {
      const res = await apiRequest('/planting-records/reassign-variety', {
        method: 'POST',
        body: JSON.stringify({
          siteId: siteFilter,
          oldVarietyId: reassignDialog.oldVarietyId,
          newVarietyId: reassignTarget,
        }),
      });
      const targetName = (allVarietiesByCrop[reassignDialog.cropId] || []).find(v => v.id === reassignTarget)?.name || '';
      notify.success(`Reassigned ${res.data?.updated || 0} records to "${targetName}"`);
      setPRows((prev) => prev.map(r =>
        r.varietyId === reassignDialog.oldVarietyId ? { ...r, varietyId: reassignTarget } : r
      ));
      setReassignDialog({ open: false, oldVarietyId: '', cropId: '', oldName: '' });
      setReassignTarget('');
    } catch (err) {
      notify.error(err.message || 'Failed to reassign');
    }
  };

  /* ─── Nursery management ─── */
  const toggleNursery = async () => {
    if (!nurseryField) return;
    try {
      const existing = nurseries.find((n) => n.id === nurseryField);
      await apiRequest(`/planting-records/nursery/${nurseryField}`, {
        method: 'PATCH',
        body: JSON.stringify({ isNursery: !existing }),
      });
      notify.success(existing ? 'Nursery designation removed' : 'Field marked as nursery');
      setNurseryDialogOpen(false);
      setNurseryField('');
      loadPlantingRecords();
      refreshMaster();
    } catch (err) {
      notify.error(err.message || 'Failed to update nursery');
    }
  };

  const TOTAL_COLS = nurserySowingEnabled ? 17 : 16;
  const dirtyCount = pRows.filter((r) => r._dirty && r.seedingDate).length;

  const sowingBatchOptions = useMemo(() => {
    const getVarieties = (cropId) => allVarietiesByCrop[cropId] || [];
    return nurserySowingBatches.map((b) => ({
      value: b.id,
      label: sowingBatchLabel(b, cropOptions, getVarieties),
    }));
  }, [nurserySowingBatches, cropOptions, allVarietiesByCrop]);

  const handleExportPlanting = async () => {
    if (dirtyCount > 0) notify.warning('Unsaved planting rows are not in the file.');
    const varietyNameById = {};
    Object.values(allVarietiesByCrop).forEach((list) => {
      (list || []).forEach((v) => { varietyNameById[v.id] = v.name; });
    });
    const rows = buildPlantingExportRows(
      visiblePlantingRows.map(({ row }) => row),
      {
        includeSowingBatch: nurserySowingEnabled,
        includeSite: !siteFilter,
        siteNameByFieldId: Object.fromEntries(allFields.map((f) => [f.id, f.siteName || ''])),
        cropNameById: Object.fromEntries(crops.map((c) => [c.id, c.name])),
        varietyNameById,
        fieldNameById: Object.fromEntries(allFields.map((f) => [f.id, f.name])),
        sowingLabelById: Object.fromEntries(sowingBatchOptions.map((o) => [o.value, o.label])),
      },
    );
    if (!rows.length) {
      notify.error('Nothing to export');
      return;
    }
    await exportOpsExcel(rows, {
      filename: 'Planting-Transplant.xlsx',
      ...OPS_EXPORT.planting,
    });
  };

  /* ─── Compute crop groups for visual merging (like Excel merged cells) ─── */
  const cropGroupInfo = useMemo(() => {
    const rows = visiblePlantingRows.map((item) => item.row);
    const info = new Array(rows.length).fill(null).map(() => ({ isGroupStart: true, span: 1 }));
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row.cropId || row._isNew) { info[i] = { isGroupStart: true, span: 1 }; continue; }
      const key = `${row.seedingDate}|${row.cropId}|${row.varietyId}|${row.breeder}|${row.lotBatchNo}`;
      let span = 1;
      while (i + span < rows.length) {
        const next = rows[i + span];
        if (next._isNew && !next.seedingDate) break;
        const nKey = `${next.seedingDate}|${next.cropId}|${next.varietyId}|${next.breeder}|${next.lotBatchNo}`;
        if (nKey !== key) break;
        span++;
      }
      info[i] = { isGroupStart: true, span };
      for (let j = 1; j < span; j++) {
        info[i + j] = { isGroupStart: false, span: 0 };
      }
      i += span - 1;
    }
    return info;
  }, [visiblePlantingRows]);

  /* ─── RENDER ─── */
  return (
    <Box sx={{ maxWidth: 1760, mx: 'auto' }}>
      <PageTitle help="Manage crop rotation history and planting/transplant records." sx={{ mb: 2 }}>
        Crop Rotation & Planting
      </PageTitle>

      <Paper sx={{ p: 2, mb: 2, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
        <TextField size="small" select label="Site" value={siteFilter}
          onChange={(e) => setSiteFilter(e.target.value)}
          InputLabelProps={{ shrink: true }} SelectProps={{ displayEmpty: true }}
          sx={{ minWidth: 200 }}>
          <MenuItem value="">All Sites</MenuItem>
          {allSites.map((s) => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
        </TextField>
        <Tabs value={tabIndex} onChange={(_, v) => setTabIndex(v)} sx={{ ml: 2 }} variant="scrollable" scrollButtons="auto">
          {visibleTabs.map((tab) => (
            <Tab key={tab.key} label={tab.label} />
          ))}
        </Tabs>
      </Paper>

      {activeTabKey === 'rotation' && (
        <CropRotationTab
          siteFilter={siteFilter}
          siteFields={filteredFields}
          pickerFields={pickerFields}
          structureFieldIds={structureFieldIds}
          fieldFilterId={fieldFilterId}
          availableTabs={cropStructureTabs}
          structureId={structureId}
          onStructureChange={setStructureId}
          onFieldChange={setFieldFilterId}
          allFields={allFields}
          crops={crops}
          allVarietiesByCrop={allVarietiesByCrop}
          setAllVarietiesByCrop={setAllVarietiesByCrop}
          isSeasonReadOnly={isSeasonReadOnly}
          reloadToken={rotationReloadToken}
          onOccupancyChange={() => { loadPlantingRecords(); bumpRotationReload(); reloadOccupancy(); }}
        />
      )}

      {/* ─── TAB 1: PLANTING & TRANSPLANT ─── */}
      {activeTabKey === 'planting' && (
        <CellReadOnlyContext.Provider value={plantingReadOnly}>
          {plantingRoleReadOnly && (
            <ReadOnlyBanner message={t('cropHistoryAccess.plantingViewOnly')} />
          )}
          <Paper sx={{ p: 2, mb: 2, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
            <StructureAndFieldToolbar
              availableTabs={cropStructureTabs}
              structureId={structureId}
              onStructureChange={setStructureId}
              pickerFields={pickerFields}
              fieldId={fieldFilterId}
              onFieldChange={setFieldFilterId}
            />
            {nurseries.length > 0 && (
              <Stack direction="row" spacing={0.5} alignItems="center">
                <NurseryIcon fontSize="small" color="success" />
                <Typography variant="body2" color="text.secondary">
                  Nursery: {nurseries.map((n) => n.name).join(', ')}
                </Typography>
              </Stack>
            )}
            {!plantingReadOnly && (
              <Chip
                label="Set Nursery"
                size="small"
                variant="outlined"
                icon={<NurseryIcon />}
                onClick={() => setNurseryDialogOpen(true)}
                sx={{ cursor: 'pointer' }}
              />
            )}
            <Box sx={{ flexGrow: 1 }} />
            <DeleteSelectedButton
              count={plantingSelection.size}
              onClick={() => removePRowsByKeys([...plantingSelection.selectedIds])}
              disabled={plantingReadOnly}
            />
            <Chip label={`${pRows.filter((r) => !r._isNew).length} records`} variant="outlined" size="small" />
            {dirtyCount > 0 && (
              <Chip label={`${dirtyCount} unsaved`} size="small" color="warning" />
            )}
            <ExportButton label="Export to Excel" onClick={handleExportPlanting} />
            <Button variant="outlined" startIcon={<FileUpload />} onClick={() => setPlantingImporterOpen(true)} disabled={plantingReadOnly}>
              Import Excel
            </Button>
            <Button variant="outlined" startIcon={<AddCircleOutline />} onClick={addPRow} disabled={plantingReadOnly}>
              Add Row
            </Button>
            <Button variant="contained" startIcon={<SaveIcon />} onClick={savePlantingRecords}
              disabled={pSaving || dirtyCount === 0 || plantingReadOnly}>
              {pSaving ? <CircularProgress size={20} /> : 'Update'}
            </Button>
          </Paper>

          {plantingOverlaps.map((hit) => (
            <Alert key={hit.key} severity="warning" sx={{ mb: 1 }}>
              {formatOverlapWarning(hit.conflicts, hit.cropLabel)}
            </Alert>
          ))}

          {!pLoading && visiblePlantingRows.length === 0 && pRows.some((r) => !r._isNew) && (
            <InfoNote mode="line" severity="info" sx={{ mb: 2 }}>
              {fieldFilterId
                ? 'No planting records for this field.'
                : 'No planting records for this field type.'}
            </InfoNote>
          )}

          {pLoading ? (
            <Box sx={{ textAlign: 'center', py: 4 }}><CircularProgress /></Box>
          ) : (
            <>
            {siteFilter && (
              <Box sx={{ bgcolor: 'table.headerBg', color: 'table.headerText', px: 2, py: 1, borderRadius: '4px 4px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.8125rem' }}>
                  SEEDING / TRANSPLANTING RECORD
                </Typography>
                <Typography variant="caption" sx={{ opacity: 0.85 }}>
                  {allSites.find(s => s.id === siteFilter)?.name || ''}
                </Typography>
              </Box>
            )}
            <FitTableContainer component={Paper} variant="outlined" sx={{ overflow: 'auto', borderRadius: siteFilter ? '0 0 4px 4px' : undefined }}>
              <Table
                size="small"
                sx={[
                  excelTableSx,
                  freezeColumnsSx(nurserySowingEnabled ? PLANTING_FROZEN_WITH_SOWING : PLANTING_FROZEN_WIDTHS, GUTTER_WIDTH),
                  plantingRowSx,
                  { minWidth: 1800 },
                ]}
              >
                <TableHead>
                  <TableRow>
                    <GutterCell />
                    <SelectAllHeadCell
                      ids={visiblePlantingRows.map(({ row }) => row._key)}
                      selectedIds={plantingSelection.selectedIds}
                      onToggleAll={plantingSelection.toggleAll}
                      label="Select all planting rows"
                    />
                    {nurserySowingEnabled && (
                      <TableCell className="col-frozen-0">Sowing batch</TableCell>
                    )}
                    <TableCell className={nurserySowingEnabled ? 'col-frozen-1 col-frozen-date' : 'col-frozen-0 col-frozen-date'}>Seeding Date</TableCell>
                    <TableCell className={nurserySowingEnabled ? 'col-frozen-2' : 'col-frozen-1'}>Field ID</TableCell>
                    <TableCell className={nurserySowingEnabled ? undefined : 'col-frozen-2'}>Segment (Bay)</TableCell>
                    <TableCell>Area</TableCell>
                    <TableCell>Crop Name</TableCell>
                    <TableCell>Variety</TableCell>
                    <TableCell>Sub Class</TableCell>
                    <TableCell>Crop Type</TableCell>
                    <TableCell>Breeder</TableCell>
                    <TableCell>Lot/Batch No</TableCell>
                    <TableCell className="col-numeric">Quantity</TableCell>
                    <TableCell>UOM</TableCell>
                    <TableCell>Trays/Hec</TableCell>
                    <TableCell>Rate/Hec</TableCell>
                    <TableCell>Transplant Date</TableCell>
                    <TableCell>Authorized By</TableCell>
                    <TableCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {visiblePlantingRows.map(({ row, index: ri }, vi) => {
                    const isNurseryRow = !row.fieldId;
                    const gInfo = cropGroupInfo[vi] || { isGroupStart: true, span: 1 };
                    const showCropCells = gInfo.isGroupStart;
                    const mergedSpan = gInfo.span;
                    const mergedCellSx = mergedSpan > 1 ? {
                      verticalAlign: 'middle',
                      borderLeft: '2px solid',
                      borderLeftColor: 'primary.light',
                      bgcolor: 'action.hover',
                    } : { verticalAlign: 'middle' };
                    return (
                      <TableRow
                        key={row._key}
                        hover
                        selected={plantingSelection.selectedIds.has(row._key)}
                        className={row._dirty ? 'row-draft' : (isNurseryRow && !row._isNew ? 'row-nursery' : undefined)}
                      >
                        <GutterCell index={vi + 1} />
                        <RowSelectCell
                          id={row._key}
                          selectedIds={plantingSelection.selectedIds}
                          onToggle={plantingSelection.toggle}
                          label={`Select planting row ${vi + 1}`}
                        />

                        {nurserySowingEnabled && (
                          <TableCell className="col-frozen-0">
                            <CellSelect
                              value={row.sowingRecordId || ''}
                              onChange={(v) => applyPlantingSowingBatch(ri, v)}
                              options={[{ value: '', label: 'Manual / none' }, ...sowingBatchOptions]}
                              allowEmpty={false}
                              rowIdx={vi}
                              colIdx={0}
                              totalCols={TOTAL_COLS}
                              onAddRow={addPRow}
                              width={175}
                            />
                          </TableCell>
                        )}

                        {/* Seeding Date */}
                        <TableCell className={nurserySowingEnabled ? 'col-frozen-1 col-frozen-date' : 'col-frozen-0 col-frozen-date'}>
                          <CellInput type="date" value={row.seedingDate}
                            onChange={(v) => updatePRow(ri, 'seedingDate', v)}
                            rowIdx={vi} colIdx={0} totalCols={TOTAL_COLS} onAddRow={addPRow}
                            width={148} />
                        </TableCell>

                        {/* Field ID */}
                        <TableCell className={nurserySowingEnabled ? 'col-frozen-2' : 'col-frozen-1'}>
                          <CellSelect value={row.fieldId}
                            onChange={(v) => { updatePRow(ri, 'fieldId', v); if (!v && ri > 0) autoFillFromPrevious(ri); }}
                            options={fieldOptions} allowEmpty
                            rowIdx={vi} colIdx={1} totalCols={TOTAL_COLS} onAddRow={addPRow}
                            width={130} />
                        </TableCell>

                        {/* Segment */}
                        <TableCell className={nurserySowingEnabled ? undefined : 'col-frozen-2'}>
                          <CellInput value={row.segment}
                            onChange={(v) => updatePRow(ri, 'segment', v)}
                            placeholder="1,2,3,4"
                            rowIdx={vi} colIdx={2} totalCols={TOTAL_COLS} onAddRow={addPRow}
                            width={120} />
                        </TableCell>

                        {/* Total Area */}
                        <TableCell>
                          <CellInput value={row.totalArea}
                            onChange={(v) => updatePRow(ri, 'totalArea', v)}
                            placeholder="1 Hec"
                            rowIdx={vi} colIdx={3} totalCols={TOTAL_COLS} onAddRow={addPRow}
                            width={80} />
                        </TableCell>

                        {/* Crop columns — merged when consecutive rows share same crop info */}
                        {showCropCells && (
                          <>
                            {/* Crop — dropdown + Create New */}
                            <TableCell sx={mergedCellSx} rowSpan={mergedSpan}>
                              <CellSelect value={row.cropId}
                                onChange={(v) => {
                                  if (v === CREATE_NEW_VALUE) { openCreateDialog('crop', ri, mergedSpan); return; }
                                  for (let g = 0; g < mergedSpan; g++) { updatePRow(ri + g, 'cropId', v); updatePRow(ri + g, 'varietyId', ''); }
                                }}
                                options={[...cropOptions, { value: CREATE_NEW_VALUE, label: '+ Create New Crop' }]} allowEmpty
                                rowIdx={vi} colIdx={4} totalCols={TOTAL_COLS} onAddRow={addPRow}
                                width={140} />
                            </TableCell>
                            {/* Variety — dropdown + Create New + Rename + Reassign */}
                            <TableCell sx={mergedCellSx} rowSpan={mergedSpan}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                                <CellSelect value={row.varietyId}
                                  onChange={(v) => {
                                    if (v === CREATE_NEW_VALUE) { openCreateDialog('variety', ri, mergedSpan); return; }
                                    for (let g = 0; g < mergedSpan; g++) updatePRow(ri + g, 'varietyId', v);
                                  }}
                                  options={[...varietyOptionsForCrop(row.cropId), { value: CREATE_NEW_VALUE, label: '+ Create New Variety' }]} allowEmpty
                                  rowIdx={vi} colIdx={5} totalCols={TOTAL_COLS} onAddRow={addPRow}
                                  width={110} />
                                {row.varietyId && !plantingReadOnly && (<>
                                  <Tooltip title="Rename variety (fix typo)">
                                    <IconButton size="small" sx={{ p: 0.25 }} onClick={() => {
                                      const vName = (allVarietiesByCrop[row.cropId] || []).find(v => v.id === row.varietyId)?.name || '';
                                      setRenameDialog({ open: true, type: 'variety', id: row.varietyId, cropId: row.cropId, currentName: vName });
                                      setRenameName(vName);
                                    }}>
                                      <Edit sx={{ fontSize: 14 }} />
                                    </IconButton>
                                  </Tooltip>
                                  {siteFilter && (
                                    <Tooltip title="Reassign all rows with this variety to another">
                                      <IconButton size="small" sx={{ p: 0.25 }} onClick={() => {
                                        const vName = (allVarietiesByCrop[row.cropId] || []).find(v => v.id === row.varietyId)?.name || '';
                                        setReassignDialog({ open: true, oldVarietyId: row.varietyId, cropId: row.cropId, oldName: vName });
                                        setReassignTarget('');
                                      }}>
                                        <SwapHoriz sx={{ fontSize: 14 }} />
                                      </IconButton>
                                    </Tooltip>
                                  )}
                                </>)}
                              </Box>
                            </TableCell>
                            <TableCell sx={mergedCellSx} rowSpan={mergedSpan}>
                              <CellInput value={row.cropSubClass}
                                onChange={(v) => { for (let g = 0; g < mergedSpan; g++) updatePRow(ri + g, 'cropSubClass', v); }}
                                placeholder="Red"
                                rowIdx={vi} colIdx={6} totalCols={TOTAL_COLS} onAddRow={addPRow}
                                width={80} />
                            </TableCell>
                            <TableCell sx={mergedCellSx} rowSpan={mergedSpan}>
                              <CellInput value={row.cropType}
                                onChange={(v) => { for (let g = 0; g < mergedSpan; g++) updatePRow(ri + g, 'cropType', v); }}
                                placeholder="Annual"
                                rowIdx={vi} colIdx={7} totalCols={TOTAL_COLS} onAddRow={addPRow}
                                width={80} />
                            </TableCell>
                            {/* Breeder — dropdown + Create New */}
                            <TableCell sx={mergedCellSx} rowSpan={mergedSpan}>
                              <CellSelect value={row.breederId}
                                onChange={(v) => {
                                  if (v === CREATE_NEW_VALUE) { openCreateDialog('breeder', ri, mergedSpan); return; }
                                  const b = breeders.find((br) => br.id === v);
                                  for (let g = 0; g < mergedSpan; g++) {
                                    updatePRow(ri + g, 'breederId', v);
                                    updatePRow(ri + g, 'breeder', b?.name || '');
                                  }
                                }}
                                options={[...breederOptions, { value: CREATE_NEW_VALUE, label: '+ Create New Breeder' }]} allowEmpty
                                rowIdx={vi} colIdx={8} totalCols={TOTAL_COLS} onAddRow={addPRow}
                                width={130} />
                            </TableCell>
                            <TableCell sx={mergedCellSx} rowSpan={mergedSpan}>
                              <CellInput value={row.lotBatchNo}
                                onChange={(v) => { for (let g = 0; g < mergedSpan; g++) updatePRow(ri + g, 'lotBatchNo', v); }}
                                rowIdx={vi} colIdx={9} totalCols={TOTAL_COLS} onAddRow={addPRow}
                                width={110} />
                            </TableCell>
                            <TableCell sx={mergedCellSx} rowSpan={mergedSpan} className="col-numeric">
                              <CellInput value={row.pmQuantity}
                                onChange={(v) => { for (let g = 0; g < mergedSpan; g++) updatePRow(ri + g, 'pmQuantity', v); }}
                                type="number"
                                rowIdx={vi} colIdx={10} totalCols={TOTAL_COLS} onAddRow={addPRow}
                                width={80} />
                            </TableCell>
                            <TableCell sx={mergedCellSx} rowSpan={mergedSpan}>
                              <CellSelect value={row.uom}
                                onChange={(v) => { for (let g = 0; g < mergedSpan; g++) updatePRow(ri + g, 'uom', v); }}
                                options={UOM_OPTIONS.map((u) => ({ value: u, label: u }))}
                                rowIdx={vi} colIdx={11} totalCols={TOTAL_COLS} onAddRow={addPRow}
                                width={60} />
                            </TableCell>
                          </>
                        )}

                        {/* Trays per Hec */}
                        <TableCell>
                          <CellInput value={row.traysPerHec}
                            onChange={(v) => updatePRow(ri, 'traysPerHec', v)}
                            rowIdx={vi} colIdx={12} totalCols={TOTAL_COLS} onAddRow={addPRow}
                            width={80} />
                        </TableCell>

                        {/* Rate per Hec */}
                        <TableCell>
                          <CellInput value={row.ratePerHec}
                            onChange={(v) => updatePRow(ri, 'ratePerHec', v)}
                            rowIdx={vi} colIdx={13} totalCols={TOTAL_COLS} onAddRow={addPRow}
                            width={80} />
                        </TableCell>

                        {/* Transplant Date */}
                        <TableCell>
                          <CellInput type="date" value={row.transplantDate}
                            onChange={(v) => updatePRow(ri, 'transplantDate', v)}
                            rowIdx={vi} colIdx={14} totalCols={TOTAL_COLS} onAddRow={addPRow}
                            width={148} />
                        </TableCell>

                        {/* Authorized By */}
                        <TableCell>
                          <CellInput value={row.authorizedBy}
                            onChange={(v) => updatePRow(ri, 'authorizedBy', v)}
                            rowIdx={vi} colIdx={15} totalCols={TOTAL_COLS} onAddRow={addPRow}
                            width={100} />
                        </TableCell>

                        {/* Actions */}
                        <TableCell>
                          {!plantingReadOnly && (
                            <Tooltip title="Delete row">
                              <IconButton size="small" color="error" onClick={() => removePRow(ri)}>
                                <Delete fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </FitTableContainer>
            </>
          )}

          {/* Create New Crop / Variety / Breeder Dialog */}
          <Dialog open={createDialog.open} onClose={() => setCreateDialog({ open: false, type: '', rowIdx: -1, groupSpan: 1 })} maxWidth="xs" fullWidth>
            <DialogTitle>
              {createDialog.type === 'crop' && 'Create New Crop'}
              {createDialog.type === 'variety' && 'Create New Variety'}
              {createDialog.type === 'breeder' && 'Create New Breeder'}
            </DialogTitle>
            <DialogContent dividers>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {createDialog.type === 'crop' && 'This crop will be available in all dropdowns across the app.'}
                {createDialog.type === 'variety' && 'This variety will be linked to the selected crop.'}
                {createDialog.type === 'breeder' && 'This breeder/seed company will be available for all planting records.'}
              </Typography>
              <TextField
                autoFocus fullWidth size="small"
                label={createDialog.type === 'crop' ? 'Crop Name' : createDialog.type === 'variety' ? 'Variety Name' : 'Breeder Name'}
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
                placeholder={createDialog.type === 'crop' ? 'e.g. Cherry Tomato' : createDialog.type === 'variety' ? 'e.g. Duckvine F1' : 'e.g. Enza Zaden'}
              />
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setCreateDialog({ open: false, type: '', rowIdx: -1, groupSpan: 1 })}>Cancel</Button>
              <Button variant="contained" onClick={handleCreate} disabled={creating || !createName.trim()}>
                {creating ? <CircularProgress size={20} /> : 'Create'}
              </Button>
            </DialogActions>
          </Dialog>

          {/* Rename Dialog */}
          <Dialog open={renameDialog.open} onClose={() => setRenameDialog({ open: false, type: '', id: '', cropId: '', currentName: '' })} maxWidth="xs" fullWidth>
            <DialogTitle>Rename {renameDialog.type === 'variety' ? 'Variety' : 'Crop'}</DialogTitle>
            <DialogContent dividers>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Renaming will update this {renameDialog.type} everywhere it appears (spray records, harvest, planting, etc.)
              </Typography>
              <TextField
                autoFocus fullWidth size="small"
                label="New Name"
                value={renameName}
                onChange={(e) => setRenameName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); }}
              />
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setRenameDialog({ open: false, type: '', id: '', cropId: '', currentName: '' })}>Cancel</Button>
              <Button variant="contained" onClick={handleRename} disabled={!renameName.trim() || renameName.trim() === renameDialog.currentName}>
                Rename
              </Button>
            </DialogActions>
          </Dialog>

          {/* Reassign Variety Dialog */}
          <Dialog open={reassignDialog.open} onClose={() => setReassignDialog({ open: false, oldVarietyId: '', cropId: '', oldName: '' })} maxWidth="xs" fullWidth>
            <DialogTitle>Reassign Variety</DialogTitle>
            <DialogContent dividers>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                All planting records currently assigned to <strong>{reassignDialog.oldName}</strong> in this site will be moved to the selected variety.
              </Typography>
              <FormControl fullWidth size="small">
                <InputLabel id="crophistory-target-variety-label-1">Target Variety</InputLabel>
                <Select labelId="crophistory-target-variety-label-1" value={reassignTarget} onChange={(e) => setReassignTarget(e.target.value)} label="Target Variety">
                  {(allVarietiesByCrop[reassignDialog.cropId] || [])
                    .filter(v => v.id !== reassignDialog.oldVarietyId)
                    .map(v => <MenuItem key={v.id} value={v.id}>{v.name}</MenuItem>)}
                </Select>
              </FormControl>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setReassignDialog({ open: false, oldVarietyId: '', cropId: '', oldName: '' })}>Cancel</Button>
              <Button variant="contained" color="warning" onClick={handleReassign} disabled={!reassignTarget}>
                Reassign All
              </Button>
            </DialogActions>
          </Dialog>

          {/* Nursery Dialog */}
          <Dialog open={nurseryDialogOpen} onClose={() => setNurseryDialogOpen(false)} maxWidth="xs" fullWidth>
            <DialogTitle>Designate Nursery Home</DialogTitle>
            <DialogContent dividers>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Select a greenhouse/field to mark as a nursery home. Nursery-seeded rows (no Field ID) are tracked
                separately from transplant rows.
              </Typography>
              {nurseries.length > 0 && (
                <Alert severity="success" sx={{ mb: 2 }}>
                  Current nurseries: <strong>{nurseries.map((n) => n.name).join(', ')}</strong>
                </Alert>
              )}
              <FormControl size="small" fullWidth>
                <InputLabel id="crophistory-field-label-2">Field</InputLabel>
                <Select labelId="crophistory-field-label-2" value={nurseryField} label="Field"
                  onChange={(e) => setNurseryField(e.target.value)}>
                  {filteredFields.map((f) => (
                    <MenuItem key={f.id} value={f.id}>
                      {f.name} ({f.farmAreaName})
                      {nurseries.some((n) => n.id === f.id) ? ' ★ Nursery' : ''}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setNurseryDialogOpen(false)}>Cancel</Button>
              <Button variant="contained" onClick={toggleNursery} disabled={!nurseryField}>
                {nurseries.some((n) => n.id === nurseryField) ? 'Remove Nursery' : 'Set as Nursery'}
              </Button>
            </DialogActions>
          </Dialog>
        </CellReadOnlyContext.Provider>
      )}

      {/* ─── GERMINATION RECORD ─── */}
      {activeTabKey === 'germination' && (
        <GerminationRecord siteFilter={siteFilter} />
      )}

      {activeTabKey === 'nursery-sowing' && (
        <NurserySowingRecord
          siteFilter={siteFilter}
          crops={crops}
          allVarietiesByCrop={allVarietiesByCrop}
          breeders={breeders}
          onStartTransplant={handleStartTransplant}
        />
      )}

      {activeTabKey === 'plantation-workbook' && (
        <PlantationWorkbook
          siteFilter={siteFilter}
          siteMeta={allSites.find((s) => s.id === siteFilter) || null}
          fields={filteredFields}
          pickerFields={pickerFields}
          fieldFilterId={fieldFilterId}
          structureFieldIds={structureFieldIds}
          structureToolbar={(
            <StructureAndFieldToolbar
              availableTabs={cropStructureTabs}
              structureId={structureId}
              onStructureChange={setStructureId}
              pickerFields={pickerFields}
              fieldId={fieldFilterId}
              onFieldChange={setFieldFilterId}
            />
          )}
          crops={crops}
          allVarietiesByCrop={allVarietiesByCrop}
          setAllVarietiesByCrop={setAllVarietiesByCrop}
          refreshMaster={refreshMaster}
        />
      )}

      <PlantingImporter
        open={plantingImporterOpen}
        onClose={() => setPlantingImporterOpen(false)}
        fields={pickerFields}
        crops={crops}
        allVarietiesByCrop={allVarietiesByCrop}
        breeders={breeders}
        siteId={siteFilter}
        existingRecords={pRows.filter(r => !r._isNew)}
        nurserySowingBatches={nurserySowingEnabled ? nurserySowingBatches : []}
        onImportComplete={() => { loadPlantingRecords(); bumpRotationReload(); reloadOccupancy(); }}
      />
    </Box>
  );
}
