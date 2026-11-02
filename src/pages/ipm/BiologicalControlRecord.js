import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Box, Typography, Button, IconButton, TextField, Alert, Skeleton,
  Dialog, DialogTitle, DialogContent, DialogActions, Grid,
  Autocomplete, Tooltip, ToggleButtonGroup, ToggleButton,
  Select, MenuItem, FormControl, InputLabel, CircularProgress,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  Tabs, Tab, Chip, Checkbox,
} from '@mui/material';
import {
  AddOutlined as AddIcon,
  UploadFileOutlined as UploadIcon,
  SaveOutlined as SaveIcon,
  DeleteOutlined as DeleteIcon,
  SummarizeOutlined as SummaryIcon,
  TableChartOutlined as SpreadsheetIcon,
  InventoryOutlined as CatalogIcon,
  EditOutlined as EditIcon,
  CheckOutlined as CheckIcon,
  CloseOutlined as CancelIcon,
  ContentCopyOutlined as CopyIcon,
  HomeOutlined as MySiteIcon,
  PublicOutlined as BrowseIcon,
  FileDownloadOutlined as DownloadIcon,
  TaskAltOutlined as ApproveIcon,
  UndoOutlined as RejectIcon,
} from '@mui/icons-material';
import * as XLSX from 'xlsx';
import { useActiveSite } from '../../contexts/ActiveSiteContext';
import { useActiveSeason } from '../../contexts/ActiveSeasonContext';
import { useNotification } from '../../contexts/NotificationContext';
import { useAuth } from '../../contexts/AuthContext';
import ReadOnlyBanner from '../../components/ReadOnlyBanner';
import { seasonListDateRange } from '../../utils/seasonListDates';
import { apiRequest } from '../../utils/api';
import { useMasterData } from '../../utils/useMasterData';
import { DeleteSelectedButton, RowCheckbox, RowSelectCell, SelectAllCheckbox, SelectAllHeadCell, deleteIdsSequentially } from '../../components/table/BulkSelect';
import { useRowSelection } from '../../hooks/useRowSelection';
import useOpsExcelExport from '../../hooks/useOpsExcelExport';
import { OPS_EXPORT } from '../../utils/companyExcelExport';
import { bioExportFilename, buildBioExportSheets } from '../../utils/bioControlExcelExport';
import {
  canImportBio,
  canManageBio,
  canProposeBioCells,
  canRequestBioDelete,
} from '../../utils/ipmAccess';
import { ENTITY_BIO_FIELD_SETUP } from '../../utils/changeRequestAccess';
import {
  buildServerCellMap,
  cellKey,
  countedCellValue,
  diffBioCells,
  editableBase,
  pendingCellKeys,
} from '../../utils/bioCellDiff';
import {
  DEFAULT_NEW_WEEK_COUNT,
  MAX_BIO_WEEKS,
  defaultNewStartDate,
  defaultNewStartDateForSeason,
  formatIsoDate,
  mondayOf,
  programDateSpan,
  toDateInputValue,
  weekOverlapsRange,
  weekToDateRange,
  weeksFromCount,
  formatPackCost,
  packCost,
  resolvedSitePrice,
} from '../../utils/bioControlWeeks';

function UomPicker({ options, value, onChange, label = 'UOM', variant = 'outlined', sx }) {
  const selected = typeof value === 'object' && value
    ? value
    : options.find((o) => o.name.toLowerCase() === String(value || '').toLowerCase()) || value || null;
  return (
    <Autocomplete
      freeSolo
      options={options}
      getOptionLabel={(o) => (typeof o === 'string' ? o : o?.name || '')}
      isOptionEqualToValue={(a, b) => (
        a?.id && b?.id
          ? a.id === b.id
          : String(a?.name || a).toLowerCase() === String(b?.name || b).toLowerCase()
      )}
      value={selected}
      onChange={(_, v) => onChange(v)}
      onInputChange={(_, v, reason) => {
        if (reason === 'input') onChange(v);
      }}
      renderInput={(params) => (
        <TextField {...params} label={label} size="small" variant={variant} placeholder="sachets, ml, or new" sx={sx} />
      )}
    />
  );
}

const cellBorder = '1px solid #c8c8c8';
const headerBg = '#e8efd4';
const subHeaderBg = '#f3f6ec';
const frozenBg = '#fafcf6';
const focusBg = '#d4e5f7';
const altRowBg = '#fafcf7';
const totalRowBg = '#e2e8d5';
const costRowBg = '#d9e4cc';
const tabActiveBg = '#ffffff';
const tabInactiveBg = '#e0e0e0';

const headerCellStyle = {
  border: cellBorder,
  padding: '2px 4px',
  fontSize: '0.75rem',
  lineHeight: 1.2,
  height: 28,
  background: headerBg,
  fontWeight: 700,
  textAlign: 'center',
  whiteSpace: 'nowrap',
};

function summaryBodyCell(index, align = 'right') {
  return {
    border: cellBorder,
    padding: '2px 6px',
    fontSize: '0.75rem',
    textAlign: align,
    background: index % 2 === 0 ? altRowBg : 'transparent',
  };
}

