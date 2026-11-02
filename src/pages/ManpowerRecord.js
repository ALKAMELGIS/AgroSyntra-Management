import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { TableSkeleton } from '../components/LoadingSkeleton';
import {
  Box, Typography, Paper, Button, TextField, Tabs, Tab, Chip, Badge,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  CircularProgress, Alert, IconButton, Tooltip, Dialog, DialogTitle,
  DialogContent, DialogActions, Switch, FormControlLabel, FormControl,
  InputLabel, Select, MenuItem, Autocomplete, InputAdornment,
  ToggleButton, ToggleButtonGroup, Checkbox,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import {
  EditOutlined as Edit, DeleteOutlined as Delete, AddOutlined as Add, SearchOutlined as Search, FileDownloadOutlined as FileDownload, FileUploadOutlined as FileUpload,
  Star, StarBorder, Lock, FilterListOutlined as FilterList, PeopleOutlined as People, AssignmentOutlined as Assignment, TodayOutlined as Today, TableChartOutlined as TableChart, HowToRegOutlined as HowToReg, AccessTimeOutlined as AccessTime, MenuBookOutlined as MenuBook, InsightsOutlined as Insights,
} from '@mui/icons-material';
import { apiRequest, apiRequestWithMeta } from '../utils/api';
import { useNotification } from '../contexts/NotificationContext';
import { useMasterData } from '../utils/useMasterData';
import { useActiveSite } from '../contexts/ActiveSiteContext';
import useSeasonListDates from '../hooks/useSeasonListDates';
import { useAuth } from '../contexts/AuthContext';
import useAppLayout from '../hooks/useAppLayout';
import useReadOnlyMode from '../hooks/useReadOnlyMode';
import ReadOnlyBanner from '../components/ReadOnlyBanner';
import { useTranslation } from 'react-i18next';
import {
  PAGE_KEYS,
  canApproveManpowerRecords,
  canModifyManpowerRecord,
  canEditManpowerReference,
  canSubmitManpower,
  canImportManpower,
  canManageManpowerRoster,
} from '../utils/roleAccess';
import { useActiveSeason } from '../contexts/ActiveSeasonContext';
import { canReviewManpowerChangeRequests } from '../utils/changeRequestAccess';
import ManpowerApprovalsPanel from '../components/manpower/ManpowerApprovalsPanel';
import { refreshManpowerApprovalBadgeCount } from '../hooks/useManpowerApprovalBadgeCount';
import * as XLSX from 'xlsx';
import { downloadDetailSummaryWorkbook, downloadWorkHoursWorkbook } from '../utils/manpowerDetailPivotExport';
import { OPS_EXPORT } from '../utils/companyExcelExport';
import useOpsExcelExport from '../hooks/useOpsExcelExport';
import { buildManpowerRecordExportRows, fetchAllManpowerRecords } from '../utils/manpowerRecordExcel';
import { buildWorkersCountRowOrder, findCropIdByNameInMasterData, getSiteCropNamesFromMasterData } from '../utils/manpowerSiteRowOrder';
import WorkersCountPivotTable from '../components/manpower/WorkersCountPivotTable';
import WorkersCountCropSummaryPair from '../components/manpower/WorkersCountCropSummaryPair';
import {
  localIsoDate,
} from '../utils/manpowerWorkersCountSummaryGrid';
import WorkHoursPivotTable from '../components/manpower/WorkHoursPivotTable';
import WorkHoursDetailDialog from '../components/manpower/WorkHoursDetailDialog';
import ManpowerActivityReferenceTable from '../components/manpower/ManpowerActivityReferenceTable';
import ManpowerPerformancePanel from '../components/manpower/ManpowerPerformancePanel';
import {
  PIVOT_COLUMN_OPTIONS,
  resolvePivotActivities,
  resolvePivotActivityColumns,
} from '../utils/manpowerPivotActivities';
import { productivityForRowActivity } from '../utils/manpowerWorkHoursGrid';
import ManpowerOptionalValue from '../components/manpower/ManpowerOptionalValue';
import ManpowerMandatoryValue from '../components/manpower/ManpowerMandatoryValue';
import ManpowerUnitCell from '../components/manpower/ManpowerUnitCell';
import ManpowerDailyImportDialog from '../components/manpower/ManpowerDailyImportDialog';
import { filesFromDataTransfer, importSourceFromPickedFiles } from '../utils/manpowerDailyZip';
import { blockMeetsRequiredFields, getBlockValidationError, getBlockMandatoryErrors } from '../utils/manpowerOptionalFields';
import { excelTableSx, freezeColumnsSx, GutterCell, GUTTER_WIDTH } from '../components/table/ExcelTable';
import { DeleteSelectedButton, RowCheckbox, SelectAllCheckbox, deleteIdsSequentially } from '../components/table/BulkSelect';
import { useRowSelection } from '../hooks/useRowSelection';

const MAX_BLOCKS = 8;
const BLOCK_COLS = ['Activity', 'Unit', 'Variety', 'Location', 'Section', 'Start', 'End', 'Target', 'Actual', 'Hours'];

const RECORD_FROZEN_WIDTHS = [90, 60, 180, 110];
const WORKER_FROZEN_WIDTHS = [110, 160];
const twoRowHeadSx = {
  '&& thead tr:first-of-type .MuiTableCell-head': { top: 0 },
  '&& thead tr:nth-of-type(2) .MuiTableCell-head': { top: 40 },
};
const blockEdgeSx = { borderRight: '2px solid #b5b0a8' };
const blockColMinWidth = (col) => (col === 'Activity' ? 120 : col === 'Location' ? 80 : 60);

function groupRecordsByWorker(records) {
  const map = {};
  records.forEach((r) => {
    const key = `${r.record_date}_${r.worker_id}`;
    if (!map[key]) {
      map[key] = {
        date: r.record_date,
        workerId: r.worker_id,
        employeeId: r.employee_id,
        workerName: r.worker_name,
        workerCategory: r.worker_category,
        tasks: [],
      };
    }
    map[key].tasks.push(r);
  });
  const groups = Object.values(map);
  groups.forEach((g) => {
    g.tasks.sort((a, b) => (a.task_sequence || 1) - (b.task_sequence || 1));
    g.totalHours = g.tasks.reduce((s, t) => s + (Number(t.work_hours) || 0), 0);
  });
  return groups;
}

const APPROVAL_STATUS_COLORS = {
  pending: 'warning',
  approved: 'success',
  rejected: 'error',
};

function ManpowerRecordsGrid({
  groups,
  tableHeight,
  readOnly = false,
  emptyMessage = 'No records found',
  onEdit,
  onDelete,
  onRequestEdit,
  onRequestDelete,
  showApprovalStatus = false,
  canEditRecord,
  canDeleteRecord,
  canRequestChange,
  selectedIds,
  onToggleSelect,
  onToggleAllSelect,
}) {
  const actionColSpan = readOnly ? 0 : 1;
  const recordMinWidth = GUTTER_WIDTH
    + RECORD_FROZEN_WIDTHS.reduce((sum, w) => sum + w, 0)
    + MAX_BLOCKS * 10 * 80
    + 70
    + (readOnly ? 0 : 80);

  return (
    <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: tableHeight, overflow: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <Table
        stickyHeader
        size="small"
        sx={[excelTableSx, freezeColumnsSx(RECORD_FROZEN_WIDTHS, GUTTER_WIDTH), twoRowHeadSx, { minWidth: recordMinWidth }]}
      >
        <TableHead>
          <TableRow>
            <TableCell className="table-gutter" rowSpan={2} />
            <TableCell className="col-frozen-0" rowSpan={2}>Date</TableCell>
            <TableCell className="col-frozen-1" rowSpan={2}>ID</TableCell>
            <TableCell className="col-frozen-2" rowSpan={2}>Employee Name</TableCell>
            <TableCell className="col-frozen-3" rowSpan={2} sx={blockEdgeSx}>Category</TableCell>
            {Array.from({ length: MAX_BLOCKS }, (_, i) => (
              <TableCell
                key={i}
                colSpan={10}
                align="center"
                sx={i < MAX_BLOCKS - 1 ? blockEdgeSx : undefined}
              >
                Activity {i + 1}
              </TableCell>
            ))}
            <TableCell className="col-numeric" rowSpan={2} sx={{ minWidth: 70, borderLeft: '2px solid #b5b0a8' }}>Total Hrs</TableCell>
            {!readOnly && (
              <TableCell rowSpan={2} sx={{ minWidth: 140 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  {onToggleAllSelect && (
                    <SelectAllCheckbox
                      plain
                      ids={groups.flatMap((g) => g.tasks.filter((t) => (canDeleteRecord ? canDeleteRecord(t) : true)).map((t) => t.id))}
                      selectedIds={selectedIds}
                      onToggleAll={onToggleAllSelect}
                      label="Select all deletable activity blocks"
                    />
                  )}
                  Actions
                </Box>
              </TableCell>
            )}
          </TableRow>
          <TableRow>
            {Array.from({ length: MAX_BLOCKS }, (_, blk) =>
              BLOCK_COLS.map((col, ci) => (
                <TableCell
                  key={`${blk}-${ci}`}
                  className={col === 'Hours' ? 'col-numeric' : undefined}
                  sx={{
                    minWidth: blockColMinWidth(col),
                    ...(ci === 9 && blk < MAX_BLOCKS - 1 ? blockEdgeSx : {}),
                  }}
                >
                  {col}
                </TableCell>
              ))
            )}
          </TableRow>
        </TableHead>
        <TableBody>
          {groups.map((g, idx) => (
            <TableRow key={`${g.date}_${g.workerId}`} hover>
              <GutterCell index={idx + 1} />
              <TableCell className="col-frozen-0">
                {new Date(g.date).toLocaleDateString('en-GB')}
              </TableCell>
              <TableCell className="col-frozen-1">{g.employeeId}</TableCell>
              <TableCell className="col-frozen-2" sx={{ fontWeight: 600 }} title={g.workerName}>
                {g.workerName}
                {showApprovalStatus && g.tasks[0]?.approval_status && (
                  <Chip
                    size="small"
                    label={g.tasks[0].approval_status}
                    color={APPROVAL_STATUS_COLORS[g.tasks[0].approval_status] || 'default'}
                    sx={{ ml: 1 }}
                  />
                )}
              </TableCell>
              <TableCell className="col-frozen-3" sx={blockEdgeSx}>
                <Chip label={g.workerCategory} size="small" variant="outlined"
                  color={g.workerCategory === 'Permanent' ? 'primary' : 'default'} />
              </TableCell>
              {Array.from({ length: MAX_BLOCKS }, (_, i) => {
                const t = g.tasks[i];
                const lastInBlock = (ci) => ci === 9 && i < MAX_BLOCKS - 1 ? blockEdgeSx : undefined;
                if (!t) {
                  return Array.from({ length: 10 }, (__, ci) => (
                    <TableCell key={`${i}-${ci}`} sx={{ color: '#ccc', ...lastInBlock(ci) }}>
                      -
                    </TableCell>
                  ));
                }
                return [
                  <TableCell key={`${i}-0`} sx={{ whiteSpace: 'nowrap' }}>
                    <ManpowerOptionalValue field="activity" value={t.activity} />
                  </TableCell>,
                  <TableCell key={`${i}-1`}>
                    <ManpowerUnitCell activity={t.activity} unit={t.unit} />
                  </TableCell>,
                  <TableCell key={`${i}-2`}>
                    <ManpowerMandatoryValue value={t.variety} />
                  </TableCell>,
                  <TableCell key={`${i}-3`}>
                    <ManpowerMandatoryValue value={t.location} />
                  </TableCell>,
                  <TableCell key={`${i}-4`}>
                    <ManpowerMandatoryValue value={t.section} />
                  </TableCell>,
                  <TableCell key={`${i}-5`}>
                    <ManpowerMandatoryValue value={t.start_time} format={(v) => v?.substring(0, 5)} />
                  </TableCell>,
                  <TableCell key={`${i}-6`}>
                    <ManpowerMandatoryValue value={t.end_time} format={(v) => v?.substring(0, 5)} />
                  </TableCell>,
                  <TableCell key={`${i}-7`}>
                    <ManpowerOptionalValue field="target" value={t.target} />
                  </TableCell>,
                  <TableCell key={`${i}-8`}>
                    <ManpowerOptionalValue field="actual" value={t.actual} />
                  </TableCell>,
                  <TableCell key={`${i}-9`} className="col-numeric" sx={{ fontWeight: 600, ...lastInBlock(9) }}>
                    <ManpowerOptionalValue
                      field="hours"
                      record={{
                        work_hours: t.work_hours,
                        start_time: t.start_time,
                        end_time: t.end_time,
                      }}
                    />
                  </TableCell>,
                ];
              })}
              <TableCell className="col-numeric" sx={{ fontWeight: 700, borderLeft: '2px solid #b5b0a8' }}>
                {g.totalHours ? g.totalHours.toFixed(1) : '-'}
              </TableCell>
              {!readOnly && (
                <TableCell>
                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                    {g.tasks.map((t) => {
                      const canEdit = canEditRecord ? canEditRecord(t) : true;
                      const canRequest = canRequestChange ? canRequestChange(t) : false;
                      const canDel = canDeleteRecord ? canDeleteRecord(t) : canEdit;
                      return (
                        <Box key={t.id} sx={{ display: 'flex' }}>
                          {canEdit && (
                            <Tooltip title={`Edit block ${t.task_sequence || 1}${t.activity ? `: ${t.activity}` : ''}`}>
                              <IconButton size="small" onClick={() => onEdit(t)}><Edit fontSize="small" /></IconButton>
                            </Tooltip>
                          )}
                          {canRequest && onRequestEdit && (
                            <Tooltip title={`Request edit block ${t.task_sequence || 1}${t.activity ? `: ${t.activity}` : ''}`}>
                              <IconButton size="small" color="warning" onClick={() => onRequestEdit(t)}><Edit fontSize="small" /></IconButton>
                            </Tooltip>
                          )}
                          {canDel && (
                            <>
                              {onToggleSelect && (
                                <RowCheckbox
                                  id={t.id}
                                  selectedIds={selectedIds}
                                  onToggle={onToggleSelect}
                                  label={`Select block ${t.task_sequence || 1}`}
                                />
                              )}
                              <Tooltip title={`Delete block ${t.task_sequence || 1}`}>
                                <IconButton size="small" color="error" onClick={() => onDelete(t.id, t)}><Delete fontSize="small" /></IconButton>
                              </Tooltip>
                            </>
                          )}
                          {canRequest && onRequestDelete && (
                            <Tooltip title={`Request delete block ${t.task_sequence || 1}`}>
                              <IconButton size="small" color="error" onClick={() => onRequestDelete(t)}><Delete fontSize="small" /></IconButton>
                            </Tooltip>
                          )}
                        </Box>
                      );
                    })}
                  </Box>
                </TableCell>
              )}
            </TableRow>
          ))}
          {groups.length === 0 && (
            <TableRow>
              <TableCell colSpan={5 + MAX_BLOCKS * 10 + 1 + actionColSpan} align="center">
                <Typography color="text.secondary" py={4}>{emptyMessage}</Typography>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

export default function ManpowerRecord() {
  const { user } = useAuth();
  const readOnly = useReadOnlyMode(PAGE_KEYS.WORKFORCE);
  const { t } = useTranslation();
  const canApprove = canApproveManpowerRecords(user);
  const canEditReference = canEditManpowerReference(user);
  const canSubmit = canSubmitManpower(user);
  const canImport = canImportManpower(user) && !readOnly;
  const { isSeasonReadOnly } = useActiveSeason();
  // Workers list: worker + operation manager (OM is otherwise view-only on workforce pages).
  const canManageRoster = canManageManpowerRoster(user) && !isSeasonReadOnly;
  const notify = useNotification();
  const exportOpsExcel = useOpsExcelExport();
  const recordSelection = useRowSelection();
  const { data: masterData } = useMasterData();
  const { activeSiteId } = useActiveSite();
  const theme = useTheme();
  const { isMobile, scrollRegionHeight } = useAppLayout();
  const recordsTableHeight = scrollRegionHeight(isMobile ? 300 : 320);
  const workersTableHeight = scrollRegionHeight(isMobile ? 280 : 300);
  const workersCountGridHeight = scrollRegionHeight(isMobile ? 320 : 360);
  const workersCountSummaryHeight = scrollRegionHeight(isMobile ? 280 : 320);
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = useMemo(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam === 'daily') return 1;
    if (tabParam === 'workers') return 2;
    if (tabParam === 'workers-count') return 3;
    if (tabParam === 'work-hours') return 4;
    if (tabParam === 'reference') return 5;
    if (tabParam === 'performance') return 6;
    if (tabParam === 'approvals') return 7;
    return 0;
  }, [searchParams]);

  const handleTabChange = (_, value) => {
    if (value === 1) {
      setSearchParams({ tab: 'daily' });
      return;
    }
    if (value === 2) {
      setSearchParams({ tab: 'workers' });
      return;
    }
    if (value === 3) {
      setSearchParams({ tab: 'workers-count' });
      return;
    }
    if (value === 4) {
      setSearchParams({ tab: 'work-hours' });
      return;
    }
    if (value === 5) {
      setSearchParams({ tab: 'reference' });
      return;
    }
    if (value === 6) {
      setSearchParams({ tab: 'performance' });
      return;
    }
    if (value === 7) {
      setSearchParams({ tab: 'approvals' });
      return;
    }
    setSearchParams({});
  };

  // ─── Records Tab State ────────────────────────────────────────
  const [records, setRecords] = useState([]);
  const [recordsMeta, setRecordsMeta] = useState({ total: 0 });
  const [loadingRecords, setLoadingRecords] = useState(true);
  const [recordsError, setRecordsError] = useState(null);
  const {
    startDate: filterDate,
    endDate: filterDateEnd,
    setStartDate: setFilterDate,
    setEndDate: setFilterDateEnd,
    seasonStart,
    seasonEnd,
    isReady: seasonDatesReady,
  } = useSeasonListDates();
  const [filterSearch, setFilterSearch] = useState('');
  const [filterActivity, setFilterActivity] = useState('');
  const [filterApprovalStatus, setFilterApprovalStatus] = useState('');
  const [page, setPage] = useState(1);
  const [rowsPerPage] = useState(50);

  // ─── Daily Report Tab State ───────────────────────────────────
  const [dailyDate, setDailyDate] = useState(() => localIsoDate());
  const [dailyRecords, setDailyRecords] = useState([]);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [dailyError, setDailyError] = useState(null);

  const firstOfMonth = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  }, []);
  const todayIso = useMemo(() => localIsoDate(), []);

  const [pivotStartDate, setPivotStartDate] = useState(firstOfMonth);
  const [pivotEndDate, setPivotEndDate] = useState(todayIso);
  const [pivotDailyReportDate, setPivotDailyReportDate] = useState(todayIso);
  const [pivotGroupBy, setPivotGroupBy] = useState('crop');
  const [workersCountApprovedOnly, setWorkersCountApprovedOnly] = useState(false);
  const [pivotLoading, setPivotLoading] = useState(false);
  const [pivotData, setPivotData] = useState(null);
  const [pivotError, setPivotError] = useState(null);

  const [hoursStartDate, setHoursStartDate] = useState(firstOfMonth);
  const [hoursEndDate, setHoursEndDate] = useState(todayIso);

  useEffect(() => {
    if (!seasonDatesReady || !seasonStart) return;
    setPivotStartDate(seasonStart);
    setHoursStartDate(seasonStart);
    if (seasonEnd) {
      setPivotEndDate(seasonEnd);
      setHoursEndDate(seasonEnd);
    }
  }, [seasonDatesReady, seasonStart, seasonEnd]);
  const [hoursGroupBy, setHoursGroupBy] = useState('crop');
  const [hoursCropFilter, setHoursCropFilter] = useState('__all__');
  const [hoursActivityFilter, setHoursActivityFilter] = useState([]);
  const [hoursVarietyTemplate, setHoursVarietyTemplate] = useState([]);
  const [hoursLoading, setHoursLoading] = useState(false);
  const [hoursData, setHoursData] = useState(null);
  const [hoursError, setHoursError] = useState(null);
  const [hoursDetail, setHoursDetail] = useState({ open: false, crop: '', variety: '', activity: '', activityLabel: '' });

  // Edit record dialog
  const [editDialog, setEditDialog] = useState({ open: false, record: null, asChangeRequest: false });
  const [editForm, setEditForm] = useState({});
  const [editShowMandatoryErrors, setEditShowMandatoryErrors] = useState(false);

  // ─── Workers Tab State ────────────────────────────────────────
  const [workers, setWorkers] = useState([]);
  const [loadingWorkers, setLoadingWorkers] = useState(false);
  const [workerSearch, setWorkerSearch] = useState('');
  const [workerDialog, setWorkerDialog] = useState({ open: false, mode: 'add', worker: null });
  const [workerForm, setWorkerForm] = useState({ employeeId: '', name: '', category: 'Casual', isTeamLeader: false, siteId: '' });
  const canEditTeamLeaderFlag = canManageRoster && workerDialog.mode === 'add';

  const canToggleWorkerTeamLeader = (w) => {
    if (w.linked_user_role === 'scouter' || w.linked_user_role === 'operator') return false;
    return true;
  };
  const [pinDialog, setPinDialog] = useState({ open: false, workerId: null, workerName: '' });
  const [pinValue, setPinValue] = useState('');
  const [saving, setSaving] = useState(false);

  // Site filter for workers
  const [workerSiteFilter, setWorkerSiteFilter] = useState('');

  const [importSource, setImportSource] = useState(null);
  const [excelDragOver, setExcelDragOver] = useState(false);

  // Bulk upload
  const [bulkDialog, setBulkDialog] = useState(false);
  const [bulkFile, setBulkFile] = useState(null);
  const [bulkPreview, setBulkPreview] = useState([]);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [pendingApprovalCount, setPendingApprovalCount] = useState(0);
  const [pendingClashCount, setPendingClashCount] = useState(0);
  const [changeRequestDialog, setChangeRequestDialog] = useState({
    open: false, action: 'update', entityId: null, payload: null,
  });
  const [changeRequestReason, setChangeRequestReason] = useState('');
  const [changeRequestSubmitting, setChangeRequestSubmitting] = useState(false);

  const allSites = useMemo(() => {
    const sites = [];
    masterData.countries?.forEach((c) => c.sites?.forEach((s) => sites.push(s)));
    return sites;
  }, [masterData]);

  useEffect(() => {
    if (activeSiteId) {
      setWorkerSiteFilter(activeSiteId);
    }
  }, [activeSiteId]);

  const loadPivotSummary = useCallback(async () => {
    if (!pivotStartDate || !pivotEndDate || !activeSiteId) return;
    setPivotLoading(true);
    setPivotError(null);
    try {
      const params = new URLSearchParams({
        start_date: pivotStartDate,
        end_date: pivotEndDate,
        site_id: activeSiteId,
      });
      if (workersCountApprovedOnly) params.set('approved_only', 'true');
      const data = await apiRequest(`/manpower/summary/detail-pivot?${params.toString()}`);
      // #region agent log
      fetch('http://127.0.0.1:7696/ingest/fe52ce8f-1e39-401c-9d8d-13bdb7e59857',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'f50e55'},body:JSON.stringify({sessionId:'f50e55',runId:'post-fix',hypothesisId:'range-grid',location:'ManpowerRecord.js:loadPivotSummary',message:'detail-pivot payload',data:{start:pivotStartDate,end:pivotEndDate,daily:pivotDailyReportDate,datesCount:(data?.dates||[]).length,cellsCount:(data?.cells||[]).length,datesLast8:(data?.dates||[]).slice(-8),sampleActs:[...new Set((data?.cells||[]).map((c)=>c.activity))].slice(0,16),approvedOnly:workersCountApprovedOnly},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      setPivotData(data);
    } catch (err) {
      setPivotError(err.message || 'Failed to load workers count summary');
      setPivotData(null);
    } finally {
      setPivotLoading(false);
    }
  }, [pivotStartDate, pivotEndDate, activeSiteId, workersCountApprovedOnly]);

  const workersCountRowOrder = useMemo(() => {
    if (!activeSiteId || !pivotData) return [];
    const siteCrops = pivotData.siteCrops?.length
      ? pivotData.siteCrops
      : getSiteCropNamesFromMasterData(masterData, activeSiteId);
    const pivotVarieties = [
      ...new Set(
        (pivotData.cells || [])
          .map((cell) => cell.variety)
          .filter(Boolean),
      ),
    ].sort((a, b) => a.localeCompare(b));
    return buildWorkersCountRowOrder({
      groupBy: pivotGroupBy,
      siteCrops,
      siteVarieties: pivotData.siteVarieties || [],
      pivotCrops: pivotData.crops || [],
      pivotVarieties,
      cells: pivotData.cells || [],
    });
  }, [activeSiteId, pivotData, pivotGroupBy, masterData]);

  const loadHoursSummary = useCallback(async () => {
    if (!hoursStartDate || !hoursEndDate || !activeSiteId) return;
    setHoursLoading(true);
    setHoursError(null);
    try {
      const params = new URLSearchParams({
        start_date: hoursStartDate,
        end_date: hoursEndDate,
        site_id: activeSiteId,
        approved_only: 'true',
      });
      const data = await apiRequest(`/manpower/summary/detail-pivot?${params.toString()}`);
      setHoursData(data);
    } catch (err) {
      setHoursError(err.message || 'Failed to load work hours summary');
      setHoursData(null);
    } finally {
      setHoursLoading(false);
    }
  }, [hoursStartDate, hoursEndDate, activeSiteId]);

  const findCropIdByName = useCallback((cropName) => {
    return findCropIdByNameInMasterData(masterData, cropName, activeSiteId);
  }, [masterData, activeSiteId]);

  useEffect(() => {
    if (hoursCropFilter === '__all__' || hoursGroupBy !== 'crop') {
      setHoursVarietyTemplate([]);
      return;
    }
    const cropId = findCropIdByName(hoursCropFilter);
    if (!cropId) {
      setHoursVarietyTemplate([]);
      return;
    }
    let cancelled = false;
    apiRequest(`/manpower/admin/varieties?crop_id=${cropId}`)
      .then((rows) => {
        if (!cancelled) {
          setHoursVarietyTemplate((rows || []).map((r) => r.name).filter(Boolean));
        }
      })
      .catch(() => {
        if (!cancelled) setHoursVarietyTemplate([]);
      });
    return () => { cancelled = true; };
  }, [hoursCropFilter, hoursGroupBy, findCropIdByName]);

  const workHoursRowOrder = useMemo(() => {
    if (!activeSiteId || !hoursData) return [];
    if (hoursCropFilter !== '__all__') {
      const varieties = hoursVarietyTemplate.slice().sort((a, b) => a.localeCompare(b));
      const dataVarieties = [
        ...new Set(
          (hoursData.cells || [])
            .filter((c) => c.crop === hoursCropFilter)
            .map((c) => c.variety)
            .filter((v) => v && v !== 'General'),
        ),
      ];
      const merged = ['General'];
      const seen = new Set(['General']);
      for (const v of varieties) {
        if (!seen.has(v)) { merged.push(v); seen.add(v); }
      }
      for (const v of dataVarieties.sort((a, b) => a.localeCompare(b))) {
        if (!seen.has(v)) { merged.push(v); seen.add(v); }
      }
      return merged;
    }
    const siteCrops = hoursData.siteCrops?.length
      ? hoursData.siteCrops
      : getSiteCropNamesFromMasterData(masterData, activeSiteId);
    const pivotVarieties = [
      ...new Set((hoursData.cells || []).map((cell) => cell.variety).filter(Boolean)),
    ].sort((a, b) => a.localeCompare(b));
    return buildWorkersCountRowOrder({
      groupBy: hoursGroupBy,
      siteCrops,
      siteVarieties: hoursData.siteVarieties || [],
      pivotCrops: hoursData.crops || [],
      pivotVarieties,
      cells: hoursData.cells || [],
    });
  }, [activeSiteId, hoursData, hoursGroupBy, hoursCropFilter, hoursVarietyTemplate, masterData]);

  const hoursActivityKeys = useMemo(() => {
    const allKeys = resolvePivotActivityColumns(hoursData).map((a) => a.key);
    if (!hoursActivityFilter.length) {
      return allKeys;
    }
    return hoursActivityFilter;
  }, [hoursActivityFilter, hoursData]);

  const hoursGroupByEffective = useMemo(() => {
    if (hoursCropFilter !== '__all__') return 'variety';
    return hoursGroupBy;
  }, [hoursCropFilter, hoursGroupBy]);

  useEffect(() => {
    if (tab === 3) loadPivotSummary();
  }, [tab, loadPivotSummary]);

  useEffect(() => {
    if (tab === 4) loadHoursSummary();
  }, [tab, loadHoursSummary]);

  const exportPivotExcel = () => {
    if (!pivotData?.dates?.length || !workersCountRowOrder.length) {
      notify.error('No data to export for this date range.');
      return;
    }
    downloadDetailSummaryWorkbook(
      pivotData,
      `workers-count-${pivotStartDate}-to-${pivotEndDate}.xlsx`,
      {
        dailyReportDate: pivotDailyReportDate,
        tillStartDate: pivotStartDate,
        tillEndDate: pivotEndDate,
        groupBy: pivotGroupBy,
        rowOrder: workersCountRowOrder,
      },
      theme,
    );
    notify.success('Exported activity sheets and Summary (daily + till date)');
  };

  const exportWorkHoursExcel = () => {
    if (!hoursData?.dates?.length || !workHoursRowOrder.length) {
      notify.error('No data to export for this date range.');
      return;
    }
    downloadWorkHoursWorkbook(
      hoursData,
      `work-hours-${hoursStartDate}-to-${hoursEndDate}.xlsx`,
      { groupBy: hoursGroupBy, rowOrder: workHoursRowOrder },
      theme,
    );
    notify.success('Exported Work Hours (EAG, Casual, Total)');
  };

  // ─── Reference data ───────────────────────────────────────────
  const [activities, setActivities] = useState([]);

  // ─── Load Records ─────────────────────────────────────────────
  const loadRecords = useCallback(async () => {
    if (!seasonDatesReady) return;
    try {
      setRecordsError(null);
      const params = new URLSearchParams();
      if (filterDate) params.set('start_date', filterDate);
      if (filterDateEnd) params.set('end_date', filterDateEnd);
      if (activeSiteId) params.set('site_id', activeSiteId);
      if (filterSearch) params.set('search', filterSearch);
      if (filterActivity) params.set('activity', filterActivity);
      if (filterApprovalStatus) params.set('approval_status', filterApprovalStatus);
      params.set('limit', String(rowsPerPage));
      params.set('offset', String((page - 1) * rowsPerPage));

      const qs = params.toString();
      const result = await apiRequestWithMeta(`/manpower/records${qs ? `?${qs}` : ''}`);
      setRecords(result.data || []);
      setRecordsMeta(result.meta || { total: 0 });
    } catch (err) {
      setRecordsError(err.message || 'Failed to load records');
    } finally {
      setLoadingRecords(false);
    }
  }, [filterDate, filterDateEnd, filterSearch, filterActivity, filterApprovalStatus, page, rowsPerPage, activeSiteId, seasonDatesReady]);

  useEffect(() => { loadRecords(); }, [loadRecords]);

  const loadDailyRecords = useCallback(async () => {
    try {
      setDailyLoading(true);
      setDailyError(null);
      const data = await fetchAllManpowerRecords({
        date: dailyDate,
        approved_only: 'true',
        site_id: activeSiteId,
      });
      setDailyRecords(data);
    } catch (err) {
      setDailyError(err.message || 'Failed to load daily report');
    } finally {
      setDailyLoading(false);
    }
  }, [dailyDate, activeSiteId]);

  useEffect(() => {
    if (tab === 1) loadDailyRecords();
  }, [tab, loadDailyRecords]);

  // ─── Load Workers ─────────────────────────────────────────────
  const loadWorkers = useCallback(async () => {
    setLoadingWorkers(true);
    try {
      const params = new URLSearchParams();
      if (workerSearch) params.set('search', workerSearch);
      if (workerSiteFilter) params.set('site_id', workerSiteFilter);
      params.set('active_only', 'false');
      const data = await apiRequest(`/manpower/workers?${params.toString()}`);
      setWorkers(data || []);
    } catch (err) {
      notify.error(err.message || 'Failed to load workers');
    } finally {
      setLoadingWorkers(false);
    }
  }, [workerSearch, workerSiteFilter, notify]);

  useEffect(() => { if (tab === 2) loadWorkers(); }, [tab, loadWorkers]);

  const loadPendingApprovalCount = useCallback(async () => {
    if (!canApprove) return;
    try {
      const data = await apiRequest('/manpower/approvals/pending-count');
      setPendingApprovalCount(data?.badgeCount ?? data?.count ?? 0);
      setPendingClashCount(data?.clashCount ?? 0);
      refreshManpowerApprovalBadgeCount();
    } catch {
      setPendingApprovalCount(0);
      setPendingClashCount(0);
    }
  }, [canApprove]);

  useEffect(() => {
    loadPendingApprovalCount();
  }, [loadPendingApprovalCount]);

  const canDirectModifyApprovedManpower = useCallback((record) => (
    record?.approval_status !== 'approved' || canReviewManpowerChangeRequests(user)
  ), [user]);

  const canEditManpowerRecord = useCallback((record) => (
    canDirectModifyApprovedManpower(record) && canModifyManpowerRecord(user, record)
  ), [user, canDirectModifyApprovedManpower]);

  const canDeleteManpowerRecord = useCallback((record) => (
    canDirectModifyApprovedManpower(record) && canModifyManpowerRecord(user, record)
  ), [user, canDirectModifyApprovedManpower]);

  const canRequestManpowerChange = useCallback((record) => (
    canSubmitManpower(user)
    && record?.approval_status === 'approved'
    && !canReviewManpowerChangeRequests(user)
  ), [user]);

  const showRecordActions = canSubmit || canApprove;

  useEffect(() => {
    apiRequest('/manpower/admin/activities').then(setActivities).catch(() => {});
  }, []);

  const handleActivityPivotColumnChange = async (activityId, pivotColumn) => {
    try {
      const value = pivotColumn || null;
      await apiRequest(`/manpower/admin/activities/${activityId}/pivot-column`, {
        method: 'PUT',
        body: JSON.stringify({ pivotColumn: value }),
      });
      setActivities((prev) => prev.map((a) => (
        a.id === activityId ? { ...a, pivot_column: value } : a
      )));
      notify.success('Activity column updated');
    } catch (err) {
      notify.error(err.message || 'Failed to update activity column');
    }
  };

  const groupedRecords = useMemo(() => groupRecordsByWorker(records), [records]);
  const dailyGroupedRecords = useMemo(() => groupRecordsByWorker(dailyRecords), [dailyRecords]);

  // ─── Record Handlers ──────────────────────────────────────────

  const openEdit = (record, asChangeRequest = false) => {
    if (record?.approval_status === 'approved' && !canReviewManpowerChangeRequests(user) && !asChangeRequest) {
      openEdit(record, true);
      return;
    }
    setEditForm({
      activity: record.activity || '',
      unit: record.unit || '',
      variety: record.variety || '',
      location: record.location || '',
      section: record.section || '',
      startTime: record.start_time?.substring(0, 5) || '',
      endTime: record.end_time?.substring(0, 5) || '',
      target: record.target || '',
      actual: record.actual || '',
      workHours: record.work_hours || '',
      overtime: record.overtime || '',
      totalHours: record.total_hours || '',
    });
    setEditShowMandatoryErrors(false);
    setEditDialog({ open: true, record, asChangeRequest: Boolean(asChangeRequest) });
  };

  const handleEditSave = async () => {
    if (!editDialog.asChangeRequest && !canModifyManpowerRecord(user, editDialog.record)) return;
    setEditShowMandatoryErrors(true);
    if (!blockMeetsRequiredFields(editForm)) {
      notify.error(getBlockValidationError(editForm));
      return;
    }
    if (editDialog.asChangeRequest) {
      setChangeRequestDialog({
        open: true,
        action: 'update',
        entityId: editDialog.record.id,
        payload: { ...editForm },
      });
      setChangeRequestReason('');
      setEditDialog({ open: false, record: null, asChangeRequest: false });
      return;
    }
    setSaving(true);
    try {
      await apiRequest(`/manpower/records/${editDialog.record.id}`, {
        method: 'PUT',
        body: JSON.stringify(editForm),
      });
      setEditDialog({ open: false, record: null, asChangeRequest: false });
      notify.success('Record updated');
      loadRecords();
      if (tab === 7) loadPendingApprovalCount();
    } catch (err) {
      notify.error(err.message || 'Failed to update record');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRecord = async (id, record) => {
    if (record?.approval_status === 'approved' && !canReviewManpowerChangeRequests(user)) {
      setChangeRequestDialog({ open: true, action: 'delete', entityId: id, payload: null });
      setChangeRequestReason('');
      return;
    }
    if (!window.confirm('Delete this record?')) return;
    try {
      await apiRequest(`/manpower/records/${id}`, { method: 'DELETE' });
      notify.success('Record deleted');
      loadRecords();
    } catch (err) {
      notify.error(err.message || 'Failed to delete');
    }
  };

  const handleBulkDeleteRecords = async () => {
    const ids = [...recordSelection.selectedIds];
    if (!ids.length) return;
    if (!window.confirm(`Delete ${ids.length} selected activity block(s)?`)) return;
    const deleted = await deleteIdsSequentially(ids, (id) => apiRequest(`/manpower/records/${id}`, { method: 'DELETE' }));
    recordSelection.clear();
    notify.success(`Deleted ${deleted} record(s)`);
    loadRecords();
  };

  const submitManpowerChangeRequest = async () => {
    const { action, entityId, payload } = changeRequestDialog;
    if (!changeRequestReason.trim()) {
      notify.error('Reason is required for change requests');
      return;
    }
    setChangeRequestSubmitting(true);
    try {
      await apiRequest('/ipm/change-requests', {
        method: 'POST',
        body: JSON.stringify({
          entityType: 'manpower_record',
          entityId,
          action,
          reason: changeRequestReason.trim(),
          proposedPayload: action === 'update' ? payload : null,
          siteId: activeSiteId || null,
        }),
      });
      notify.success('Change request submitted for operation manager review');
      setChangeRequestDialog({ open: false, action: 'update', entityId: null, payload: null });
      setChangeRequestReason('');
    } catch (err) {
      notify.error(err.message || 'Failed to submit change request');
    } finally {
      setChangeRequestSubmitting(false);
    }
  };

  // ─── Worker Handlers ──────────────────────────────────────────

  const openWorkerAdd = () => {
    if (!canManageRoster) return;
    setWorkerForm({ employeeId: '', name: '', category: 'Casual', isTeamLeader: false, siteId: workerSiteFilter || '' });
    setWorkerDialog({ open: true, mode: 'add', worker: null });
  };

  const openWorkerEdit = (w) => {
    setWorkerForm({
      employeeId: w.employee_id, name: w.name, category: w.category,
      isTeamLeader: w.is_team_leader, siteId: w.site_id || '',
    });
    setWorkerDialog({ open: true, mode: 'edit', worker: w });
  };

  const getSiteName = (siteId) => {
    if (!siteId) return '-';
    const s = allSites.find((site) => site.id === siteId);
    return s ? s.name : siteId.slice(0, 8);
  };

  const handleBulkFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBulkFile(file);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const wb = XLSX.read(evt.target.result, { type: 'binary' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws, { defval: '' });
      const mapped = data.map((row) => {
        const employeeId = String(row['Employee ID'] || row['employee_id'] || row['ID'] || row['id'] || '').trim();
        const name = String(row['Name'] || row['name'] || row['Full Name'] || '').trim();
        const cat = String(row['Category'] || row['category'] || 'Casual').trim();
        const category = cat === 'Permanent' ? 'Permanent' : 'Casual';
        return { employeeId, name, category };
      }).filter((r) => r.employeeId && r.name);
      setBulkPreview(mapped);
    };
    reader.readAsBinaryString(file);
  };

  const handleBulkUpload = async () => {
    if (bulkPreview.length === 0) return;
    setBulkUploading(true);
    try {
      const res = await apiRequest('/manpower/workers/bulk', {
        method: 'POST',
        body: JSON.stringify({ workers: bulkPreview, siteId: workerSiteFilter || undefined }),
      });
      notify.success(`Created ${res.created} workers, ${res.skipped} skipped (duplicates)`);
      if (res.errors?.length) notify.error(`${res.errors.length} errors`);
      setBulkDialog(false);
      setBulkFile(null);
      setBulkPreview([]);
      loadWorkers();
    } catch (err) {
      notify.error(err.message || 'Bulk upload failed');
    } finally {
      setBulkUploading(false);
    }
  };

  const handleWorkerSave = async () => {
    if (!canManageRoster) return;
    setSaving(true);
    try {
      if (workerDialog.mode === 'add') {
        await apiRequest('/manpower/workers', {
          method: 'POST',
          body: JSON.stringify(workerForm),
        });
        notify.success('Worker added');
      } else {
        await apiRequest(`/manpower/workers/${workerDialog.worker.id}`, {
          method: 'PUT',
          body: JSON.stringify(workerForm),
        });
        notify.success('Worker updated');
      }
      setWorkerDialog({ open: false, mode: 'add', worker: null });
      loadWorkers();
    } catch (err) {
      notify.error(err.message || 'Failed to save worker');
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivateWorker = async (id) => {
    if (!window.confirm('Deactivate this worker?')) return;
    try {
      await apiRequest(`/manpower/workers/${id}`, { method: 'DELETE' });
      notify.success('Worker deactivated');
      loadWorkers();
    } catch (err) {
      notify.error(err.message || 'Failed to deactivate');
    }
  };

  const handleSetPin = async () => {
    if (!pinValue || pinValue.length < 4) {
      notify.error('PIN must be at least 4 characters');
      return;
    }
    setSaving(true);
    try {
      await apiRequest(`/manpower/workers/${pinDialog.workerId}/pin`, {
        method: 'PUT',
        body: JSON.stringify({ pin: pinValue }),
      });
      notify.success('PIN set successfully');
      setPinDialog({ open: false, workerId: null, workerName: '' });
      setPinValue('');
    } catch (err) {
      notify.error(err.message || 'Failed to set PIN');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleTeamLeader = async (w) => {
    try {
      await apiRequest(`/manpower/workers/${w.id}`, {
        method: 'PUT',
        body: JSON.stringify({ isTeamLeader: !w.is_team_leader }),
      });
      notify.success(`${w.name} ${!w.is_team_leader ? 'set as' : 'removed as'} team leader`);
      loadWorkers();
    } catch (err) {
      notify.error(err.message || 'Failed to update');
    }
  };

  // ─── Excel Export ─────────────────────────────────────────────

  const exportManpowerGroups = async (groups, filename) => {
    if (!groups.length) {
      notify.warning('No records to export');
      return;
    }
    const ok = await exportOpsExcel(buildManpowerRecordExportRows(groups), {
      filename,
      ...OPS_EXPORT.manpower,
    });
    if (ok) notify.success('Excel exported');
  };

  const exportRecordsExcel = async () => {
    try {
      const recordsAll = await fetchAllManpowerRecords({
        start_date: filterDate,
        end_date: filterDateEnd,
        site_id: activeSiteId,
        search: filterSearch,
        activity: filterActivity,
        approval_status: filterApprovalStatus,
      });
      await exportManpowerGroups(groupRecordsByWorker(recordsAll), `Manpower_Record_${filterDate || 'all'}`);
    } catch (err) {
      notify.error(err.message || 'Failed to export Excel');
    }
  };

  const exportDailyExcel = async () => {
    await exportManpowerGroups(dailyGroupedRecords, `Manpower_Daily_Report_${dailyDate}`);
  };

  const handleImportFile = (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    const picked = importSourceFromPickedFiles(files);
    if (picked.error) {
      notify.error(picked.error);
      return;
    }
    setImportSource(picked.source);
  };

  const reviewOpen = Boolean(importSource?.files?.length);

  const handleRecordsDragOver = (e) => {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = (!canImport || reviewOpen) ? 'none' : 'copy';
    }
    if (canImport && !reviewOpen) setExcelDragOver(true);
  };

  const handleRecordsDragLeave = (e) => {
    if (e.relatedTarget && e.currentTarget.contains(e.relatedTarget)) return;
    setExcelDragOver(false);
  };

  const handleRecordsDrop = (e) => {
    e.preventDefault();
    setExcelDragOver(false);
    if (!canImport || reviewOpen) return;
    const dropped = filesFromDataTransfer(e.dataTransfer);
    if (dropped.error) {
      notify.error(dropped.error);
      return;
    }
    const picked = importSourceFromPickedFiles(dropped.files);
    if (picked.error) {
      notify.error(picked.error);
      return;
    }
    setImportSource(picked.source);
  };

  // ─── Render ───────────────────────────────────────────────────

  return (
    <Box>
      <Box sx={{
        display: 'flex',
        flexDirection: { xs: 'column', sm: 'row' },
        justifyContent: 'space-between',
        alignItems: { xs: 'stretch', sm: 'center' },
        gap: 1,
        mb: 2,
      }}>
        <Box>
          <Typography variant="h4">Manpower Record</Typography>
          <Typography variant="body2" color="text.secondary">
            Daily work activity tracking and worker management
          </Typography>
        </Box>
      </Box>

      {!canSubmit && !canApprove && <ReadOnlyBanner message={t('manpowerAccess.readOnlyBanner')} />}

      <Tabs value={tab} onChange={handleTabChange} sx={{ mb: 2 }} variant="scrollable" scrollButtons="auto">
        <Tab icon={<Assignment />} iconPosition="start" label="Records" />
        <Tab icon={<Today />} iconPosition="start" label="Daily Manpower Report" />
        <Tab icon={<People />} iconPosition="start" label={`Workers (${workers.length || '...'})`} />
        <Tab icon={<TableChart />} iconPosition="start" label="Workers count" />
        <Tab icon={<AccessTime />} iconPosition="start" label="Work Hours" />
        <Tab icon={<MenuBook />} iconPosition="start" label="Reference" />
        <Tab icon={<Insights />} iconPosition="start" label="Performance" />
        {canApprove && (
          <Tab
            icon={(
              <Badge
                badgeContent={pendingApprovalCount}
                color={pendingClashCount > 0 ? 'warning' : 'success'}
                invisible={pendingApprovalCount === 0}
                max={99}
              >
                <HowToReg />
              </Badge>
            )}
            iconPosition="start"
            label="Approvals"
          />
        )}
      </Tabs>

      <Alert severity="info" sx={{ mb: 2 }}>
        {t('manpowerAccess.pageInfo')}
      </Alert>

      {/* ─── Tab 0: Records View ──────────────────────────────── */}
      {tab === 0 && (
        <Box
          onDragOver={handleRecordsDragOver}
          onDrop={handleRecordsDrop}
          onDragLeave={handleRecordsDragLeave}
        >
          <Paper sx={{ p: 2, mb: 2, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
            <FilterList color="action" />
            <TextField size="small" type="date" label="From" value={filterDate}
              onChange={(e) => { setFilterDate(e.target.value); setPage(1); }}
              InputLabelProps={{ shrink: true }} sx={{ width: 150 }}
              inputProps={{ min: seasonStart || undefined, max: seasonEnd || undefined }} />
            <TextField size="small" type="date" label="To" value={filterDateEnd}
              onChange={(e) => { setFilterDateEnd(e.target.value); setPage(1); }}
              InputLabelProps={{ shrink: true }} sx={{ width: 150 }}
              inputProps={{ min: seasonStart || undefined, max: seasonEnd || undefined }} />
            <Autocomplete size="small" freeSolo sx={{ minWidth: 200 }}
              options={activities.map((a) => a.name)}
              value={filterActivity}
              onInputChange={(_, v) => { setFilterActivity(v); setPage(1); }}
              renderInput={(params) => <TextField {...params} label="Activity" />}
            />
            <TextField size="small" placeholder="Search worker, location..."
              value={filterSearch} onChange={(e) => { setFilterSearch(e.target.value); setPage(1); }}
              InputProps={{ startAdornment: <InputAdornment position="start"><Search /></InputAdornment> }}
              sx={{ minWidth: 180 }} />
            <TextField size="small" select label="Status" value={filterApprovalStatus}
              onChange={(e) => { setFilterApprovalStatus(e.target.value); setPage(1); }}
              sx={{ minWidth: 140 }}>
              <MenuItem value="">All statuses</MenuItem>
              <MenuItem value="pending">Pending</MenuItem>
              <MenuItem value="approved">Approved</MenuItem>
              <MenuItem value="rejected">Rejected</MenuItem>
            </TextField>
            <Chip label={`${groupedRecords.length} rows (${recordsMeta.total} records)`} color="primary" variant="outlined" size="small" />
            <Box sx={{ flexGrow: 1 }} />
            {showRecordActions && (
              <DeleteSelectedButton count={recordSelection.size} onClick={handleBulkDeleteRecords} />
            )}
            <Button size="small" startIcon={<FileDownload />} onClick={exportRecordsExcel}>Export</Button>
            {canImport && (
              <Button size="small" startIcon={<FileUpload />} component="label">
                Zip
                <input type="file" hidden accept=".zip,application/zip,application/x-zip-compressed" onChange={handleImportFile} />
              </Button>
            )}
          </Paper>

          {canImport && (
            <Paper
              component="label"
              variant="outlined"
              sx={{
                display: 'block',
                p: 1.5,
                mb: 2,
                textAlign: 'center',
                cursor: 'pointer',
                borderStyle: 'dashed',
                borderColor: excelDragOver ? 'primary.main' : 'divider',
                bgcolor: excelDragOver ? 'action.hover' : 'transparent',
              }}
            >
              <input type="file" hidden multiple accept=".xlsx,.xls" onChange={handleImportFile} />
              <Typography variant="body2" color="text.secondary">
                Drop Excel files or click
              </Typography>
            </Paper>
          )}

          {loadingRecords ? (
            <TableSkeleton rows={8} columns={7} />
          ) : recordsError ? (
            <Alert severity="error" sx={{ mb: 2 }}>{recordsError}
              <Button size="small" sx={{ ml: 2 }} onClick={() => { setLoadingRecords(true); loadRecords(); }}>Retry</Button>
            </Alert>
          ) : (
            <ManpowerRecordsGrid
              groups={groupedRecords}
              tableHeight={recordsTableHeight}
              readOnly={!showRecordActions}
              showApprovalStatus
              canEditRecord={canEditManpowerRecord}
              canDeleteRecord={canDeleteManpowerRecord}
              canRequestChange={canRequestManpowerChange}
              onEdit={openEdit}
              onDelete={handleDeleteRecord}
              onRequestEdit={(record) => openEdit(record, true)}
              onRequestDelete={(record) => handleDeleteRecord(record.id, record)}
              selectedIds={recordSelection.selectedIds}
              onToggleSelect={recordSelection.toggle}
              onToggleAllSelect={recordSelection.toggleAll}
            />
          )}

          {/* Pagination controls */}
          {!loadingRecords && !recordsError && recordsMeta.total > 0 && (
            <Paper sx={{ p: 1.5, mt: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                Showing {Math.min((page - 1) * rowsPerPage + 1, recordsMeta.total)}–{Math.min(page * rowsPerPage, recordsMeta.total)} of {recordsMeta.total} records
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <Button size="small" disabled={page <= 1} onClick={() => setPage(1)}>First</Button>
                <Button size="small" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
                <Chip label={`Page ${page} / ${Math.ceil(recordsMeta.total / rowsPerPage) || 1}`} size="small" variant="outlined" />
                <Button size="small" disabled={page * rowsPerPage >= recordsMeta.total} onClick={() => setPage((p) => p + 1)}>Next</Button>
                <Button size="small" disabled={page * rowsPerPage >= recordsMeta.total} onClick={() => setPage(Math.ceil(recordsMeta.total / rowsPerPage))}>Last</Button>
              </Box>
            </Paper>
          )}
        </Box>
      )}

      {/* ─── Tab 1: Daily Manpower Report ─────────────────────── */}
      {tab === 1 && (
        <>
          <Alert severity="info" sx={{ mb: 2 }}>
            Daily snapshot of submitted work activities for the selected date.
          </Alert>

          <Paper sx={{ p: 2, mb: 2, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
            <TextField size="small" type="date" label="Date" value={dailyDate}
              onChange={(e) => setDailyDate(e.target.value)}
              InputLabelProps={{ shrink: true }} sx={{ width: 170 }} />
            <Chip label={`${dailyGroupedRecords.length} workers (${dailyRecords.length} records)`} color="primary" variant="outlined" size="small" />
            <Box sx={{ flexGrow: 1 }} />
            <Button size="small" startIcon={<FileDownload />} onClick={exportDailyExcel}>Export</Button>
          </Paper>

          {dailyLoading ? (
            <TableSkeleton rows={8} columns={7} />
          ) : dailyError ? (
            <Alert severity="error" sx={{ mb: 2 }}>{dailyError}
              <Button size="small" sx={{ ml: 2 }} onClick={loadDailyRecords}>Retry</Button>
            </Alert>
          ) : (
            <ManpowerRecordsGrid
              groups={dailyGroupedRecords}
              tableHeight={recordsTableHeight}
              readOnly
              emptyMessage="No manpower records for this date."
            />
          )}
        </>
      )}

      {/* ─── Tab 2: Workers Management ────────────────────────── */}
      {tab === 2 && (
        <>
          <Paper sx={{ p: 2, mb: 2, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
            <TextField size="small" placeholder="Search workers..."
              value={workerSearch} onChange={(e) => setWorkerSearch(e.target.value)}
              InputProps={{ startAdornment: <InputAdornment position="start"><Search /></InputAdornment> }}
              sx={{ minWidth: 250 }} />
            <TextField size="small" select label="Site" value={workerSiteFilter}
              onChange={(e) => setWorkerSiteFilter(e.target.value)}
              InputLabelProps={{ shrink: true }} SelectProps={{ displayEmpty: true }}
              sx={{ minWidth: 180 }}>
              <MenuItem value="">All Sites</MenuItem>
              {allSites.map((s) => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
            </TextField>
            <Chip label={`${workers.length} workers`} variant="outlined" size="small" />
            <Box sx={{ flexGrow: 1 }} />
            {!canManageRoster && (
              <Typography variant="body2" color="text.secondary">{t('manpowerAccess.rosterReadOnly')}</Typography>
            )}
            {canManageRoster && (
            <>
            <Button variant="outlined" startIcon={<FileUpload />} onClick={() => setBulkDialog(true)}>
              Bulk Upload
            </Button>
            <Button variant="contained" startIcon={<Add />} onClick={openWorkerAdd}>Add Worker</Button>
            </>
            )}
          </Paper>

          {loadingWorkers ? (
            <TableSkeleton rows={5} columns={5} />
          ) : (
            <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: workersTableHeight, overflow: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <Table stickyHeader size="small" sx={[excelTableSx, freezeColumnsSx(WORKER_FROZEN_WIDTHS, GUTTER_WIDTH)]}>
                <TableHead>
                  <TableRow>
                    <GutterCell />
                    <TableCell className="col-frozen-0">Employee ID</TableCell>
                    <TableCell className="col-frozen-1">Name</TableCell>
                    <TableCell>Site</TableCell>
                    <TableCell>Category</TableCell>
                    <TableCell>Team Leader</TableCell>
                    <TableCell>PIN</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {workers.map((w, idx) => (
                    <TableRow key={w.id} hover sx={{ opacity: w.is_active ? 1 : 0.5 }}>
                      <GutterCell index={idx + 1} />
                      <TableCell className="col-frozen-0" sx={{ fontWeight: 600 }} title={w.employee_id}>{w.employee_id}</TableCell>
                      <TableCell className="col-frozen-1" title={w.name}>{w.name}</TableCell>
                      <TableCell>
                        <Chip label={getSiteName(w.site_id)} size="small" variant="outlined" />
                      </TableCell>
                      <TableCell>
                        <Chip label={w.category} size="small" variant="outlined"
                          color={w.category === 'Permanent' ? 'primary' : 'default'} />
                      </TableCell>
                      <TableCell>
                        {canManageRoster && canToggleWorkerTeamLeader(w) ? (
                          <Tooltip title={w.is_team_leader ? 'Remove team leader' : 'Set as team leader'}>
                            <IconButton size="small" onClick={() => handleToggleTeamLeader(w)}>
                              {w.is_team_leader ? <Star color="warning" /> : <StarBorder />}
                            </IconButton>
                          </Tooltip>
                        ) : (
                          <Tooltip title={
                            !canManageRoster ? ''
                            : w.linked_user_role === 'scouter'
                              ? (w.is_team_leader ? 'Scouter + team leader — managed via Field Staff' : 'Scouter — managed via Field Staff')
                              : 'Operator — managed via Field Staff'
                          } describeChild>
                            <span>{w.is_team_leader ? <Star color="warning" /> : '—'}</span>
                          </Tooltip>
                        )}
                      </TableCell>
                      <TableCell>
                        {w.has_pin ? (
                          <Chip label="Set" size="small" color="success" variant="outlined" />
                        ) : (
                          <Chip label="Not set" size="small" color="error" variant="outlined" />
                        )}
                      </TableCell>
                      <TableCell>
                        <Chip label={w.is_active ? 'Active' : 'Inactive'} size="small"
                          color={w.is_active ? 'success' : 'default'} />
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', gap: 0.5 }}>
                          {canManageRoster ? (
                          <>
                          <Tooltip title="Edit"><IconButton size="small" onClick={() => openWorkerEdit(w)}><Edit fontSize="small" /></IconButton></Tooltip>
                          <Tooltip title="Set PIN"><IconButton size="small" onClick={() => setPinDialog({ open: true, workerId: w.id, workerName: w.name })}><Lock fontSize="small" /></IconButton></Tooltip>
                          </>
                          ) : '—'}
                          {canManageRoster && w.is_active && (
                            <Tooltip title="Deactivate"><IconButton size="small" color="error" onClick={() => handleDeactivateWorker(w.id)}><Delete fontSize="small" /></IconButton></Tooltip>
                          )}
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          {canEditReference && activities.length > 0 && (
            <Paper sx={{ p: 2, mt: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
                Workers count column mapping
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Map catalog activities to Workers count grid columns. Unmapped activities appear in Other.
                Remapping can shift workers between crop rows and General when a general activity is selected.
              </Typography>
              <TableContainer sx={{ maxHeight: 360, overflow: 'auto' }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700 }}>Activity</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Default unit</TableCell>
                      <TableCell sx={{ fontWeight: 700, minWidth: 220 }}>Workers count column</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {activities.map((act) => (
                      <TableRow key={act.id}>
                        <TableCell>{act.name}</TableCell>
                        <TableCell>{act.default_unit || '—'}</TableCell>
                        <TableCell>
                          <TextField
                            select
                            size="small"
                            fullWidth
                            value={act.pivot_column || ''}
                            onChange={(e) => handleActivityPivotColumnChange(act.id, e.target.value)}
                           SelectProps={{ SelectDisplayProps: { 'aria-label': 'Pivot column' } }}>
                            {PIVOT_COLUMN_OPTIONS.map((opt) => (
                              <MenuItem key={opt.value || '__unmapped__'} value={opt.value}>
                                {opt.label}
                              </MenuItem>
                            ))}
                          </TextField>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          )}
        </>
      )}

      {tab === 3 && (
        <>
          <Paper sx={{ p: 2, mb: 2, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
            <TextField size="small" type="date" label="From" value={pivotStartDate}
              onChange={(e) => setPivotStartDate(e.target.value)}
              InputLabelProps={{ shrink: true }} sx={{ width: 150 }} />
            <TextField size="small" type="date" label="To" value={pivotEndDate}
              onChange={(e) => setPivotEndDate(e.target.value)}
              InputLabelProps={{ shrink: true }} sx={{ width: 150 }} />
            <TextField size="small" type="date" label="Daily report date" value={pivotDailyReportDate}
              onChange={(e) => setPivotDailyReportDate(e.target.value)}
              InputLabelProps={{ shrink: true }} sx={{ width: 160 }} />
            <ToggleButtonGroup
              size="small"
              exclusive
              value={pivotGroupBy}
              onChange={(_, val) => { if (val) setPivotGroupBy(val); }}
            >
              <ToggleButton value="crop">Crop</ToggleButton>
              <ToggleButton value="variety">Variety</ToggleButton>
            </ToggleButtonGroup>
            <FormControlLabel
              control={(
                <Checkbox
                  size="small"
                  checked={workersCountApprovedOnly}
                  onChange={(e) => setWorkersCountApprovedOnly(e.target.checked)}
                />
              )}
              label="Approved only"
            />
            <Button variant="outlined" onClick={loadPivotSummary} disabled={pivotLoading || !activeSiteId}>
              Refresh
            </Button>
            <Box sx={{ flexGrow: 1 }} />
            <Button variant="contained" startIcon={<FileDownload />} onClick={exportPivotExcel}
              disabled={pivotLoading || !pivotData?.dates?.length || !workersCountRowOrder.length}>
              Export workers count (Excel)
            </Button>
          </Paper>

          <Alert severity="info" sx={{ mb: 2 }}>
            Reports use the site selected in the top-left selector. The activity grid and
            <strong> Till date</strong> both sum <strong>From</strong> through <strong>To</strong>.
            <strong> Daily report date</strong> only affects the daily summary block — it defaults
            to today and can be any day, including one with no records.
            Use <strong>Crop</strong> or <strong>Variety</strong> to group the activity grid, daily report, and till date report.
            Budget/Difference are placeholders for now.
          </Alert>

          {!activeSiteId && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              Select a site using the dropdown at the top left of the app.
            </Alert>
          )}

          {pivotError && <Alert severity="error" sx={{ mb: 2 }}>{pivotError}</Alert>}

          {pivotLoading ? (
            <TableSkeleton rows={4} columns={4} />
          ) : activeSiteId && !pivotLoading && pivotData && !pivotData?.dates?.length ? (
            <Paper sx={{ p: 2 }}>
              <Typography color="text.secondary">No manpower records in this date range.</Typography>
            </Paper>
          ) : activeSiteId && !pivotLoading && pivotData && !workersCountRowOrder.length ? (
            <Alert severity="info">No crop or variety rows to display for this site and date range.</Alert>
          ) : activeSiteId && pivotData?.dates?.length && workersCountRowOrder.length ? (
            <>
              <WorkersCountPivotTable
                pivotData={pivotData}
                tillStartDate={pivotStartDate}
                tillEndDate={pivotEndDate}
                groupBy={pivotGroupBy}
                rowOrder={workersCountRowOrder}
                maxHeight={workersCountGridHeight}
              />
              <WorkersCountCropSummaryPair
                pivotData={pivotData}
                dailyReportDate={pivotDailyReportDate}
                tillStartDate={pivotStartDate}
                tillEndDate={pivotEndDate}
                groupBy={pivotGroupBy}
                rowOrder={workersCountRowOrder}
                maxHeight={workersCountSummaryHeight}
              />
            </>
          ) : null}
        </>
      )}

      {tab === 4 && (
        <>
          <Paper sx={{ p: 2, mb: 2, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
            <TextField size="small" type="date" label="From" value={hoursStartDate}
              onChange={(e) => setHoursStartDate(e.target.value)}
              InputLabelProps={{ shrink: true }} sx={{ width: 150 }} />
            <TextField size="small" type="date" label="To" value={hoursEndDate}
              onChange={(e) => setHoursEndDate(e.target.value)}
              InputLabelProps={{ shrink: true }} sx={{ width: 150 }} />
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel id="manpowerrecord-crop-label-1">Crop</InputLabel>
              <Select labelId="manpowerrecord-crop-label-1"
                label="Crop"
                value={hoursCropFilter}
                onChange={(e) => setHoursCropFilter(e.target.value)}
              >
                <MenuItem value="__all__">All crops</MenuItem>
                {(hoursData?.siteCrops || getSiteCropNamesFromMasterData(masterData, activeSiteId)).map((c) => (
                  <MenuItem key={c} value={c}>{c}</MenuItem>
                ))}
              </Select>
            </FormControl>
            {hoursCropFilter === '__all__' && (
              <ToggleButtonGroup
                size="small"
                exclusive
                value={hoursGroupBy}
                onChange={(_, val) => { if (val) setHoursGroupBy(val); }}
              >
                <ToggleButton value="crop">Crop</ToggleButton>
                <ToggleButton value="variety">Variety</ToggleButton>
              </ToggleButtonGroup>
            )}
            <Autocomplete
              multiple
              size="small"
              sx={{ minWidth: 220, flex: 1 }}
              options={resolvePivotActivityColumns(hoursData).map((a) => a.key)}
              getOptionLabel={(key) => resolvePivotActivityColumns(hoursData).find((a) => a.key === key)?.label || key}
              value={hoursActivityFilter}
              onChange={(_, val) => setHoursActivityFilter(val)}
              renderInput={(params) => <TextField {...params} label="Activities (all if empty)" />}
            />
            <Button variant="outlined" onClick={loadHoursSummary} disabled={hoursLoading || !activeSiteId}>
              Refresh
            </Button>
            <Button variant="contained" startIcon={<FileDownload />} onClick={exportWorkHoursExcel}
              disabled={hoursLoading || !hoursData?.dates?.length || !workHoursRowOrder.length}>
              Export Work Hours (Excel)
            </Button>
          </Paper>

          <Alert severity="info" sx={{ mb: 2 }}>
            <strong>Approved records only.</strong> Workers count tab includes pending records.
            Hours are additive across crops — use this tab for season budgeting.
            General activities (Supervisor, IPM, Irrigation, etc.) always appear on the <strong>General</strong> row, not per crop.
          </Alert>

          {hoursData?.missingHoursCount > 0 && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              {hoursData.missingHoursCount} record(s) in this range have no start/end time — hours may be incomplete.
            </Alert>
          )}

          {!activeSiteId && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              Select a site using the dropdown at the top left of the app.
            </Alert>
          )}

          {hoursError && <Alert severity="error" sx={{ mb: 2 }}>{hoursError}</Alert>}

          {hoursLoading ? (
            <TableSkeleton rows={4} columns={4} />
          ) : activeSiteId && !hoursLoading && hoursData && !hoursData?.dates?.length ? (
            <Paper sx={{ p: 2 }}>
              <Typography color="text.secondary">No approved manpower records in this date range.</Typography>
            </Paper>
          ) : activeSiteId && !hoursLoading && hoursData && !workHoursRowOrder.length ? (
            <Alert severity="info">No crop or variety rows to display for this site and date range.</Alert>
          ) : activeSiteId && hoursData?.dates?.length && workHoursRowOrder.length ? (
            <>
              {hoursCropFilter !== '__all__' && resolvePivotActivities(hoursData).filter((a) => hoursActivityKeys.includes(a.key)).slice(0, 3).map((act) => {
                const prod = productivityForRowActivity(hoursData, hoursCropFilter, act.key, 'crop');
                if (!prod.hours) return null;
                return (
                  <Alert key={act.key} severity={prod.mixedUnits ? 'warning' : 'info'} sx={{ mb: 1 }}>
                    {hoursCropFilter} / {act.label}: {prod.hours}h
                    {prod.mixedUnits
                      ? ' — mixed output units; productivity not shown'
                      : prod.actual > 0
                        ? ` — ${prod.actual} ${prod.unit} (${prod.hoursPerUnit} h/${prod.unit}, ${prod.coveragePct}% of records with output)`
                        : ' — no output recorded'}
                  </Alert>
                );
              })}
              <WorkHoursPivotTable
                pivotData={hoursData}
                groupBy={hoursGroupByEffective}
                rowOrder={workHoursRowOrder}
                activityKeys={hoursActivityKeys}
                maxHeight={workersCountGridHeight}
                onCellClick={({ rowKey, activity, activityLabel }) => {
                  let crop = hoursCropFilter !== '__all__' ? hoursCropFilter : rowKey;
                  let variety = '';
                  if (hoursGroupByEffective === 'variety') {
                    variety = rowKey;
                    if (hoursCropFilter === '__all__') {
                      const match = (hoursData.cells || []).find(
                        (c) => (c.variety || c.crop) === rowKey && c.activity === activity,
                      );
                      crop = match?.crop || rowKey;
                    }
                  } else if (rowKey === 'General') {
                    crop = 'General';
                  }
                  setHoursDetail({
                    open: true,
                    crop,
                    variety,
                    activity,
                    activityLabel,
                  });
                }}
              />
              <WorkHoursDetailDialog
                open={hoursDetail.open}
                onClose={() => setHoursDetail((d) => ({ ...d, open: false }))}
                startDate={hoursStartDate}
                endDate={hoursEndDate}
                siteId={activeSiteId}
                crop={hoursDetail.crop}
                variety={hoursDetail.variety}
                activity={hoursDetail.activity}
                activityLabel={hoursDetail.activityLabel}
                groupBy={hoursGroupByEffective}
              />
            </>
          ) : null}
        </>
      )}

      {tab === 5 && (
        <ManpowerActivityReferenceTable
          siteId={activeSiteId}
          canEdit={canEditReference}
          extraActivities={activities}
          crops={getSiteCropNamesFromMasterData(masterData, activeSiteId)}
          findCropIdByName={findCropIdByName}
          tableHeight={recordsTableHeight}
        />
      )}

      {tab === 6 && (
        <ManpowerPerformancePanel
          siteId={activeSiteId}
          tableHeight={recordsTableHeight}
        />
      )}

      {tab === 7 && canApprove && (
        <ManpowerApprovalsPanel
          siteId={activeSiteId || ''}
          tableHeight={recordsTableHeight}
          onEditRecord={openEdit}
          onChanged={loadPendingApprovalCount}
        />
      )}

      {/* ─── Edit Record Dialog ───────────────────────────────── */}
      <Dialog open={editDialog.open} onClose={() => { setEditDialog({ open: false, record: null, asChangeRequest: false }); setEditShowMandatoryErrors(false); }} maxWidth="sm" fullWidth>
        <DialogTitle>{editDialog.asChangeRequest ? 'Request edit' : 'Edit Record'}</DialogTitle>
        <DialogContent dividers>
          {editDialog.asChangeRequest && (
            <Alert severity="info" sx={{ mb: 2 }}>
              Your changes will be sent to an operation manager for review.
            </Alert>
          )}
          {(() => {
            const mErr = editShowMandatoryErrors ? getBlockMandatoryErrors(editForm, { force: true }) : {};
            return (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField size="small" label="Activity (optional)" value={editForm.activity || ''} fullWidth
                onChange={(e) => setEditForm({ ...editForm, activity: e.target.value })} />
              <TextField size="small" label={editForm.activity?.trim() ? 'Unit *' : 'Unit'} value={editForm.unit || ''} sx={{ width: 100 }}
                onChange={(e) => setEditForm({ ...editForm, unit: e.target.value })}
                error={Boolean(mErr.unit)}
                helperText={mErr.unit || ' '} />
            </Box>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField size="small" label="Variety *" value={editForm.variety || ''} fullWidth
                onChange={(e) => setEditForm({ ...editForm, variety: e.target.value })}
                error={Boolean(mErr.variety)}
                helperText={mErr.variety || ' '} />
              <TextField size="small" label="Location *" value={editForm.location || ''} fullWidth
                onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                error={Boolean(mErr.location)}
                helperText={mErr.location || ' '} />
              <TextField size="small" label="Section *" value={editForm.section || ''} sx={{ width: 120 }}
                onChange={(e) => setEditForm({ ...editForm, section: e.target.value })}
                error={Boolean(mErr.section)}
                helperText={mErr.section || ' '} />
            </Box>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField size="small" type="time" label="Start *" value={editForm.startTime || ''}
                onChange={(e) => setEditForm({ ...editForm, startTime: e.target.value })}
                InputLabelProps={{ shrink: true }} fullWidth
                error={Boolean(mErr.startTime)}
                helperText={mErr.startTime || ' '} />
              <TextField size="small" type="time" label="End *" value={editForm.endTime || ''}
                onChange={(e) => setEditForm({ ...editForm, endTime: e.target.value })}
                InputLabelProps={{ shrink: true }} fullWidth
                error={Boolean(mErr.endTime)}
                helperText={mErr.endTime || ' '} />
            </Box>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField size="small" type="number" label="Target" value={editForm.target || ''} fullWidth
                onChange={(e) => setEditForm({ ...editForm, target: e.target.value })} />
              <TextField size="small" type="number" label="Actual" value={editForm.actual || ''} fullWidth
                onChange={(e) => setEditForm({ ...editForm, actual: e.target.value })} />
            </Box>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField size="small" type="number" label="Work Hours" value={editForm.workHours || ''} fullWidth
                onChange={(e) => setEditForm({ ...editForm, workHours: e.target.value })} />
              <TextField size="small" type="number" label="OT" value={editForm.overtime || ''} fullWidth
                onChange={(e) => setEditForm({ ...editForm, overtime: e.target.value })} />
              <TextField size="small" type="number" label="Total" value={editForm.totalHours || ''} fullWidth
                onChange={(e) => setEditForm({ ...editForm, totalHours: e.target.value })} />
            </Box>
          </Box>
            );
          })()}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setEditDialog({ open: false, record: null, asChangeRequest: false }); setEditShowMandatoryErrors(false); }}>Cancel</Button>
          <Button variant="contained" onClick={handleEditSave} disabled={saving}>
            {saving ? <CircularProgress size={20} /> : (editDialog.asChangeRequest ? 'Continue' : 'Save')}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={changeRequestDialog.open}
        onClose={() => {
          if (changeRequestSubmitting) return;
          setChangeRequestDialog({ open: false, action: 'update', entityId: null, payload: null });
          setChangeRequestReason('');
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          Request {changeRequestDialog.action === 'delete' ? 'deletion' : 'edit'}
        </DialogTitle>
        <DialogContent dividers>
          <Alert severity="info" sx={{ mb: 2 }}>
            Your request will be sent to an operation manager for review before the change is applied.
          </Alert>
          <TextField
            fullWidth
            multiline
            minRows={3}
            label="Reason for change"
            value={changeRequestReason}
            onChange={(e) => setChangeRequestReason(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setChangeRequestDialog({ open: false, action: 'update', entityId: null, payload: null });
              setChangeRequestReason('');
            }}
            disabled={changeRequestSubmitting}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={submitManpowerChangeRequest}
            disabled={!changeRequestReason.trim() || changeRequestSubmitting}
          >
            {changeRequestSubmitting ? <CircularProgress size={20} /> : 'Submit request'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ─── Worker Add/Edit Dialog ───────────────────────────── */}
      <Dialog open={workerDialog.open} onClose={() => setWorkerDialog({ open: false, mode: 'add', worker: null })} maxWidth="xs" fullWidth>
        <DialogTitle>{workerDialog.mode === 'add' ? 'Add Worker' : 'Edit Worker'}</DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField size="small" label="Employee ID *" value={workerForm.employeeId}
              onChange={(e) => setWorkerForm({ ...workerForm, employeeId: e.target.value })}
              disabled={workerDialog.mode === 'edit'} />
            <TextField size="small" label="Full Name *" value={workerForm.name}
              onChange={(e) => setWorkerForm({ ...workerForm, name: e.target.value })} />
            <FormControl size="small">
              <InputLabel id="manpowerrecord-category-label-2">Category</InputLabel>
              <Select labelId="manpowerrecord-category-label-2" value={workerForm.category} label="Category"
                onChange={(e) => setWorkerForm({ ...workerForm, category: e.target.value })}>
                <MenuItem value="Permanent">Permanent</MenuItem>
                <MenuItem value="Casual">Casual</MenuItem>
              </Select>
            </FormControl>
            <TextField size="small" select label="Site" value={workerForm.siteId}
              onChange={(e) => setWorkerForm({ ...workerForm, siteId: e.target.value })}
              InputLabelProps={{ shrink: true }} SelectProps={{ displayEmpty: true }}>
              <MenuItem value=""><em>No site</em></MenuItem>
              {allSites.map((s) => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
            </TextField>
            {canEditTeamLeaderFlag && (
              <FormControlLabel
                control={<Switch checked={workerForm.isTeamLeader}
                  onChange={(e) => setWorkerForm({ ...workerForm, isTeamLeader: e.target.checked })} />}
                label="Team Leader (harvest/maintenance)" />
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setWorkerDialog({ open: false, mode: 'add', worker: null })}>Cancel</Button>
          <Button variant="contained" onClick={handleWorkerSave} disabled={saving || !workerForm.name || !workerForm.employeeId}>
            {saving ? <CircularProgress size={20} /> : workerDialog.mode === 'add' ? 'Add' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ─── PIN Dialog ───────────────────────────────────────── */}
      <Dialog open={pinDialog.open} onClose={() => { setPinDialog({ open: false, workerId: null, workerName: '' }); setPinValue(''); }} maxWidth="xs" fullWidth>
        <DialogTitle>Set PIN for {pinDialog.workerName}</DialogTitle>
        <DialogContent>
          <TextField fullWidth type="password" label="New PIN (min 4 characters)" value={pinValue}
            onChange={(e) => setPinValue(e.target.value)}
            sx={{ mt: 2 }} inputProps={{ maxLength: 8, minLength: 4 }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setPinDialog({ open: false, workerId: null, workerName: '' }); setPinValue(''); }}>Cancel</Button>
          <Button variant="contained" onClick={handleSetPin} disabled={saving || pinValue.length < 4}>
            {saving ? <CircularProgress size={20} /> : 'Set PIN'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ─── Bulk Upload Dialog ────────────────────────────────── */}
      <Dialog open={bulkDialog} onClose={() => { setBulkDialog(false); setBulkFile(null); setBulkPreview([]); }} maxWidth="sm" fullWidth>
        <DialogTitle>Bulk Upload Workers from Excel</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Upload an Excel file with columns: <strong>Employee ID</strong>, <strong>Name</strong>, <strong>Category</strong> (Permanent/Casual).
            {workerSiteFilter && <> Workers will be assigned to <strong>{getSiteName(workerSiteFilter)}</strong>.</>}
          </Typography>
          <Button variant="outlined" component="label" startIcon={<FileUpload />}>
            {bulkFile ? bulkFile.name : 'Choose Excel File'}
            <input type="file" hidden accept=".xlsx,.xls,.csv" onChange={handleBulkFileSelect} />
          </Button>
          {bulkPreview.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                Preview: {bulkPreview.length} workers found
              </Typography>
              <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 300 }}>
                <Table size="small" stickyHeader sx={excelTableSx}>
                  <TableHead>
                    <TableRow>
                      <GutterCell />
                      <TableCell>Employee ID</TableCell>
                      <TableCell>Name</TableCell>
                      <TableCell>Category</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {bulkPreview.slice(0, 50).map((w, i) => (
                      <TableRow key={i} hover>
                        <GutterCell index={i + 1} />
                        <TableCell>{w.employeeId}</TableCell>
                        <TableCell>{w.name}</TableCell>
                        <TableCell>{w.category}</TableCell>
                      </TableRow>
                    ))}
                    {bulkPreview.length > 50 && (
                      <TableRow>
                        <TableCell colSpan={4} align="center">
                          <Typography variant="body2" color="text.secondary">
                            ... and {bulkPreview.length - 50} more
                          </Typography>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setBulkDialog(false); setBulkFile(null); setBulkPreview([]); }}>Cancel</Button>
          <Button variant="contained" onClick={handleBulkUpload} disabled={bulkUploading || bulkPreview.length === 0}>
            {bulkUploading ? <CircularProgress size={20} /> : `Upload ${bulkPreview.length} Workers`}
          </Button>
        </DialogActions>
      </Dialog>

      <ManpowerDailyImportDialog
        source={importSource}
        open={Boolean(importSource?.files?.length)}
        onClose={() => setImportSource(null)}
        activeSiteId={activeSiteId}
        onImported={() => {
          loadRecords();
          loadWorkers();
        }}
      />
    </Box>
  );
}
