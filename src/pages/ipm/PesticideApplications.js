import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import FitTableContainer from '../../components/table/FitTableContainer';
import { confirmAction } from '../../components/ConfirmDialog';
import { useSearchParams } from 'react-router-dom';
import {
  Box, Typography, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem, Chip,
  IconButton, Alert, CircularProgress, LinearProgress, Card, CardContent, Grid, Tooltip, Select, InputLabel,
  FormControl, FormControlLabel, Autocomplete, Tabs, Tab, InputAdornment, Divider, Checkbox, Fab, Portal,
  Radio, RadioGroup,
} from '@mui/material';
import {
  Check, Close, AddOutlined as Add, TimerOutlined as Timer, SearchOutlined as Search, FileDownloadOutlined as FileDownload,
  AgricultureOutlined as Agriculture, ScienceOutlined as Science, CalendarMonthOutlined as CalendarMonth,
  InventoryOutlined as CatalogIcon,
  HomeOutlined as MySiteIcon,
  PublicOutlined as BrowseIcon,
  EditOutlined as EditIcon,
  CheckOutlined as CheckIcon,
  CloseOutlined as CancelIcon,
  ContentCopyOutlined as CopyIcon,
  DeleteOutlined as DeleteIcon,
  AttachMoneyOutlined as CostIcon,
  PictureAsPdfOutlined as PdfIcon,
  UploadFileOutlined as UploadIcon,
  AssignmentOutlined as WorkOrderIcon,
} from '@mui/icons-material';
import SprayApplicationIcon from '../../components/icons/SprayApplicationIcon';
import { excelTableSx, GutterCell } from '../../components/table/ExcelTable';
import api from '../../utils/api';
import { listAllPesticideApplications } from '../../utils/listPesticideApplications';
import { apiRequest } from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../contexts/NotificationContext';
import { useActiveSite } from '../../contexts/ActiveSiteContext';
import SpreadsheetGrid from '../../components/SpreadsheetGrid';
import SpreadsheetImporter from '../../components/SpreadsheetImporter';
import SegmentSelector from '../../components/SegmentSelector';
import WorkOrders from './WorkOrders';
import PivotPppApplicationTab from '../../components/ipm/PivotPppApplicationTab';
import useSameDaySprayWarn from '../../components/ipm/useSameDaySprayWarn';
import { useMasterData } from '../../utils/useMasterData';
import { isPivotType, groupFieldsByStructure } from '../../utils/fieldTypeHelpers';
import { useActiveSiteStructures } from '../../hooks/useActiveSiteStructures';
import { generateCostingReport, downloadPDF } from '../../utils/pdfExport';
import {
  canApprovePesticideApplication,
  canCreatePesticideApplication,
  canDirectEditDeleteApplication,
  canRequestApplicationChange,
  canEditIpmCatalog,
  autoApprovedOnCreate,
} from '../../utils/ipmAccess';
import useReadOnlyMode from '../../hooks/useReadOnlyMode';
import ReadOnlyBanner from '../../components/ReadOnlyBanner';
import useOpsExcelExport from '../../hooks/useOpsExcelExport';
import { OPS_EXPORT } from '../../utils/companyExcelExport';
import {
  buildPestExcelSheets,
  collectPestExportFilterOptions,
  EMPTY_PEST_EXPORT_FILTERS,
  filterPestApps,
  pestGetters,
  pestJustification,
} from '../../utils/pestExcelExport';
import { PAGE_KEYS } from '../../utils/roleAccess';
import useSeasonListDates from '../../hooks/useSeasonListDates';
import { formatPercentSeen } from '../../utils/percentSeen';
import {
  applyJustificationColumnOptions,
  justificationOptionsFromCatalog,
  catalogJustificationLabel,
  rewriteJustificationRecord,
  uniqueUnknownJustifications,
  normJustification,
} from '../../utils/justificationCatalog';
import useAppLayout from '../../hooks/useAppLayout';
import { fetchOrganizationLogoDataUrl } from '../../utils/organizationLogo';
import InfoNote from '../../components/InfoNote';
import PageTitle from '../../components/PageTitle';
import ExportButton from '../../components/ExportButton';
import FilterBar from '../../components/FilterBar';
import DataSheet from '../../components/table/DataSheet';

// ─── Constants ────────────────────────────────────────────────────

const WEATHER_OPTIONS = ['Sunny', 'Cloudy', 'Windy', 'Rainy', 'Partly Cloudy', 'Hot', 'Humid'];
const UOM_OPTIONS = ['ML', 'GM', 'L', 'KG'];
// Fixed tabs: Records, Work Orders, PHI, Catalog, Costing; optional Pivots (RC-109); then spray/drench templates
const PIVOT_TAB_INDEX = 5;
const WORK_ORDERS_TAB_INDEX = 1;
const TEMPLATE_TAB_OFFSET_WITH_PIVOT = 6;
const TEMPLATE_TAB_OFFSET_NO_PIVOT = 5;
const PIVOT_TEMPLATE_SLUG = 'pest-pivot-rc109';

const PEST_EXPORT_FILTER_FIELDS = [
  { key: 'field', label: 'Field' },
  { key: 'ppp', label: 'Name of PPP' },
  { key: 'activeIngredient', label: 'Active Ingredient' },
  { key: 'variety', label: 'Variety' },
  { key: 'crop', label: 'Crop' },
  { key: 'operator', label: 'Operator' },
  { key: 'segment', label: 'Segment' },
];

const EMPTY_COSTING_EXPORT_FILTERS = {
  ...EMPTY_PEST_EXPORT_FILTERS,
  type: 'all',
};

function collectCombinedApplications(applications, templateRows) {
  const allRows = [...(applications || [])];
  Object.values(templateRows || {}).forEach((rows) => {
    (rows || []).forEach((r) => {
      if (!allRows.find((a) => a.id === r.id)) allRows.push(r);
    });
  });
  return allRows;
}

function costingRowType(row, tplNameMap) {
  const tplName = tplNameMap[row.template_id || row.templateId] || '';
  const lower = tplName.toLowerCase();
  if (lower.includes('drench')) return 'Drench';
  if (lower.includes('pivot')) return 'Pivot';
  return 'Spray';
}

function hasCostingValue(row) {
  const cost = Number(row.cost) || 0;
  const qty = Number(row.total_quantity_applied || row.totalQuantityApplied) || 0;
  return cost !== 0 || qty !== 0;
}

function filterCostingExportRows(rows, filters, getters, tplNameMap) {
  const matched = filterPestApps((rows || []).filter(hasCostingValue), filters, getters);
  const type = String(filters?.type || 'all').toLowerCase();
  if (type === 'all') return matched;
  return matched.filter((row) => costingRowType(row, tplNameMap).toLowerCase() === type);
}

const BULK_ID_BATCH = 2000;

function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

// A record opened from a notification link stays tinted while the mouse moves
// over it, so this has to outrank the hover rule in excelTableSx, which matches
// at the same weight. It paints cells rather than the row because the frozen
// columns carry their own background and would otherwise stay white.
const highlightedRowSx = {
  '&&& .MuiTableBody-root .MuiTableRow-root.row-highlight .MuiTableCell-root': {
    backgroundColor: 'var(--sheet-tint-peach)',
    fontWeight: 600,
  },
};

/**
 * Day an application was made, without its time.
 *
 * Stored dates carry one (2026-06-29T00:00:00.000Z) while the date pickers hand
 * back a bare day, and comparing the two as text sorts a record after its own
 * end date. Every date range in this file has to narrow to the day first, or it
 * silently drops whatever happened on the closing day.
 *
 * @param {object} row application or template row
 * @returns {string} yyyy-mm-dd, or '' when the row carries no date
 */
function applicationDay(row) {
  return String(row.application_date || row.applicationDate || '').slice(0, 10);
}

const EMPTY_CHANGE_REQUEST = { open: false, action: 'update', entityId: null, entityIds: null, payload: null };

const JUSTIFICATION_PRESETS = [
  'Pest : Whitefly', 'Pest : Thrips', 'Pest : Red Spider Mite', 'Pest : Mealybug',
  'Pest : Worm ( Caterpillar )', 'Pest : Aphids', 'Pest : Phytium',
  'Disease : botrytis', 'Disease : Powdery Mildew', 'Disease : Downy Mildew',
  'Preventative',
];

const JUSTIFICATION_CLASSIFY_OPTIONS = [
  { value: 'pest', label: 'Pest' },
  { value: 'disease', label: 'Disease' },
  { value: 'preventative', label: 'Preventative' },
];

/** Matches the PHI chip colours used on the Product Catalog page. */
const phiChipColor = (phiDays) => {
  const days = Number(phiDays);
  if (!Number.isFinite(days)) return 'default';
  if (days === 0) return 'success';
  return days >= 7 ? 'warning' : 'default';
};

const getEmptyForm = () => ({
  fieldId: '', cropName: '', variety: '', segmentId: '',
  scoutingDate: '', justification: '', percentSeen: '',
  applicationDate: new Date().toISOString().split('T')[0],
  applicationStartTime: '', applicationEndTime: '',
  productId: '', activeIngredient: '',
  dosage: '', ratePerHa: '', unitPrice: '', cost: '', uom: 'ML',
  totalQuantityApplied: '', machineryUsed: '',
  weatherConditions: 'Sunny', operatorName: '', verifiedBy: '',
  notes: '',
});

// ─── Component ────────────────────────────────────────────────────