function sumFinite(rows, key) {
  return rows.reduce((sum, row) => {
    const value = parseFloat(row[key]);
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);
}

const inputStyle = {
  width: '100%',
  border: 'none',
  outline: 'none',
  padding: '2px 3px',
  fontSize: '0.75rem',
  textAlign: 'right',
  background: 'transparent',
  height: '100%',
  boxSizing: 'border-box',
};

// Pending (waiting for the pest agronomist) and rejected cell markers.
const pendingCellBg = '#fff3cd';
const pendingText = '#8a6d00';
const rejectedMark = '#d32f2f';
const dirtyCellBg = '#e3f2fd';

function fmtCellNum(value) {
  return value == null ? '—' : String(value);
}

function fmtWhen(value) {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString();
}

function CellStatusTooltip({ cell, canReview, onApprove, onReject }) {
  return (
    <Box sx={{ fontSize: '0.72rem', lineHeight: 1.5, maxWidth: 260 }}>
      <div>Approved: per m² {fmtCellNum(cell.perM2)} · units {fmtCellNum(cell.units)}</div>
      {cell.hasPending && (
        <div style={{ marginTop: 4 }}>
          <strong>Waiting for approval:</strong>{' '}
          {cell.pendingClear
            ? 'remove this value'
            : `per m² ${fmtCellNum(cell.pendingPerM2)} · units ${fmtCellNum(cell.pendingUnits)}`}
          <div>by {cell.pendingByName || 'unknown'}{cell.pendingAt ? `, ${fmtWhen(cell.pendingAt)}` : ''}</div>
        </div>
      )}
      {cell.rejectedReason && (
        <div style={{ marginTop: 4 }}>
          <strong>Rejected</strong>
          {cell.rejectedByName ? ` by ${cell.rejectedByName}` : ''}
          {cell.rejectedAt ? `, ${fmtWhen(cell.rejectedAt)}` : ''}: {cell.rejectedReason}
          <div>Enter the value again to send a corrected one.</div>
        </div>
      )}
      {canReview && cell.hasPending && (
        <Box sx={{ display: 'flex', gap: 0.5, mt: 1 }}>
          <Button size="small" variant="contained" color="success" onClick={onApprove}
            sx={{ fontSize: '0.7rem', py: 0, textTransform: 'none' }}>Approve</Button>
          <Button size="small" variant="contained" color="error" onClick={onReject}
            sx={{ fontSize: '0.7rem', py: 0, textTransform: 'none' }}>Reject…</Button>
        </Box>
      )}
    </Box>
  );
}

export default function BiologicalControlRecord() {
  const notify = useNotification();
  const { activeSiteId } = useActiveSite();
  const { user } = useAuth();
  const { data: masterData } = useMasterData();
  const { activeSeasonId, activeSeason, isSeasonReadOnly, isLoaded: seasonLoaded } = useActiveSeason();
  // Who may do what (the API enforces the same rules):
  //  - bio manager (pest agronomist / IPM admin): everything, live values, approvals
  //  - scouter: weekly cells only, saved as pending
  //  - worker: Excel import (pending) and "request delete" on a table
  //  - everyone else: view only
  // A closed season locks every write.
  const isBioManager = canManageBio(user);
  const cellMode = isBioManager ? 'manager' : 'proposer';
  const canEditSetup = isBioManager && !isSeasonReadOnly;
  const canEditCells = !isSeasonReadOnly && (isBioManager || canProposeBioCells(user));
  const canImportNow = !isSeasonReadOnly && canImportBio(user);
  const canRequestDeleteNow = !isSeasonReadOnly && canRequestBioDelete(user);
  const viewOnlyRole = !isBioManager && !canProposeBioCells(user) && !canImportBio(user) && !canRequestBioDelete(user);
  const seasonBounds = useMemo(() => seasonListDateRange(activeSeason), [activeSeason]);
  const seasonReady = Boolean(seasonLoaded && activeSeasonId);

  const [crops, setCrops] = useState([]);
  const [selectedCropId, setSelectedCropId] = useState('');
  const [fieldSetups, setFieldSetups] = useState([]);
  const [selectedFieldTab, setSelectedFieldTab] = useState(0);
  const [viewMode, setViewMode] = useState('spreadsheet');

  const [setup, setSetup] = useState(null);
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const filterInitKey = useRef('');
  const [products, setProducts] = useState([]);
  // serverCells: what the API returned (approved + pending + rejection per cell).
  // drafts: only the cells typed since the last load; Save sends just those that changed.
  const [serverCells, setServerCells] = useState({});
  const [drafts, setDrafts] = useState({});
  const [loadingData, setLoadingData] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [rejectDialog, setRejectDialog] = useState({ open: false, cells: null, reason: '' });
  const [deleteRequest, setDeleteRequest] = useState({ open: false, setupId: null, name: '', reason: '', sending: false });
  const changedCells = useMemo(() => diffBioCells(serverCells, drafts, cellMode), [serverCells, drafts, cellMode]);
  const hasUnsavedChanges = changedCells.length > 0;
  const dirtyKeys = useMemo(
    () => new Set(changedCells.map((c) => cellKey(c.productColumnId, c.weekNumber))),
    [changedCells],
  );
  const pendingKeys = useMemo(() => pendingCellKeys(serverCells), [serverCells]);

  const [setupDialogOpen, setSetupDialogOpen] = useState(false);
  const [setupForm, setSetupForm] = useState({ fieldId: '', cropId: '', surfaceM2: '', plantsPerM2: '', numberOfPlants: '', startDate: defaultNewStartDate() });
  const [newProductCatalogId, setNewProductCatalogId] = useState(null);

  const [addProductOpen, setAddProductOpen] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogResults, setCatalogResults] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  const [newProductCode, setNewProductCode] = useState('');
  const [newProductPerPkg, setNewProductPerPkg] = useState('');
  const [newProductPrice, setNewProductPrice] = useState('');
  const [newProductUom, setNewProductUom] = useState(null);
  const [uomOptions, setUomOptions] = useState([]);

  const [importOpen, setImportOpen] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportSelected, setExportSelected] = useState(new Set());
  const exportOpsExcel = useOpsExcelExport();

  const [summaryData, setSummaryData] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState('');
  const summaryRequestId = useRef(0);

  const fieldSetupSelection = useRowSelection();
  const catalogSelection = useRowSelection();
  const [catalogItems, setCatalogItems] = useState([]);
  const [catalogBrowseItems, setCatalogBrowseItems] = useState([]);
  const [catalogFilter, setCatalogFilter] = useState('');
  const [catalogEditId, setCatalogEditId] = useState(null);
  const [catalogEditData, setCatalogEditData] = useState({});
  const [catalogNewRow, setCatalogNewRow] = useState(null);
  const [catalogSaving, setCatalogSaving] = useState(false);
  const [catalogTab, setCatalogTab] = useState(0);
  const [catalogBrowseSelected, setCatalogBrowseSelected] = useState(new Set());

  const [editingMeta, setEditingMeta] = useState(null);
  const metaInputRef = useRef(null);

  const allFields = useMemo(() => {
    if (!masterData?.countries) return [];
    const fields = [];
    for (const c of masterData.countries) {
      for (const s of c.sites || []) {
        if (activeSiteId && s.id !== activeSiteId) continue;
        for (const fa of s.farmAreas || []) {
          for (const f of fa.fields || []) {
            fields.push({ id: f.id, name: f.name, farmArea: fa.name, siteId: s.id, currentCropId: f.currentCropId || null });
          }
        }
      }
    }
    return fields;
  }, [masterData, activeSiteId]);

  const allCrops = useMemo(() => {
    if (!masterData?.crops) return [];
    return masterData.crops;
  }, [masterData]);

  const loadCrops = useCallback(async () => {
    if (!activeSeasonId) { setCrops([]); return; }
    try {
      const siteParam = activeSiteId ? `&site_id=${activeSiteId}` : '';
      const data = await apiRequest(`/bio-records/crops?season_id=${activeSeasonId}${siteParam}`);
      setCrops(data);
      if (data.length > 0 && !selectedCropId) {
        setSelectedCropId(data[0].id);
      }
    } catch (err) {
      setCrops([]);
      notify.error(err.message || 'Failed to load crops');
    }
  }, [activeSeasonId, selectedCropId, activeSiteId, notify]);

  const loadFieldSetups = useCallback(async () => {
    if (!selectedCropId || !activeSeasonId) { setFieldSetups([]); return; }
    try {
      const siteParam = activeSiteId ? `&site_id=${activeSiteId}` : '';
      const data = await apiRequest(`/bio-records/fields/${selectedCropId}?season_id=${activeSeasonId}${siteParam}`);
      setFieldSetups(data);
      setSelectedFieldTab((prev) => (prev < data.length ? prev : 0));
    } catch (err) {
      setFieldSetups([]);
      notify.error(err.message || 'Failed to load field setups');
    }
  }, [selectedCropId, activeSeasonId, activeSiteId, notify]);

  const loadFieldData = useCallback(async () => {
    if (fieldSetups.length === 0 || selectedFieldTab >= fieldSetups.length) {
      setSetup(null); setProducts([]); setServerCells({}); setDrafts({});
      return;
    }
    const setupId = fieldSetups[selectedFieldTab]?.id;
    if (!setupId) return;
    setLoadingData(true);
    try {
      const data = await apiRequest(`/bio-records/field-setup/${setupId}`);
      setSetup(data.setup);
      setProducts(data.products);
      setServerCells(buildServerCellMap(data.entries));
      setDrafts({});
    } catch (err) {
      notify.error('Failed to load field data');
    } finally {
      setLoadingData(false);
    }
  }, [fieldSetups, selectedFieldTab, notify]);

  useEffect(() => {
    setSelectedCropId('');
    setCrops([]);
    setFieldSetups([]);
    setSetup(null);
    setProducts([]);
    setServerCells({});
    setDrafts({});
  }, [activeSeasonId]);

  useEffect(() => { if (seasonReady) loadCrops(); }, [loadCrops, seasonReady]);
  useEffect(() => { if (seasonReady) loadFieldSetups(); }, [loadFieldSetups, seasonReady]);
  useEffect(() => { if (viewMode === 'spreadsheet') loadFieldData(); }, [loadFieldData, viewMode]);

  useEffect(() => {
    if (viewMode !== 'summary' || !selectedCropId || !activeSeasonId) return;
    const requestId = ++summaryRequestId.current;
    setSummaryLoading(true);
    setSummaryError('');
    setSummaryData(null);
    const siteParam = activeSiteId ? `&site_id=${activeSiteId}` : '';
    apiRequest(`/bio-records/summary/${selectedCropId}?season_id=${activeSeasonId}${siteParam}`)
      .then((d) => {
        if (requestId !== summaryRequestId.current) return;
        setSummaryData(d);
      })
      .catch((err) => {
        if (requestId !== summaryRequestId.current) return;
        setSummaryData(null);
        setSummaryError(err.message || 'Failed to load summary');
      })
      .finally(() => {
        if (requestId !== summaryRequestId.current) return;
        setSummaryLoading(false);
      });
  }, [viewMode, selectedCropId, activeSeasonId, activeSiteId]);

  const summaryFields = summaryData?.fields || [];
  const summaryProducts = summaryData?.productTotals || [];
  const summaryFieldCost = useMemo(
    () => sumFinite(summaryData?.fields || [], 'total_cost'),
    [summaryData],
  );
  const summaryFieldUnits = useMemo(
    () => sumFinite(summaryData?.fields || [], 'total_units'),
    [summaryData],
  );
  const summaryProductPerM2 = useMemo(
    () => sumFinite(summaryData?.productTotals || [], 'total_per_m2'),
    [summaryData],
  );
  const summaryProductUnits = useMemo(
    () => sumFinite(summaryData?.productTotals || [], 'total_units'),
    [summaryData],
  );
  const summaryProductCost = useMemo(
    () => sumFinite(summaryData?.productTotals || [], 'total_cost'),
    [summaryData],
  );

  const loadCatalog = useCallback(async () => {
    try {
      if (activeSiteId) {
        const data = await apiRequest(`/bio-records/catalog/site/${activeSiteId}`);
        setCatalogItems(data);
        return data;
      }
      const data = await apiRequest('/bio-records/catalog?all=true');
      setCatalogItems(data);
      return data;
    } catch (err) {
      setCatalogItems([]);
      notify.error(err.message || 'Failed to load catalog');
      return [];
    }
  }, [activeSiteId, notify]);

  const loadUom = useCallback(async () => {
    try {
      const data = await apiRequest('/bio-records/uom');
      setUomOptions(data || []);
      return data || [];
    } catch {
      setUomOptions([]);
      return [];
    }
  }, []);

  const resolveUomId = useCallback(async (value) => {
    if (!value) return null;
    if (typeof value === 'object' && value.id) return value.id;
    const name = String(value).trim();
    if (!name) return null;
    const existing = uomOptions.find((u) => u.name.toLowerCase() === name.toLowerCase());
    if (existing) return existing.id;
    const created = await apiRequest('/bio-records/uom', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
    if (created) {
      setUomOptions((prev) => (prev.some((u) => u.id === created.id) ? prev : [...prev, created]));
      return created.id;
    }
    return null;
  }, [uomOptions]);

  const loadCatalogBrowse = useCallback(async () => {
    try {
      const data = await apiRequest('/bio-records/catalog/browse');
      setCatalogBrowseItems(data);
    } catch (err) {
      setCatalogBrowseItems([]);
      notify.error(err.message || 'Failed to load browse catalog');
    }
  }, [notify]);

  const syncCatalogFromFields = useCallback(async () => {
    setCatalogSaving(true);
    try {
      const result = await apiRequest('/bio-records/catalog/sync-from-fields', { method: 'POST' });
      if (result.synced > 0) {
        notify.success(`Synced ${result.synced} products from existing records`);
        await loadCatalog();
      } else {
        notify.info('No products found in existing field records to sync');
      }
    } catch (err) {
      notify.error(err.message || 'Sync failed');
    } finally {
      setCatalogSaving(false);
    }
  }, [loadCatalog, notify]);

  useEffect(() => {
    if (viewMode === 'catalog' || addProductOpen) loadUom();
  }, [viewMode, addProductOpen, loadUom]);

  useEffect(() => {
    if (viewMode === 'catalog') {
      loadCatalog().then(items => {
        if (items.length === 0 && !activeSiteId && canEditSetup) syncCatalogFromFields();
      });
      if (catalogTab === 1) loadCatalogBrowse();
    }
  }, [viewMode, loadCatalog, syncCatalogFromFields, activeSiteId, catalogTab, loadCatalogBrowse, canEditSetup]);

  const handleCatalogSave = async (id, updates) => {
    setCatalogSaving(true);
    try {
      if (activeSiteId && updates.pricePerPackage !== undefined) {
        await apiRequest(`/bio-records/catalog/site/${activeSiteId}/${id}`, {
          method: 'PUT',
          body: JSON.stringify({ pricePerPackage: parseFloat(updates.pricePerPackage) || null }),
        });
      }
      const masterUpdates = {};
      if (updates.itemCode !== undefined) masterUpdates.itemCode = updates.itemCode;
      if (updates.itemName !== undefined) masterUpdates.itemName = updates.itemName;
      if (updates.perPackage !== undefined) masterUpdates.perPackage = updates.perPackage;
      if (updates.uomId !== undefined) masterUpdates.uomId = updates.uomId;
      if (Object.keys(masterUpdates).length > 0) {
        await apiRequest(`/bio-records/catalog/${id}`, {
          method: 'PUT',
          body: JSON.stringify(masterUpdates),
        });
      }
      await loadCatalog();
      setCatalogEditId(null);
      setCatalogEditData({});
    } catch (err) {
      notify.error(err.message || 'Failed to save');
    } finally {
      setCatalogSaving(false);
    }
  };

  const handleCatalogAdd = async () => {
    if (!catalogNewRow?.itemCode?.trim() || !catalogNewRow?.itemName?.trim()) {
      notify.warning('Item code and name are required');
      return;
    }
    setCatalogSaving(true);
    try {
      const result = await apiRequest('/bio-records/catalog/single', {
        method: 'POST',
        body: JSON.stringify({
          itemCode: catalogNewRow.itemCode.trim(),
          itemName: catalogNewRow.itemName.trim(),
          perPackage: parseInt(catalogNewRow.perPackage) || null,
          pricePerPackage: parseFloat(catalogNewRow.pricePerPackage) || null,
          uomId: await resolveUomId(catalogNewRow.uom),
        }),
      });
      if (activeSiteId && result?.id) {
        await apiRequest(`/bio-records/catalog/site/${activeSiteId}/assign`, {
          method: 'POST',
          body: JSON.stringify({
            productIds: [result.id],
            pricePerPackage: parseFloat(catalogNewRow.pricePerPackage) || null,
          }),
        });
      }
      await loadCatalog();
      setCatalogNewRow(null);
      notify.success('Product added');
    } catch (err) {
      notify.error(err.message || 'Failed to add');
    } finally {
      setCatalogSaving(false);
    }
  };

  const deleteCatalogItem = async (id) => {
    if (activeSiteId) {
      await apiRequest(`/bio-records/catalog/site/${activeSiteId}/${id}`, { method: 'DELETE' });
    } else {
      await apiRequest(`/bio-records/catalog/${id}`, { method: 'DELETE' });
    }
  };

  const handleCatalogDelete = async (id, name) => {
    if (!window.confirm(`Remove "${name}" from this site's catalog?`)) return;
    try {
      await deleteCatalogItem(id);
      setCatalogItems(prev => prev.filter(p => p.id !== id));
      notify.success('Removed');
    } catch (err) {
      notify.error(err.message || 'Failed to remove');
    }
  };

  const handleBulkCatalogDelete = async () => {
    const ids = [...catalogSelection.selectedIds];
    if (!ids.length) return;
    if (!window.confirm(`Remove ${ids.length} selected catalog product(s) from this site?`)) return;
    const deleted = await deleteIdsSequentially(ids, deleteCatalogItem);
    catalogSelection.clear();
    await loadCatalog();
    notify.success(`Removed ${deleted} product(s)`);
  };

  const handleCatalogCopyToSite = async (productIds) => {
    if (!activeSiteId) { notify.error('Select a site first'); return; }
    const ids = Array.isArray(productIds) ? productIds : [productIds];
    setCatalogSaving(true);
    try {
      await apiRequest(`/bio-records/catalog/site/${activeSiteId}/assign`, {
        method: 'POST',
        body: JSON.stringify({ productIds: ids }),
      });
      notify.success(`${ids.length} product${ids.length !== 1 ? 's' : ''} copied to your site`);
      setCatalogBrowseSelected(new Set());
      await loadCatalog();
      await loadCatalogBrowse();
    } catch (err) {
      notify.error(err.message || 'Failed to copy');
    } finally {
      setCatalogSaving(false);
    }
  };

  const filteredCatalog = useMemo(() => {
    if (!catalogFilter.trim()) return catalogItems;
    const q = catalogFilter.toLowerCase();
    return catalogItems.filter(p =>
      (p.item_code || '').toLowerCase().includes(q) ||
      (p.item_name || '').toLowerCase().includes(q)
    );
  }, [catalogItems, catalogFilter]);

  const mySiteProductIds = useMemo(() => new Set(catalogItems.map(p => p.id)), [catalogItems]);

  const filteredBrowseCatalog = useMemo(() => {
    if (!catalogFilter.trim()) return catalogBrowseItems;
    const q = catalogFilter.toLowerCase();
    return catalogBrowseItems.filter(p =>
      (p.item_code || '').toLowerCase().includes(q) ||
      (p.item_name || '').toLowerCase().includes(q)
    );
  }, [catalogBrowseItems, catalogFilter]);

  const browseSelectableIds = useMemo(() =>
    filteredBrowseCatalog.filter(p => !mySiteProductIds.has(p.id)).map(p => p.id),
    [filteredBrowseCatalog, mySiteProductIds],
  );

  // Input value: the typed draft if any, else the approved value (manager / viewers)
  // or the pending proposal (scouter).
  const getCellValue = (productId, week, field) => {
    const key = cellKey(productId, week);
    const draft = drafts[key];
    if (draft && Object.prototype.hasOwnProperty.call(draft, field)) return draft[field] ?? '';
    return editableBase(serverCells[key], canEditCells ? cellMode : 'manager')[field] ?? '';
  };

  const setCellValue = useCallback((productId, week, field, value) => {
    if (!canEditCells) return;
    const key = cellKey(productId, week);
    setDrafts((prev) => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
  }, [canEditCells]);

  // Reload the tables (pending counts) and, through them, the open table's cells.
  const reloadAfterWrite = async () => {
    await loadFieldSetups();
  };

  const handleSave = async () => {
    if (!setup || !canEditCells) return;
    if (!changedCells.length) {
      notify.info('No changes to save');
      return;
    }
    setSaving(true);
    try {
      const result = await apiRequest('/bio-records/entries/bulk', {
        method: 'PUT',
        body: JSON.stringify({ fieldSetupId: setup.id, entries: changedCells }),
      });
      setDrafts({});
      if (isBioManager) {
        notify.success('Saved');
      } else {
        notify.success(result?.pending
          ? `Saved — ${result.pending} value${result.pending === 1 ? '' : 's'} waiting for the pest agronomist's approval`
          : 'Saved');
      }
      await reloadAfterWrite();
    } catch (err) {
      notify.error(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const reviewCells = async (decision, cells, reason) => {
    if (!setup || !canEditSetup) return false;
    if (hasUnsavedChanges && !window.confirm('You have unsaved changes on this table. Continue without saving them?')) {
      return false;
    }
    setReviewing(true);
    try {
      const result = await apiRequest(`/bio-records/entries/${decision}`, {
        method: 'POST',
        body: JSON.stringify({
          fieldSetupId: setup.id,
          ...(cells ? { cells } : {}),
          ...(decision === 'reject' ? { reason } : {}),
        }),
      });
      const n = decision === 'approve' ? result?.approved : result?.rejected;
      notify.success(`${decision === 'approve' ? 'Approved' : 'Rejected'} ${n ?? 0} value${n === 1 ? '' : 's'}`);
      await reloadAfterWrite();
      return true;
    } catch (err) {
      notify.error(err.message || `Failed to ${decision}`);
      return false;
    } finally {
      setReviewing(false);
    }
  };

  const approveCell = (productId, week) => reviewCells('approve', [{ productColumnId: productId, weekNumber: week }]);

  const openRejectDialog = (cells) => setRejectDialog({ open: true, cells, reason: '' });

  const submitReject = async () => {
    const reason = rejectDialog.reason.trim();
    if (!reason) return;
    const ok = await reviewCells('reject', rejectDialog.cells, reason);
    if (ok) setRejectDialog({ open: false, cells: null, reason: '' });
  };

  const weekCount = setup?.week_count
    || (setup?.start_date ? DEFAULT_NEW_WEEK_COUNT : 52);
  const allWeekRows = useMemo(() => weeksFromCount(weekCount), [weekCount]);
  const week1Start = setup?.start_date
    || formatIsoDate(mondayOf(seasonBounds.startDate))
    || defaultNewStartDate();
  const week1Label = week1Start;
  const programSpan = useMemo(
    () => programDateSpan(weekCount, week1Start),
    [weekCount, week1Start],
  );

  useEffect(() => {
    const key = `${setup?.id || ''}:${programSpan.startDate}:${programSpan.endDate}`;
    if (!setup || !programSpan.startDate || filterInitKey.current === key) return;
    filterInitKey.current = key;
    setFilterFrom(programSpan.startDate);
    setFilterTo(programSpan.endDate);
  }, [setup, programSpan.startDate, programSpan.endDate]);

  const weekRows = useMemo(
    () => allWeekRows.filter((w) => weekOverlapsRange(w, week1Start, filterFrom, filterTo)),
    [allWeekRows, week1Start, filterFrom, filterTo],
  );

  const handleAddWeek = async () => {
    if (!setup || !canEditSetup || weekCount >= MAX_BIO_WEEKS || !activeSeasonId) return;
    try {
      const result = await apiRequest('/bio-records/field-setup', {
        method: 'POST',
        body: JSON.stringify({
          fieldId: setup.field_id,
          cropId: setup.crop_id,
          seasonId: activeSeasonId,
          surfaceM2: parseFloat(setup.surface_m2) || null,
          plantsPerM2: parseFloat(setup.plants_per_m2) || null,
          numberOfPlants: parseInt(setup.number_of_plants) || null,
          weekCount: weekCount + 1,
        }),
      });
      setSetup(result.setup);
    } catch (err) {
      notify.error(err.message || 'Failed to add week');
    }
  };

  // Totals and cost count APPROVED values only (plus the manager's own unsaved edits,
  // which will be saved as approved). Pending values never count.
  const productTotals = useMemo(() => {
    const totals = {};
    for (const p of products) {
      let totalPerM2 = 0, totalUnits = 0;
      for (const w of weekRows) {
        const key = cellKey(p.id, w);
        const counted = countedCellValue(serverCells[key], drafts[key], cellMode);
        totalPerM2 += counted.perM2 || 0;
        totalUnits += counted.units || 0;
      }
      const price = resolvedSitePrice(p.price_per_package);
      totals[p.id] = {
        totalPerM2,
        totalUnits,
        cost: packCost(totalUnits, price || 0),
        costLabel: formatPackCost(totalUnits, price),
        missingPrice: totalUnits > 0 && price == null,
      };
    }
    return totals;
  }, [products, serverCells, drafts, cellMode, weekRows]);

  const grandTotalCost = useMemo(
    () => Object.values(productTotals).reduce((s, t) => s + t.cost, 0),
    [productTotals],
  );

  // ── Inline metadata editing ──
  const startMetaEdit = (field, value) => {
    setEditingMeta({ field, value: value?.toString() || '' });
    setTimeout(() => metaInputRef.current?.focus(), 50);
  };

  const saveMetaEdit = async () => {
    if (!editingMeta || !setup || !canEditSetup || !activeSeasonId) return;
    const { field, value } = editingMeta;
    const numVal = parseFloat(value) || null;
    const intVal = parseInt(value) || null;
    const payload = {
      fieldId: setup.field_id,
      cropId: setup.crop_id,
      seasonId: activeSeasonId,
      surfaceM2: field === 'surface_m2' ? numVal : (parseFloat(setup.surface_m2) || null),
      plantsPerM2: field === 'plants_per_m2' ? numVal : (parseFloat(setup.plants_per_m2) || null),
      numberOfPlants: field === 'number_of_plants' ? intVal : (parseInt(setup.number_of_plants) || null),
      startDate: field === 'start_date'
        ? (formatIsoDate(mondayOf(value)) || value)
        : (toDateInputValue(setup.start_date) || undefined),
    };
    try {
      const result = await apiRequest('/bio-records/field-setup', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setSetup(result.setup);
      setEditingMeta(null);
    } catch (err) {
      notify.error(err.message || 'Failed to update');
    }
  };

  // ── Setup dialog ──
  const openSetupDialog = () => {
    setSetupForm({
      fieldId: '',
      cropId: '',
      surfaceM2: '',
      plantsPerM2: '',
      numberOfPlants: '',
      startDate: defaultNewStartDateForSeason(activeSeason),
    });
    setSetupDialogOpen(true);
  };

  const saveSetup = async () => {
    if (!setupForm.fieldId) {
      notify.warning('Please select a field');
      return;
    }
    if (!setupForm.cropId) {
      notify.warning('This field has no crop assigned in Crop Rotation. Please assign a crop first.');
      return;
    }
    if (!activeSeasonId) {
      notify.warning('Select a season first');
      return;
    }
    try {
      await apiRequest('/bio-records/field-setup', {
        method: 'POST',
        body: JSON.stringify({
          fieldId: setupForm.fieldId,
          cropId: setupForm.cropId,
          seasonId: activeSeasonId,
          surfaceM2: parseFloat(setupForm.surfaceM2) || null,
          plantsPerM2: parseFloat(setupForm.plantsPerM2) || null,
          numberOfPlants: parseInt(setupForm.numberOfPlants) || null,
          startDate: formatIsoDate(mondayOf(setupForm.startDate)) || defaultNewStartDateForSeason(activeSeason),
          weekCount: DEFAULT_NEW_WEEK_COUNT,
        }),
      });
      setSetupDialogOpen(false);
      notify.success('Field setup saved');
      await loadCrops();
      await loadFieldSetups();
    } catch (err) {
      notify.error(err.message || 'Failed to save setup');
    }
  };

  // ── Add product ──
  useEffect(() => {
    if (!addProductOpen) return;
    const timer = setTimeout(async () => {
      if (!catalogSearch.trim()) { setCatalogResults([]); return; }
      setCatalogLoading(true);
      try {
        const siteQ = activeSiteId ? `&site_id=${activeSiteId}` : '';
        const data = await apiRequest(`/bio-records/catalog?search=${encodeURIComponent(catalogSearch)}&limit=20${siteQ}`);
        setCatalogResults(data);
      } catch (err) {
        setCatalogResults([]);
        notify.error(err.message || 'Catalog search failed');
      } finally { setCatalogLoading(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [catalogSearch, addProductOpen, activeSiteId]);

  const handleAddProduct = async () => {
    if (!newProductName.trim() || !setup || !canEditSetup) return;
    try {
      const result = await apiRequest(`/bio-records/field-setup/${setup.id}/products`, {
        method: 'POST',
        body: JSON.stringify({
          productCatalogId: newProductCatalogId || null,
          itemCode: newProductCode || null,
          productName: newProductName.trim(),
          perPackage: parseInt(newProductPerPkg) || null,
          pricePerPackage: parseFloat(newProductPrice) || null,
          uomId: await resolveUomId(newProductUom),
        }),
      });
      setProducts(result.products);
      setAddProductOpen(false);
      setNewProductName(''); setNewProductCode(''); setNewProductPerPkg(''); setNewProductPrice('');
      setNewProductCatalogId(null);
      setNewProductUom(null);
      notify.success('Product added');
    } catch (err) {
      notify.error(err.message || 'Failed to add product');
    }
  };

  const handleRemoveProduct = async (productId) => {
    if (!setup || !canEditSetup) return;
    const prefix = `${productId}_`;
    const hasValues = Object.keys(serverCells).some((key) => key.startsWith(prefix));
    const product = products.find((p) => p.id === productId);
    if (hasValues && !window.confirm(
      `Remove "${product?.product_name || 'this product'}" and every value entered in its column (approved and pending)?`,
    )) return;
    try {
      const result = await apiRequest(`/bio-records/field-setup/${setup.id}/products/${productId}`, {
        method: 'DELETE',
      });
      setProducts(result.products);
      const dropColumn = (map) => Object.fromEntries(Object.entries(map).filter(([key]) => !key.startsWith(prefix)));
      setServerCells(dropColumn);
      setDrafts(dropColumn);
      notify.success('Product removed');
    } catch (err) {
      notify.error(err.message || 'Failed to remove product');
    }
  };

  // ── Delete field setup ──
  const handleDeleteFieldSetup = async (setupId, fieldName) => {
    if (!canEditSetup) {
      if (canRequestDeleteNow) setDeleteRequest({ open: true, setupId, name: fieldName, reason: '', sending: false });
      return;
    }
    if (!window.confirm(`Delete "${fieldName}" and all its data? This cannot be undone.`)) return;
    try {
      await apiRequest(`/bio-records/field-setup/${setupId}`, { method: 'DELETE' });
      notify.success(`"${fieldName}" deleted`);
      await loadCrops();
      await loadFieldSetups();
    } catch (err) {
      notify.error(err.message || 'Failed to delete');
    }
  };

  // Scouter / worker: ask the pest agronomist to delete a table (change request).
  const submitDeleteRequest = async () => {
    const reason = deleteRequest.reason.trim();
    if (!deleteRequest.setupId || !reason) return;
    setDeleteRequest((prev) => ({ ...prev, sending: true }));
    try {
      await apiRequest('/ipm/change-requests', {
        method: 'POST',
        body: JSON.stringify({
          entityType: ENTITY_BIO_FIELD_SETUP,
          entityId: deleteRequest.setupId,
          action: 'delete',
          reason,
        }),
      });
      notify.success(`Delete request for "${deleteRequest.name}" sent to the pest agronomist`);
      setDeleteRequest({ open: false, setupId: null, name: '', reason: '', sending: false });
    } catch (err) {
      notify.error(err.message || 'Failed to send the delete request');
      setDeleteRequest((prev) => ({ ...prev, sending: false }));
    }
  };

  const handleBulkDeleteFieldSetups = async () => {
    if (!canEditSetup) return;
    const ids = [...fieldSetupSelection.selectedIds];
    if (!ids.length) return;
    if (!window.confirm(`Delete ${ids.length} selected field table(s) and all their data? This cannot be undone.`)) return;
    const deleted = await deleteIdsSequentially(ids, (id) => apiRequest(`/bio-records/field-setup/${id}`, { method: 'DELETE' }));
    fieldSetupSelection.clear();
    notify.success(`Deleted ${deleted} field table(s)`);
    await loadCrops();
    await loadFieldSetups();
  };

  // ── Import products only from Excel columns ──
  const handleImportProductsOnly = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCatalogSaving(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const seen = new Map();

      for (const sheetName of wb.SheetNames) {
        if (sheetName.toLowerCase() === 'products') continue;
        const ws = wb.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        if (data.length < 10) continue;

        const productRow = data[5] || [];
        for (let col = 2; col < (data[9] || []).length; col += 2) {
          const name = (productRow[col] || '').toString().trim();
          if (!name || seen.has(name.toLowerCase())) continue;
          const itemCode = (data[4]?.[col + 1] || data[4]?.[col] || '').toString().trim();
          seen.set(name.toLowerCase(), {
            itemCode: itemCode || name.substring(0, 20).replace(/\s+/g, '-').toUpperCase(),
            itemName: name,
          });
        }
      }

      const products = Array.from(seen.values());
      if (products.length === 0) {
        notify.warning('No products found in Excel column headers');
        return;
      }

      await apiRequest('/bio-records/catalog/import', {
        method: 'POST',
        body: JSON.stringify({ products }),
      });
      notify.success(`Imported ${products.length} products to catalog`);
      await loadCatalog();
    } catch (err) {
      notify.error(err.message || 'Failed to import products');
    } finally {
      setCatalogSaving(false);
      e.target.value = '';
    }
  };

  // ── Excel import ──
  const handleExcelImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!canImportNow) {
      e.target.value = '';
      return;
    }
    if (!activeSeasonId) {
      notify.warning('Select a season first');
      e.target.value = '';
      return;
    }
    setImportLoading(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });

      const sheets = [];
      for (const sheetName of wb.SheetNames) {
        if (sheetName.toLowerCase() === 'products') continue;

        const ws = wb.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        if (data.length < 10) continue;

        const cropName = (data[1]?.[2] || '').toString().trim();
        const surfaceM2 = parseFloat(data[2]?.[2]) || null;
        const plantsPerM2 = parseFloat(data[1]?.[6]) || null;
        const numberOfPlants = parseInt(data[2]?.[6]) || null;
        const startWeek = parseInt(data[0]?.[6]) || 1;

        const matchedField = allFields.find(f =>
          f.name.toLowerCase().replace(/[\s-]+/g, '') === sheetName.toLowerCase().replace(/[\s-]+/g, ''),
        );
        if (!matchedField) {
          notify.warning(`Could not match field "${sheetName}", skipping`);
          continue;
        }

        const matchedCrop = allCrops.find(cr =>
          cr.name.toLowerCase() === cropName.toLowerCase(),
        );
        if (!matchedCrop) {
          notify.warning(`Could not match crop "${cropName}" for ${sheetName}, skipping`);
          continue;
        }

        const productRow = data[5] || [];
        const pkgRow = data[6] || [];
        const headerRow = data[9] || [];
        const productsList = [];
        for (let col = 2; col < headerRow.length; col += 2) {
          const name = (productRow[col] || '').toString().trim();
          if (!name) continue;
          const itemCode = (data[4]?.[col + 1] || data[4]?.[col] || '').toString().trim();
          const perPkg = parseInt(pkgRow[col]) || null;
          productsList.push({ itemCode: itemCode || null, productName: name, perPackage: perPkg, pricePerPackage: null });
        }

        const entryRows = [];
        for (let row = 10; row < data.length - 4; row++) {
          const weekNum = parseInt(data[row]?.[0]);
          if (!weekNum || weekNum < 1 || weekNum > 53) continue;
          for (let pIdx = 0; pIdx < productsList.length; pIdx++) {
            const colBase = 2 + pIdx * 2;
            const perM2 = parseFloat(data[row]?.[colBase]) || null;
            const units = parseFloat(data[row]?.[colBase + 1]) || null;
            if (perM2 || units) {
              entryRows.push({ weekNumber: weekNum, productIndex: pIdx, perM2, units });
            }
          }
        }

        const maxWeek = entryRows.reduce((m, row) => Math.max(m, row.weekNumber), 0);
        sheets.push({
          fieldId: matchedField.id,
          cropId: matchedCrop.id,
          surfaceM2, plantsPerM2, numberOfPlants, startWeek,
          weekCount: Math.min(53, Math.max(maxWeek, 52)),
          products: productsList,
          entries: entryRows,
        });
      }

      if (sheets.length === 0) {
        notify.warning('No valid sheets found to import');
        setImportLoading(false);
        return;
      }

      // The "products" catalog sheet is the pest agronomist's to import; a worker's
      // import only adds the product columns the field sheets need.
      const catalogProducts = [];
      const prodSheet = isBioManager ? wb.Sheets['products'] : null;
      if (prodSheet) {
        const prodData = XLSX.utils.sheet_to_json(prodSheet, { header: 1, defval: '' });
        for (let i = 4; i < prodData.length; i++) {
          const code = (prodData[i]?.[0] || '').toString().trim();
          const name = (prodData[i]?.[1] || '').toString().trim();
          if (code && name && !name.startsWith('**N/A**') && name !== 'xxxxxxxxxxxxxxxxxx') {
            catalogProducts.push({ itemCode: code, itemName: name });
          }
        }
      }

      if (catalogProducts.length > 0) {
        const batchSize = 500;
        for (let i = 0; i < catalogProducts.length; i += batchSize) {
          await apiRequest('/bio-records/catalog/import', {
            method: 'POST',
            body: JSON.stringify({ products: catalogProducts.slice(i, i + batchSize) }),
          });
        }
        notify.success(`Imported ${catalogProducts.length} catalog products`);
      }

      const result = await apiRequest('/bio-records/import-excel', {
        method: 'POST',
        body: JSON.stringify({ seasonId: activeSeasonId, sheets }),
      });

      notify.success(result.pending
        ? `Imported ${result.sheets} field sheets — ${result.pending} value${result.pending === 1 ? '' : 's'} waiting for the pest agronomist's approval`
        : `Imported ${result.sheets} field sheets with ${result.entries} entries`);
      setImportOpen(false);
      await loadCrops();
      if (selectedCropId) await loadFieldSetups();
    } catch (err) {
      notify.error(err.message || 'Import failed');
    } finally {
      setImportLoading(false);
    }
  };

  // ── Keyboard navigation ──
  const handleKeyDown = (e, productIdx, week, subCol) => {
    const key = e.key;
    let nextPIdx = productIdx, nextWeek = week, nextSub = subCol;

    if (key === 'Tab' || key === 'ArrowRight') {
      e.preventDefault();
      if (subCol === 'perM2') { nextSub = 'units'; }
      else {
        nextSub = 'perM2';
        nextPIdx = productIdx + 1;
        if (nextPIdx >= products.length) { nextPIdx = 0; nextWeek = week + 1; }
      }
    } else if (key === 'ArrowLeft') {
      e.preventDefault();
      if (subCol === 'units') { nextSub = 'perM2'; }
      else {
        nextSub = 'units';
        nextPIdx = productIdx - 1;
        if (nextPIdx < 0) { nextPIdx = products.length - 1; nextWeek = week - 1; }
      }
    } else if (key === 'ArrowDown' || key === 'Enter') {
      e.preventDefault();
      nextWeek = weekRows[weekRows.indexOf(week) + 1] ?? week;
    } else if (key === 'ArrowUp') {
      e.preventDefault();
      nextWeek = weekRows[weekRows.indexOf(week) - 1] ?? week;
    } else {
      return;
    }

    if (!weekRows.includes(nextWeek) || nextPIdx < 0 || nextPIdx >= products.length) return;
    const nextId = `cell_${nextPIdx}_${nextWeek}_${nextSub}`;
    document.getElementById(nextId)?.focus();
  };

  // ── Paste from Excel ──
  const handlePaste = useCallback((e) => {
    const active = document.activeElement;
    if (!canEditCells || !active?.id?.startsWith('cell_')) return;
    const text = e.clipboardData?.getData('text/plain');
    if (!text || !text.includes('\t')) return;
    e.preventDefault();

    const parts = active.id.split('_');
    const startPIdx = parseInt(parts[1]);
    const startWeek = parseInt(parts[2]);
    const startSub = parts[3];

    const rows = text.split(/\r?\n/).filter(r => r.trim());
    for (let ri = 0; ri < rows.length; ri++) {
      const cols = rows[ri].split('\t');
      for (let ci = 0; ci < cols.length; ci++) {
        const totalSubIdx = (startSub === 'perM2' ? 0 : 1) + ci;
        const pIdx = startPIdx + Math.floor(totalSubIdx / 2);
        const sub = totalSubIdx % 2 === 0 ? 'perM2' : 'units';
        const wk = startWeek + ri;
        if (pIdx >= products.length || !weekRows.includes(wk)) continue;
        const val = parseFloat(cols[ci]);
        if (!isNaN(val) && val !== 0) {
          setCellValue(products[pIdx].id, wk, sub, String(val));
        }
      }
    }
  }, [products, weekRows, canEditCells, setCellValue]);

  useEffect(() => {
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [handlePaste]);

  // ── Render helpers ──
  const currentFieldName = fieldSetups[selectedFieldTab]?.field_name || '';
  const currentCropName = crops.find(c => c.id === selectedCropId)?.name || '';

  const openExportDialog = () => {
    setExportSelected(new Set(fieldSetups.map((fs) => fs.id)));
    setExportOpen(true);
  };

  const toggleExportField = (id) => {
    setExportSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleExportExcel = async () => {
    const selected = fieldSetups.filter((fs) => exportSelected.has(fs.id));
    if (!selected.length) {
      notify.warning('Select at least one field');
      return;
    }
    if (hasUnsavedChanges) {
      notify.warning('Unsaved units will not be included. Save first if you need the latest figures.');
    }
    setExporting(true);
    try {
      const fields = [];
      for (const fs of selected) {
        try {
          const data = await apiRequest(`/bio-records/field-setup/${fs.id}`);
          fields.push({
            fieldName: fs.field_name || data.setup?.field_name || 'Field',
            setup: data.setup,
            products: data.products,
            entries: data.entries,
          });
        } catch {
          notify.warning(`Skipped ${fs.field_name || 'a field'} (could not load)`);
        }
      }
      if (!fields.length) {
        notify.error('No fields could be exported');
        return;
      }
      const sheets = buildBioExportSheets(fields, {
        weekFilter: { from: filterFrom, to: filterTo },
      });
      const ok = await exportOpsExcel([], {
        ...OPS_EXPORT.bio,
        sheets,
        filename: bioExportFilename(currentCropName, activeSeason?.name),
      });
      if (ok) setExportOpen(false);
    } finally {
      setExporting(false);
    }
  };

  // One half (per m² or # units) of a product/week cell. Amber = waiting for approval,
  // red corner = a rejected value (reason in the tooltip), blue = typed, not saved yet.
  const renderGridCell = (p, pi, w, field) => {
    const key = cellKey(p.id, w);
    const cell = serverCells[key];
    const pending = Boolean(cell?.hasPending);
    const rejected = Boolean(cell?.rejectedReason) && !pending;
    const bg = dirtyKeys.has(key) ? dirtyCellBg : pending ? pendingCellBg : '';
    const pendingValue = field === 'perM2' ? cell?.pendingPerM2 : cell?.pendingUnits;
    // The scouter's input already shows the proposal; everyone else sees approved -> pending.
    const showPendingCaption = pending && !(canEditCells && cellMode === 'proposer');
    const td = (
      <td key={`${p.id}_${w}_${field}`} style={{ border: cellBorder, padding: 0, minWidth: 65, position: 'relative', background: bg }}>
        <input
          id={`cell_${pi}_${w}_${field}`}
          type="number"
          step="any"
          value={getCellValue(p.id, w, field) || ''}
          readOnly={!canEditCells}
          onChange={e => setCellValue(p.id, w, field, e.target.value)}
          onKeyDown={e => handleKeyDown(e, pi, w, field)}
          onFocus={e => { if (canEditCells) e.target.parentElement.style.background = focusBg; }}
          onBlur={e => { e.target.parentElement.style.background = bg; }}
          style={{ ...inputStyle, cursor: canEditCells ? 'text' : 'default' }}
        />
        {showPendingCaption && (
          <span style={{ position: 'absolute', left: 2, top: 1, fontSize: '0.55rem', lineHeight: 1, color: pendingText, pointerEvents: 'none' }}>
            →{cell.pendingClear ? '✕' : fmtCellNum(pendingValue)}
          </span>
        )}
        {rejected && field === 'units' && (
          <span style={{
            position: 'absolute', top: 0, right: 0, width: 0, height: 0, pointerEvents: 'none',
            borderTop: `7px solid ${rejectedMark}`, borderLeft: '7px solid transparent',
          }} />
        )}
      </td>
    );
    if (!pending && !rejected) return td;
    return (
      <Tooltip
        key={`${p.id}_${w}_${field}`}
        arrow
        placement="top"
        enterDelay={300}
        title={(
          <CellStatusTooltip
            cell={cell}
            canReview={canEditSetup && !reviewing}
            onApprove={() => approveCell(p.id, w)}
            onReject={() => openRejectDialog([{ productColumnId: p.id, weekNumber: w }])}
          />
        )}
      >
        {td}
      </Tooltip>
    );
  };

  const renderMetaCell = (label, value, field, suffix = '', inputType = 'number') => {
    const isEditing = editingMeta?.field === field;
    return (
      <td key={field} style={{ border: cellBorder, padding: '3px 8px', minWidth: 100, cursor: canEditSetup ? 'pointer' : 'default', background: isEditing ? focusBg : 'transparent' }}
        onClick={() => !isEditing && canEditSetup && startMetaEdit(field, inputType === 'date' ? toDateInputValue(value) : value)}>
        <div style={{ fontSize: '0.65rem', color: '#666', fontWeight: 600 }}>{label}</div>
        {isEditing ? (
          <input
            ref={metaInputRef}
            type={inputType}
            value={editingMeta.value}
            onChange={e => setEditingMeta(prev => ({ ...prev, value: e.target.value }))}
            onBlur={saveMetaEdit}
            onKeyDown={e => { if (e.key === 'Enter') saveMetaEdit(); if (e.key === 'Escape') setEditingMeta(null); }}
            style={{ ...inputStyle, textAlign: 'left', fontWeight: 700, fontSize: '0.8rem' }}
          />
        ) : (
          <div style={{ fontWeight: 700, fontSize: '0.8rem' }}>
            {(() => {
              const shown = inputType === 'date' ? toDateInputValue(value) : value;
              return shown != null && shown !== '' && shown !== 0
                ? `${typeof shown === 'number' ? shown.toLocaleString() : shown}${suffix}`
                : '—';
            })()}
          </div>
        )}
      </td>
    );
  };

  if (!activeSiteId) {
    return (
      <Box sx={{ p: 4 }}>
        <Alert severity="info">Select a site from Organization Settings to use Biological Control Records.</Alert>
      </Box>
    );
  }

  if (!seasonReady) {
    return (
      <Box sx={{ p: 4 }}>
        <Alert severity="info">Select a season in the sidebar to use Biological Control Records.</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {viewOnlyRole && (
        <Box sx={{ px: 2, pt: 1, flexShrink: 0 }}>
          <ReadOnlyBanner message="View only — biological control records are kept by the pest agronomist." />
        </Box>
      )}
      {!isSeasonReadOnly && canProposeBioCells(user) && (
        <Box sx={{ px: 2, pt: 1, flexShrink: 0 }}>
          <Alert severity="info" sx={{ py: 0 }}>
            Values you enter wait for the pest agronomist&apos;s approval (amber cells) and are not counted until approved.
            To remove a whole field table, use ✕ on its tab to send a delete request.
          </Alert>
        </Box>
      )}
      {!isSeasonReadOnly && !isBioManager && !canProposeBioCells(user) && canImportBio(user) && (
        <Box sx={{ px: 2, pt: 1, flexShrink: 0 }}>
          <Alert severity="info" sx={{ py: 0 }}>
            You can import an Excel file — imported values wait for the pest agronomist&apos;s approval.
            To remove a whole field table, use ✕ on its tab to send a delete request.
          </Alert>
        </Box>
      )}
      {/* ── Toolbar ── */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5, px: 2, py: 1, borderBottom: cellBorder, bgcolor: '#f9f9f9', flexShrink: 0 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mr: 'auto' }}>
          Biological Control Record
        </Typography>
        <TextField
          size="small"
          type="date"
          label="From"
          InputLabelProps={{ shrink: true }}
          value={filterFrom}
          onChange={(e) => setFilterFrom(e.target.value)}
          sx={{ width: 150, '& .MuiInputBase-root': { height: 30, fontSize: '0.8rem' } }}
        />
        <TextField
          size="small"
          type="date"
          label="To"
          InputLabelProps={{ shrink: true }}
          value={filterTo}
          onChange={(e) => setFilterTo(e.target.value)}
          sx={{ width: 150, '& .MuiInputBase-root': { height: 30, fontSize: '0.8rem' } }}
        />
        <ToggleButtonGroup size="small" exclusive value={viewMode} onChange={(_, v) => { if (v) setViewMode(v); }}
          sx={{ height: 30 }}>
          <ToggleButton value="spreadsheet" sx={{ px: 1.5, fontSize: '0.75rem' }}><SpreadsheetIcon sx={{ mr: 0.5, fontSize: 16 }} />Entry</ToggleButton>
          <ToggleButton value="summary" sx={{ px: 1.5, fontSize: '0.75rem' }}><SummaryIcon sx={{ mr: 0.5, fontSize: 16 }} />Summary</ToggleButton>
          <ToggleButton value="catalog" sx={{ px: 1.5, fontSize: '0.75rem' }}><CatalogIcon sx={{ mr: 0.5, fontSize: 16 }} />Catalog</ToggleButton>
        </ToggleButtonGroup>
        <Button size="small" variant="outlined" startIcon={<DownloadIcon />} onClick={openExportDialog}
          disabled={!fieldSetups.length || exporting}
          sx={{ fontSize: '0.75rem', height: 30, textTransform: 'none' }}>Export</Button>
        {canImportBio(user) && (
          <Button size="small" variant="outlined" startIcon={<UploadIcon />} onClick={() => setImportOpen(true)}
            disabled={!canImportNow}
            sx={{ fontSize: '0.75rem', height: 30, textTransform: 'none' }}>Import Excel</Button>
        )}
        {setup && isBioManager && (
          <Button size="small" variant="outlined" startIcon={<AddIcon />}
            disabled={!canEditSetup}
            onClick={() => { setAddProductOpen(true); setCatalogSearch(''); setCatalogResults([]); setNewProductName(''); setNewProductCode(''); setNewProductPerPkg(''); setNewProductPrice(''); setNewProductCatalogId(null); }}
            sx={{ fontSize: '0.75rem', height: 30, textTransform: 'none' }}>Add Product</Button>
        )}
        {setup && (isBioManager || canProposeBioCells(user)) && (
          <Button size="small" variant="contained" startIcon={<SaveIcon />} onClick={handleSave}
            disabled={saving || !canEditCells || !hasUnsavedChanges}
            sx={{ fontSize: '0.75rem', height: 30, textTransform: 'none', bgcolor: 'success.main' }}>
            {saving ? 'Saving…' : hasUnsavedChanges ? `Save (${changedCells.length})` : 'Save'}
          </Button>
        )}
      </Box>

      {/* ── Pending approvals for the open table ── */}
      {viewMode === 'spreadsheet' && setup && pendingKeys.length > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, px: 2, py: 0.75, borderBottom: cellBorder, bgcolor: pendingCellBg, flexShrink: 0 }}>
          <Chip size="small" label={`${pendingKeys.length} pending`}
            sx={{ bgcolor: '#ffe08a', color: pendingText, fontWeight: 700 }} />
          <Typography variant="body2" sx={{ color: pendingText, fontSize: '0.78rem' }}>
            {isBioManager
              ? 'Amber cells wait for your approval. Hover a cell to approve or reject it on its own.'
              : 'Amber cells wait for the pest agronomist’s approval and are not counted yet.'}
          </Typography>
          {canEditSetup && (
            <Box sx={{ ml: 'auto', display: 'flex', gap: 1 }}>
              <Button size="small" variant="contained" color="success" startIcon={<ApproveIcon />}
                disabled={reviewing} onClick={() => reviewCells('approve')}
                sx={{ fontSize: '0.75rem', height: 28, textTransform: 'none' }}>
                Approve all
              </Button>
              <Button size="small" variant="outlined" color="error" startIcon={<RejectIcon />}
                disabled={reviewing} onClick={() => openRejectDialog(null)}
                sx={{ fontSize: '0.75rem', height: 28, textTransform: 'none', bgcolor: '#fff' }}>
                Reject all…
              </Button>
            </Box>
          )}
        </Box>
      )}

      {/* ── Crop tabs ── */}
      {crops.length > 0 && (
        <Box sx={{ display: 'flex', gap: 0, borderBottom: cellBorder, bgcolor: '#f2f2f2', flexShrink: 0, overflowX: 'auto', px: 1 }}>
          {crops.map(c => (
            <Box key={c.id}
              onClick={() => setSelectedCropId(c.id)}
              sx={{
                px: 2, py: 0.75, cursor: 'pointer', fontSize: '0.8rem', fontWeight: selectedCropId === c.id ? 700 : 400,
                borderBottom: selectedCropId === c.id ? '3px solid #4a7c2e' : '3px solid transparent',
                color: selectedCropId === c.id ? '#4a7c2e' : '#666',
                '&:hover': { bgcolor: '#e8e8e8' },
              }}>
              {c.name}
            </Box>
          ))}
        </Box>
      )}

      {crops.length === 0 && (
        <Alert severity="info" sx={{ m: 2 }}>
          No records found for {activeSeason?.name || 'this season'}. Use "Import Excel" or click + on the sheet tabs below to get started.
        </Alert>
      )}

      {/* ── SPREADSHEET VIEW ── */}
      {viewMode === 'spreadsheet' && selectedCropId && (
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {loadingData ? (
            <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 1 }}>
              {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} variant="rounded" height={28} />)}
            </Box>
          ) : setup ? (
            <>
              {/* ── Excel-like Header ── */}
              <Box sx={{ px: 2, py: 1, flexShrink: 0 }}>
                <table style={{ borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                  <tbody>
                    <tr>
                      <td style={{ border: cellBorder, padding: '3px 8px', fontWeight: 700, bgcolor: headerBg, background: headerBg, minWidth: 120 }}>
                        <div style={{ fontSize: '0.65rem', color: '#666', fontWeight: 600 }}>Company</div>
                        <div style={{ fontWeight: 700 }}>Al Maha</div>
                      </td>
                      <td style={{ border: cellBorder, padding: '3px 8px', minWidth: 120 }}>
                        <div style={{ fontSize: '0.65rem', color: '#666', fontWeight: 600 }}>Crop</div>
                        <div style={{ fontWeight: 700, color: '#4a7c2e' }}>{currentCropName}</div>
                      </td>
                      <td style={{ border: cellBorder, padding: '3px 8px', minWidth: 120 }}>
                        <div style={{ fontSize: '0.65rem', color: '#666', fontWeight: 600 }}>Field</div>
                        <div style={{ fontWeight: 700 }}>{currentFieldName}</div>
                      </td>
                      {renderMetaCell('Surface (m²)', setup.surface_m2, 'surface_m2')}
                      {renderMetaCell('Plants / m²', setup.plants_per_m2, 'plants_per_m2')}
                      {renderMetaCell('Total Plants', setup.number_of_plants, 'number_of_plants')}
                      {renderMetaCell('Week 1 starts', setup.start_date || week1Label, 'start_date', '', 'date')}
                      <td style={{ border: cellBorder, padding: '3px 8px', background: totalRowBg, minWidth: 100 }}>
                        <div style={{ fontSize: '0.65rem', color: '#666', fontWeight: 600 }}>Total Cost</div>
                        <div style={{ fontWeight: 700, color: '#2e7d32', fontSize: '0.9rem' }}>
                          {grandTotalCost > 0
                            ? grandTotalCost.toFixed(2)
                            : (products.some((p) => productTotals[p.id]?.missingPrice) ? '—' : '0.00')}
                        </div>
                      </td>
                      <td style={{ border: cellBorder, padding: '3px 8px', background: headerBg, minWidth: 60 }}>
                        <div style={{ fontSize: '0.65rem', color: '#666', fontWeight: 600 }}>Season</div>
                        <div style={{ fontWeight: 700 }}>{activeSeason?.name || '—'}</div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </Box>

              {/* ── Spreadsheet Grid ── */}
              {products.length === 0 ? (
                <Alert severity="info" sx={{ m: 2 }}>
                  No products assigned to this field yet. Products will be auto-copied from the previous season if available, or use "Add Product" / "Import Excel".
                </Alert>
              ) : (
                <Box sx={{ flex: 1, overflow: 'auto', px: 0 }}>
                  <table style={{ borderCollapse: 'collapse', fontSize: '0.75rem', width: 'max-content', minWidth: '100%' }}>
                    <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                      {/* Product name row */}
                      <tr>
                        <th style={{ ...headerCellStyle, position: 'sticky', left: 0, zIndex: 12, minWidth: 50 }}>Wk</th>
                        <th style={{ ...headerCellStyle, position: 'sticky', left: 50, zIndex: 12, minWidth: 130 }}>Date Range</th>
                        {products.map(p => (
                          <th key={p.id} colSpan={2} style={{ ...headerCellStyle, minWidth: 150, position: 'relative' }}>
                            <Tooltip title={`${p.product_name}${p.item_code ? ` (${p.item_code})` : ''}`}>
                              <span style={{ display: 'block', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: '0 auto' }}>
                                {p.product_name}
                              </span>
                            </Tooltip>
                            {canEditSetup && (
                            <IconButton size="small" onClick={() => handleRemoveProduct(p.id)}
                              sx={{ position: 'absolute', top: 0, right: 0, p: 0.2, opacity: 0.4, '&:hover': { opacity: 1, color: 'error.main' } }}>
                              <DeleteIcon sx={{ fontSize: 12 }} />
                            </IconButton>
                            )}
                          </th>
                        ))}
                      </tr>
                      {/* Item code row */}
                      <tr>
                        <th style={{ ...subHeaderBg && { background: subHeaderBg }, border: cellBorder, padding: '1px 4px', fontSize: '0.65rem', color: '#888', position: 'sticky', left: 0, zIndex: 12, background: subHeaderBg }} />
                        <th style={{ border: cellBorder, padding: '1px 4px', fontSize: '0.65rem', color: '#888', position: 'sticky', left: 50, zIndex: 12, background: subHeaderBg }} />
                        {products.map(p => (
                          <th key={`code_${p.id}`} colSpan={2} style={{ border: cellBorder, padding: '1px 4px', fontSize: '0.65rem', color: '#888', textAlign: 'center', background: subHeaderBg }}>
                            {p.item_code || '—'}
                          </th>
                        ))}
                      </tr>
                      <tr>
                        <th style={{ border: cellBorder, padding: '1px 4px', fontSize: '0.65rem', color: '#888', position: 'sticky', left: 0, zIndex: 12, background: subHeaderBg }} />
                        <th style={{ border: cellBorder, padding: '1px 4px', fontSize: '0.65rem', color: '#888', position: 'sticky', left: 50, zIndex: 12, background: subHeaderBg, textAlign: 'center' }}>UOM</th>
                        {products.map(p => (
                          <th key={`uom_${p.id}`} colSpan={2} style={{ border: cellBorder, padding: '1px 4px', fontSize: '0.65rem', color: '#888', textAlign: 'center', background: subHeaderBg }}>
                            {p.uom_name || '—'}
                          </th>
                        ))}
                      </tr>
                      <tr>
                        <th style={{ border: cellBorder, padding: '1px 4px', fontSize: '0.65rem', color: '#888', position: 'sticky', left: 0, zIndex: 12, background: subHeaderBg }} />
                        <th style={{ border: cellBorder, padding: '1px 4px', fontSize: '0.65rem', color: '#888', position: 'sticky', left: 50, zIndex: 12, background: subHeaderBg, textAlign: 'center' }}>per pkg</th>
                        {products.map(p => (
                          <th key={`pkg_${p.id}`} colSpan={2} style={{ border: cellBorder, padding: '1px 4px', fontSize: '0.65rem', color: '#888', textAlign: 'center', background: subHeaderBg }}>
                            {p.per_package || '—'}
                          </th>
                        ))}
                      </tr>
                      <tr>
                        <th style={{ border: cellBorder, padding: '1px 4px', fontSize: '0.65rem', color: '#888', position: 'sticky', left: 0, zIndex: 12, background: subHeaderBg }} />
                        <th style={{ border: cellBorder, padding: '1px 4px', fontSize: '0.65rem', color: '#888', position: 'sticky', left: 50, zIndex: 12, background: subHeaderBg, textAlign: 'center' }}>site price</th>
                        {products.map(p => (
                          <th key={`price_${p.id}`} colSpan={2} style={{ border: cellBorder, padding: '1px 4px', fontSize: '0.65rem', color: '#888', textAlign: 'center', background: subHeaderBg }}>
                            {resolvedSitePrice(p.price_per_package) != null
                              ? Number(p.price_per_package).toFixed(2)
                              : '—'}
                          </th>
                        ))}
                      </tr>
                      {/* Sub-column headers (per m² / #units) */}
                      <tr>
                        <th style={{ border: cellBorder, padding: '1px 4px', fontSize: '0.65rem', fontWeight: 700, position: 'sticky', left: 0, zIndex: 12, background: headerBg }}>Wk</th>
                        <th style={{ border: cellBorder, padding: '1px 4px', fontSize: '0.65rem', fontWeight: 700, position: 'sticky', left: 50, zIndex: 12, background: headerBg, textAlign: 'center' }}>Date Range</th>
                        {products.map(p => ([
                          <th key={`m_${p.id}`} style={{ border: cellBorder, padding: '1px 4px', fontSize: '0.65rem', fontWeight: 700, textAlign: 'center', background: headerBg, minWidth: 65 }}>per m²</th>,
                          <th key={`u_${p.id}`} style={{ border: cellBorder, padding: '1px 4px', fontSize: '0.65rem', fontWeight: 700, textAlign: 'center', background: headerBg, minWidth: 65 }}># units</th>,
                        ]))}
                      </tr>
                    </thead>
                    <tbody>
                      {weekRows.map(w => (
                        <tr key={w} style={{ background: w % 2 === 0 ? altRowBg : 'transparent' }}>
                          <td style={{ border: cellBorder, padding: '1px 4px', fontWeight: 600, textAlign: 'center', position: 'sticky', left: 0, zIndex: 1, background: w % 2 === 0 ? altRowBg : frozenBg, fontSize: '0.75rem' }}>
                            {w}
                          </td>
                          <td style={{ border: cellBorder, padding: '1px 4px', fontSize: '0.65rem', color: '#777', position: 'sticky', left: 50, zIndex: 1, background: w % 2 === 0 ? altRowBg : frozenBg, whiteSpace: 'nowrap', textAlign: 'center' }}>
                            {weekToDateRange(w, setup.start_date || { startDate: week1Start, startWeek: setup.start_week })}
                          </td>
                          {products.map((p, pi) => ([
                            renderGridCell(p, pi, w, 'perM2'),
                            renderGridCell(p, pi, w, 'units'),
                          ]))}
                        </tr>
                      ))}
                      {/* ── Totals row ── */}
                      <tr>
                        <td colSpan={2} style={{ border: cellBorder, padding: '2px 6px', fontWeight: 700, background: totalRowBg, position: 'sticky', left: 0, zIndex: 1, textAlign: 'right', fontSize: '0.75rem' }}>
                          {weekRows.length === allWeekRows.length
                            ? 'TOTAL'
                            : `TOTAL (${weekRows.length} of ${allWeekRows.length} weeks)`}
                        </td>
                        {products.map(p => ([
                          <td key={`${p.id}_tm`} style={{ border: cellBorder, padding: '2px 4px', fontWeight: 700, textAlign: 'right', background: totalRowBg, fontSize: '0.75rem' }}>
                            {productTotals[p.id]?.totalPerM2 ? productTotals[p.id].totalPerM2.toFixed(1) : ''}
                          </td>,
                          <td key={`${p.id}_tu`} style={{ border: cellBorder, padding: '2px 4px', fontWeight: 700, textAlign: 'right', background: totalRowBg, fontSize: '0.75rem' }}>
                            {productTotals[p.id]?.totalUnits ? productTotals[p.id].totalUnits.toFixed(0) : ''}
                          </td>,
                        ]))}
                      </tr>
                      {/* ── Cost row ── */}
                      <tr>
                        <td colSpan={2} style={{ border: cellBorder, padding: '2px 6px', fontWeight: 700, background: costRowBg, position: 'sticky', left: 0, zIndex: 1, textAlign: 'right', fontSize: '0.75rem' }}>
                          COST
                        </td>
                        {products.map(p => (
                          <td key={`${p.id}_c`} colSpan={2} style={{ border: cellBorder, padding: '2px 4px', fontWeight: 700, textAlign: 'right', background: costRowBg, color: '#2e7d32', fontSize: '0.75rem' }}>
                            {productTotals[p.id]?.costLabel || ''}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                  {isBioManager && (
                    <Box sx={{ px: 1, py: 1 }}>
                      <Button size="small" variant="outlined" startIcon={<AddIcon />}
                        onClick={handleAddWeek} disabled={!canEditSetup || weekCount >= MAX_BIO_WEEKS}>
                        Add week
                      </Button>
                    </Box>
                  )}
                </Box>
              )}
            </>
          ) : (
            <Alert severity="info" sx={{ m: 2 }}>
              Select a field tab below or click "+" to add a new field.
            </Alert>
          )}

          {/* ── Excel-like bottom sheet tabs ── */}
          <Box sx={{
            display: 'flex', alignItems: 'stretch', borderTop: '2px solid #999',
            bgcolor: '#d0d0d0', flexShrink: 0, overflowX: 'auto', minHeight: 32,
          }}>
            {fieldSetups.length > 0 && canEditSetup && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 1, bgcolor: '#d0d0d0' }}>
                <SelectAllCheckbox
                  plain
                  ids={fieldSetups.map((fs) => fs.id)}
                  selectedIds={fieldSetupSelection.selectedIds}
                  onToggleAll={fieldSetupSelection.toggleAll}
                  label="Select all field tables"
                />
                <DeleteSelectedButton count={fieldSetupSelection.size} onClick={handleBulkDeleteFieldSetups} label="Delete selected tables" />
              </Box>
            )}
            {fieldSetups.map((fs, i) => (
              <Box key={fs.id}
                onClick={() => setSelectedFieldTab(i)}
                sx={{
                  px: 1.5, py: 0.5, cursor: 'pointer', fontSize: '0.78rem',
                  fontWeight: selectedFieldTab === i ? 700 : 400,
                  bgcolor: selectedFieldTab === i ? tabActiveBg : tabInactiveBg,
                  color: selectedFieldTab === i ? '#333' : '#666',
                  borderRight: '1px solid #bbb',
                  borderTop: selectedFieldTab === i ? '2px solid #4a7c2e' : '2px solid transparent',
                  mt: selectedFieldTab === i ? '-2px' : 0,
                  display: 'flex', alignItems: 'center', gap: 0.5,
                  '&:hover': { bgcolor: selectedFieldTab === i ? tabActiveBg : '#e8e8e8' },
                  whiteSpace: 'nowrap',
                }}>
                {canEditSetup && (
                  <Box onClick={(e) => e.stopPropagation()} sx={{ display: 'flex' }}>
                    <RowCheckbox
                      id={fs.id}
                      selectedIds={fieldSetupSelection.selectedIds}
                      onToggle={fieldSetupSelection.toggle}
                      label={`Select ${fs.field_name || `Field ${i + 1}`}`}
                    />
                  </Box>
                )}
                {fs.field_name || `Field ${i + 1}`}
                {Number(fs.pending_count) > 0 && (
                  <Tooltip title={`${fs.pending_count} value${Number(fs.pending_count) === 1 ? '' : 's'} waiting for approval`}>
                    <Box component="span" sx={{
                      px: 0.6, borderRadius: '8px', fontSize: '0.65rem', fontWeight: 700, lineHeight: 1.5,
                      bgcolor: '#ffe08a', color: pendingText,
                    }}>
                      {fs.pending_count}
                    </Box>
                  </Tooltip>
                )}
                {(canEditSetup || canRequestDeleteNow) && (
                <Box
                  component="span"
                  title={canEditSetup ? 'Delete this table' : 'Request deleting this table'}
                  onClick={e => { e.stopPropagation(); handleDeleteFieldSetup(fs.id, fs.field_name || `Field ${i + 1}`); }}
                  sx={{
                    ml: 0.5, px: 0.3, borderRadius: '3px', fontSize: '0.7rem', lineHeight: 1,
                    color: '#999', cursor: 'pointer',
                    '&:hover': { color: '#d32f2f', bgcolor: 'rgba(211,47,47,0.1)' },
                  }}>
                  ✕
                </Box>
                )}
              </Box>
            ))}
            {canEditSetup && (
            <Box
              onClick={openSetupDialog}
              sx={{
                px: 1.5, py: 0.5, cursor: 'pointer', fontSize: '0.9rem',
                color: '#666', display: 'flex', alignItems: 'center',
                '&:hover': { bgcolor: '#c8c8c8', color: '#333' },
              }}>
              +
            </Box>
            )}
          </Box>
        </Box>
      )}

      {/* ── SUMMARY VIEW ── */}
      {viewMode === 'summary' && selectedCropId && (
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {summaryLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
          ) : summaryError ? (
            <Alert severity="error" sx={{ m: 2 }}>{summaryError}</Alert>
          ) : summaryFields.length ? (
            <>
              <Box sx={{ px: 2, py: 1, flexShrink: 0 }}>
                <table style={{ borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                  <tbody>
                    <tr>
                      <td style={{ border: cellBorder, padding: '3px 8px', background: headerBg, minWidth: 120 }}>
                        <div style={{ fontSize: '0.65rem', color: '#666', fontWeight: 600 }}>Company</div>
                        <div style={{ fontWeight: 700 }}>Al Maha</div>
                      </td>
                      <td style={{ border: cellBorder, padding: '3px 8px', minWidth: 120 }}>
                        <div style={{ fontSize: '0.65rem', color: '#666', fontWeight: 600 }}>Crop</div>
                        <div style={{ fontWeight: 700, color: '#4a7c2e' }}>{currentCropName}</div>
                      </td>
                      <td style={{ border: cellBorder, padding: '3px 8px', background: headerBg, minWidth: 80 }}>
                        <div style={{ fontSize: '0.65rem', color: '#666', fontWeight: 600 }}>Season</div>
                        <div style={{ fontWeight: 700 }}>{activeSeason?.name || '—'}</div>
                      </td>
                      <td style={{ border: cellBorder, padding: '3px 8px', background: totalRowBg, minWidth: 100 }}>
                        <div style={{ fontSize: '0.65rem', color: '#666', fontWeight: 600 }}>Total Cost</div>
                        <div style={{ fontWeight: 700, color: '#2e7d32', fontSize: '0.9rem' }}>{summaryFieldCost.toFixed(2)}</div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </Box>

              <Box sx={{ flex: 1, overflow: 'auto', px: 2, pb: 2 }}>
                <table style={{ borderCollapse: 'collapse', fontSize: '0.75rem', width: 'max-content', minWidth: '100%' }}>
                  <thead>
                    <tr>
                      <th style={headerCellStyle}>Field</th>
                      <th style={headerCellStyle}>Surface (m²)</th>
                      <th style={headerCellStyle}>Plants</th>
                      <th style={headerCellStyle}>Plants/m²</th>
                      <th style={headerCellStyle}>Total Units</th>
                      <th style={headerCellStyle}>Total Cost</th>
                      <th style={headerCellStyle}>Cost/m²</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaryFields.map((f, i) => (
                      <tr key={f.setup_id}>
                        <td style={{ ...summaryBodyCell(i, 'left'), fontWeight: 500 }}>{f.field_name}</td>
                        <td style={summaryBodyCell(i)}>{f.surface_m2 ? parseFloat(f.surface_m2).toLocaleString() : '—'}</td>
                        <td style={summaryBodyCell(i)}>{f.number_of_plants ? parseInt(f.number_of_plants, 10).toLocaleString() : '—'}</td>
                        <td style={summaryBodyCell(i)}>{f.plants_per_m2 || '—'}</td>
                        <td style={summaryBodyCell(i)}>{parseFloat(f.total_units).toFixed(0)}</td>
                        <td style={{ ...summaryBodyCell(i), color: '#2e7d32', fontWeight: 600 }}>{parseFloat(f.total_cost).toFixed(2)}</td>
                        <td style={{ ...summaryBodyCell(i), color: '#2e7d32' }}>
                          {f.surface_m2 ? (parseFloat(f.total_cost) / parseFloat(f.surface_m2)).toFixed(5) : '—'}
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan={4} style={{ border: cellBorder, padding: '2px 6px', fontWeight: 700, background: totalRowBg, textAlign: 'right', fontSize: '0.75rem' }}>TOTAL</td>
                      <td style={{ border: cellBorder, padding: '2px 6px', fontWeight: 700, background: totalRowBg, textAlign: 'right', fontSize: '0.75rem' }}>{summaryFieldUnits.toFixed(0)}</td>
                      <td style={{ border: cellBorder, padding: '2px 6px', fontWeight: 700, background: totalRowBg, textAlign: 'right', fontSize: '0.75rem' }} />
                      <td style={{ border: cellBorder, padding: '2px 6px', background: totalRowBg }} />
                    </tr>
                    <tr>
                      <td colSpan={5} style={{ border: cellBorder, padding: '2px 6px', fontWeight: 700, background: costRowBg, textAlign: 'right', fontSize: '0.75rem' }}>COST</td>
                      <td style={{ border: cellBorder, padding: '2px 6px', fontWeight: 700, background: costRowBg, textAlign: 'right', color: '#2e7d32', fontSize: '0.75rem' }}>{summaryFieldCost.toFixed(2)}</td>
                      <td style={{ border: cellBorder, padding: '2px 6px', background: costRowBg }} />
                    </tr>
                  </tbody>
                </table>

                <div style={{ ...headerCellStyle, display: 'table', width: '100%', marginTop: 16, textAlign: 'left', padding: '4px 8px' }}>
                  Product Totals
                </div>
                <table style={{ borderCollapse: 'collapse', fontSize: '0.75rem', width: 'max-content', minWidth: '100%' }}>
                  <thead>
                    <tr>
                      <th style={headerCellStyle}>Product</th>
                      <th style={headerCellStyle}>Item Code</th>
                      <th style={headerCellStyle}>Total per m²</th>
                      <th style={headerCellStyle}>Total Units</th>
                      <th style={headerCellStyle}>Total Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaryProducts.map((pt, i) => (
                      <tr key={`${pt.item_code || pt.product_name}_${i}`}>
                        <td style={summaryBodyCell(i, 'left')}>{pt.product_name}</td>
                        <td style={summaryBodyCell(i, 'left')}>{pt.item_code || '—'}</td>
                        <td style={summaryBodyCell(i)}>{pt.total_per_m2 ? parseFloat(pt.total_per_m2).toFixed(1) : '0'}</td>
                        <td style={summaryBodyCell(i)}>{pt.total_units ? parseFloat(pt.total_units).toFixed(0) : '0'}</td>
                        <td style={{ ...summaryBodyCell(i), color: '#2e7d32', fontWeight: 600 }}>{parseFloat(pt.total_cost).toFixed(2)}</td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan={2} style={{ border: cellBorder, padding: '2px 6px', fontWeight: 700, background: totalRowBg, textAlign: 'right', fontSize: '0.75rem' }}>TOTAL</td>
                      <td style={{ border: cellBorder, padding: '2px 6px', fontWeight: 700, background: totalRowBg, textAlign: 'right', fontSize: '0.75rem' }}>{summaryProductPerM2.toFixed(1)}</td>
                      <td style={{ border: cellBorder, padding: '2px 6px', fontWeight: 700, background: totalRowBg, textAlign: 'right', fontSize: '0.75rem' }}>{summaryProductUnits.toFixed(0)}</td>
                      <td style={{ border: cellBorder, padding: '2px 6px', background: totalRowBg }} />
                    </tr>
                    <tr>
                      <td colSpan={4} style={{ border: cellBorder, padding: '2px 6px', fontWeight: 700, background: costRowBg, textAlign: 'right', fontSize: '0.75rem' }}>COST</td>
                      <td style={{ border: cellBorder, padding: '2px 6px', fontWeight: 700, background: costRowBg, textAlign: 'right', color: '#2e7d32', fontSize: '0.75rem' }}>{summaryProductCost.toFixed(2)}</td>
                    </tr>
                  </tbody>
                </table>
              </Box>
            </>
          ) : (
            <Alert severity="info" sx={{ m: 2 }}>No summary data available for this crop and season.</Alert>
          )}
        </Box>
      )}

      {/* ── CATALOG VIEW ── */}
      {viewMode === 'catalog' && (
        <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>Product Catalog</Typography>
          </Box>

          <Tabs value={catalogTab} onChange={(_, v) => { setCatalogTab(v); setCatalogFilter(''); setCatalogBrowseSelected(new Set()); }}
            sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}>
            <Tab icon={<MySiteIcon />} iconPosition="start" label="My Site" sx={{ textTransform: 'none', fontSize: '0.8rem' }} />
            <Tab icon={<BrowseIcon />} iconPosition="start" label="Browse All" sx={{ textTransform: 'none', fontSize: '0.8rem' }} />
          </Tabs>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
            <TextField
              size="small" placeholder="Search products…" value={catalogFilter}
              onChange={e => setCatalogFilter(e.target.value)}
              sx={{ width: 280, fontSize: '0.8rem' }}
            />
            {catalogTab === 0 && canEditSetup && (
              <Box sx={{ ml: 'auto', display: 'flex', gap: 1 }}>
                <DeleteSelectedButton count={catalogSelection.size} onClick={handleBulkCatalogDelete} />
                <Button size="small" variant="outlined" component="label" startIcon={<UploadIcon />} disabled={catalogSaving}
                  sx={{ textTransform: 'none', fontSize: '0.8rem' }}>
                  Import from Excel
                  <input type="file" hidden accept=".xlsx,.xls" onChange={handleImportProductsOnly} />
                </Button>
                {!catalogNewRow && (
                  <Button size="small" variant="outlined" startIcon={<AddIcon />}
                    onClick={() => setCatalogNewRow({ itemCode: '', itemName: '', perPackage: '', pricePerPackage: '', uom: null })}
                    sx={{ textTransform: 'none', fontSize: '0.8rem' }}>
                    Add Product
                  </Button>
                )}
              </Box>
            )}
          </Box>

          {!activeSiteId && catalogTab === 0 && (
            <Alert severity="info" sx={{ mb: 2 }}>
              Select a site from the sidebar to see site-specific products and pricing.
            </Alert>
          )}

          {/* My Site tab */}
          {catalogTab === 0 && (
            <>
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <SelectAllHeadCell
                        plain
                        ids={filteredCatalog.map((p) => p.id)}
                        selectedIds={catalogSelection.selectedIds}
                        onToggleAll={catalogSelection.toggleAll}
                        label="Select all catalog products"
                      />
                      <TableCell sx={{ fontWeight: 700, width: 60 }}>#</TableCell>
                      <TableCell sx={{ fontWeight: 700, width: 140 }}>Item Code</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Product Name</TableCell>
                      <TableCell sx={{ fontWeight: 700, width: 130 }}>UOM</TableCell>
                      <TableCell sx={{ fontWeight: 700, width: 120 }} align="right">Per Package</TableCell>
                      <TableCell sx={{ fontWeight: 700, width: 140 }} align="right">Site Price</TableCell>
                      <TableCell sx={{ fontWeight: 700, width: 100 }} align="center">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredCatalog.map((p, idx) => {
                      const isEditing = catalogEditId === p.id;
                      const displayPrice = p.site_price != null ? p.site_price : p.price_per_package;
                      return (
                        <TableRow key={p.id} hover>
                          <RowSelectCell
                            id={p.id}
                            selectedIds={catalogSelection.selectedIds}
                            onToggle={catalogSelection.toggle}
                            label={`Select ${p.item_name}`}
                          />
                          <TableCell sx={{ color: '#999', fontSize: '0.75rem' }}>{idx + 1}</TableCell>
                          <TableCell>
                            {isEditing ? (
                              <TextField size="small" fullWidth variant="standard"
                                value={catalogEditData.itemCode ?? p.item_code}
                                onChange={e => setCatalogEditData(prev => ({ ...prev, itemCode: e.target.value }))}
                              />
                            ) : (
                              <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 500 }}>{p.item_code}</Typography>
                            )}
                          </TableCell>
                          <TableCell>
                            {isEditing ? (
                              <TextField size="small" fullWidth variant="standard"
                                value={catalogEditData.itemName ?? p.item_name}
                                onChange={e => setCatalogEditData(prev => ({ ...prev, itemName: e.target.value }))}
                              />
                            ) : p.item_name}
                          </TableCell>
                          <TableCell>
                            {isEditing ? (
                              <UomPicker
                                options={uomOptions}
                                value={catalogEditData.uom ?? p.uom_name ?? ''}
                                onChange={(v) => setCatalogEditData((prev) => ({ ...prev, uom: v }))}
                                variant="standard"
                              />
                            ) : (p.uom_name || '—')}
                          </TableCell>
                          <TableCell align="right">
                            {isEditing ? (
                              <TextField size="small" fullWidth variant="standard" type="number"
                                value={catalogEditData.perPackage ?? (p.per_package || '')}
                                onChange={e => setCatalogEditData(prev => ({ ...prev, perPackage: e.target.value }))}
                                inputProps={{ style: { textAlign: 'right' } }}
                              />
                            ) : (p.per_package || '—')}
                          </TableCell>
                          <TableCell align="right">
                            {isEditing ? (
                              <TextField size="small" fullWidth variant="standard" type="number"
                                value={catalogEditData.pricePerPackage ?? (displayPrice || '')}
                                onChange={e => setCatalogEditData(prev => ({ ...prev, pricePerPackage: e.target.value }))}
                                inputProps={{ style: { textAlign: 'right' } }}
                              />
                            ) : (displayPrice != null ? parseFloat(displayPrice).toFixed(2) : '—')}
                          </TableCell>
                          <TableCell align="center">
                            {isEditing ? (
                              <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                                <IconButton size="small" color="success" disabled={catalogSaving}
                                  onClick={async () => handleCatalogSave(p.id, {
                                    itemCode: catalogEditData.itemCode ?? p.item_code,
                                    itemName: catalogEditData.itemName ?? p.item_name,
                                    perPackage: catalogEditData.perPackage !== undefined ? (parseInt(catalogEditData.perPackage) || null) : p.per_package,
                                    pricePerPackage: catalogEditData.pricePerPackage !== undefined ? catalogEditData.pricePerPackage : displayPrice,
                                    uomId: catalogEditData.uom !== undefined
                                      ? await resolveUomId(catalogEditData.uom)
                                      : p.uom_id,
                                  })}>
                                  <CheckIcon sx={{ fontSize: 18 }} />
                                </IconButton>
                                <IconButton size="small" onClick={() => { setCatalogEditId(null); setCatalogEditData({}); }}>
                                  <CancelIcon sx={{ fontSize: 18 }} />
                                </IconButton>
                              </Box>
                            ) : canEditSetup && (
                              <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                                <IconButton size="small" onClick={() => { setCatalogEditId(p.id); setCatalogEditData({}); }}>
                                  <EditIcon sx={{ fontSize: 16 }} />
                                </IconButton>
                                <IconButton size="small" color="error" onClick={() => handleCatalogDelete(p.id, p.item_name)}>
                                  <DeleteIcon sx={{ fontSize: 16 }} />
                                </IconButton>
                              </Box>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {catalogNewRow && (
                      <TableRow sx={{ bgcolor: '#f5f9f0' }}>
                        <TableCell padding="checkbox" />
                        <TableCell sx={{ color: '#999', fontSize: '0.75rem' }}>new</TableCell>
                        <TableCell>
                          <TextField size="small" fullWidth variant="standard" placeholder="Code *"
                            value={catalogNewRow.itemCode}
                            onChange={e => setCatalogNewRow(prev => ({ ...prev, itemCode: e.target.value }))}
                            autoFocus
                          />
                        </TableCell>
                        <TableCell>
                          <TextField size="small" fullWidth variant="standard" placeholder="Product Name *"
                            value={catalogNewRow.itemName}
                            onChange={e => setCatalogNewRow(prev => ({ ...prev, itemName: e.target.value }))}
                          />
                        </TableCell>
                        <TableCell>
                          <UomPicker
                            options={uomOptions}
                            value={catalogNewRow.uom}
                            onChange={(v) => setCatalogNewRow((prev) => ({ ...prev, uom: v }))}
                            variant="standard"
                          />
                        </TableCell>
                        <TableCell align="right">
                          <TextField size="small" fullWidth variant="standard" type="number" placeholder="—"
                            value={catalogNewRow.perPackage}
                            onChange={e => setCatalogNewRow(prev => ({ ...prev, perPackage: e.target.value }))}
                            inputProps={{ style: { textAlign: 'right' } }}
                          />
                        </TableCell>
                        <TableCell align="right">
                          <TextField size="small" fullWidth variant="standard" type="number" placeholder="—"
                            value={catalogNewRow.pricePerPackage}
                            onChange={e => setCatalogNewRow(prev => ({ ...prev, pricePerPackage: e.target.value }))}
                            inputProps={{ style: { textAlign: 'right' } }}
                          />
                        </TableCell>
                        <TableCell align="center">
                          <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                            <IconButton size="small" color="success" onClick={handleCatalogAdd} disabled={catalogSaving}>
                              <CheckIcon sx={{ fontSize: 18 }} />
                            </IconButton>
                            <IconButton size="small" onClick={() => setCatalogNewRow(null)}>
                              <CancelIcon sx={{ fontSize: 18 }} />
                            </IconButton>
                          </Box>
                        </TableCell>
                      </TableRow>
                    )}
                    {filteredCatalog.length === 0 && !catalogNewRow && (
                      <TableRow>
                        <TableCell colSpan={7} align="center" sx={{ py: 4, color: '#999' }}>
                          {catalogItems.length === 0
                            ? 'No products assigned to this site yet. Add products or browse other sites to copy.'
                            : 'No products match your search.'}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                {catalogItems.length} product{catalogItems.length !== 1 ? 's' : ''} in this site's catalog.
              </Typography>
            </>
          )}

          {/* Browse All tab */}
          {catalogTab === 1 && (
            <>
              {catalogBrowseSelected.size > 0 && canEditSetup && (
                <Box sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Button size="small" variant="contained" startIcon={<CopyIcon />}
                    disabled={catalogSaving || !activeSiteId}
                    onClick={() => handleCatalogCopyToSite(Array.from(catalogBrowseSelected))}
                    sx={{ textTransform: 'none' }}>
                    Copy {catalogBrowseSelected.size} Selected to My Site
                  </Button>
                  <Button size="small" onClick={() => setCatalogBrowseSelected(new Set())}
                    sx={{ textTransform: 'none' }}>
                    Clear Selection
                  </Button>
                </Box>
              )}
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell padding="checkbox" sx={{ width: 42 }}>
                        <Checkbox size="small"
                          indeterminate={catalogBrowseSelected.size > 0 && catalogBrowseSelected.size < browseSelectableIds.length}
                          checked={browseSelectableIds.length > 0 && catalogBrowseSelected.size === browseSelectableIds.length}
                          disabled={browseSelectableIds.length === 0}
                          onChange={e => {
                            if (e.target.checked) {
                              setCatalogBrowseSelected(new Set(browseSelectableIds));
                            } else {
                              setCatalogBrowseSelected(new Set());
                            }
                          }}
                        />
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700, width: 60 }}>#</TableCell>
                      <TableCell sx={{ fontWeight: 700, width: 140 }}>Item Code</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Product Name</TableCell>
                      <TableCell sx={{ fontWeight: 700, width: 110 }}>UOM</TableCell>
                      <TableCell sx={{ fontWeight: 700, width: 120 }} align="right">Per Package</TableCell>
                      <TableCell sx={{ fontWeight: 700, width: 100 }} align="center">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredBrowseCatalog.map((p, idx) => {
                      const alreadyInSite = mySiteProductIds.has(p.id);
                      return (
                        <TableRow key={p.id} hover
                          selected={catalogBrowseSelected.has(p.id)}>
                          <TableCell padding="checkbox">
                            {alreadyInSite ? null : (
                              <Checkbox size="small" checked={catalogBrowseSelected.has(p.id)}
                                onChange={e => {
                                  setCatalogBrowseSelected(prev => {
                                    const next = new Set(prev);
                                    if (e.target.checked) next.add(p.id); else next.delete(p.id);
                                    return next;
                                  });
                                }}
                              />
                            )}
                          </TableCell>
                          <TableCell sx={{ color: '#999', fontSize: '0.75rem' }}>{idx + 1}</TableCell>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 500 }}>{p.item_code}</Typography>
                          </TableCell>
                          <TableCell>{p.item_name}</TableCell>
                          <TableCell>{p.uom_name || '—'}</TableCell>
                          <TableCell align="right">{p.per_package || '—'}</TableCell>
                          <TableCell align="center">
                            {alreadyInSite ? (
                              <Chip label="In your site" size="small" color="success" variant="outlined" sx={{ fontSize: '0.65rem' }} />
                            ) : canEditSetup && (
                              <Tooltip title="Copy to my site">
                                <IconButton size="small" onClick={() => handleCatalogCopyToSite(p.id)} disabled={catalogSaving || !activeSiteId}>
                                  <CopyIcon sx={{ fontSize: 16 }} />
                                </IconButton>
                              </Tooltip>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {filteredBrowseCatalog.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} align="center" sx={{ py: 4, color: '#999' }}>
                          {catalogBrowseItems.length === 0}
                            ? 'No products in the master catalog.'
                            : 'No products match your search.'}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                {catalogBrowseItems.length} product{catalogBrowseItems.length !== 1 ? 's' : ''} in master catalog.
              </Typography>
            </>
          )}
        </Box>
      )}

      {/* ── DIALOGS ── */}

      {/* Field Setup Dialog */}
      <Dialog open={setupDialogOpen} onClose={() => setSetupDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Field</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControl fullWidth size="small">
                <InputLabel>Field</InputLabel>
                <Select value={setupForm.fieldId} label="Field" onChange={e => {
                  const fId = e.target.value;
                  const field = allFields.find(f => f.id === fId);
                  setSetupForm(p => ({ ...p, fieldId: fId, cropId: field?.currentCropId || '' }));
                }}>
                  {allFields.map(f => <MenuItem key={f.id} value={f.id}>{f.name} ({f.farmArea})</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth size="small" label="Crop"
                value={setupForm.cropId ? (allCrops.find(c => c.id === setupForm.cropId)?.name || 'Unknown') : '—'}
                InputProps={{ readOnly: true }}
                helperText={setupForm.fieldId && !setupForm.cropId ? 'No crop assigned in Crop Rotation' : ' '}
                error={!!setupForm.fieldId && !setupForm.cropId}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth size="small" label="Surface (m²)" type="number"
                value={setupForm.surfaceM2} onChange={e => setSetupForm(p => ({ ...p, surfaceM2: e.target.value }))} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth size="small" label="Plants / m²" type="number"
                value={setupForm.plantsPerM2} onChange={e => setSetupForm(p => ({ ...p, plantsPerM2: e.target.value }))} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth size="small" label="Total Plants" type="number"
                value={setupForm.numberOfPlants} onChange={e => setSetupForm(p => ({ ...p, numberOfPlants: e.target.value }))} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth size="small" label="Week 1 starts" type="date"
                InputLabelProps={{ shrink: true }}
                value={setupForm.startDate}
                onChange={e => setSetupForm(p => ({ ...p, startDate: e.target.value }))}
                helperText="36 weeks are created from this Monday. Add more later." />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSetupDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={saveSetup}>Save</Button>
        </DialogActions>
      </Dialog>

      {/* Add Product Dialog */}
      <Dialog open={addProductOpen} onClose={() => setAddProductOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Product Column</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Search the catalog or enter product details manually.
          </Typography>
          <Autocomplete
            freeSolo
            options={catalogResults}
            getOptionLabel={o => typeof o === 'string' ? o : `${o.item_code} — ${o.item_name}`}
            loading={catalogLoading}
            inputValue={catalogSearch}
            onInputChange={(_, v) => setCatalogSearch(v)}
            onChange={(_, v) => {
              if (v && typeof v !== 'string') {
                setNewProductName(v.item_name);
                setNewProductCode(v.item_code || '');
                setNewProductCatalogId(v.id || null);
                setNewProductPerPkg(v.per_package ?? v.perPackage ?? '');
                setNewProductPrice(v.site_price ?? v.price_per_package ?? v.pricePerPackage ?? '');
                setNewProductUom(v.uom_id ? { id: v.uom_id, name: v.uom_name } : (v.uom_name || null));
              }
            }}
            renderInput={params => (
              <TextField {...params} label="Search catalog" size="small" fullWidth sx={{ mb: 2 }} />
            )}
          />
          <Grid container spacing={2}>
            <Grid size={12}>
              <TextField fullWidth size="small" label="Product Name *" value={newProductName}
                onChange={e => setNewProductName(e.target.value)} />
            </Grid>
            <Grid size={{ xs: 12, sm: 3 }}>
              <TextField fullWidth size="small" label="Item Code" value={newProductCode}
                onChange={e => setNewProductCode(e.target.value)} />
            </Grid>
            <Grid size={{ xs: 12, sm: 3 }}>
              <UomPicker options={uomOptions} value={newProductUom} onChange={setNewProductUom} />
            </Grid>
            <Grid size={{ xs: 12, sm: 3 }}>
              <TextField fullWidth size="small" label="Per package" type="number" value={newProductPerPkg}
                onChange={e => setNewProductPerPkg(e.target.value)} />
            </Grid>
            <Grid size={{ xs: 12, sm: 3 }}>
              <TextField fullWidth size="small" label="Site price / unit" type="number" value={newProductPrice}
                onChange={e => setNewProductPrice(e.target.value)} />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddProductOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleAddProduct} disabled={!newProductName.trim()}>Add</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={exportOpen} onClose={() => !exporting && setExportOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Export Biological Control</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Each field is exported as Entry then SUMMARY. Weeks follow the From/To filter.
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <SelectAllCheckbox
              plain
              ids={fieldSetups.map((fs) => fs.id)}
              selectedIds={exportSelected}
              onToggleAll={(ids) => {
                setExportSelected((prev) => {
                  const allOn = ids.length > 0 && ids.every((id) => prev.has(id));
                  return allOn ? new Set() : new Set(ids);
                });
              }}
              label="Select all fields"
            />
            <Typography variant="body2">Select all</Typography>
          </Box>
          {fieldSetups.map((fs) => (
            <Box key={fs.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.25 }}>
              <RowCheckbox
                id={fs.id}
                selectedIds={exportSelected}
                onToggle={toggleExportField}
                label={`Export ${fs.field_name}`}
              />
              <Typography variant="body2">{fs.field_name}</Typography>
            </Box>
          ))}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setExportOpen(false)} disabled={exporting}>Cancel</Button>
          <Button variant="contained" onClick={handleExportExcel} disabled={exporting || exportSelected.size === 0}>
            {exporting ? 'Exporting…' : 'Export'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Import Excel Dialog */}
      <Dialog open={importOpen} onClose={() => setImportOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Import Biological Control Excel</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Upload an Excel file with field sheets (NH 1, NH 2, etc.) and optionally a "products" catalog sheet.
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Sheets import into {activeSeason?.name || 'the current season'}.
          </Typography>
          <Button variant="outlined" component="label" startIcon={<UploadIcon />} disabled={importLoading || !activeSeasonId} fullWidth>
            {importLoading ? 'Importing…' : 'Select Excel File'}
            <input type="file" hidden accept=".xlsx,.xls" onChange={handleExcelImport} />
          </Button>
          {importLoading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}><CircularProgress size={24} /></Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setImportOpen(false)} disabled={importLoading}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Reject pending values (reason goes back to whoever entered them) */}
      <Dialog open={rejectDialog.open} onClose={() => !reviewing && setRejectDialog({ open: false, cells: null, reason: '' })} maxWidth="sm" fullWidth>
        <DialogTitle>
          {rejectDialog.cells ? 'Reject this value' : `Reject all ${pendingKeys.length} pending values`}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            The pending value{rejectDialog.cells ? '' : 's'} will be cleared; any approved value stays as it is.
            The person who entered {rejectDialog.cells ? 'it' : 'them'} sees your reason on the cell and can enter a corrected value.
          </Typography>
          <TextField
            autoFocus
            fullWidth
            multiline
            minRows={2}
            label="Reason (required)"
            value={rejectDialog.reason}
            onChange={(e) => setRejectDialog((prev) => ({ ...prev, reason: e.target.value }))}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRejectDialog({ open: false, cells: null, reason: '' })} disabled={reviewing}>Cancel</Button>
          <Button variant="contained" color="error" onClick={submitReject}
            disabled={reviewing || !rejectDialog.reason.trim()}>
            {reviewing ? 'Rejecting…' : 'Reject'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Scouter / worker: ask the pest agronomist to delete a table */}
      <Dialog open={deleteRequest.open}
        onClose={() => !deleteRequest.sending && setDeleteRequest({ open: false, setupId: null, name: '', reason: '', sending: false })}
        maxWidth="sm" fullWidth>
        <DialogTitle>Request deleting &quot;{deleteRequest.name}&quot;</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            The pest agronomist reviews this request. Nothing is deleted unless it is approved.
          </Typography>
          <TextField
            autoFocus
            fullWidth
            multiline
            minRows={2}
            label="Why should this table be deleted? (required)"
            value={deleteRequest.reason}
            onChange={(e) => setDeleteRequest((prev) => ({ ...prev, reason: e.target.value }))}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteRequest({ open: false, setupId: null, name: '', reason: '', sending: false })}
            disabled={deleteRequest.sending}>Cancel</Button>
          <Button variant="contained" color="error" onClick={submitDeleteRequest}
            disabled={deleteRequest.sending || !deleteRequest.reason.trim()}>
            {deleteRequest.sending ? 'Sending…' : 'Send request'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