export default function PesticideApplications() {
  const { user } = useAuth();
  const readOnly = useReadOnlyMode(PAGE_KEYS.IPM);
  const notify = useNotification();
  const exportOpsExcel = useOpsExcelExport();
  const { confirmIfSameDay, dialog: sameDaySprayDialog } = useSameDaySprayWarn();
  const { activeSiteId, activeSite } = useActiveSite();
  const { hasPivots } = useActiveSiteStructures();
  const pivotTabIndex = hasPivots ? PIVOT_TAB_INDEX : -1;
  const templateTabOffset = hasPivots ? TEMPLATE_TAB_OFFSET_WITH_PIVOT : TEMPLATE_TAB_OFFSET_NO_PIVOT;
  const { data: masterData } = useMasterData();
  const [searchParams] = useSearchParams();
  const highlightAppId = searchParams.get('applicationId');
  // Operators only act on work orders here, so they land on that tab; ?tab=work-orders deep-links it.
  const openOnWorkOrders = !highlightAppId
    && (searchParams.get('tab') === 'work-orders' || user?.role === 'operator');
  const highlightRef = useRef(null);
  const { isMobile, isPhone, isTablet, scrollRegionHeight } = useAppLayout();
  const sheetHeight = scrollRegionHeight(isMobile ? 200 : 252);
  const pivotSheetHeight = scrollRegionHeight(isMobile ? 168 : 220);

  const siteFarmAreas = useMemo(() => {
    if (!masterData?.countries) return [];
    const areas = [];
    for (const c of masterData.countries) {
      for (const s of c.sites || []) {
        if (activeSiteId && s.id !== activeSiteId) continue;
        for (const fa of s.farmAreas || []) {
          areas.push({ id: fa.id, name: fa.name, fields: (fa.fields || []).map((f) => ({ id: f.id, name: f.name })) });
        }
      }
    }
    return areas;
  }, [masterData, activeSiteId]);

  // Data state
  const [applications, setApplications] = useState([]);
  const [phiStatus, setPhiStatus] = useState([]);
  const [products, setProducts] = useState([]);
  const [fields, setFields] = useState([]);
  const [nurseryFields, setNurseryFields] = useState([]);
  const [plantingRecords, setPlantingRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [applicationsLoading, setApplicationsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [meta, setMeta] = useState({ total: 0 });

  const pivotFields = useMemo(() => {
    const fromMaster = [];
    for (const c of masterData?.countries || []) {
      for (const s of c.sites || []) {
        if (activeSiteId && s.id !== activeSiteId) continue;
        for (const fa of s.farmAreas || []) {
          for (const f of fa.fields || []) {
            fromMaster.push({ ...f, type: f.type });
          }
        }
      }
    }
    const grouped = groupFieldsByStructure(fromMaster.length ? fromMaster : fields);
    const pivots = grouped.pivot.length > 0
      ? grouped.pivot
      : fields.filter((f) => isPivotType(f.type));
    return [...pivots].sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true }));
  }, [masterData, activeSiteId, fields]);

  // Product catalog state
  const [pestCatalogItems, setPestCatalogItems] = useState([]);
  const [pestCatalogBrowse, setPestCatalogBrowse] = useState([]);
  const [pestCatalogFilter, setPestCatalogFilter] = useState('');
  const [pestCatalogTab, setPestCatalogTab] = useState(0);
  const [pestCatalogEditId, setPestCatalogEditId] = useState(null);
  const [pestCatalogEditPrice, setPestCatalogEditPrice] = useState('');
  const [pestCatalogSaving, setPestCatalogSaving] = useState(false);
  const [pestBrowseSelected, setPestBrowseSelected] = useState(new Set());

  // Template-driven spreadsheet state
  const [pestTemplates, setPestTemplates] = useState([]);
  const [pivotTemplate, setPivotTemplate] = useState(null);
  const [templateRows, setTemplateRows] = useState({});
  const [templateRowsLoading, setTemplateRowsLoading] = useState({});
  const [templateSaving, setTemplateSaving] = useState(false);
  const initialTabSet = useRef(false);
  const prevHasPivotsRef = useRef(hasPivots);
  const [importerOpen, setImporterOpen] = useState(false);
  const [importerTemplateId, setImporterTemplateId] = useState(null);
  const [importerTemplateName, setImporterTemplateName] = useState('');
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [deletingAddedToday, setDeletingAddedToday] = useState(false);
  const [pestDiseaseCatalog, setPestDiseaseCatalog] = useState([]);
  const pestDiseaseCatalogRef = useRef([]);
  const classifyWaiterRef = useRef(null);
  const justificationPicksRef = useRef({});
  const [classifyDialog, setClassifyDialog] = useState({ open: false, unknowns: [] });
  const [classifyChoices, setClassifyChoices] = useState({});
  const [classifySaving, setClassifySaving] = useState(false);
  const [exportFilters, setExportFilters] = useState(EMPTY_PEST_EXPORT_FILTERS);
  const [recordSelectedIds, setRecordSelectedIds] = useState(new Set());

  // Crop-specific PHI map for the active site (productId|cropName -> phiDays)
  const [cropPhiMap, setCropPhiMap] = useState(null);
  useEffect(() => {
    if (!activeSiteId) return;
    api.get(`/ipm/site/${activeSiteId}/crop-phi`).then(res => {
      const entries = res.data?.data || [];
      const map = {};
      for (const e of entries) {
        map[`${e.product_id}|${(e.crop_name || '').toLowerCase()}`] = e.phi_days;
      }
      setCropPhiMap(map);
    }).catch(() => {});
  }, [activeSiteId]);

  // Form state
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(getEmptyForm());
  const [formErrors, setFormErrors] = useState({});

  // Records view state
  const [filterField, setFilterField] = useState('all');
  const {
    startDate: filterDateStart,
    endDate: filterDateEnd,
    setStartDate: setFilterDateStart,
    setEndDate: setFilterDateEnd,
    seasonStart,
    seasonEnd,
    isReady: seasonDatesReady,
  } = useSeasonListDates();
  const [searchText, setSearchText] = useState('');
  const [filterVariety, setFilterVariety] = useState('');
  const [filterJustification, setFilterJustification] = useState('');
  const [tabValue, setTabValue] = useState(openOnWorkOrders ? WORK_ORDERS_TAB_INDEX : 0);

  useEffect(() => {
    if (highlightAppId) return;
    if (prevHasPivotsRef.current && !hasPivots && tabValue === PIVOT_TAB_INDEX) {
      setTabValue(0);
    }
    prevHasPivotsRef.current = hasPivots;
  }, [hasPivots, tabValue, highlightAppId]);

  // A notification link (?tab=work-orders&wo=…) can arrive while this page is already open.
  const tabParam = searchParams.get('tab');
  const woParam = searchParams.get('wo');
  useEffect(() => {
    if (tabParam === 'work-orders') setTabValue(WORK_ORDERS_TAB_INDEX);
  }, [tabParam, woParam]);

  useEffect(() => {
    if (initialTabSet.current || highlightAppId || openOnWorkOrders) return;
    initialTabSet.current = true;
    if (hasPivots) setTabValue(PIVOT_TAB_INDEX);
  }, [hasPivots, highlightAppId, openOnWorkOrders]);

  useEffect(() => {
    if (highlightAppId && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });

  // Costing tab state
  const [costDateStart, setCostDateStart] = useState('');
  const [costDateEnd, setCostDateEnd] = useState('');
  const [costTypeFilter, setCostTypeFilter] = useState('all');
  const [costCropFilter, setCostCropFilter] = useState([]);
  const [costProductSearch, setCostProductSearch] = useState('');

  const [costingExportDialogOpen, setCostingExportDialogOpen] = useState(false);
  const [costingExportFilters, setCostingExportFilters] = useState(EMPTY_COSTING_EXPORT_FILTERS);
  const [costingExportBusy, setCostingExportBusy] = useState(false);

  // Approval state
  const [rejectDialog, setRejectDialog] = useState({ open: false, id: null });
  const [rejectReason, setRejectReason] = useState('');
  const [changeRequestDialog, setChangeRequestDialog] = useState(EMPTY_CHANGE_REQUEST);
  const [changeRequestReason, setChangeRequestReason] = useState('');
  const [changeRequestSubmitting, setChangeRequestSubmitting] = useState(false);

  const canApprove = canApprovePesticideApplication(user);
  const canCreate = canCreatePesticideApplication(user);
  const canDirectEdit = canDirectEditDeleteApplication(user);
  const canRequestChange = canRequestApplicationChange(user);
  const canModifyExisting = canDirectEdit || canRequestChange;
  // Site product list and prices are part of the product catalog.
  const canEditCatalog = canEditIpmCatalog(user);
  const createsAutoApproved = autoApprovedOnCreate(user);

  // ─── Costing Computed Data ──────────────────────────────────────

  const costingData = useMemo(() => {
    const allRows = [...applications];
    // Also include template-driven rows
    Object.values(templateRows).forEach(rows => {
      rows.forEach(r => {
        if (!allRows.find(a => a.id === r.id)) allRows.push(r);
      });
    });

    // Build a template name map to derive type (Spray/Drench/Pivot)
    const tplNameMap = {};
    pestTemplates.forEach(t => { tplNameMap[t.id] = t.name; });
    if (pivotTemplate?.id) tplNameMap[pivotTemplate.id] = pivotTemplate.name;

    let filtered = allRows.filter(r => {
      const cost = Number(r.cost) || 0;
      const qty = Number(r.total_quantity_applied || r.totalQuantityApplied) || 0;
      if (cost === 0 && qty === 0) return false;
      const appliedOn = applicationDay(r);
      if (costDateStart && appliedOn < costDateStart) return false;
      if (costDateEnd && appliedOn > costDateEnd) return false;
      const tplName = tplNameMap[r.template_id || r.templateId] || '';
      const type = tplName.toLowerCase().includes('drench') ? 'Drench'
        : tplName.toLowerCase().includes('pivot') ? 'Pivot' : 'Spray';
      if (costTypeFilter !== 'all' && type.toLowerCase() !== costTypeFilter) return false;
      const cropName = r.field_crop_name || r.cropName || r.crop_name || '';
      if (costCropFilter.length > 0 && !costCropFilter.includes(cropName)) return false;
      const productName = (r.product_name || r.productName || '').toLowerCase();
      if (costProductSearch && !productName.includes(costProductSearch.toLowerCase())) return false;
      return true;
    });

    const details = filtered.map(r => {
      const tplName = tplNameMap[r.template_id || r.templateId] || '';
      return {
        id: r.id,
        date: r.application_date || r.applicationDate || '',
        field: r.field_name || r.fieldName || '',
        product: r.product_name || r.productName || '',
        activeIngredient: r.product_active_ingredient || r.activeIngredient || '',
        type: tplName.toLowerCase().includes('drench') ? 'Drench'
          : tplName.toLowerCase().includes('pivot') ? 'Pivot' : 'Spray',
        crop: r.field_crop_name || r.cropName || r.crop_name || '',
        qty: Number(r.total_quantity_applied || r.totalQuantityApplied) || 0,
        unitPrice: Number(r.unit_price || r.unitPrice) || 0,
        cost: Number(r.cost) || 0,
      };
    }).sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    const totalCost = details.reduce((s, r) => s + r.cost, 0);
    const totalQty = details.reduce((s, r) => s + r.qty, 0);
    const totalApps = details.length;
    const uniqueProducts = new Set(details.map(r => r.product).filter(Boolean)).size;

    // Product summary
    const prodMap = {};
    details.forEach(r => {
      if (!r.product) return;
      if (!prodMap[r.product]) prodMap[r.product] = { product: r.product, count: 0, totalQty: 0, totalCost: 0 };
      prodMap[r.product].count++;
      prodMap[r.product].totalQty += r.qty;
      prodMap[r.product].totalCost += r.cost;
    });
    const productSummary = Object.values(prodMap)
      .map(p => ({ ...p, pct: totalCost > 0 ? ((p.totalCost / totalCost) * 100).toFixed(1) : '0.0' }))
      .sort((a, b) => b.totalCost - a.totalCost);

    // Crop summary
    const cropMap = {};
    details.forEach(r => {
      const crop = r.crop || 'Unknown';
      if (!cropMap[crop]) cropMap[crop] = { crop, count: 0, totalQty: 0, totalCost: 0 };
      cropMap[crop].count++;
      cropMap[crop].totalQty += r.qty;
      cropMap[crop].totalCost += r.cost;
    });
    const cropSummary = Object.values(cropMap)
      .map(c => ({ ...c, pct: totalCost > 0 ? ((c.totalCost / totalCost) * 100).toFixed(1) : '0.0' }))
      .sort((a, b) => b.totalCost - a.totalCost);

    // Available crops for filter
    const availableCrops = [...new Set(allRows.map(r => r.field_crop_name || r.cropName || r.crop_name || '').filter(Boolean))].sort();

    return { details, totalCost, totalQty, totalApps, uniqueProducts, productSummary, cropSummary, availableCrops };
  }, [applications, templateRows, pestTemplates, pivotTemplate, costDateStart, costDateEnd, costTypeFilter, costCropFilter, costProductSearch]);

  const costingExportGetters = useMemo(() => pestGetters({
    fieldById: Object.fromEntries((fields || []).map((f) => [f.id, f])),
    productById: Object.fromEntries(
      (pestCatalogItems.length > 0 ? pestCatalogItems : products || []).map((p) => [p.id, p]),
    ),
  }), [fields, pestCatalogItems, products]);

  const costingTplNameMap = useMemo(() => {
    const tplNameMap = {};
    pestTemplates.forEach((t) => { tplNameMap[t.id] = t.name; });
    if (pivotTemplate?.id) tplNameMap[pivotTemplate.id] = pivotTemplate.name;
    return tplNameMap;
  }, [pestTemplates, pivotTemplate]);

  const handleExportCostExcel = useCallback(async () => {
    const allRows = collectCombinedApplications(applications, templateRows);
    const filtered = filterCostingExportRows(
      allRows,
      costingExportFilters,
      costingExportGetters,
      costingTplNameMap,
    );
    if (filtered.length === 0) {
      notify.warning('No records match the selected filters');
      return;
    }
    const details = filtered.map((r) => ({
      Date: r.application_date || r.applicationDate || '',
      Field: r.field_name || r.fieldName || '',
      Product: r.product_name || r.productName || '',
      'Active Ingredient': r.product_active_ingredient || r.activeIngredient || '',
      Type: costingRowType(r, costingTplNameMap),
      Crop: r.field_crop_name || r.cropName || r.crop_name || '',
      'Qty Applied': Number(r.total_quantity_applied || r.totalQuantityApplied) || 0,
      'Unit Price': Number(r.unit_price || r.unitPrice) || 0,
      Cost: Number(r.cost) || 0,
    }));
    const totalCost = details.reduce((s, r) => s + r.Cost, 0);
    const totalQty = details.reduce((s, r) => s + r['Qty Applied'], 0);
    const detailRows = [
      ...details,
      {
        Date: '', Field: '', Product: '', 'Active Ingredient': '', Type: '',
        Crop: 'TOTAL', 'Qty Applied': totalQty, 'Unit Price': '', Cost: totalCost,
      },
    ];

    const prodMap = {};
    details.forEach((r) => {
      if (!r.Product) return;
      if (!prodMap[r.Product]) prodMap[r.Product] = { Product: r.Product, 'Times Used': 0, 'Total Qty': 0, 'Total Cost': 0 };
      prodMap[r.Product]['Times Used']++;
      prodMap[r.Product]['Total Qty'] += r['Qty Applied'];
      prodMap[r.Product]['Total Cost'] += r.Cost;
    });
    const productRows = Object.values(prodMap)
      .map((p) => ({ ...p, '% of Total': totalCost > 0 ? `${((p['Total Cost'] / totalCost) * 100).toFixed(1)}%` : '0.0%' }))
      .sort((a, b) => b['Total Cost'] - a['Total Cost']);

    const cropMap = {};
    details.forEach((r) => {
      const crop = r.Crop || 'Unknown';
      if (!cropMap[crop]) cropMap[crop] = { Crop: crop, Applications: 0, 'Total Qty': 0, 'Total Cost': 0 };
      cropMap[crop].Applications++;
      cropMap[crop]['Total Qty'] += r['Qty Applied'];
      cropMap[crop]['Total Cost'] += r.Cost;
    });
    const cropRows = Object.values(cropMap)
      .map((c) => ({ ...c, '% of Total': totalCost > 0 ? `${((c['Total Cost'] / totalCost) * 100).toFixed(1)}%` : '0.0%' }))
      .sort((a, b) => b['Total Cost'] - a['Total Cost']);

    setCostingExportBusy(true);
    try {
      await exportOpsExcel(null, {
        filename: `IPM_Costing_Report_${new Date().toISOString().slice(0, 10)}`,
        sheets: [
          { sheetName: 'Cost Details', rows: detailRows },
          { sheetName: 'Product Summary', rows: productRows },
          { sheetName: 'Crop Summary', rows: cropRows },
        ],
        ...OPS_EXPORT.costing,
      });
      setCostingExportDialogOpen(false);
    } finally {
      setCostingExportBusy(false);
    }
  }, [
    applications, templateRows, costingExportFilters, costingExportGetters,
    costingTplNameMap, notify, exportOpsExcel,
  ]);

  // ─── PDF Report Generation ─────────────────────────────────────

  const handleGeneratePDF = useCallback(async () => {
    const allRows = collectCombinedApplications(applications, templateRows);
    const filtered = filterCostingExportRows(
      allRows,
      costingExportFilters,
      costingExportGetters,
      costingTplNameMap,
    );
    if (filtered.length === 0) {
      notify.warning('No records match the selected filters');
      return;
    }

    const start = costingExportFilters.dateFrom;
    const end = costingExportFilters.dateTo;

    const fmtDate = (d) => {
      if (!d) return '';
      const dt = new Date(d);
      if (isNaN(dt.getTime())) return String(d);
      return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    };
    const toDateKey = (d) => {
      if (!d) return '';
      return (typeof d === 'string' && d.length >= 10) ? d.substring(0, 10) : new Date(d).toISOString().split('T')[0];
    };

    const details = filtered.map(r => {
      const rawDate = r.application_date || r.applicationDate || '';
      return {
        id: r.id, date: fmtDate(rawDate), dateKey: toDateKey(rawDate),
        field: r.field_name || r.fieldName || '', product: r.product_name || r.productName || '',
        activeIngredient: r.product_active_ingredient || r.activeIngredient || '',
        type: costingRowType(r, costingTplNameMap),
        crop: r.field_crop_name || r.cropName || r.crop_name || '',
        qty: Number(r.total_quantity_applied || r.totalQuantityApplied) || 0,
        unitPrice: Number(r.unit_price || r.unitPrice) || 0,
        cost: Number(r.cost) || 0,
        phiDays: Number(r.phi_days) || 0,
        phiEndDate: r.phi_end_date || '',
        operator: r.operator_name || r.operatorName || '',
      };
    }).sort((a, b) => (b.dateKey || '').localeCompare(a.dateKey || ''));

    const totalCost = details.reduce((s, r) => s + r.cost, 0);
    const totalQty = details.reduce((s, r) => s + r.qty, 0);
    const totalApps = details.length;
    const uniqueProducts = new Set(details.map(r => r.product).filter(Boolean)).size;

    // Product summary
    const prodMap = {};
    details.forEach(r => {
      if (!r.product) return;
      if (!prodMap[r.product]) prodMap[r.product] = { product: r.product, count: 0, totalQty: 0, totalCost: 0 };
      prodMap[r.product].count++;
      prodMap[r.product].totalQty += r.qty;
      prodMap[r.product].totalCost += r.cost;
    });
    const productSummary = Object.values(prodMap)
      .map(p => ({ ...p, pct: totalCost > 0 ? ((p.totalCost / totalCost) * 100).toFixed(1) : '0.0' }))
      .sort((a, b) => b.totalCost - a.totalCost);

    // Crop summary
    const cropMap = {};
    details.forEach(r => {
      const crop = r.crop || 'Unknown';
      if (!cropMap[crop]) cropMap[crop] = { crop, count: 0, totalQty: 0, totalCost: 0 };
      cropMap[crop].count++;
      cropMap[crop].totalQty += r.qty;
      cropMap[crop].totalCost += r.cost;
    });
    const cropSummary = Object.values(cropMap)
      .map(c => ({ ...c, pct: totalCost > 0 ? ((c.totalCost / totalCost) * 100).toFixed(1) : '0.0' }))
      .sort((a, b) => b.totalCost - a.totalCost);

    // PHI Compliance
    const now = new Date();
    let phiActive = 0, phiCleared = 0, phiNone = 0;
    details.forEach(r => {
      if (!r.phiDays || r.phiDays === 0) { phiNone++; return; }
      if (r.phiEndDate && new Date(r.phiEndDate) > now) phiActive++;
      else phiCleared++;
    });
    const phiCompliance = { active: phiActive, cleared: phiCleared, noPhi: phiNone };

    // Active Ingredient totals
    const aiMap = {};
    details.forEach(r => {
      const ai = r.activeIngredient || 'Unknown';
      if (!aiMap[ai]) aiMap[ai] = { name: ai, count: 0, totalQty: 0 };
      aiMap[ai].count++;
      aiMap[ai].totalQty += r.qty;
    });
    const activeIngredients = Object.values(aiMap).sort((a, b) => b.totalQty - a.totalQty);

    // Cost per field
    const fieldMap = {};
    details.forEach(r => {
      const field = r.field || 'Unknown';
      if (!fieldMap[field]) fieldMap[field] = { field, count: 0, totalQty: 0, totalCost: 0 };
      fieldMap[field].count++;
      fieldMap[field].totalQty += r.qty;
      fieldMap[field].totalCost += r.cost;
    });
    const costPerField = Object.values(fieldMap)
      .map(f => ({ ...f, pct: totalCost > 0 ? ((f.totalCost / totalCost) * 100).toFixed(1) : '0.0' }))
      .sort((a, b) => b.totalCost - a.totalCost);

    // Application frequency by field (top 10)
    const frequencyByField = Object.values(fieldMap)
      .map(f => ({
        field: f.field, count: f.count,
        distinctProducts: new Set(details.filter(d => d.field === f.field).map(d => d.product)).size,
        avgCost: f.count > 0 ? f.totalCost / f.count : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Top 5 costliest days
    const dayMap = {};
    details.forEach(r => {
      if (!r.dateKey) return;
      if (!dayMap[r.dateKey]) dayMap[r.dateKey] = { date: r.date, count: 0, totalCost: 0, productSet: new Set() };
      dayMap[r.dateKey].count++;
      dayMap[r.dateKey].totalCost += r.cost;
      if (r.product) dayMap[r.dateKey].productSet.add(r.product);
    });
    const top5Days = Object.values(dayMap)
      .map(d => ({ date: d.date, count: d.count, totalCost: d.totalCost, products: [...d.productSet].join(', ') }))
      .sort((a, b) => b.totalCost - a.totalCost)
      .slice(0, 5);

    // Weekly breakdown (Mon-to-Mon)
    const weekMap = {};
    details.forEach(r => {
      if (!r.dateKey) return;
      const d = new Date(r.dateKey);
      const day = d.getDay();
      const offset = day === 0 ? -6 : 1 - day;
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() + offset);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      const key = weekStart.toISOString().split('T')[0];
      if (!weekMap[key]) weekMap[key] = {
        label: `${weekStart.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} – ${weekEnd.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`,
        count: 0, totalQty: 0, totalCost: 0, sortKey: key,
      };
      weekMap[key].count++;
      weekMap[key].totalQty += r.qty;
      weekMap[key].totalCost += r.cost;
    });
    const weeklyBreakdown = Object.values(weekMap).sort((a, b) => a.sortKey.localeCompare(b.sortKey));

    // Period comparison: compute previous period of same duration
    let prevPeriod = null;
    if (start && end) {
      const startD = new Date(start);
      const endD = new Date(end);
      const duration = endD.getTime() - startD.getTime();
      const prevEnd = new Date(startD.getTime() - 1);
      const prevStart = new Date(prevEnd.getTime() - duration);
      const prevS = prevStart.toISOString().split('T')[0];
      const prevE = prevEnd.toISOString().split('T')[0];

      const prevFiltered = filterCostingExportRows(
        allRows,
        { ...costingExportFilters, dateFrom: prevS, dateTo: prevE },
        costingExportGetters,
        costingTplNameMap,
      );

      const prevCost = prevFiltered.reduce((s, r) => s + (Number(r.cost) || 0), 0);
      const prevQty = prevFiltered.reduce((s, r) => s + (Number(r.total_quantity_applied || r.totalQuantityApplied) || 0), 0);
      const prevApps = prevFiltered.length;

      const fmtShort = (d) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
      prevPeriod = {
        label: `${fmtShort(prevS)} – ${fmtShort(prevE)}`,
        cost: prevCost, qty: prevQty, apps: prevApps,
      };
    }

    const dateRange = (start || end) ? `${start || '...'} to ${end || '...'}` : null;
    const typeFilter = costingExportFilters.type || 'all';
    const subtitleText = typeFilter !== 'all'
      ? `${typeFilter.charAt(0).toUpperCase() + typeFilter.slice(1)} Applications`
      : 'All Applications';

    setCostingExportBusy(true);
    try {
      const logoDataUrl = await fetchOrganizationLogoDataUrl();
      const doc = generateCostingReport({
        siteName: activeSite?.name || 'Al Maha Farm',
        dateRange,
        subtitle: subtitleText,
        generatedBy: user?.name || user?.email || '',
        logoDataUrl,
        totalCost, totalQty, totalApps, uniqueProducts,
        prevPeriod,
        details,
        productSummary,
        cropSummary,
        phiCompliance,
        activeIngredients,
        costPerField,
        frequencyByField,
        top5Days,
        weeklyBreakdown,
      });

      const fileDateRange = start && end ? `_${start}_to_${end}` : '';
      downloadPDF(doc, `IPM_Costing_Report${fileDateRange}.pdf`);
      setCostingExportDialogOpen(false);
    } finally {
      setCostingExportBusy(false);
    }
  }, [
    applications, templateRows, costingExportFilters, costingExportGetters,
    costingTplNameMap, notify, activeSite, user,
  ]);

  // ─── Data Loading ─────────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (!seasonDatesReady) return;
    setApplicationsLoading(true);
    try {
      setLoadError(null);
      const params = new URLSearchParams();
      if (filterField !== 'all') params.set('field_id', filterField);
      if (filterDateStart) params.set('start_date', filterDateStart);
      if (filterDateEnd) params.set('end_date', filterDateEnd);
      if (searchText.trim()) params.set('search', searchText.trim());
      if (filterVariety.trim()) params.set('variety', filterVariety.trim());
      if (filterJustification.trim()) params.set('justification', filterJustification.trim());
      if (activeSiteId) params.set('site_id', activeSiteId);

      const fieldParams = activeSiteId ? `?site_id=${activeSiteId}&limit=10000` : '?limit=10000';

      const plantingParams = activeSiteId ? `?site_id=${activeSiteId}` : '';
      const [appsRes, phiRes, prodsRes, fieldsRes, plantingRes, nurseryRes] = await Promise.all([
        listAllPesticideApplications(params),
        api.get(`/ipm/phi-status${activeSiteId ? `?site_id=${activeSiteId}` : ''}`),
        api.get('/ipm/pesticide-products/active'),
        api.get(`/fields${fieldParams}`),
        // Optional context (crop/segments) — a refused or failed call must not blank the page.
        api.get(`/planting-records${plantingParams}`).catch(() => ({ data: { data: [] } })),
        api.get(`/planting-records/nurseries${plantingParams}`).catch(() => ({ data: { data: [] } })),
      ]);
      setApplications(appsRes.items);
      setMeta(appsRes.meta || { total: appsRes.items.length });
      setPhiStatus(phiRes.data.data || []);
      setProducts(prodsRes.data.data || []);
      setFields(fieldsRes.data.data || []);
      setPlantingRecords(plantingRes.data.data || plantingRes.data || []);
      setNurseryFields(nurseryRes.data?.data || nurseryRes.data || []);
    } catch (err) {
      console.error('Failed to load data:', err);
      setLoadError(err.message || 'Failed to load data. Please try again.');
    } finally {
      setApplicationsLoading(false);
      setLoading(false);
    }
  }, [filterField, filterDateStart, filterDateEnd, searchText, filterVariety, filterJustification, activeSiteId, seasonDatesReady]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    setRecordSelectedIds(new Set());
  }, [filterField, filterDateStart, filterDateEnd, searchText, filterVariety, filterJustification, activeSiteId]);

  // ─── Product Catalog Loading ────────────────────────────────────

  const loadPestCatalog = useCallback(async () => {
    try {
      if (activeSiteId) {
        const data = await apiRequest(`/ipm/pesticide-products/site/${activeSiteId}`);
        setPestCatalogItems(data);
      } else {
        const res = await api.get('/ipm/pesticide-products/active');
        setPestCatalogItems(res.data.data || []);
      }
    } catch (err) {
      setPestCatalogItems([]);
      notify.error(err.message || 'Failed to load site catalog');
    }
  }, [activeSiteId, notify]);

  const loadPestCatalogBrowse = useCallback(async () => {
    try {
      const data = await apiRequest('/ipm/pesticide-products/browse');
      setPestCatalogBrowse(data);
    } catch (err) {
      setPestCatalogBrowse([]);
      notify.error(err.message || 'Failed to load product catalog');
    }
  }, [notify]);

  useEffect(() => {
    if (activeSiteId) loadPestCatalog();
  }, [activeSiteId, loadPestCatalog]);

  useEffect(() => {
    if (tabValue === 3) {
      if (pestCatalogTab === 1) loadPestCatalogBrowse();
    }
  }, [tabValue, pestCatalogTab, loadPestCatalogBrowse]);

  const loadPestDiseaseCatalog = useCallback(async () => {
    try {
      const res = await api.get('/scouting/pest-catalog');
      const list = res.data?.data || [];
      pestDiseaseCatalogRef.current = list;
      setPestDiseaseCatalog(list);
    } catch {
      pestDiseaseCatalogRef.current = [];
      setPestDiseaseCatalog([]);
    }
  }, []);

  useEffect(() => {
    loadPestDiseaseCatalog();
  }, [loadPestDiseaseCatalog]);

  const justificationOptionList = useMemo(() => {
    const fromCatalog = justificationOptionsFromCatalog(pestDiseaseCatalog);
    return fromCatalog.length > 0 ? fromCatalog : JUSTIFICATION_PRESETS;
  }, [pestDiseaseCatalog]);

  const justificationOptionString = useMemo(
    () => justificationOptionList.join(','),
    [justificationOptionList],
  );

  const promptClassifyUnknowns = useCallback((unknowns) => {
    if (!unknowns.length) return Promise.resolve({});
    return new Promise((resolve) => {
      classifyWaiterRef.current = resolve;
      setClassifyChoices(Object.fromEntries(
        unknowns.map((item) => [item.bareName, {
          matchId: '',
          category: item.categoryHint || 'pest',
          groupIds: [],
        }]),
      ));
      setClassifyDialog({ open: true, unknowns });
    });
  }, []);

  const finishClassify = useCallback((result) => {
    const resolve = classifyWaiterRef.current;
    classifyWaiterRef.current = null;
    setClassifyDialog({ open: false, unknowns: [] });
    setClassifySaving(false);
    if (resolve) resolve(result);
  }, []);

  const createUnknownJustifications = useCallback(async (unknowns) => {
    if (!unknowns.length) return true;
    const choices = await promptClassifyUnknowns(unknowns);
    if (!choices) return false;
    setClassifySaving(true);
    const added = [];
    const picks = { ...justificationPicksRef.current };
    let createFailed = false;
    try {
      for (const item of unknowns) {
        const choice = choices[item.bareName] || {};
        const matchId = choice.matchId;
        if (matchId) {
          const entry = pestDiseaseCatalogRef.current.find((row) => row.id === matchId);
          if (entry) {
            picks[normJustification(item.bareName)] = { matchId, entry };
            continue;
          }
        }
        const category = choice.category || 'pest';
        try {
          const res = await api.post('/scouting/pest-catalog', {
            name: item.bareName,
            category,
            groupIds: choice.groupIds || [],
          });
          added.push(res.data?.data || { name: item.bareName, category, is_active: true });
        } catch {
          createFailed = true;
          added.push({ name: item.bareName, category, is_active: true });
        }
      }
    } finally {
      setClassifySaving(false);
    }
    const next = [...pestDiseaseCatalogRef.current, ...added];
    pestDiseaseCatalogRef.current = next;
    setPestDiseaseCatalog(next);
    justificationPicksRef.current = picks;
    if (createFailed) {
      notify.error('Some justifications were saved on the application but could not be added to the Pest Catalog');
    }
    return true;
  }, [notify, promptClassifyUnknowns]);

  const ensureJustifications = useCallback(async (values) => {
    const catalog = pestDiseaseCatalogRef.current;
    const unknowns = uniqueUnknownJustifications(values, catalog);
    if (unknowns.length > 0) {
      const created = await createUnknownJustifications(unknowns);
      if (!created) return null;
    }
    const latest = pestDiseaseCatalogRef.current;
    const picks = justificationPicksRef.current;
    return (values || []).map((value) => rewriteJustificationRecord(value, latest, picks));
  }, [createUnknownJustifications]);

  const ensureOneJustification = useCallback(async (value) => {
    if (!String(value || '').trim()) {
      return { justification: '', justificationCatalogId: null };
    }
    const rewritten = await ensureJustifications([value]);
    if (!rewritten) return undefined;
    return rewritten[0];
  }, [ensureJustifications]);

  // ─── Template Loading ──────────────────────────────────────────
  const loadPestTemplates = useCallback(async () => {
    try {
      let all = [];
      if (activeSiteId) {
        const res = await api.get(`/form-templates/site/${activeSiteId}`);
        all = res.data.data || [];
        const sitePest = all.filter((t) => t.category === 'pest');
        if (sitePest.length === 0) {
          const allRes = await api.get('/form-templates');
          all = allRes.data.data || [];
        }
      } else {
        const res = await api.get('/form-templates');
        all = res.data.data || [];
      }
      const pestAll = all.filter((t) => t.category === 'pest');
      const pivotTpl = pestAll.find((t) => t.slug === PIVOT_TEMPLATE_SLUG) || null;
      setPivotTemplate(pivotTpl);
      setPestTemplates(
        pestAll.filter((t) => t.columns_config && t.slug !== PIVOT_TEMPLATE_SLUG),
      );
    } catch (err) {
      setPestTemplates([]);
      setPivotTemplate(null);
      notify.error(err.message || 'Failed to load templates');
    }
  }, [activeSiteId, notify]);

  const loadTemplateRows = useCallback(async (templateId) => {
    setTemplateRowsLoading((prev) => ({ ...prev, [templateId]: true }));
    try {
      const params = new URLSearchParams({ template_id: templateId });
      if (activeSiteId) params.set('site_id', activeSiteId);
      const { items } = await listAllPesticideApplications(params);
      setTemplateRows(prev => ({ ...prev, [templateId]: items }));
    } catch (err) {
      notify.error(err.message || 'Failed to load application rows');
      setTemplateRows(prev => ({ ...prev, [templateId]: [] }));
    } finally {
      setTemplateRowsLoading((prev) => ({ ...prev, [templateId]: false }));
    }
  }, [activeSiteId, notify]);

  useEffect(() => { loadPestTemplates(); }, [loadPestTemplates]);

  const handlePivotRecordsChange = useCallback((rawRows) => {
    if (!pivotTemplate?.id) return;
    setTemplateRows((prev) => ({ ...prev, [pivotTemplate.id]: rawRows }));
  }, [pivotTemplate?.id]);

  const prevSiteIdRef = useRef(activeSiteId);
  useEffect(() => {
    if (prevSiteIdRef.current === activeSiteId) return;
    prevSiteIdRef.current = activeSiteId;
    if (openOnWorkOrders) { setTabValue(WORK_ORDERS_TAB_INDEX); return; }
    setTabValue(highlightAppId ? 0 : (hasPivots ? PIVOT_TAB_INDEX : 0));
  }, [activeSiteId, hasPivots, highlightAppId, openOnWorkOrders]);

  useEffect(() => {
    const templateIdx = tabValue - templateTabOffset;
    if (templateIdx >= 0 && templateIdx < pestTemplates.length) {
      const tpl = pestTemplates[templateIdx];
      if (tpl?.id && !templateRows[tpl.id]) {
        loadTemplateRows(tpl.id);
      }
    }
  }, [tabValue, pestTemplates, templateRows, loadTemplateRows, templateTabOffset]);

  const submitChangeRequest = useCallback(async () => {
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
      setChangeRequestDialog(EMPTY_CHANGE_REQUEST);
      setChangeRequestReason('');
    } catch (err) {
      notify.error(err.message || 'Failed to submit change request');
    } finally {
      setChangeRequestSubmitting(false);
    }
  }, [changeRequestDialog, changeRequestReason, notify, activeSiteId]);

  const handleSpreadsheetSave = useCallback(async (payload) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const applicationDate = payload.applicationDate || today;
      if (payload.scoutingDate && applicationDate && payload.scoutingDate > applicationDate) {
        notify.error('Scouting date cannot be after application date');
        return null;
      }
      const resolved = await ensureOneJustification(payload.justification);
      if (resolved === undefined) return null;
      const data = {
        ...payload,
        justification: resolved.justification,
        justificationCatalogId: resolved.justificationCatalogId,
        applicationDate,
        siteId: activeSiteId,
      };
      if (payload.id) {
        setTemplateSaving(true);
        try {
          if (canDirectEdit) {
            const res = await api.put(`/ipm/pesticide-applications/${payload.id}`, data);
            return res.data.data;
          }
          if (canRequestChange) {
            setChangeRequestDialog({ open: true, action: 'update', entityId: payload.id, entityIds: [payload.id], payload: data });
            return null;
          }
          notify.error('You do not have permission to edit application records');
          return null;
        } finally {
          setTemplateSaving(false);
        }
      }
      const ok = await confirmIfSameDay({ fieldId: data.fieldId, dateYmd: applicationDate });
      if (!ok) return null;
      setTemplateSaving(true);
      try {
        const res = await api.post('/ipm/pesticide-applications', data);
        return res.data.data;
      } finally {
        setTemplateSaving(false);
      }
    } catch (err) {
      notify.error(err.message || 'Failed to save row');
      return null;
    }
  }, [notify, activeSiteId, canDirectEdit, canRequestChange, confirmIfSameDay, ensureOneJustification]);

  const removeAppsByIds = useCallback((ids) => {
    const idSet = new Set(ids);
    setApplications((prev) => prev.filter((a) => !idSet.has(a.id)));
    setTemplateRows((prev) => {
      const updated = {};
      for (const [tplId, rows] of Object.entries(prev)) {
        updated[tplId] = rows.filter((r) => !idSet.has(r.id));
      }
      return updated;
    });
    setRecordSelectedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
  }, []);

  const handleSpreadsheetDelete = useCallback(async (id) => {
    try {
      if (canDirectEdit) {
        await api.delete(`/ipm/pesticide-applications/${id}`);
      } else if (canRequestChange) {
        setChangeRequestDialog({ open: true, action: 'delete', entityId: id, entityIds: [id], payload: null });
        return false;
      } else {
        notify.error('You do not have permission to delete application records');
        return false;
      }
      removeAppsByIds([id]);
      notify.success('Row deleted');
      loadData();
      return true;
    } catch (err) {
      notify.error(err.message || 'Failed to delete row');
      return false;
    }
  }, [notify, canDirectEdit, canRequestChange, removeAppsByIds, loadData]);

  const handleSpreadsheetBulkDelete = useCallback(async (ids) => {
    if (!ids?.length) return false;
    if (canRequestChange && !canDirectEdit) {
      setChangeRequestDialog({ open: true, action: 'delete', entityId: ids[0], entityIds: ids, payload: null });
      return false;
    }
    if (!canDirectEdit) {
      notify.error('Bulk delete requires IPM admin');
      throw new Error('Bulk delete requires IPM admin');
    }
    try {
      let deleted = 0;
      for (const batch of chunkArray(ids, BULK_ID_BATCH)) {
        const res = await api.post('/ipm/pesticide-applications/bulk-delete', { ids: batch });
        deleted += res.data?.data?.deleted ?? batch.length;
      }
      removeAppsByIds(ids);
      notify.success(`${deleted} row${deleted === 1 ? '' : 's'} deleted`);
      loadData();
      return true;
    } catch (err) {
      notify.error(err.message || 'Failed to delete rows');
      throw err;
    }
  }, [canDirectEdit, canRequestChange, notify, removeAppsByIds, loadData]);

  const handleDeleteAddedToday = useCallback(async (templateId) => {
    if (!canDirectEdit) return;
    if (!activeSiteId) {
      notify.error('Select a site first');
      return;
    }
    setDeletingAddedToday(true);
    try {
      const params = new URLSearchParams({ site_id: activeSiteId });
      if (templateId) params.set('template_id', templateId);
      const preview = await api.get(`/ipm/pesticide-applications/created-today?${params}`);
      const count = preview.data?.data?.count ?? 0;
      if (count === 0) {
        notify.warning('No records added today on this tab');
        return;
      }
      if (!(await confirmAction(`Delete ${count} record${count === 1 ? '' : 's'} added today on this tab?`))) {
        return;
      }
      const res = await api.post('/ipm/pesticide-applications/delete-created-today', {
        siteId: activeSiteId,
        ...(templateId ? { templateId } : {}),
      });
      const deleted = res.data?.data?.deleted ?? count;
      notify.success(`${deleted} record${deleted === 1 ? '' : 's'} added today deleted`);
      if (templateId) loadTemplateRows(templateId);
      loadData();
    } catch (err) {
      notify.error(err.message || 'Failed to delete records added today');
    } finally {
      setDeletingAddedToday(false);
    }
  }, [canDirectEdit, activeSiteId, notify, loadTemplateRows, loadData]);

  const pestMySiteIds = useMemo(() => new Set(pestCatalogItems.map(p => p.id)), [pestCatalogItems]);

  const filteredPestCatalog = useMemo(() => {
    if (!pestCatalogFilter.trim()) return pestCatalogItems;
    const q = pestCatalogFilter.toLowerCase();
    return pestCatalogItems.filter(p =>
      (p.name || '').toLowerCase().includes(q) ||
      (p.active_ingredient || '').toLowerCase().includes(q)
    );
  }, [pestCatalogItems, pestCatalogFilter]);

  const filteredPestBrowse = useMemo(() => {
    if (!pestCatalogFilter.trim()) return pestCatalogBrowse;
    const q = pestCatalogFilter.toLowerCase();
    return pestCatalogBrowse.filter(p =>
      (p.name || '').toLowerCase().includes(q) ||
      (p.active_ingredient || '').toLowerCase().includes(q)
    );
  }, [pestCatalogBrowse, pestCatalogFilter]);

  const pestBrowseSelectableIds = useMemo(() =>
    filteredPestBrowse.filter(p => !pestMySiteIds.has(p.id)).map(p => p.id),
    [filteredPestBrowse, pestMySiteIds],
  );

  const handlePestPriceSave = async (productId) => {
    if (!activeSiteId) return;
    setPestCatalogSaving(true);
    try {
      await apiRequest(`/ipm/pesticide-products/site/${activeSiteId}/${productId}`, {
        method: 'PUT',
        body: JSON.stringify({ unitPrice: parseFloat(pestCatalogEditPrice) || null }),
      });
      await loadPestCatalog();
      setPestCatalogEditId(null);
      setPestCatalogEditPrice('');
    } catch (err) {
      notify.error(err.message || 'Failed to save price');
    } finally {
      setPestCatalogSaving(false);
    }
  };

  const handlePestRemove = async (productId, name) => {
    if (!(await confirmAction(`Remove "${name}" from this site?`))) return;
    try {
      await apiRequest(`/ipm/pesticide-products/site/${activeSiteId}/${productId}`, { method: 'DELETE' });
      setPestCatalogItems(prev => prev.filter(p => p.id !== productId));
      notify.success('Removed');
    } catch (err) {
      notify.error(err.message || 'Failed to remove');
    }
  };

  const handlePestCopyToSite = async (productIds) => {
    if (!activeSiteId) { notify.error('Select a site first'); return; }
    const ids = Array.isArray(productIds) ? productIds : [productIds];
    setPestCatalogSaving(true);
    try {
      await apiRequest(`/ipm/pesticide-products/site/${activeSiteId}/assign`, {
        method: 'POST',
        body: JSON.stringify({ productIds: ids }),
      });
      notify.success(`${ids.length} product${ids.length !== 1 ? 's' : ''} copied to your site`);
      setPestBrowseSelected(new Set());
      await loadPestCatalog();
      await loadPestCatalogBrowse();
    } catch (err) {
      notify.error(err.message || 'Failed to copy');
    } finally {
      setPestCatalogSaving(false);
    }
  };

  // ─── Auto-fill Helpers ────────────────────────────────────────

  const selectedProduct = useMemo(
    () => (pestCatalogItems.length > 0 ? pestCatalogItems : products).find((p) => p.id === form.productId),
    [pestCatalogItems, products, form.productId]
  );

  const selectedField = useMemo(
    () => fields.find((f) => f.id === form.fieldId),
    [fields, form.fieldId]
  );

  const handleFieldChange = (fieldId) => {
    const field = fields.find((f) => f.id === fieldId);
    setForm((prev) => ({
      ...prev,
      fieldId,
      cropName: field?.current_crop || field?.crop_name || prev.cropName,
      variety: field?.varietyName || field?.variety || prev.variety,
    }));
  };

  const handleProductChange = (productId) => {
    const productList = pestCatalogItems.length > 0 ? pestCatalogItems : products;
    const product = productList.find((p) => p.id === productId);
    setForm((prev) => ({
      ...prev,
      productId,
      activeIngredient: product?.active_ingredient || '',
      unitPrice: product?.site_price != null ? String(product.site_price) : prev.unitPrice,
    }));
  };

  // Auto-calculate cost when rate and unit price change
  const handleCostFields = (field, value) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === 'ratePerHa' || field === 'unitPrice') {
        const rate = parseFloat(field === 'ratePerHa' ? value : next.ratePerHa) || 0;
        const price = parseFloat(field === 'unitPrice' ? value : next.unitPrice) || 0;
        if (rate > 0 && price > 0) {
          next.cost = (rate * price).toFixed(2);
        }
      }
      return next;
    });
  };

  // PHI auto-calculation (with crop-specific override support)
  const phiDays = useMemo(() => {
    if (!form.productId) return 0;
    if (cropPhiMap && form.cropName) {
      const key = `${form.productId}|${form.cropName.toLowerCase()}`;
      if (cropPhiMap[key] != null) return cropPhiMap[key];
    }
    return selectedProduct?.phi_days || 0;
  }, [form.productId, form.cropName, cropPhiMap, selectedProduct]);

  const clearToHarvestDate = useMemo(() => {
    if (!form.applicationDate || !phiDays) return '';
    const d = new Date(form.applicationDate);
    if (form.applicationEndTime && form.applicationEndTime.includes(':')) {
      const [h, m] = form.applicationEndTime.split(':').map(Number);
      d.setHours(h || 0, m || 0);
    }
    d.setDate(d.getDate() + phiDays);
    const day = String(d.getDate()).padStart(2, '0');
    const mon = d.toLocaleString('en', { month: 'short' });
    const yr = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    if (d.getHours() === 0 && d.getMinutes() === 0) return `${day} ${mon} ${yr}`;
    return `${day} ${mon} ${yr}, ${hh}:${mm}`;
  }, [form.applicationDate, form.applicationEndTime, phiDays]);

  // ─── Form Validation ─────────────────────────────────────────

  const validateForm = () => {
    const errors = {};
    if (!form.fieldId) errors.fieldId = 'Field is required';
    if (!form.productId) errors.productId = 'Product is required';
    if (!form.applicationDate) errors.applicationDate = 'Application date is required';

    // Numeric fields must be positive when provided
    if (form.dosage && (isNaN(form.dosage) || Number(form.dosage) <= 0))
      errors.dosage = 'Must be a positive number';
    if (form.ratePerHa && (isNaN(form.ratePerHa) || Number(form.ratePerHa) <= 0))
      errors.ratePerHa = 'Must be a positive number';
    if (form.unitPrice && (isNaN(form.unitPrice) || Number(form.unitPrice) < 0))
      errors.unitPrice = 'Must be zero or positive';
    if (form.cost && (isNaN(form.cost) || Number(form.cost) < 0))
      errors.cost = 'Must be zero or positive';
    if (form.totalQuantityApplied && (isNaN(form.totalQuantityApplied) || Number(form.totalQuantityApplied) <= 0))
      errors.totalQuantityApplied = 'Must be a positive number';

    // Scouting date should not be after application date
    if (form.scoutingDate && form.applicationDate && form.scoutingDate > form.applicationDate)
      errors.scoutingDate = 'Scouting date cannot be after application date';

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // ─── Handlers ─────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!validateForm()) return;
    const ok = await confirmIfSameDay({ fieldId: form.fieldId, dateYmd: form.applicationDate });
    if (!ok) return;
    const resolved = await ensureOneJustification(form.justification);
    if (resolved === undefined) return;
    setCreating(true);
    try {
      await api.post('/ipm/pesticide-applications', {
        ...form,
        justification: resolved.justification,
        justificationCatalogId: resolved.justificationCatalogId,
        siteId: activeSiteId,
      });
      setShowCreate(false);
      setForm(getEmptyForm());
      setFormErrors({});
      notify.success('Application submitted for approval');
      loadData();
    } catch (err) {
      notify.error(err.message || 'Failed to create application');
    } finally {
      setCreating(false);
    }
  };

  const handleApprove = async (id) => {
    try {
      await api.post(`/ipm/pesticide-applications/${id}/approve`);
      notify.success('Application approved');
      loadData();
    } catch (err) {
      notify.error(err.message || 'Failed to approve application');
    }
  };

  const handleBulkApproveSelected = async () => {
    const ids = applications
      .filter((app) => recordSelectedIds.has(app.id) && app.approval_status === 'pending')
      .map((app) => app.id);
    if (ids.length === 0) {
      notify.warning('No pending records selected');
      return;
    }
    try {
      let approved = 0;
      for (const batch of chunkArray(ids, BULK_ID_BATCH)) {
        const res = await api.post('/ipm/pesticide-applications/bulk-approve', { ids: batch });
        approved += res.data?.data?.approved ?? batch.length;
      }
      notify.success(`${approved} application${approved === 1 ? '' : 's'} approved`);
      setRecordSelectedIds(new Set());
      loadData();
    } catch (err) {
      notify.error(err.message || 'Failed to approve applications');
    }
  };

  const handleRecordsDelete = async (id) => {
    if (canDirectEdit && !(await confirmAction('Delete this application record?'))) return;
    try {
      await handleSpreadsheetDelete(id);
    } catch (err) {
      notify.error(err.message || 'Failed to delete record');
    }
  };

  const handleRecordsBulkDelete = async () => {
    const ids = [...recordSelectedIds];
    if (ids.length === 0) return;
    if (canRequestChange && !canDirectEdit) {
      setChangeRequestDialog({ open: true, action: 'delete', entityId: ids[0], entityIds: ids, payload: null });
      return;
    }
    if (!(await confirmAction(`Delete ${ids.length} selected record${ids.length === 1 ? '' : 's'}?`))) return;
    try {
      await handleSpreadsheetBulkDelete(ids);
    } catch (err) {
      notify.error(err.message || 'Failed to delete records');
    }
  };

  const toggleRecordSelected = (id) => {
    setRecordSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const pendingSelectedCount = applications.filter(
    (app) => recordSelectedIds.has(app.id) && app.approval_status === 'pending',
  ).length;

  const handleReject = async () => {
    try {
      await api.post(`/ipm/pesticide-applications/${rejectDialog.id}/reject`, { reason: rejectReason });
      setRejectDialog({ open: false, id: null });
      setRejectReason('');
      notify.success('Application rejected');
      loadData();
    } catch (err) {
      notify.error(err.message || 'Failed to reject application');
    }
  };

  const getStatusColor = (status) => {
    if (status === 'approved') return 'success';
    if (status === 'rejected') return 'error';
    return 'warning';
  };

  // ─── Records sheet (desktop) / cards (phone) ─────────────────
  const showDate = (v, opts) => {
    if (!v) return null;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return null;
    return opts ? d.toLocaleDateString('en-GB', opts) : d.toLocaleDateString();
  };
  const showPhiEnd = (v) => {
    if (!v) return null;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return null;
    const s = d.toLocaleDateString('en-GB');
    return d.getHours() || d.getMinutes()
      ? `${s}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
      : s;
  };
  const statusLabel = (s) => ({ approved: 'Approved', rejected: 'Rejected', pending: 'Pending' }[s] || s || '—');
  const statusChip = (app) => (
    <Chip label={statusLabel(app.approval_status)} color={getStatusColor(app.approval_status)} size="small" />
  );
  const numOrNull = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

  const recordColumns = [
    { key: 'crop', label: 'Crop', frozen: true, width: 140, value: (a) => a.crop_name || a.field_crop_name || '' },
    { key: 'variety', label: 'Variety', frozen: true, width: 110, value: (a) => a.variety || '' },
    { key: 'field', label: 'Field ID', frozen: true, width: 100, value: (a) => a.field_name || '' },
    { key: 'segment', label: 'Segment', group: 'Scouting', translate: true, minWidth: 100, value: (a) => (a.segment_id === 'ALL' ? 'Entire Field' : a.segment_id || '') },
    { key: 'scouting_date', label: 'Scouting Date', group: 'Scouting', minWidth: 100, value: (a) => a.scouting_date || null, render: (a) => showDate(a.scouting_date) },
    { key: 'justification', label: 'Justification', group: 'Scouting', minWidth: 140, value: (a) => pestJustification(a) || '' },
    { key: 'percent_seen', label: '% Seen', group: 'Scouting', numeric: true, minWidth: 90, value: (a) => numOrNull(a.percent_seen), render: (a) => formatPercentSeen(a.percent_seen) },
    { key: 'application_date', label: 'App. Date', group: 'Application details', minWidth: 110, value: (a) => a.application_date || null, render: (a) => showDate(a.application_date) },
    { key: 'start', label: 'Start', group: 'Application details', minWidth: 80, value: (a) => a.application_start_time || '' },
    { key: 'end', label: 'End', group: 'Application details', minWidth: 80, value: (a) => a.application_end_time || '' },
    { key: 'machinery', label: 'Machinery', group: 'Application details', minWidth: 110, value: (a) => a.machinery_used || a.application_method || '' },
    { key: 'weather', label: 'Weather', group: 'Application details', minWidth: 90, hidden: true, value: (a) => a.weather_conditions || '' },
    { key: 'operator', label: 'Operator', group: 'Application details', minWidth: 110, value: (a) => a.operator_name || '' },
    { key: 'product', label: 'Name of PPP', group: 'Product & cost', minWidth: 140, value: (a) => a.product_name || '', cellSx: { fontWeight: 600 } },
    { key: 'ai', label: 'Active Ingredient', group: 'Product & cost', minWidth: 150, value: (a) => a.active_ingredient || a.product_active_ingredient || '', cellSx: { fontSize: '0.8125rem' } },
    { key: 'dosage', label: 'Dose/L', group: 'Product & cost', numeric: true, minWidth: 80, value: (a) => numOrNull(a.dosage) },
    { key: 'rate', label: 'Rate/Ha', group: 'Product & cost', numeric: true, minWidth: 90, value: (a) => numOrNull(a.rate_per_ha) },
    { key: 'uom', label: 'UoM', group: 'Product & cost', minWidth: 60, value: (a) => a.uom || a.dosage_unit || '' },
    { key: 'qty', label: 'Total Qty', group: 'Product & cost', numeric: true, minWidth: 90, total: 'sum', value: (a) => numOrNull(a.total_quantity_applied) },
    { key: 'unit_price', label: 'Unit Price', group: 'Product & cost', numeric: true, minWidth: 90, hidden: true, value: (a) => numOrNull(a.unit_price) },
    { key: 'cost', label: 'Cost', group: 'Product & cost', numeric: true, minWidth: 90, total: 'sum', value: (a) => numOrNull(a.cost),
      render: (a) => (a.cost == null || a.cost === '' ? null : Number(a.cost).toLocaleString()), cellSx: { fontWeight: 600 } },
    { key: 'phi', label: 'PHI', group: 'Pre-harvest interval', numeric: true, minWidth: 70, value: (a) => Number(a.phi_days || 0), cardLabel: 'PHI (days)' },
    { key: 'clear_date', label: 'Safe to harvest from', group: 'Pre-harvest interval', minWidth: 110, value: (a) => a.phi_end_date || null, render: (a) => showPhiEnd(a.phi_end_date) },
    { key: 'verified_by', label: 'Verified By', group: 'Approval', minWidth: 110, value: (a) => a.verified_by || '' },
    { key: 'status', label: 'Status', group: 'Approval', minWidth: 100, value: (a) => statusLabel(a.approval_status), render: statusChip },
  ];

  const recordCard = {
    title: (a) => a.product_name || '—',
    subtitle: (a) => {
      const parts = [
        a.field_name && <bdi key="f" translate="no">{a.field_name}</bdi>,
        a.segment_id && (a.segment_id === 'ALL' ? <span key="s">Entire Field</span> : <bdi key="s" translate="no">{a.segment_id}</bdi>),
        (a.crop_name || a.field_crop_name) && <span key="c" translate="no">{a.crop_name || a.field_crop_name}</span>,
      ].filter(Boolean);
      return parts.flatMap((p, i) => (i ? [' · ', p] : [p]));
    },
    status: statusChip,
    fields: ['application_date', 'clear_date', 'qty', 'cost', 'justification', 'operator'],
  };

  const renderRecordActions = (app, mode) => {
    const pending = canApprove && app.approval_status === 'pending';
    if (!pending && !canModifyExisting) return null;
    if (mode === 'table') {
      return (
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          {pending && (
            <>
              <Tooltip title="Approve">
                <IconButton color="success" size="small" aria-label="Approve" onClick={() => handleApprove(app.id)}>
                  <Check />
                </IconButton>
              </Tooltip>
              <Tooltip title="Reject">
                <IconButton color="error" size="small" aria-label="Reject" onClick={() => setRejectDialog({ open: true, id: app.id })}>
                  <Close />
                </IconButton>
              </Tooltip>
            </>
          )}
          {canModifyExisting && (
            <Tooltip title={canDirectEdit ? 'Delete' : 'Request deletion'}>
              <IconButton color="error" size="small" aria-label={canDirectEdit ? 'Delete' : 'Request deletion'} onClick={() => handleRecordsDelete(app.id)}>
                <DeleteIcon />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      );
    }
    return (
      <>
        {pending && (
          <>
            <Button size="small" color="success" variant="contained" startIcon={<Check />} onClick={() => handleApprove(app.id)} sx={{ minHeight: 40 }}>
              Approve
            </Button>
            <Button size="small" color="error" variant="outlined" startIcon={<Close />} onClick={() => setRejectDialog({ open: true, id: app.id })} sx={{ minHeight: 40 }}>
              Reject
            </Button>
          </>
        )}
        {canModifyExisting && (
          <Button size="small" color="error" variant="text" startIcon={<DeleteIcon />} onClick={() => handleRecordsDelete(app.id)} sx={{ minHeight: 40, ml: 'auto' }}>
            {canDirectEdit ? 'Delete' : 'Request Deletion'}
          </Button>
        )}
      </>
    );
  };

  const fieldNameById = (id) => (fields.find((f) => String(f.id) === String(id)) || {}).name || id;
  const recordFilterChips = [
    filterField !== 'all' && { key: 'field', label: fieldNameById(filterField), onDelete: () => setFilterField('all') },
    (filterDateStart && seasonStart && filterDateStart !== seasonStart) && {
      key: 'from', label: `≥ ${filterDateStart}`, onDelete: () => setFilterDateStart(seasonStart),
    },
    (filterDateEnd && seasonEnd && filterDateEnd !== seasonEnd) && {
      key: 'to', label: `≤ ${filterDateEnd}`, onDelete: () => setFilterDateEnd(seasonEnd),
    },
    filterVariety && { key: 'variety', label: filterVariety, onDelete: () => setFilterVariety('') },
    filterJustification && { key: 'just', label: filterJustification, onDelete: () => setFilterJustification('') },
  ].filter(Boolean);
  const clearRecordFilters = () => {
    setFilterField('all');
    setFilterVariety('');
    setFilterJustification('');
    if (seasonStart) setFilterDateStart(seasonStart);
    if (seasonEnd) setFilterDateEnd(seasonEnd);
  };

  // ─── Excel Export ─────────────────────────────────────────────

  const exportGetters = useMemo(() => pestGetters({
    fieldById: Object.fromEntries((fields || []).map((f) => [f.id, f])),
    productById: Object.fromEntries(
      (pestCatalogItems.length > 0 ? pestCatalogItems : products || []).map((p) => [p.id, p]),
    ),
  }), [fields, pestCatalogItems, products]);

  const exportFilterOptions = useMemo(() => {
    const extra = Object.values(templateRows || {}).flat();
    return collectPestExportFilterOptions([...(applications || []), ...extra], exportGetters);
  }, [applications, templateRows, exportGetters]);

  const exportToExcel = async () => {
    const sheets = buildPestExcelSheets(applications, {
      templates: pestTemplates,
      templateRows,
      fields,
      products: pestCatalogItems.length > 0 ? pestCatalogItems : products,
      filters: exportFilters,
    });
    if (sheets.length === 0) {
      notify.warning('No records match the selected filters');
      return;
    }
    await exportOpsExcel(null, {
      filename: `PPP_Application_Record_${new Date().toISOString().split('T')[0]}`,
      sheets,
      ...OPS_EXPORT.pest,
    });
    setExportDialogOpen(false);
  };

  // ─── Render ───────────────────────────────────────────────────

  if (loading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, p: 4 }}>
        <CircularProgress />
        <Typography color="text.secondary">Loading records…</Typography>
      </Box>
    );
  }

  if (loadError) return (
    <Box sx={{ p: 4, textAlign: 'center' }}>
      <Alert severity="error" sx={{ mb: 2, justifyContent: 'center' }}>{loadError}</Alert>
      <Button variant="contained" onClick={() => { setLoading(true); loadData(); }}>
        Retry
      </Button>
    </Box>
  );

  return (
    <Box>
      {/* Header: title and the actions share one row, even on a phone */}
      <Box sx={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 1.5,
        mb: 2,
      }}>
        <Box sx={{ minWidth: 0, flex: '1 1 auto' }}>
          <PageTitle>
            Plant Protection Application Record
          </PageTitle>
          <Typography variant="body2" color="text.secondary">
            {`PPP Application Record - ${meta.total || applications.length} records`}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'flex-end', flexShrink: 0 }}>
          <ExportButton label="Export to Excel" onClick={() => setExportDialogOpen(true)} />
          {tabValue === 0 && canCreate && (isPhone ? (
            <Tooltip title="Import from Excel">
              <IconButton
                aria-label="Import from Excel"
                onClick={() => {
                  setImporterTemplateId(null);
                  setImporterTemplateName('Application Records');
                  setImporterOpen(true);
                }}
                sx={{ width: 40, height: 40, border: 1, borderColor: 'divider', borderRadius: 0, bgcolor: 'background.paper', color: 'primary.main' }}
              >
                <UploadIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          ) : (
            <Button
              variant="outlined"
              startIcon={<UploadIcon />}
              onClick={() => {
                setImporterTemplateId(null);
                setImporterTemplateName('Application Records');
                setImporterOpen(true);
              }}
              size={isMobile ? 'small' : 'medium'}
            >
              Import from Excel
            </Button>
          ))}
          {canCreate && !isPhone && (
            <Button variant="contained" startIcon={<Add />} onClick={() => setShowCreate(true)} size={isMobile ? 'small' : 'medium'}>
              New Application
            </Button>
          )}
        </Box>
      </Box>

      {/* Phone: the main action sits under the thumb, above the bottom navigation */}
      {canCreate && isPhone && (
        <Portal>
        <Fab
          variant="extended" color="primary" onClick={() => setShowCreate(true)}
          sx={{ position: 'fixed', insetInlineEnd: 16, bottom: 'calc(64px + 16px + env(safe-area-inset-bottom))', zIndex: 1100 }}
        >
          <Add sx={{ mr: 1 }} />
          New Application
        </Fab>
        </Portal>
      )}

      {readOnly && <ReadOnlyBanner message="View only — you can browse records and export reports but cannot create or edit applications." />}

      {/* Tabs */}
      <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)} sx={{ mb: 2 }}
        variant="scrollable" scrollButtons="auto">
        <Tab icon={<SprayApplicationIcon />} iconPosition="start" label="Application Records" />
        <Tab icon={<WorkOrderIcon />} iconPosition="start" label="Work Orders" />
        <Tab icon={<Timer />} iconPosition="start" label={`Active PHI (${phiStatus.length})`} />
        <Tab icon={<CatalogIcon />} iconPosition="start" label="Product Catalog" />
        <Tab icon={<CostIcon />} iconPosition="start" label="Costing Report" />
        {hasPivots && (
          <Tab icon={<Science />} iconPosition="start" label="Pivots (RC-109)" sx={{ textTransform: 'none' }} />
        )}
        {pestTemplates.map((tpl) => (
          <Tab key={tpl.id} icon={<Science />} iconPosition="start"
            label={tpl.name} sx={{ textTransform: 'none' }} />
        ))}
      </Tabs>

      {/* Tab 1: Work Orders */}
      {tabValue === 1 && (
        <WorkOrders />
      )}

      {/* Tab 0: Records View */}
      {tabValue === 0 && (
        <>
          {/* Filter Bar: inline on tablet/desktop, search + bottom sheet on a phone */}
          <FilterBar
            onClear={clearRecordFilters}
            chips={recordFilterChips}
            search={(
              <TextField
                size="small" placeholder="Search crop, operator..."
                value={searchText} onChange={(e) => setSearchText(e.target.value)}
                InputProps={{ startAdornment: <InputAdornment position="start"><Search /></InputAdornment> }}
                inputProps={{ 'aria-label': 'Search crop, operator...' }}
                sx={{ minWidth: { xs: 0, sm: 220 }, flex: { xs: '1 1 auto', sm: '1 1 220px' } }}
              />
            )}
            actions={(
              <>
                {canDirectEdit && (
                  <Button
                    size="small"
                    variant="outlined"
                    color="error"
                    startIcon={<DeleteIcon />}
                    onClick={() => handleDeleteAddedToday(null)}
                    disabled={deletingAddedToday || !activeSiteId}
                    sx={{ textTransform: 'none' }}
                  >
                    {deletingAddedToday ? 'Deleting…' : 'Delete added today'}
                  </Button>
                )}
                {recordSelectedIds.size > 0 && (
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', ml: { sm: 'auto' } }}>
                    {canApprove && pendingSelectedCount > 0 && (
                      <Button size="small" variant="contained" color="success" startIcon={<Check />}
                        onClick={handleBulkApproveSelected} sx={{ textTransform: 'none' }}>
                        {`Approve Selected (${pendingSelectedCount})`}
                      </Button>
                    )}
                    {canDirectEdit && (
                      <Button size="small" variant="contained" color="error" startIcon={<DeleteIcon />}
                        onClick={handleRecordsBulkDelete} sx={{ textTransform: 'none' }}>
                        {`Delete Selected (${recordSelectedIds.size})`}
                      </Button>
                    )}
                    {canRequestChange && !canDirectEdit && (
                      <Button size="small" variant="contained" color="error" startIcon={<DeleteIcon />}
                        onClick={handleRecordsBulkDelete} sx={{ textTransform: 'none' }}>
                        {`Request Deletion (${recordSelectedIds.size})`}
                      </Button>
                    )}
                  </Box>
                )}
              </>
            )}
          >
            <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 200 }, flex: { xs: '1 1 100%', sm: '0 0 auto' } }}>
              <InputLabel id="pesticideapplications-field-label-1">Field</InputLabel>
              <Select labelId="pesticideapplications-field-label-1" value={filterField} label="Field" onChange={(e) => setFilterField(e.target.value)}>
                <MenuItem value="all">All Records</MenuItem>
                {fields.map((f) => (
                  <MenuItem key={f.id} value={f.id}>{f.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              size="small" label="From" type="date" value={filterDateStart}
              onChange={(e) => setFilterDateStart(e.target.value)}
              InputLabelProps={{ shrink: true }} sx={{ width: { xs: '100%', sm: 160 } }}
              inputProps={{ min: seasonStart || undefined, max: seasonEnd || undefined }}
            />
            <TextField
              size="small" label="To" type="date" value={filterDateEnd}
              onChange={(e) => setFilterDateEnd(e.target.value)}
              InputLabelProps={{ shrink: true }} sx={{ width: { xs: '100%', sm: 160 } }}
              inputProps={{ min: seasonStart || undefined, max: seasonEnd || undefined }}
            />
            <TextField
              size="small" placeholder="Variety..." label={isPhone ? 'Variety' : undefined}
              value={filterVariety} onChange={(e) => setFilterVariety(e.target.value)}
              inputProps={{ 'aria-label': 'Variety' }}
              sx={{ width: { xs: '100%', sm: 140 } }}
            />
            <TextField
              size="small" placeholder="Justification..." label={isPhone ? 'Justification' : undefined}
              value={filterJustification} onChange={(e) => setFilterJustification(e.target.value)}
              inputProps={{ 'aria-label': 'Justification' }}
              sx={{ width: { xs: '100%', sm: 160 } }}
            />
          </FilterBar>

          {applicationsLoading && <LinearProgress sx={{ mb: 0.5, height: 3 }} />}

          {/* Records: Excel-style sheet on desktop/tablet landscape, cards on phone/tablet portrait */}
          <DataSheet
            storageKey="pesticide-applications"
            ariaLabel="Application records"
            columns={recordColumns}
            rows={applications}
            loading={applicationsLoading}
            emptyText="No application records found"
            height={scrollRegionHeight(isTablet ? 150 : 170)}
            selection={(canApprove || canModifyExisting) ? {
              selected: recordSelectedIds,
              onToggle: toggleRecordSelected,
              onToggleAll: (ids, select) => setRecordSelectedIds(select ? new Set(ids) : new Set()),
            } : null}
            actions={(canApprove || canModifyExisting) ? renderRecordActions : null}
            card={recordCard}
            rowClassName={(app) => (String(app.id) === String(highlightAppId) ? 'row-highlight' : '')}
            rowHighlighted={(app) => String(app.id) === String(highlightAppId)}
            rowRef={(app) => (String(app.id) === String(highlightAppId) ? highlightRef : undefined)}
            tableSx={highlightedRowSx}
          />
          {canCreate && isPhone && <Box sx={{ height: 72 }} aria-hidden />}
        </>
      )}

      {/* Tab 2: Active PHI */}
      {tabValue === 2 && (
        <Box>
          {phiStatus.length === 0 ? (
            <Paper sx={{ p: { xs: 3, sm: 4 }, textAlign: 'center' }}>
              <Typography color="text.secondary">No active PHI restrictions</Typography>
            </Paper>
          ) : (
            <Grid container spacing={2}>
              {phiStatus.map((phi) => (
                <Grid size={{ xs: 12, sm: 6, md: 4 }} key={phi.id}>
                  <Card variant="outlined" sx={{ boxShadow: 'none', borderColor: phi.days_remaining <= 1 ? 'warning.main' : 'error.main' }}>
                    <CardContent>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <Typography fontWeight={600}>{phi.field_name}</Typography>
                          {phi.segment_id && (
                            <Chip label={phi.segment_id} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.6875rem' }} />
                          )}
                        </Box>
                        <Chip
                          icon={<Timer />}
                          label={`${Math.ceil(phi.days_remaining)} days left`}
                          color={phi.days_remaining <= 1 ? 'warning' : 'error'}
                          size="small"
                        />
                      </Box>
                      <Typography variant="body2" color="text.secondary" mt={1}>
                        {phi.product_name} - PHI: {phi.phi_days} days
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Applied: {new Date(phi.application_date).toLocaleDateString()} |
                        Clears: {(() => { const _d = new Date(phi.phi_end_date); const _s = _d.toLocaleDateString('en-GB'); return _d.getHours() || _d.getMinutes() ? `${_s}, ${String(_d.getHours()).padStart(2,'0')}:${String(_d.getMinutes()).padStart(2,'0')}` : _s; })()}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          )}
        </Box>
      )}

      {/* Tab 3: Product Catalog */}
      {tabValue === 3 && (
        <Box>
          <Tabs value={pestCatalogTab} onChange={(_, v) => { setPestCatalogTab(v); setPestCatalogFilter(''); setPestBrowseSelected(new Set()); }}
            sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}>
            <Tab icon={<MySiteIcon />} iconPosition="start" label="My Site" sx={{ textTransform: 'none', fontSize: '0.8125rem' }} />
            <Tab icon={<BrowseIcon />} iconPosition="start" label="Browse All" sx={{ textTransform: 'none', fontSize: '0.8125rem' }} />
          </Tabs>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
            <TextField size="small" placeholder="Search products…" value={pestCatalogFilter}
              onChange={e => setPestCatalogFilter(e.target.value)} sx={{ width: 280 }} />
          </Box>

          {!activeSiteId && pestCatalogTab === 0 && (
            <InfoNote mode="line" severity="info" sx={{ mb: 2 }}>
              Select a site from the sidebar to see site-specific products and pricing.
            </InfoNote>
          )}

          {/* My Site sub-tab */}
          {pestCatalogTab === 0 && (
            <>
              <FitTableContainer component={Paper} variant="outlined"
                sx={{ borderRadius: 1 }}>
                <Table size="small" sx={excelTableSx}>
                  <TableHead>
                    <TableRow>
                      <GutterCell />
                      <TableCell>Product Name</TableCell>
                      <TableCell sx={{ width: 180 }}>Active Ingredient</TableCell>
                      <TableCell sx={{ width: 120 }}>Formulation</TableCell>
                      <TableCell sx={{ width: 80 }} align="center">PHI</TableCell>
                      <TableCell className="col-numeric" sx={{ width: 140 }}>Site Price</TableCell>
                      <TableCell sx={{ width: 100 }} align="center">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredPestCatalog.map((p, idx) => {
                      const isEditing = pestCatalogEditId === p.id;
                      const displayPrice = p.site_price != null ? p.site_price : null;
                      return (
                        <TableRow key={p.id} hover>
                          <GutterCell index={idx + 1} />
                          <TableCell sx={{ fontWeight: 500 }}>{p.name}</TableCell>
                          <TableCell sx={{ fontSize: '0.8125rem' }}>{p.active_ingredient}</TableCell>
                          <TableCell>{p.formulation_type}</TableCell>
                          <TableCell align="center">
                            {p.phi_days == null || p.phi_days === '' ? null : (
                              <Chip
                                label={`${p.phi_days}d`}
                                size="small"
                                color={phiChipColor(p.phi_days)}
                              />
                            )}
                          </TableCell>
                          <TableCell className="col-numeric">
                            {isEditing ? (
                              <TextField size="small" variant="standard" type="number"
                                value={pestCatalogEditPrice}
                                onChange={e => setPestCatalogEditPrice(e.target.value)}
                                inputProps={{ style: { textAlign: 'right' } }}
                                autoFocus sx={{ width: 100 }}
                              />
                            ) : (displayPrice != null ? parseFloat(displayPrice).toFixed(2) : null)}
                          </TableCell>
                          <TableCell align="center">
                            {!canEditCatalog ? null : isEditing ? (
                              <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                                <IconButton size="small" color="success" disabled={pestCatalogSaving}
                                  onClick={() => handlePestPriceSave(p.id)} aria-label="Confirm">
                                  <CheckIcon sx={{ fontSize: 18 }} />
                                </IconButton>
                                <IconButton size="small" onClick={() => { setPestCatalogEditId(null); setPestCatalogEditPrice(''); }} aria-label="Cancel">
                                  <CancelIcon sx={{ fontSize: 18 }} />
                                </IconButton>
                              </Box>
                            ) : (
                              <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                                <Tooltip title="Edit site price">
                                  <IconButton size="small" onClick={() => { setPestCatalogEditId(p.id); setPestCatalogEditPrice(displayPrice || ''); }}>
                                    <EditIcon sx={{ fontSize: 16 }} />
                                  </IconButton>
                                </Tooltip>
                                <Tooltip title="Remove from site">
                                  <IconButton size="small" color="error" onClick={() => handlePestRemove(p.id, p.name)}>
                                    <DeleteIcon sx={{ fontSize: 16 }} />
                                  </IconButton>
                                </Tooltip>
                              </Box>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {filteredPestCatalog.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} align="center" sx={{ py: 4, color: 'var(--sheet-ink-3)' }}>
                          {pestCatalogItems.length === 0
                            ? 'No products assigned to this site yet. Browse other sites to copy products.'
                            : 'No products match your search.'}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </FitTableContainer>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                {pestCatalogItems.length} product{pestCatalogItems.length !== 1 ? 's' : ''} in this site's catalog.
              </Typography>
            </>
          )}

          {/* Browse All sub-tab */}
          {pestCatalogTab === 1 && (
            <>
              {canEditCatalog && pestBrowseSelected.size > 0 && (
                <Box sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Button size="small" variant="contained" startIcon={<CopyIcon />}
                    disabled={pestCatalogSaving || !activeSiteId}
                    onClick={() => handlePestCopyToSite(Array.from(pestBrowseSelected))}
                    sx={{ textTransform: 'none' }}>
                    Copy {pestBrowseSelected.size} Selected to My Site
                  </Button>
                  <Button size="small" onClick={() => setPestBrowseSelected(new Set())}
                    sx={{ textTransform: 'none' }}>
                    Clear Selection
                  </Button>
                </Box>
              )}
              <FitTableContainer component={Paper} variant="outlined"
                sx={{ borderRadius: 1 }}>
                <Table size="small" sx={excelTableSx}>
                  <TableHead>
                    <TableRow>
                      <GutterCell />
                      <TableCell padding="checkbox" sx={{ width: 42 }}>
                        <Checkbox slotProps={{ input: { 'aria-label': 'Select all rows' } }} size="small"
                          sx={(t) => ({
                            color: t.palette.table.headerText,
                            '&.Mui-checked, &.MuiCheckbox-indeterminate': { color: t.palette.table.headerText },
                            '&.Mui-disabled': { color: 'rgba(255,255,255,0.4)' },
                          })}
                          indeterminate={pestBrowseSelected.size > 0 && pestBrowseSelected.size < pestBrowseSelectableIds.length}
                          checked={pestBrowseSelectableIds.length > 0 && pestBrowseSelected.size === pestBrowseSelectableIds.length}
                          disabled={!canEditCatalog || pestBrowseSelectableIds.length === 0}
                          onChange={e => {
                            if (e.target.checked) {
                              setPestBrowseSelected(new Set(pestBrowseSelectableIds));
                            } else {
                              setPestBrowseSelected(new Set());
                            }
                          }}
                        />
                      </TableCell>
                      <TableCell>Product Name</TableCell>
                      <TableCell sx={{ width: 180 }}>Active Ingredient</TableCell>
                      <TableCell sx={{ width: 120 }}>Formulation</TableCell>
                      <TableCell sx={{ width: 100 }} align="center">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredPestBrowse.map((p, idx) => {
                      const alreadyInSite = pestMySiteIds.has(p.id);
                      return (
                        <TableRow key={p.id} hover
                          selected={pestBrowseSelected.has(p.id)}>
                          <GutterCell index={idx + 1} />
                          <TableCell padding="checkbox">
                            {alreadyInSite || !canEditCatalog ? null : (
                              <Checkbox slotProps={{ input: { 'aria-label': 'Select row' } }} size="small" checked={pestBrowseSelected.has(p.id)}
                                onChange={e => {
                                  setPestBrowseSelected(prev => {
                                    const next = new Set(prev);
                                    if (e.target.checked) next.add(p.id); else next.delete(p.id);
                                    return next;
                                  });
                                }}
                              />
                            )}
                          </TableCell>
                          <TableCell sx={{ fontWeight: 500 }}>{p.name}</TableCell>
                          <TableCell sx={{ fontSize: '0.8125rem' }}>{p.active_ingredient}</TableCell>
                          <TableCell>{p.formulation_type}</TableCell>
                          <TableCell align="center">
                            {alreadyInSite ? (
                              <Chip label="In your site" size="small" color="success" variant="outlined" sx={{ fontSize: '0.6875rem' }} />
                            ) : !canEditCatalog ? null : (
                              <Tooltip title="Copy to my site">
                                <IconButton size="small" onClick={() => handlePestCopyToSite(p.id)} disabled={pestCatalogSaving || !activeSiteId}>
                                  <CopyIcon sx={{ fontSize: 16 }} />
                                </IconButton>
                              </Tooltip>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {filteredPestBrowse.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} align="center" sx={{ py: 4, color: 'var(--sheet-ink-3)' }}>
                          {pestCatalogBrowse.length === 0
                            ? 'No products in the master catalog.'
                            : 'No products match your search.'}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </FitTableContainer>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                {pestCatalogBrowse.length} product{pestCatalogBrowse.length !== 1 ? 's' : ''} in master catalog.
              </Typography>
            </>
          )}
        </Box>
      )}

      {/* Tab 4: Costing Report */}
      {tabValue === 4 && (() => {
        const { details, totalCost, totalQty, totalApps, uniqueProducts, productSummary, cropSummary, availableCrops } = costingData;
        // Greens mirror palette.table in src/theme.js, the same source the rest of
        // the themed tables draw from. They are literals here because this report
        // paints with plain inline styles rather than MUI sx, so it has no theme
        // to read from.
        const hdr = { background: 'var(--sheet-accent)', color: '#fff', fontWeight: 700, fontSize: '0.6875rem', padding: '6px 10px', border: '1px solid #c8c8c8', whiteSpace: 'nowrap' };
        const cell = { fontSize: '0.6875rem', padding: '5px 10px', border: '1px solid #c8c8c8' };
        // Deliberately a warm neutral rather than a green. Cost cells are tinted
        // green, and a green stripe underneath them would swallow that signal.
        const altBg = '#eff1ed';
        const calcCell = { ...cell, background: 'var(--sheet-tint-green)', fontWeight: 600, color: 'var(--sheet-accent)', textAlign: 'right' };
        const bannerBg = 'var(--sheet-header)';
        const bannerStyle = { background: bannerBg, color: '#fff', padding: '8px 16px', fontSize: '0.875rem', fontWeight: 700, borderBottom: `2px solid ${hdr.background}` };

        return (
          <Box>
            {/* Banner */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', ...bannerStyle, borderRadius: '4px 4px 0 0' }}>
              <Typography sx={{ fontSize: '0.875rem', fontWeight: 700, color: '#fff', letterSpacing: 0.5 }}>
                IPM COSTING REPORT
              </Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <ExportButton label="Export to Excel" onClick={() => setCostingExportDialogOpen(true)} />
                <ExportButton label="Generate PDF report" format="pdf" onClick={() => setCostingExportDialogOpen(true)} />
              </Box>
            </Box>

            {/* Filter Bar */}
            <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center', p: 1.5, background: 'var(--sheet-muted)', borderBottom: '1px solid #c8c8c8' }}>
              <Typography sx={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--sheet-ink-2)', mr: 0.5 }}>Filter:</Typography>
              <TextField size="small" type="date" label="From" InputLabelProps={{ shrink: true }}
                value={costDateStart} onChange={e => setCostDateStart(e.target.value)}
                sx={{ width: 150, '& input': { fontSize: '0.6875rem', py: '5px' } }} />
              <TextField size="small" type="date" label="To" InputLabelProps={{ shrink: true }}
                value={costDateEnd} onChange={e => setCostDateEnd(e.target.value)}
                sx={{ width: 150, '& input': { fontSize: '0.6875rem', py: '5px' } }} />
              <FormControl size="small" sx={{ minWidth: 120 }}>
                <InputLabel id="pesticideapplications-type-label-2" sx={{ fontSize: '0.75rem' }}>Type</InputLabel>
                <Select labelId="pesticideapplications-type-label-2" value={costTypeFilter} label="Type" onChange={e => setCostTypeFilter(e.target.value)}
                  sx={{ fontSize: '0.6875rem', '& .MuiSelect-select': { py: '5px' } }}>
                  <MenuItem value="all" sx={{ fontSize: '0.75rem' }}>All</MenuItem>
                  <MenuItem value="spray" sx={{ fontSize: '0.75rem' }}>Spray</MenuItem>
                  <MenuItem value="drench" sx={{ fontSize: '0.75rem' }}>Drench</MenuItem>
                </Select>
              </FormControl>
              <Autocomplete
                multiple size="small"
                options={availableCrops}
                value={costCropFilter}
                onChange={(_, v) => setCostCropFilter(v)}
                renderInput={(params) => <TextField {...params} label="Crop" sx={{ '& input': { fontSize: '0.6875rem' } }} />}
                sx={{ minWidth: 200, '& .MuiChip-root': { height: 20, fontSize: '0.6875rem' } }}
              />
              <TextField size="small" placeholder="Search product..." value={costProductSearch}
                onChange={e => setCostProductSearch(e.target.value)}
                InputProps={{ startAdornment: <InputAdornment position="start"><Search sx={{ fontSize: 16, color: '#888' }} /></InputAdornment> }}
                sx={{ width: 180, '& input': { fontSize: '0.6875rem', py: '5px' } }} />
            </Box>

            {/* KPI summary: one neutral row, the cost (the figure that matters) in the accent */}
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' }, gap: 2, p: 3, background: 'var(--sheet-alt)', borderBottom: '1px solid var(--sheet-grid)' }}>
              {[
                { label: 'Total cost (AED)', value: totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), lead: true },
                { label: 'Total qty applied', value: totalQty.toLocaleString(undefined, { maximumFractionDigits: 1 }) },
                { label: 'Applications', value: totalApps },
                { label: 'Products used', value: uniqueProducts },
              ].map((kpi) => (
                <Box key={kpi.label} sx={{ px: 3, py: 2, borderRadius: 2, border: '1px solid var(--sheet-grid)', background: 'var(--sheet-bg)', minWidth: 0 }}>
                  <Typography noWrap sx={{ fontSize: '0.75rem', color: 'var(--sheet-ink-2)' }}>{kpi.label}</Typography>
                  <Typography noWrap sx={{ fontSize: '1.125rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: kpi.lead ? 'var(--sheet-accent)' : 'var(--sheet-ink)' }}>{kpi.value}</Typography>
                </Box>
              ))}
            </Box>

            {/* Detail Table */}
            <TableContainer sx={{ maxHeight: 420, border: '1px solid #c8c8c8', borderTop: 0 }}>
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    {['Date', 'Field', 'Product', 'Active Ingredient', 'Type', 'Crop', 'Qty Applied', 'Unit Price', 'Cost'].map(h => (
                      <TableCell key={h} sx={hdr}>{h}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {details.map((r, i) => (
                    <TableRow key={r.id || i} sx={{ '&:nth-of-type(even)': { background: altBg } }}>
                      <TableCell sx={{ ...cell, whiteSpace: 'nowrap' }}>
                        {r.date ? new Date(r.date).toLocaleDateString() : ''}
                      </TableCell>
                      <TableCell sx={cell}>{r.field}</TableCell>
                      <TableCell sx={{ ...cell, fontWeight: 600 }}>{r.product}</TableCell>
                      <TableCell sx={{ ...cell, color: 'var(--sheet-ink-2)' }}>{r.activeIngredient}</TableCell>
                      <TableCell sx={cell}>
                        <Chip label={r.type} size="small"
                          sx={{ fontSize: '0.6875rem', height: 20, fontWeight: 600,
                            bgcolor: r.type === 'Spray' ? '#e3f2fd' : '#fce4ec',
                            color: r.type === 'Spray' ? '#1565c0' : '#c62828' }} />
                      </TableCell>
                      <TableCell sx={cell}>{r.crop}</TableCell>
                      <TableCell sx={{ ...cell, textAlign: 'right' }}>{r.qty.toLocaleString(undefined, { maximumFractionDigits: 2 })}</TableCell>
                      <TableCell sx={{ ...cell, textAlign: 'right' }}>{r.unitPrice.toFixed(2)}</TableCell>
                      <TableCell sx={calcCell}>{r.cost.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                  {details.length === 0 && (
                    <TableRow><TableCell colSpan={9} sx={{ ...cell, textAlign: 'center', color: '#888', py: 4 }}>No cost records found for current filters</TableCell></TableRow>
                  )}
                  {details.length > 0 && (
                    <TableRow sx={{ background: bannerBg }}>
                      <TableCell colSpan={6} sx={{ ...cell, background: bannerBg, color: '#fff', fontWeight: 700, border: `1px solid ${bannerBg}` }}>TOTAL</TableCell>
                      <TableCell sx={{ ...cell, background: bannerBg, color: '#fff', fontWeight: 700, textAlign: 'right', border: `1px solid ${bannerBg}` }}>{totalQty.toLocaleString(undefined, { maximumFractionDigits: 2 })}</TableCell>
                      <TableCell sx={{ ...cell, background: bannerBg, color: '#fff', border: `1px solid ${bannerBg}` }} />
                      <TableCell sx={{ ...cell, background: bannerBg, color: '#e8f5e9', fontWeight: 800, textAlign: 'right', border: `1px solid ${bannerBg}` }}>{totalCost.toFixed(2)}</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>

            {/* Product Summary */}
            {productSummary.length > 0 && (
              <Box sx={{ mt: 2 }}>
                <Box sx={{ ...bannerStyle, borderRadius: '4px 4px 0 0', fontSize: '0.8125rem' }}>PRODUCT SUMMARY</Box>
                <TableContainer sx={{ border: '1px solid #c8c8c8', borderTop: 0 }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        {['Product', 'Times Used', 'Total Qty', 'Total Cost (AED)', '% of Total'].map(h => (
                          <TableCell key={h} sx={hdr}>{h}</TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {productSummary.map((r, i) => (
                        <TableRow key={r.product} sx={{ '&:nth-of-type(even)': { background: altBg } }}>
                          <TableCell sx={{ ...cell, fontWeight: 600 }}>{r.product}</TableCell>
                          <TableCell sx={{ ...cell, textAlign: 'center' }}>{r.count}</TableCell>
                          <TableCell sx={{ ...cell, textAlign: 'right' }}>{r.totalQty.toLocaleString(undefined, { maximumFractionDigits: 2 })}</TableCell>
                          <TableCell sx={calcCell}>{r.totalCost.toFixed(2)}</TableCell>
                          <TableCell sx={{ ...cell, textAlign: 'center', fontWeight: 600 }}>{r.pct}%</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            )}

            {/* Crop Summary */}
            {cropSummary.length > 0 && (
              <Box sx={{ mt: 2, mb: 2 }}>
                <Box sx={{ ...bannerStyle, borderRadius: '4px 4px 0 0', fontSize: '0.8125rem' }}>CROP SUMMARY</Box>
                <TableContainer sx={{ border: '1px solid #c8c8c8', borderTop: 0 }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        {['Crop', 'Applications', 'Total Qty', 'Total Cost (AED)', '% of Total'].map(h => (
                          <TableCell key={h} sx={hdr}>{h}</TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {cropSummary.map((r, i) => (
                        <TableRow key={r.crop} sx={{ '&:nth-of-type(even)': { background: altBg } }}>
                          <TableCell sx={{ ...cell, fontWeight: 600 }}>{r.crop}</TableCell>
                          <TableCell sx={{ ...cell, textAlign: 'center' }}>{r.count}</TableCell>
                          <TableCell sx={{ ...cell, textAlign: 'right' }}>{r.totalQty.toLocaleString(undefined, { maximumFractionDigits: 2 })}</TableCell>
                          <TableCell sx={calcCell}>{r.totalCost.toFixed(2)}</TableCell>
                          <TableCell sx={{ ...cell, textAlign: 'center', fontWeight: 600 }}>{r.pct}%</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            )}
          </Box>
        );
      })()}

      {/* Tab: Pivots (RC-109) */}
      {pivotTabIndex >= 0 && tabValue === pivotTabIndex && (
        <Box sx={{ height: pivotSheetHeight, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
          <PivotPppApplicationTab
            templateId={pivotTemplate?.id}
            pivotFields={pivotFields}
            products={pestCatalogItems.length > 0 ? pestCatalogItems : products}
            cropPhiMap={cropPhiMap}
            activeSiteId={activeSiteId}
            siteName={activeSite?.name}
            onRecordsChange={handlePivotRecordsChange}
          />
        </Box>
      )}

      {/* Dynamic Spreadsheet Tabs */}
      {pestTemplates.map((tpl, tplIdx) => {
        if (tabValue !== templateTabOffset + tplIdx) return null;
        const colsConfig = tpl.columns_config?.columns || [];
        const tplRows = templateRows[tpl.id] || [];
        const spreadsheetProducts = pestCatalogItems.length > 0 ? pestCatalogItems : products;
        return (
          <Box key={tpl.id} sx={{ display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mb: 0.5, flexWrap: 'wrap' }}>
              {canDirectEdit && (
                <Button
                  size="small"
                  variant="outlined"
                  color="error"
                  startIcon={<DeleteIcon />}
                  onClick={() => handleDeleteAddedToday(tpl.id)}
                  disabled={deletingAddedToday || !activeSiteId}
                  sx={{ textTransform: 'none', fontSize: '0.75rem' }}
                >
                  {deletingAddedToday ? 'Deleting…' : 'Delete added today'}
                </Button>
              )}
              <Button
                size="small"
                variant="outlined"
                startIcon={<UploadIcon />}
                onClick={() => { setImporterTemplateId(tpl.id); setImporterTemplateName(tpl.name); setImporterOpen(true); }}
                sx={{ textTransform: 'none', fontSize: '0.75rem', borderColor: 'var(--sheet-accent)', color: 'var(--sheet-accent)', '&:hover': { borderColor: 'var(--sheet-header)', background: '#eef4ef' } }}
                disabled={!canCreate}
              >
                Import from Excel
              </Button>
            </Box>
            <Box sx={{
              height: sheetHeight, display: 'flex', flexDirection: 'column',
              border: '1px solid #c8c8c8', borderRadius: 0, overflow: 'hidden',
            }}>
              <SpreadsheetGrid
                columns={applyJustificationColumnOptions(colsConfig, justificationOptionString)}
                rows={tplRows}
                onSaveRow={canCreate ? handleSpreadsheetSave : async () => null}
                onDeleteRow={canCreate ? handleSpreadsheetDelete : async () => {}}
                onBulkDeleteRows={canDirectEdit || canRequestChange ? handleSpreadsheetBulkDelete : undefined}
                skipBulkDeleteConfirm={canRequestChange && !canDirectEdit}
                fields={fields}
                farmAreas={siteFarmAreas}
                products={spreadsheetProducts}
                plantingRecords={plantingRecords}
                templateId={tpl.id}
                templateName={tpl.name.toUpperCase()}
                saving={templateSaving}
                loading={!!templateRowsLoading[tpl.id] || templateRows[tpl.id] == null}
                cropPhiMap={cropPhiMap}
              />
            </Box>
          </Box>
        );
      })}

      {/* ─── Create Dialog (Reformed 24-column form) ─────────────── */}
      <Dialog open={showCreate} onClose={() => setShowCreate(false)} maxWidth="lg" fullWidth>
        <DialogTitle sx={{ pb: 1 }}>
          <Typography variant="h6" fontWeight={700}>New PPP Application Record</Typography>
          <Typography variant="caption" color="text.secondary">
            Plant Protection Product Application - All fields match the company template
          </Typography>
        </DialogTitle>
        <DialogContent dividers>
          <InfoNote mode="line" severity="info" sx={{ mb: 2 }}>
            {createsAutoApproved
              ? 'Your entries are approved automatically when saved.'
              : 'This application will require approval from a pest agronomist before it takes effect.'}
          </InfoNote>

          {/* Section 1: Crop & Location */}
          <Typography variant="subtitle2" color="text.primary" fontWeight={600} gutterBottom sx={{ mt: 1 }}>
            <Agriculture sx={{ fontSize: 16, mr: 0.5, verticalAlign: 'text-bottom' }} />
            Crop & Location
          </Typography>
          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <FormControl required fullWidth size="small">
                <InputLabel id="pesticideapplications-field-id-label-3">Field ID</InputLabel>
                <Select labelId="pesticideapplications-field-id-label-3" value={form.fieldId} label="Field ID" onChange={(e) => handleFieldChange(e.target.value)}>
                  {fields.map((f) => <MenuItem key={f.id} value={f.id}>{f.name}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Autocomplete
                freeSolo size="small"
                options={[...new Set(fields.map((f) => f.current_crop || f.crop_name).filter(Boolean))]}
                value={form.cropName}
                onInputChange={(_, v) => setForm((p) => ({ ...p, cropName: v }))}
                renderInput={(params) => <TextField {...params} label="Crop" />}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <TextField fullWidth size="small" label="Variety" value={form.variety}
                onChange={(e) => setForm((p) => ({ ...p, variety: e.target.value }))} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, minHeight: 40, display: 'flex', alignItems: 'center', px: 0.5 }}>
                <SegmentSelector
                  value={form.segmentId}
                  onChange={(v) => setForm((p) => ({ ...p, segmentId: v }))}
                  fieldId={form.fieldId}
                  plantingRecords={plantingRecords}
                />
              </Box>
            </Grid>
          </Grid>

          <Divider sx={{ my: 1.5 }} />

          {/* Section 2: Scouting & Justification */}
          <Typography variant="subtitle2" color="text.primary" fontWeight={600} gutterBottom>
            <Search sx={{ fontSize: 16, mr: 0.5, verticalAlign: 'text-bottom' }} />
            Scouting & Justification
          </Typography>
          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField fullWidth size="small" type="date" label="Scouting Date" value={form.scoutingDate}
                onChange={(e) => setForm((p) => ({ ...p, scoutingDate: e.target.value }))}
                InputLabelProps={{ shrink: true }}
                error={!!formErrors.scoutingDate} helperText={formErrors.scoutingDate} />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <Autocomplete
                freeSolo size="small"
                options={justificationOptionList}
                value={form.justification}
                onInputChange={(_, v) => setForm((p) => ({ ...p, justification: v }))}
                renderInput={(params) => <TextField {...params} label="Justification (Pest, Disease or Preventive)" />}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField fullWidth size="small" label="% Seen & Expected Problem" value={form.percentSeen}
                onChange={(e) => setForm((p) => ({ ...p, percentSeen: e.target.value }))}
                placeholder='e.g. 0.10% or Out of Scouting Area' />
            </Grid>
          </Grid>

          <Divider sx={{ my: 1.5 }} />

          {/* Section 3: Application Details */}
          <Typography variant="subtitle2" color="text.primary" fontWeight={600} gutterBottom>
            <CalendarMonth sx={{ fontSize: 16, mr: 0.5, verticalAlign: 'text-bottom' }} />
            Application Details
          </Typography>
          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <TextField fullWidth size="small" type="date" label="Application Date" required value={form.applicationDate}
                onChange={(e) => setForm((p) => ({ ...p, applicationDate: e.target.value }))}
                InputLabelProps={{ shrink: true }} />
            </Grid>
            <Grid size={{ xs: 6, sm: 3, md: 2 }}>
              <TextField fullWidth size="small" type="time" label="Start Time" value={form.applicationStartTime}
                onChange={(e) => setForm((p) => ({ ...p, applicationStartTime: e.target.value }))}
                InputLabelProps={{ shrink: true }} />
            </Grid>
            <Grid size={{ xs: 6, sm: 3, md: 2 }}>
              <TextField fullWidth size="small" type="time" label="End Time" value={form.applicationEndTime}
                onChange={(e) => setForm((p) => ({ ...p, applicationEndTime: e.target.value }))}
                InputLabelProps={{ shrink: true }} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <FormControl required fullWidth size="small">
                <InputLabel id="pesticideapplications-name-of-ppp-label-4">Name of PPP</InputLabel>
                <Select labelId="pesticideapplications-name-of-ppp-label-4" value={form.productId} label="Name of PPP" onChange={(e) => handleProductChange(e.target.value)}>
                  {(pestCatalogItems.length > 0 ? pestCatalogItems : products).map((p) => (
                    <MenuItem key={p.id} value={p.id}>
                      {p.name} {p.phi_days > 0 ? `(PHI: ${p.phi_days}d)` : ''}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 2 }}>
              <TextField fullWidth size="small" label="Active Ingredient" value={form.activeIngredient}
                onChange={(e) => setForm((p) => ({ ...p, activeIngredient: e.target.value }))}
                helperText="Auto-filled from product" />
            </Grid>
          </Grid>

          <Divider sx={{ my: 1.5 }} />

          {/* Section 4: Dosage & Cost */}
          <Typography variant="subtitle2" color="text.primary" fontWeight={600} gutterBottom>
            <Science sx={{ fontSize: 16, mr: 0.5, verticalAlign: 'text-bottom' }} />
            Dosage & Cost
          </Typography>
          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid size={{ xs: 6, sm: 4, md: 2 }}>
              <TextField fullWidth size="small" label="Dose/L of Water" type="number" value={form.dosage}
                onChange={(e) => setForm((p) => ({ ...p, dosage: e.target.value }))}
                inputProps={{ step: 0.01, min: 0 }} placeholder="ml/gm"
                error={!!formErrors.dosage} helperText={formErrors.dosage} />
            </Grid>
            <Grid size={{ xs: 6, sm: 4, md: 2 }}>
              <TextField fullWidth size="small" label="Rate/Ha" type="number" value={form.ratePerHa}
                onChange={(e) => handleCostFields('ratePerHa', e.target.value)}
                inputProps={{ step: 0.01, min: 0 }}
                error={!!formErrors.ratePerHa} helperText={formErrors.ratePerHa} />
            </Grid>
            <Grid size={{ xs: 6, sm: 4, md: 2 }}>
              <TextField fullWidth size="small" label="Unit Price" type="number" value={form.unitPrice}
                onChange={(e) => handleCostFields('unitPrice', e.target.value)}
                inputProps={{ step: 0.01, min: 0 }}
                error={!!formErrors.unitPrice} helperText={formErrors.unitPrice} />
            </Grid>
            <Grid size={{ xs: 6, sm: 4, md: 2 }}>
              <TextField fullWidth size="small" label="Cost" type="number" value={form.cost}
                onChange={(e) => setForm((p) => ({ ...p, cost: e.target.value }))}
                inputProps={{ step: 0.01, min: 0 }}
                error={!!formErrors.cost} helperText={formErrors.cost || 'Auto = Rate x Price'} />
            </Grid>
            <Grid size={{ xs: 6, sm: 4, md: 2 }}>
              <FormControl fullWidth size="small">
                <InputLabel id="pesticideapplications-uom-label-5">UoM</InputLabel>
                <Select labelId="pesticideapplications-uom-label-5" value={form.uom} label="UoM" onChange={(e) => setForm((p) => ({ ...p, uom: e.target.value }))}>
                  {UOM_OPTIONS.map((u) => <MenuItem key={u} value={u}>{u}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 6, sm: 4, md: 2 }}>
              <TextField fullWidth size="small" label="Total Qty Applied (Ltr)" type="number"
                value={form.totalQuantityApplied}
                onChange={(e) => setForm((p) => ({ ...p, totalQuantityApplied: e.target.value }))}
                inputProps={{ step: 0.01, min: 0 }}
                error={!!formErrors.totalQuantityApplied} helperText={formErrors.totalQuantityApplied} />
            </Grid>
          </Grid>

          <Divider sx={{ my: 1.5 }} />

          {/* Section 5: Operations */}
          <Typography variant="subtitle2" color="text.primary" fontWeight={600} gutterBottom>
            Operations & Verification
          </Typography>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <TextField fullWidth size="small" label="Machinery Used" value={form.machineryUsed}
                onChange={(e) => setForm((p) => ({ ...p, machineryUsed: e.target.value }))}
                placeholder='e.g. 2,4,3,6,9 or Boom Spray' />
            </Grid>
            <Grid size={{ xs: 6, sm: 3, md: 2 }}>
              <TextField fullWidth size="small" label="PHI (Days)" value={phiDays} disabled
                helperText="From product" />
            </Grid>
            <Grid size={{ xs: 6, sm: 3, md: 2 }}>
              <TextField fullWidth size="small" label="Clear to Harvest" value={clearToHarvestDate} disabled
                InputLabelProps={{ shrink: true }} helperText="Auto-calculated" />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 2 }}>
              <Autocomplete
                freeSolo size="small"
                options={WEATHER_OPTIONS}
                value={form.weatherConditions}
                onInputChange={(_, v) => setForm((p) => ({ ...p, weatherConditions: v }))}
                renderInput={(params) => <TextField {...params} label="Weather" />}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <TextField fullWidth size="small" label="Operator" value={form.operatorName}
                onChange={(e) => setForm((p) => ({ ...p, operatorName: e.target.value }))} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <TextField fullWidth size="small" label="Authorized / Verified by" value={form.verifiedBy}
                onChange={(e) => setForm((p) => ({ ...p, verifiedBy: e.target.value }))} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 9 }}>
              <TextField fullWidth size="small" multiline rows={2} label="Notes (optional)" value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 1.5 }}>
          <Button onClick={() => setShowCreate(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate}
            disabled={creating || !form.fieldId || !form.productId || !form.applicationDate}>
            {creating ? <CircularProgress size={20} /> : 'Submit for Approval'}
          </Button>
        </DialogActions>
      </Dialog>

      {sameDaySprayDialog}

      {/* Reject Dialog */}
      <Dialog open={rejectDialog.open} onClose={() => setRejectDialog({ open: false, id: null })}>
        <DialogTitle>Reject Application</DialogTitle>
        <DialogContent>
          <TextField fullWidth multiline rows={3} label="Reason for Rejection" value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)} sx={{ mt: 1 }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRejectDialog({ open: false, id: null })}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleReject} disabled={!rejectReason.trim()}>
            Reject
          </Button>
        </DialogActions>
      </Dialog>

      {/* Change Request Dialog */}
      <Dialog
        open={changeRequestDialog.open}
        onClose={() => setChangeRequestDialog(EMPTY_CHANGE_REQUEST)}
      >
        <DialogTitle>
          {changeRequestDialog.action === 'delete' && (changeRequestDialog.entityIds?.length || 0) > 1
            ? `Request deletion of ${changeRequestDialog.entityIds.length} records`
            : `Request ${changeRequestDialog.action === 'delete' ? 'Deletion' : 'Edit'}`}
        </DialogTitle>
        <DialogContent>
          <InfoNote severity="info" sx={{ mb: 2 }}>
            Your request will be sent to an auditor for review before the change is applied.
          </InfoNote>
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
              setChangeRequestDialog(EMPTY_CHANGE_REQUEST);
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

      {/* Costing Excel / PDF Filters Dialog */}
      <Dialog open={costingExportDialogOpen} onClose={() => !costingExportBusy && setCostingExportDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ background: 'var(--sheet-header)', color: '#fff', py: 1.5 }}>
          <Typography sx={{ fontSize: '0.9375rem', fontWeight: 700 }}>Export Costing Report</Typography>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 2 }}>
            Leave a filter blank to include all values. The same filters apply to Excel and PDF.
          </Typography>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                size="small"
                fullWidth
                type="date"
                label="From"
                value={costingExportFilters.dateFrom || ''}
                onChange={(e) => setCostingExportFilters((prev) => ({ ...prev, dateFrom: e.target.value }))}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                size="small"
                fullWidth
                type="date"
                label="To"
                value={costingExportFilters.dateTo || ''}
                onChange={(e) => setCostingExportFilters((prev) => ({ ...prev, dateTo: e.target.value }))}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControl size="small" fullWidth>
                <InputLabel id="pesticideapplications-type-label-6">Type</InputLabel>
                <Select labelId="pesticideapplications-type-label-6"
                  value={costingExportFilters.type || 'all'}
                  label="Type"
                  onChange={(e) => setCostingExportFilters((prev) => ({ ...prev, type: e.target.value }))}
                >
                  <MenuItem value="all">All</MenuItem>
                  <MenuItem value="spray">Spray</MenuItem>
                  <MenuItem value="drench">Drench</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            {PEST_EXPORT_FILTER_FIELDS.map(({ key, label }) => (
              <Grid size={{ xs: 12, sm: 6 }} key={key}>
                <Autocomplete
                  size="small"
                  options={exportFilterOptions[key] || []}
                  value={costingExportFilters[key] || null}
                  onChange={(_, value) => setCostingExportFilters((prev) => ({ ...prev, [key]: value || '' }))}
                  renderInput={(params) => <TextField {...params} label={label} />}
                />
              </Grid>
            ))}
          </Grid>
          <InfoNote severity="info" sx={{ fontSize: '0.75rem', mt: 2 }}>
            PDF includes summaries and period comparison. Detail rows are included for ≤50 records; for larger sets use Excel.
          </InfoNote>
        </DialogContent>
        <DialogActions sx={{ px: 2, py: 1.5, flexWrap: 'wrap', gap: 1 }}>
          <Button
            onClick={() => setCostingExportFilters({ ...EMPTY_COSTING_EXPORT_FILTERS })}
            disabled={costingExportBusy}
            sx={{ textTransform: 'none' }}
          >
            Clear
          </Button>
          <Box sx={{ flex: 1 }} />
          <Button onClick={() => setCostingExportDialogOpen(false)} disabled={costingExportBusy} sx={{ textTransform: 'none' }}>
            Cancel
          </Button>
          <Button
            variant="outlined"
            startIcon={<FileDownload />}
            onClick={handleExportCostExcel}
            disabled={costingExportBusy}
            sx={{ textTransform: 'none' }}
          >
            Export Excel
          </Button>
          <Button
            variant="contained"
            startIcon={<PdfIcon />}
            onClick={handleGeneratePDF}
            disabled={costingExportBusy}
            sx={{ textTransform: 'none', bgcolor: '#c0392b', '&:hover': { bgcolor: '#a93226' } }}
          >
            Generate PDF
          </Button>
        </DialogActions>
      </Dialog>

      {/* Excel Export Filters Dialog */}
      <Dialog open={exportDialogOpen} onClose={() => setExportDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Export Excel</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 2 }}>
            Leave a filter blank to include all values. Filters apply to Application Records, Spray, and Drench sheets.
          </Typography>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                size="small"
                fullWidth
                type="date"
                label="From"
                value={exportFilters.dateFrom || ''}
                onChange={(e) => setExportFilters((prev) => ({ ...prev, dateFrom: e.target.value }))}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                size="small"
                fullWidth
                type="date"
                label="To"
                value={exportFilters.dateTo || ''}
                onChange={(e) => setExportFilters((prev) => ({ ...prev, dateTo: e.target.value }))}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            {PEST_EXPORT_FILTER_FIELDS.map(({ key, label }) => (
              <Grid size={{ xs: 12, sm: 6 }} key={key}>
                <Autocomplete
                  size="small"
                  options={exportFilterOptions[key] || []}
                  value={exportFilters[key] || null}
                  onChange={(_, value) => setExportFilters((prev) => ({ ...prev, [key]: value || '' }))}
                  renderInput={(params) => <TextField {...params} label={label} />}
                />
              </Grid>
            ))}
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setExportFilters({ ...EMPTY_PEST_EXPORT_FILTERS })}>
            Clear
          </Button>
          <Button onClick={() => setExportDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" startIcon={<FileDownload />} onClick={exportToExcel}>
            Export
          </Button>
        </DialogActions>
      </Dialog>

      {/* Excel Importer Dialog */}
      <SpreadsheetImporter
        open={importerOpen}
        onClose={() => setImporterOpen(false)}
        fields={fields}
        nurseryFields={nurseryFields}
        products={pestCatalogItems.length > 0 ? pestCatalogItems : products}
        templateId={importerTemplateId}
        templateName={importerTemplateName}
        onBulkImport={async (rows) => {
          const rewritten = await ensureJustifications((rows || []).map((row) => row.justification));
          if (!rewritten) {
            throw new Error('Import cancelled — unknown justifications were not classified');
          }
          const resolvedRows = (rows || []).map((row, idx) => ({
            ...row,
            justification: rewritten[idx]?.justification || row.justification,
            justificationCatalogId: rewritten[idx]?.justificationCatalogId || null,
          }));
          const res = await api.post('/ipm/pesticide-applications/bulk', { rows: resolvedRows, siteId: activeSiteId });
          return res.data.data;
        }}
        onImportComplete={(result) => {
          if (importerTemplateId) loadTemplateRows(importerTemplateId);
          loadPestCatalog();
          loadPestDiseaseCatalog();
          loadData();
          const msg = result?.productsCreated
            ? `Import done — ${result.inserted} records saved, ${result.productsCreated} new product(s) added to catalog`
            : 'Excel import completed — data refreshed';
          notify.success(msg);
        }}
      />

      <Dialog
        open={classifyDialog.open}
        onClose={() => !classifySaving && finishClassify(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Match or add justification</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 2 }}>
            Match a misspelling to an existing catalog name, or add it as new and optionally assign groups (original pests).
          </Typography>
          {classifyDialog.unknowns.map((item) => {
            const choice = classifyChoices[item.bareName] || { matchId: '', category: 'pest', groupIds: [] };
            const catalogOptions = pestDiseaseCatalog.filter((row) => (
              ['pest', 'disease', 'preventative'].includes(row.category) && row.is_active !== false
            ));
            const matchValue = catalogOptions.find((row) => row.id === choice.matchId) || null;
            const groupValue = catalogOptions.filter((row) => (choice.groupIds || []).includes(row.id));
            return (
              <Box key={item.bareName} sx={{ mb: 3 }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>{item.bareName}</Typography>
                <Autocomplete
                  size="small"
                  options={catalogOptions}
                  value={matchValue}
                  getOptionLabel={(opt) => catalogJustificationLabel(opt) || opt.name || ''}
                  isOptionEqualToValue={(a, b) => a.id === b.id}
                  onChange={(_, next) => setClassifyChoices((prev) => ({
                    ...prev,
                    [item.bareName]: {
                      ...choice,
                      ...(prev[item.bareName] || {}),
                      matchId: next?.id || '',
                    },
                  }))}
                  renderInput={(params) => (
                    <TextField {...params} label="Match existing" placeholder="Leave empty to create new" />
                  )}
                />
                {!choice.matchId && (
                  <>
                    <RadioGroup
                      row
                      value={choice.category || 'pest'}
                      onChange={(e) => setClassifyChoices((prev) => ({
                        ...prev,
                        [item.bareName]: {
                          ...choice,
                          ...(prev[item.bareName] || {}),
                          category: e.target.value,
                        },
                      }))}
                    >
                      {JUSTIFICATION_CLASSIFY_OPTIONS.map((opt) => (
                        <FormControlLabel
                          key={opt.value}
                          value={opt.value}
                          control={<Radio size="small" />}
                          label={opt.label}
                        />
                      ))}
                    </RadioGroup>
                    <Autocomplete
                      multiple
                      size="small"
                      options={catalogOptions}
                      value={groupValue}
                      getOptionLabel={(opt) => opt.name || ''}
                      isOptionEqualToValue={(a, b) => a.id === b.id}
                      onChange={(_, next) => setClassifyChoices((prev) => ({
                        ...prev,
                        [item.bareName]: {
                          ...choice,
                          ...(prev[item.bareName] || {}),
                          groupIds: next.map((row) => row.id),
                        },
                      }))}
                      renderInput={(params) => (
                        <TextField {...params} label="Groups (original pests)" placeholder="Optional" />
                      )}
                    />
                  </>
                )}
              </Box>
            );
          })}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => finishClassify(null)} disabled={classifySaving}>Cancel</Button>
          <Button
            variant="contained"
            disabled={classifySaving}
            onClick={() => finishClassify(classifyChoices)}
          >
            Apply
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
