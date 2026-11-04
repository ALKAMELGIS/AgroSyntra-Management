import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box,
  Tabs,
  Tab,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
  Paper,
  Button,
  MenuItem,
  Typography,
  IconButton,
  Select,
  Grid,
  CircularProgress,
} from '@mui/material';
import { AddOutlined as Add, DeleteOutlined as Delete, CheckOutlined as Check, FileUploadOutlined as FileUpload } from '@mui/icons-material';
import { useActiveSite } from '../contexts/ActiveSiteContext';
import { useMasterData } from '../utils/useMasterData';
import HarvestImporter from '../components/HarvestImporter';
import {
  listHarvests,
  listHarvestsAll,
  deleteHarvest,
  fetchVarieties,
  fetchCropHistoryBySite,
  fetchPlantingRecordsBySite,
  getHarvestReportSummary,
  getHarvestDailyWorksheet,
  getHarvestWeeklySummary,
} from '../utils/backendApi';
import usePhiHarvestSave from '../components/harvest/usePhiHarvestSave';
import HarvestEntryToolbar from '../components/harvest/HarvestEntryToolbar';
import useOpsExcelExport from '../hooks/useOpsExcelExport';
import { OPS_EXPORT } from '../utils/companyExcelExport';
import { buildHarvestExcelSheets } from '../utils/harvestExcelExport';
import {
  defaultHarvestDateRange,
  farmTodayYmd,
  filterHarvestEntries,
  harvestDateRangeError,
  uniqueHarvestVarieties,
} from '../utils/harvestEntryFilters';
import { harvestClockTimesError } from '../utils/harvestClockTimes';
import {
  defaultPlantedCropId,
  defaultPlantedVariety,
  plantedCropsAndVarietiesForField,
  varietiesForPlantedCrop,
} from '../utils/harvestFieldPlanting';
import { useNotification } from '../contexts/NotificationContext';
import useAppLayout from '../hooks/useAppLayout';
import useReadOnlyMode from '../hooks/useReadOnlyMode';
import ReadOnlyBanner from '../components/ReadOnlyBanner';
import { PAGE_KEYS } from '../utils/roleAccess';
import { excelTableSx, freezeColumnsSx } from '../components/table/ExcelTable';
import { DeleteSelectedButton, RowSelectCell, SelectAllCheckbox, deleteIdsSequentially } from '../components/table/BulkSelect';
import { useRowSelection } from '../hooks/useRowSelection';

const GRID_BORDER = '1px solid var(--sheet-border, #BDBDBD)';
const HEADER_FILL = '#165c3a';
// Unified with the app font (theme FONT_SANS via CSS variable).
const FONT = 'var(--font-sans, Inter, "IBM Plex Sans Arabic", system-ui, sans-serif)';
const HARVEST_DATE_WIDTH = 110;

// Two-row header on Field / Open Field: names on row 1, the qty total on row 2.
// excelTableSx parks every head cell at top: 0, which would stack them, so row 2
// sits under the green band. Draft (Add Row) stays yellow under hover the same
// way Bumble Bee drafts do.
const harvestEntrySx = (theme) => ({
  '&& thead tr:first-of-type .MuiTableCell-head': { top: 0 },
  '&& thead tr:nth-of-type(2) .MuiTableCell-head': {
    top: 40,
    zIndex: 3,
    backgroundColor: `${theme.palette.table.totalBg} !important`,
    color: `${theme.palette.table.totalText} !important`,
    fontWeight: 700,
    boxShadow: 'inset -1px 0 0 rgba(0,0,0,0.06)',
  },
  '&&& .MuiTableBody-root .MuiTableRow-root.row-draft .MuiTableCell-root': {
    backgroundColor: 'var(--sheet-tint-green, #F1F8E9)',
  },
});

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const day = d.getDate();
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${day}-${months[d.getMonth()]}-${String(d.getFullYear()).slice(-2)}`;
}

function formatTime(timeStr) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  return `${hour % 12 || 12}:${m} ${ampm}`;
}

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
  '&:hover .MuiOutlinedInput-notchedOutline': { border: 'none' },
  '&.Mui-focused .MuiOutlinedInput-notchedOutline': { border: 'none' },
};

function useScrollDraftIntoView(hasDraft) {
  const draftRef = useRef(null);
  useEffect(() => {
    if (!hasDraft) return;
    draftRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [hasDraft]);
  return draftRef;
}

function CompanyHeader({ fieldName }) {
  return (
    <Box sx={{ border: GRID_BORDER, mb: 0 }}>
      <Box sx={{ display: 'flex', borderBottom: GRID_BORDER }}>
        <Box sx={{ flex: 1, borderRight: GRID_BORDER, p: '4px 8px', textAlign: 'center' }}>
          <Typography sx={{ fontFamily: FONT, fontWeight: 700, fontSize: '13px', letterSpacing: 0.5 }}>
            ELITE AGRO UAE LLC
          </Typography>
          <Typography sx={{ fontFamily: FONT, fontWeight: 700, fontSize: '11px', color: HEADER_FILL }}>
            HARVEST RECORD
          </Typography>
        </Box>
        <Box sx={{ width: 160, p: '4px 8px', textAlign: 'right', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <Typography sx={{ fontFamily: FONT, fontSize: '9px', color: 'var(--sheet-ink-2, #555)' }}>EAG/AFO/IMS/RC-111</Typography>
          <Typography sx={{ fontFamily: FONT, fontSize: '9px', color: 'var(--sheet-ink-2, #555)' }}>Issue 03, Rev00</Typography>
        </Box>
      </Box>
      <Box sx={{ p: '3px 8px' }}>
        <Typography sx={{ fontFamily: FONT, fontWeight: 700, fontSize: '11px' }}>
          EAG Farm Name: Al Maha {fieldName}
        </Typography>
      </Box>
    </Box>
  );
}

function FieldTab({
  field, siteId, crops, cropHistory = [], plantingRecords = [], onRefresh, readOnly = false,
  dateFrom, dateTo, cropFilter, varietyFilter, farmAreaId, filterFieldId,
}) {
  const notify = useNotification();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newRow, setNewRow] = useState(null);
  const draftRef = useScrollDraftIntoView(Boolean(newRow));
  const selection = useRowSelection();

  const planted = useMemo(
    () => plantedCropsAndVarietiesForField(field, cropHistory, plantingRecords),
    [field, cropHistory, plantingRecords],
  );
  const cropOptions = planted.crops;
  const varietyOptions = varietiesForPlantedCrop(planted, newRow?.cropId);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const params = { field_id: field.id, site_id: siteId, limit: 200 };
      if (dateFrom) params.start_date = dateFrom;
      if (dateTo) params.end_date = dateTo;
      const { data } = await listHarvests(params);
      setRecords(data || []);
    } catch { setRecords([]); }
    setLoading(false);
  }, [field.id, siteId, dateFrom, dateTo]);

  const { save: saveHarvest, dialog: phiDialog } = usePhiHarvestSave({
    notify,
    onSaved: () => {
      setNewRow(null);
      loadRecords();
      if (onRefresh) onRefresh();
    },
  });

  useEffect(() => { loadRecords(); }, [loadRecords]);

  useEffect(() => {
    setNewRow((prev) => {
      if (!prev) return prev;
      const nextCrop = prev.cropId || defaultPlantedCropId(planted, field.currentCropId);
      const nextVariety = prev.variety || defaultPlantedVariety(planted);
      if (nextCrop === prev.cropId && nextVariety === prev.variety) return prev;
      return { ...prev, cropId: nextCrop, variety: nextVariety };
    });
  }, [planted, field.currentCropId]);

  const handleAddRow = () => {
    const cropId = defaultPlantedCropId(planted, field.currentCropId);
    setNewRow({
      date: farmTodayYmd(),
      startTime: '',
      endTime: '',
      shiftNumber: '',
      weekNumber: '',
      batchNumber: '',
      cropId,
      variety: defaultPlantedVariety(planted),
      segmentId: '',
      harvestedAreaHa: '',
      quantity: '',
      packhouse: '',
      authorizedBy: '',
    });
  };

  const handleSaveRow = async () => {
    if (readOnly) return;
    if (!newRow.quantity || !newRow.variety) {
      notify.error('Variety and quantity are required');
      return;
    }
    const clockErr = harvestClockTimesError(newRow.startTime, newRow.endTime);
    if (clockErr) {
      notify.error(clockErr);
      return;
    }
    await saveHarvest({
      fieldId: field.id,
      date: newRow.date,
      startTime: newRow.startTime || undefined,
      endTime: newRow.endTime || undefined,
      shiftNumber: newRow.shiftNumber || undefined,
      weekNumber: newRow.weekNumber || undefined,
      batchNumber: newRow.batchNumber || undefined,
      segmentId: newRow.segmentId || undefined,
      harvestedAreaHa: newRow.harvestedAreaHa ? parseFloat(newRow.harvestedAreaHa) : undefined,
      packhouse: newRow.packhouse || undefined,
      authorizedBy: newRow.authorizedBy || undefined,
      cropId: newRow.cropId || undefined,
      totalQuantity: parseFloat(newRow.quantity),
      varieties: [{ variety: newRow.variety, quantity: parseFloat(newRow.quantity), grade: 'A' }],
    });
  };

  const handleDeleteRow = async (id) => {
    if (readOnly) return;
    try {
      await deleteHarvest(id);
      loadRecords();
      if (onRefresh) onRefresh();
    } catch (err) {
      notify.error(err.message || 'Failed to delete');
    }
  };

  const handleBulkDelete = async () => {
    if (readOnly) return;
    const ids = [...selection.selectedIds];
    if (!ids.length) return;
    if (!window.confirm(`Delete ${ids.length} harvest ${ids.length === 1 ? 'record' : 'records'}?`)) return;
    const deleted = await deleteIdsSequentially(ids, deleteHarvest);
    selection.clear();
    loadRecords();
    if (onRefresh) onRefresh();
    notify.success(`Deleted ${deleted} ${deleted === 1 ? 'record' : 'records'}.`);
  };

  const visibleRecords = useMemo(() => {
    if (filterFieldId && filterFieldId !== field.id) return [];
    if (farmAreaId && field.farmAreaId && field.farmAreaId !== farmAreaId) return [];
    return filterHarvestEntries(records, { cropName: cropFilter, variety: varietyFilter });
  }, [records, cropFilter, varietyFilter, farmAreaId, filterFieldId, field.id, field.farmAreaId]);
  const totalQty = visibleRecords.reduce((s, r) => s + (r.totalQuantity || 0), 0);
  const cropName = crops.find(c => c.id === field.currentCropId)?.name || field.currentCrop || '';

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', px: 1, py: 0.5 }}>
        <DeleteSelectedButton count={selection.size} onClick={handleBulkDelete} disabled={readOnly} />
      </Box>
      <CompanyHeader fieldName={field.name} />
      <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 480, borderRadius: 0, borderTop: 'none' }}>
        <Table size="small" sx={[excelTableSx, freezeColumnsSx([42, HARVEST_DATE_WIDTH]), harvestEntrySx]}>
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox" rowSpan={2} className="col-frozen-0">
                <SelectAllCheckbox
                  ids={visibleRecords.map((r) => r.id)}
                  selectedIds={selection.selectedIds}
                  onToggleAll={selection.toggleAll}
                  label="Select all harvest rows"
                />
              </TableCell>
              <TableCell className="col-frozen-1">Date</TableCell>
              <TableCell>Start Time *</TableCell>
              <TableCell>End Time *</TableCell>
              <TableCell>Shift No</TableCell>
              <TableCell>Week Number</TableCell>
              <TableCell>Batch No</TableCell>
              <TableCell>Product</TableCell>
              <TableCell>Variety</TableCell>
              <TableCell>Segment</TableCell>
              <TableCell className="col-numeric">Area (Ha)</TableCell>
              <TableCell className="col-numeric">Qty (Kg)</TableCell>
              <TableCell>Packhouse</TableCell>
              <TableCell>Auth. By</TableCell>
              <TableCell />
            </TableRow>
            <TableRow>
              <TableCell colSpan={10} />
              <TableCell className="col-numeric">{totalQty.toFixed(1)}</TableCell>
              <TableCell colSpan={3} align="center">TOTAL</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={15} align="center" sx={{ py: 2 }}><CircularProgress size={18} /></TableCell></TableRow>
            ) : (
              <>
                {visibleRecords.map((r) => (
                  <TableRow key={r.id} hover selected={selection.selectedIds.has(r.id)}>
                    <RowSelectCell
                      id={r.id}
                      selectedIds={selection.selectedIds}
                      onToggle={selection.toggle}
                      label={`Select harvest ${formatDate(r.date) || r.id}`}
                      className="col-frozen-0"
                    />
                    <TableCell className="col-frozen-1">{formatDate(r.date)}</TableCell>
                    <TableCell>{r.startTime ? formatTime(r.startTime) : ''}</TableCell>
                    <TableCell>{r.endTime ? formatTime(r.endTime) : ''}</TableCell>
                    <TableCell align="center">{r.shiftNumber || ''}</TableCell>
                    <TableCell align="center">{r.weekNumber || ''}</TableCell>
                    <TableCell>{r.batchNumber || ''}</TableCell>
                    <TableCell>{r.cropName || cropName}</TableCell>
                    <TableCell>{r.varieties?.[0]?.variety || r.varietyName || ''}</TableCell>
                    <TableCell align="center">{r.segmentId || ''}</TableCell>
                    <TableCell className="col-numeric">{r.harvestedAreaHa || ''}</TableCell>
                    <TableCell className="col-numeric" sx={{ fontWeight: 600 }}>{r.totalQuantity?.toFixed(1)}</TableCell>
                    <TableCell>{r.packhouse || ''}</TableCell>
                    <TableCell>{r.authorizedBy || ''}</TableCell>
                    <TableCell align="center" sx={{ px: 0 }}>
                      <IconButton size="small" onClick={() => handleDeleteRow(r.id)} sx={{ p: '2px' }} aria-label="Delete">
                        <Delete sx={{ fontSize: 14, color: 'var(--sheet-danger, #C62828)' }} />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
                {newRow && (
                  <TableRow className="row-draft" ref={draftRef}>
                    <TableCell padding="checkbox" className="col-frozen-0" />
                    <TableCell className="col-frozen-1" sx={{ p: 0 }}>
                      <input type="date" value={newRow.date} onChange={e => setNewRow(p => ({ ...p, date: e.target.value }))} style={inputSx} />
                    </TableCell>
                    <TableCell sx={{ p: 0 }}>
                      <input type="time" value={newRow.startTime} onChange={e => setNewRow(p => ({ ...p, startTime: e.target.value }))} style={inputSx} />
                    </TableCell>
                    <TableCell sx={{ p: 0 }}>
                      <input type="time" value={newRow.endTime} onChange={e => setNewRow(p => ({ ...p, endTime: e.target.value }))} style={inputSx} />
                    </TableCell>
                    <TableCell sx={{ p: 0 }}>
                      <input value={newRow.shiftNumber} onChange={e => setNewRow(p => ({ ...p, shiftNumber: e.target.value }))} style={{ ...inputSx, textAlign: 'center' }} />
                    </TableCell>
                    <TableCell sx={{ p: 0 }}>
                      <input value={newRow.weekNumber} maxLength={20} onChange={e => setNewRow(p => ({ ...p, weekNumber: e.target.value }))} style={{ ...inputSx, textAlign: 'center' }} />
                    </TableCell>
                    <TableCell sx={{ p: 0 }}>
                      <input value={newRow.batchNumber} onChange={e => setNewRow(p => ({ ...p, batchNumber: e.target.value }))} style={inputSx} />
                    </TableCell>
                    <TableCell sx={{ p: 0 }}>
                      {cropOptions.length > 1 ? (
                        <Select size="small" value={newRow.cropId} displayEmpty sx={selectSx}
                          onChange={(e) => {
                            const cropId = e.target.value;
                            setNewRow((p) => ({
                              ...p,
                              cropId,
                              variety: defaultPlantedVariety(planted),
                            }));
                          }}
                        >
                          {cropOptions.map((c) => (
                            <MenuItem key={c.id} value={c.id} sx={{ fontSize: '11px' }}>{c.name}</MenuItem>
                          ))}
                        </Select>
                      ) : (
                        <Box component="span" sx={{ display: 'block', px: '3px', py: '1px', fontFamily: FONT, fontSize: '11px', lineHeight: '22px' }}>
                          {cropOptions[0]?.name || ''}
                        </Box>
                      )}
                    </TableCell>
                    <TableCell sx={{ p: 0 }}>
                      {varietyOptions.length > 1 ? (
                        <Select size="small" value={newRow.variety} displayEmpty sx={selectSx}
                          onChange={(e) => setNewRow((p) => ({ ...p, variety: e.target.value }))}>
                          {varietyOptions.map((name) => (
                            <MenuItem key={name} value={name} sx={{ fontSize: '11px' }}>{name}</MenuItem>
                          ))}
                        </Select>
                      ) : (
                        <Box component="span" sx={{ display: 'block', px: '3px', py: '1px', fontFamily: FONT, fontSize: '11px', lineHeight: '22px' }}>
                          {varietyOptions[0] || newRow.variety || ''}
                        </Box>
                      )}
                    </TableCell>
                    <TableCell sx={{ p: 0 }}>
                      <input value={newRow.segmentId} onChange={e => setNewRow(p => ({ ...p, segmentId: e.target.value }))} style={{ ...inputSx, textAlign: 'center' }} />
                    </TableCell>
                    <TableCell className="col-numeric" sx={{ p: 0 }}>
                      <input type="number" step="0.01" value={newRow.harvestedAreaHa} onChange={e => setNewRow(p => ({ ...p, harvestedAreaHa: e.target.value }))} style={{ ...inputSx, textAlign: 'right' }} />
                    </TableCell>
                    <TableCell className="col-numeric" sx={{ p: 0 }}>
                      <input type="number" step="0.1" value={newRow.quantity} onChange={e => setNewRow(p => ({ ...p, quantity: e.target.value }))} style={{ ...inputSx, textAlign: 'right', fontWeight: 600 }} />
                    </TableCell>
                    <TableCell sx={{ p: 0 }}>
                      <input value={newRow.packhouse} onChange={e => setNewRow(p => ({ ...p, packhouse: e.target.value }))} style={inputSx} />
                    </TableCell>
                    <TableCell sx={{ p: 0 }}>
                      <input value={newRow.authorizedBy} onChange={e => setNewRow(p => ({ ...p, authorizedBy: e.target.value }))} style={inputSx} />
                    </TableCell>
                    <TableCell align="center" sx={{ p: 0 }}>
                      <IconButton size="small" onClick={handleSaveRow} sx={{ p: '2px' }} aria-label="Confirm">
                        <Check sx={{ fontSize: 14, color: HEADER_FILL }} />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                )}
              </>
            )}
          </TableBody>
        </Table>
      </TableContainer>
      <Box sx={{ mt: '4px' }}>
        <Button size="small" startIcon={<Add sx={{ fontSize: '13px !important' }} />} onClick={handleAddRow}
          sx={{ fontFamily: FONT, fontSize: '10.5px', textTransform: 'none', color: HEADER_FILL, border: GRID_BORDER, borderRadius: 0, px: 1, py: '2px', minHeight: 0 }}>
          Add Row
        </Button>
      </Box>
      {phiDialog}
    </Box>
  );
}

function SummaryTab({ siteId }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!siteId) return;
    setLoading(true);
    getHarvestReportSummary({ site_id: siteId })
      .then(res => setData(Array.isArray(res) ? res : res.data || []))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [siteId]);

  if (loading) return <Box sx={{ p: 2, textAlign: 'center' }}><CircularProgress size={18} /></Box>;

  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small" sx={excelTableSx}>
        <TableHead>
          <TableRow>
            <TableCell>Plantation (Field)</TableCell>
            <TableCell>Crop</TableCell>
            <TableCell>Cycle start</TableCell>
            <TableCell className="col-numeric">Yield (Ton)</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {data.map((row, idx) => (
            <TableRow key={idx} hover>
              <TableCell>{row.field_name}</TableCell>
              <TableCell>{row.crop_name || '-'}</TableCell>
              <TableCell>{row.cycle_start ? String(row.cycle_start).slice(0, 10) : '—'}</TableCell>
              <TableCell className="col-numeric">{Number(row.yield_tons).toFixed(3)}</TableCell>
            </TableRow>
          ))}
          {data.length === 0 && (
            <TableRow><TableCell colSpan={4} align="center" sx={{ color: 'text.secondary' }}>No harvest data</TableCell></TableRow>
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function DailyWorksheetTab({ siteId }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!siteId) return;
    setLoading(true);
    getHarvestDailyWorksheet({ site_id: siteId })
      .then(res => setData(Array.isArray(res) ? res : res.data || []))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [siteId]);

  if (loading) return <Box sx={{ p: 2, textAlign: 'center' }}><CircularProgress size={18} /></Box>;

  return (
    <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 480 }}>
      <Table size="small" sx={[excelTableSx, freezeColumnsSx([HARVEST_DATE_WIDTH])]}>
        <TableHead>
          <TableRow>
            <TableCell className="col-frozen-0">Date</TableCell>
            <TableCell>Crop</TableCell>
            <TableCell className="col-numeric">Harvest Qty (Kg)</TableCell>
            <TableCell>Week No</TableCell>
            <TableCell>Day</TableCell>
            <TableCell>Month</TableCell>
            <TableCell>Year</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {data.map((row, idx) => (
            <TableRow key={idx} hover>
              <TableCell className="col-frozen-0">{formatDate(row.date)}</TableCell>
              <TableCell>{row.crop}</TableCell>
              <TableCell className="col-numeric">{Number(row.harvest_qty).toFixed(1)}</TableCell>
              <TableCell align="center">{row.week_no}</TableCell>
              <TableCell align="center">{row.day}</TableCell>
              <TableCell align="center">{row.month}</TableCell>
              <TableCell align="center">{row.year}</TableCell>
            </TableRow>
          ))}
          {data.length === 0 && (
            <TableRow><TableCell colSpan={7} align="center" sx={{ color: 'text.secondary' }}>No data</TableCell></TableRow>
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function WeeklySummaryTab({ siteId }) {
  const [data, setData] = useState({ weekly: [], daily: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!siteId) return;
    setLoading(true);
    getHarvestWeeklySummary({ site_id: siteId })
      .then(res => {
        const d = res.data || res;
        setData({ weekly: d.weekly || [], daily: d.daily || [] });
      })
      .catch(() => setData({ weekly: [], daily: [] }))
      .finally(() => setLoading(false));
  }, [siteId]);

  if (loading) return <Box sx={{ p: 2, textAlign: 'center' }}><CircularProgress size={18} /></Box>;

  return (
    <Grid container spacing={2}>
      <Grid size={{ xs: 12, md: 6 }}>
        <Typography sx={{ fontFamily: FONT, fontWeight: 700, fontSize: '11px', mb: '4px', color: HEADER_FILL }}>
          THIS WEEK
        </Typography>
        <TableContainer component={Paper} variant="outlined">
          <Table size="small" sx={excelTableSx}>
            <TableHead>
              <TableRow>
                <TableCell>Crop</TableCell>
                <TableCell className="col-numeric">Qty (Kg)</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.weekly.map((row, idx) => (
                <TableRow key={idx} hover>
                  <TableCell>{row.crop}</TableCell>
                  <TableCell className="col-numeric">{Number(row.total_quantity).toFixed(1)}</TableCell>
                </TableRow>
              ))}
              {data.weekly.length === 0 && (
                <TableRow><TableCell colSpan={2} align="center" sx={{ color: 'text.secondary' }}>No data</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Grid>
      <Grid size={{ xs: 12, md: 6 }}>
        <Typography sx={{ fontFamily: FONT, fontWeight: 700, fontSize: '11px', mb: '4px', color: HEADER_FILL }}>
          TODAY
        </Typography>
        <TableContainer component={Paper} variant="outlined">
          <Table size="small" sx={excelTableSx}>
            <TableHead>
              <TableRow>
                <TableCell>Crop</TableCell>
                <TableCell className="col-numeric">Qty (Kg)</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.daily.map((row, idx) => (
                <TableRow key={idx} hover>
                  <TableCell>{row.crop}</TableCell>
                  <TableCell className="col-numeric">{Number(row.total_quantity).toFixed(1)}</TableCell>
                </TableRow>
              ))}
              {data.daily.length === 0 && (
                <TableRow><TableCell colSpan={2} align="center" sx={{ color: 'text.secondary' }}>No data</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Grid>
    </Grid>
  );
}

const PIVOT_SAGE = 'var(--sheet-tint-green, #EBF1DE)';
const PIVOT_PEACH = 'var(--sheet-tint-peach, #FDEADA)';
const PIVOT_BLUE = 'var(--sheet-tint-blue, #DBEEF4)';
const PIVOT_BORDER = '1px solid var(--sheet-border, #000)';
const PIVOT_BANNER_BG = 'var(--sheet-bg, #FFFFFF)';
const PIVOT_NOTE =
  'Note: *Authorization of the Harvest  **Verification of the Record. If different, please indicate both';

function pivotHdr(bg, extra = {}) {
  return {
    backgroundColor: `${bg} !important`,
    color: 'var(--sheet-ink, #000) !important',
    fontFamily: FONT,
    fontWeight: 700,
    fontSize: '10px',
    textAlign: 'center',
    textTransform: 'none',
    border: PIVOT_BORDER,
    whiteSpace: 'pre-line',
    py: '5px',
    px: '4px',
    lineHeight: 1.15,
    verticalAlign: 'middle',
    ...extra,
  };
}

const pivotDCell = {
  fontFamily: FONT,
  fontSize: '11px',
  border: PIVOT_BORDER,
  py: '3px',
  px: '4px',
  lineHeight: 1.3,
  textAlign: 'center',
  backgroundColor: 'var(--sheet-bg, #fff)',
};

function formatTime24(timeStr) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':');
  return `${parseInt(h, 10)}:${m || '00'}`;
}

function formatNum(n, decimals = 2) {
  if (n == null || n === '') return '';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function parsePivotDateInput(str) {
  if (!str || !str.trim()) return undefined;
  const s = str.trim();
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmy) {
    const y = dmy[3].length === 2 ? 2000 + parseInt(dmy[3], 10) : parseInt(dmy[3], 10);
    return `${y}-${String(dmy[2]).padStart(2, '0')}-${String(dmy[1]).padStart(2, '0')}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }
  return s;
}

function parsePivotTimeInput(str) {
  if (!str || !str.trim()) return undefined;
  const m = str.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (m) return `${String(parseInt(m[1], 10)).padStart(2, '0')}:${m[2]}`;
  return str.trim();
}

function pivotDateDisplay(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return isoStr;
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

const PIVOT_COLS_ALFALFA = [
  { key: 'field', label: 'Field Name/ID (eg: Pivot)', bg: PIVOT_SAGE, width: 158 },
  { key: 'segment', label: 'Segment ID (eg: LS,RS)', bg: PIVOT_SAGE, width: 131 },
  { key: 'area', label: 'Area (In Ha)', bg: PIVOT_SAGE, width: 136 },
  { key: 'date', label: 'Date of Harvest (dd/mm/yyyy)', bg: PIVOT_SAGE, width: 171 },
  { key: 'time', label: 'Time Started (24 HR)', bg: PIVOT_PEACH, width: 143 },
  { key: 'cut', label: 'Cut Number', bg: PIVOT_SAGE, width: 117 },
  { key: 'baling', label: 'Baling Date (dd/mm/yyyy)', bg: PIVOT_SAGE, width: 164 },
  { key: 'bales', label: 'Total Number of Bails Harvested', bg: PIVOT_SAGE, width: 175 },
  { key: 'bundles', label: 'Bundles', bg: PIVOT_BLUE, width: 186 },
  { key: 'kg', label: 'Total Quantity Harvested  (Kg)', bg: PIVOT_SAGE, width: 186 },
  { key: 'ton', label: 'Total Quantity Harvested  (Ton)', bg: PIVOT_BLUE, width: 172 },
  { key: 'dispatched', label: 'Number of Bales dispatched', bg: PIVOT_SAGE, width: 160 },
  { key: 'stock', label: 'Number of Bales on Stock', bg: PIVOT_SAGE, width: 160 },
  { key: 'avg', label: 'Avrg. Weight of Bail', bg: PIVOT_SAGE, width: 149 },
  { key: 'batch', label: 'Batch No:', bg: PIVOT_SAGE, width: 183 },
  { key: 'auth', label: '*Authorized and **Verified by', bg: PIVOT_SAGE, width: 100 },
];

const PIVOT_COLS_RHODES = PIVOT_COLS_ALFALFA.filter(c => c.key !== 'bundles');

function PivotHarvestTab({ fields, siteId, crop, onRefresh, readOnly = false, dateFrom, dateTo, farmAreaId, filterFieldId }) {
  const notify = useNotification();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newRow, setNewRow] = useState(null);
  const selection = useRowSelection();

  const showBundles = crop === 'alfalfa';
  const cols = showBundles ? PIVOT_COLS_ALFALFA : PIVOT_COLS_RHODES;
  const colCount = cols.length + 1;
  const tableMinWidth = cols.reduce((s, c) => s + c.width, 0) + 24;
  const sheetTitle = 'HARVEST RECORD  -  FORAGES';
  const remarksColSpan = cols.length - 7;

  const fieldIds = useMemo(() => {
    return fields
      .filter((f) => !farmAreaId || f.farmAreaId === farmAreaId)
      .filter((f) => !filterFieldId || f.id === filterFieldId)
      .map((f) => f.id);
  }, [fields, farmAreaId, filterFieldId]);

  const loadRecords = useCallback(async () => {
    if (!fieldIds.length) { setRecords([]); setLoading(false); return; }
    setLoading(true);
    try {
      const params = { field_ids: fieldIds.join(','), site_id: siteId, limit: 500 };
      if (dateFrom) params.start_date = dateFrom;
      if (dateTo) params.end_date = dateTo;
      const { data } = await listHarvests(params);
      const filtered = (data || []).filter(r => {
        const v = (r.varieties?.[0]?.variety || r.extraData?.cropType || '').toLowerCase();
        if (crop === 'alfalfa') return v.includes('alfalfa') || v.includes('lucerne') || v === 'forage' || !v;
        return v.includes('rhodes') || v.includes('grass');
      });
      setRecords(filtered);
    } catch { setRecords([]); }
    setLoading(false);
  }, [fieldIds, siteId, crop, dateFrom, dateTo]);

  useEffect(() => { if (fieldIds.length > 0) loadRecords(); }, [loadRecords, fieldIds]);

  const { save: saveHarvest, dialog: phiDialog } = usePhiHarvestSave({
    notify,
    onSaved: () => {
      setNewRow(null);
      loadRecords();
      if (onRefresh) onRefresh();
    },
  });

  const handleAddRow = () => {
    setNewRow({
      fieldId: fields[0]?.id || '',
      segmentId: 'LS, RS',
      harvestedAreaHa: '',
      date: pivotDateDisplay(new Date().toISOString().split('T')[0]),
      startTime: '',
      cutNumber: '',
      balingDate: '',
      totalBales: '',
      bundles: '',
      quantity: '',
      balesDispatched: '',
      batchNumber: '',
      authorizedBy: '',
    });
  };

  const handleSaveRow = async () => {
    if (readOnly) return;
    if (!newRow.quantity || !newRow.fieldId) {
      notify.error('Field and quantity are required');
      return;
    }
    const varietyName = crop === 'alfalfa' ? 'Alfalfa' : 'Rhodes';
    const parsedDate = parsePivotDateInput(newRow.date);
    if (!parsedDate) {
      notify.error('Harvest date is required (dd/mm/yyyy)');
      return;
    }
    await saveHarvest({
      fieldId: newRow.fieldId,
      date: parsedDate,
      startTime: parsePivotTimeInput(newRow.startTime),
      segmentId: newRow.segmentId || undefined,
      harvestedAreaHa: newRow.harvestedAreaHa ? parseFloat(newRow.harvestedAreaHa) : undefined,
      batchNumber: newRow.batchNumber || undefined,
      authorizedBy: newRow.authorizedBy || undefined,
      totalQuantity: parseFloat(newRow.quantity),
      extraData: {
        cropType: crop,
        cutNumber: newRow.cutNumber ? parseInt(newRow.cutNumber, 10) : undefined,
        balingDate: parsePivotDateInput(newRow.balingDate),
        totalBales: newRow.totalBales ? parseInt(newRow.totalBales, 10) : undefined,
        bundles: showBundles && newRow.bundles ? parseInt(newRow.bundles, 10) : undefined,
        balesDispatched: newRow.balesDispatched ? parseInt(newRow.balesDispatched, 10) : undefined,
      },
      varieties: [{ variety: varietyName, quantity: parseFloat(newRow.quantity), grade: 'A' }],
    });
  };

  const handleDeleteRow = async (id) => {
    try {
      await deleteHarvest(id);
      loadRecords();
      if (onRefresh) onRefresh();
    } catch (err) {
      notify.error(err.message || 'Failed to delete');
    }
  };

  const handleBulkDelete = async () => {
    const ids = [...selection.selectedIds];
    if (!ids.length) return;
    if (!window.confirm(`Delete ${ids.length} harvest ${ids.length === 1 ? 'record' : 'records'}?`)) return;
    const deleted = await deleteIdsSequentially(ids, deleteHarvest);
    selection.clear();
    loadRecords();
    if (onRefresh) onRefresh();
    notify.success(`Deleted ${deleted} ${deleted === 1 ? 'record' : 'records'}.`);
  };

  return (
    <Box sx={{ fontFamily: FONT }}>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', px: 1, py: 0.5 }}>
        <DeleteSelectedButton count={selection.size} onClick={handleBulkDelete} disabled={readOnly} />
      </Box>
      {/* Banner — matches Excel rows 2-5 */}
      <Box sx={{ border: PIVOT_BORDER, backgroundColor: PIVOT_BANNER_BG }}>
        <Box sx={{ display: 'flex', minHeight: 72 }}>
          <Box sx={{ width: 100, borderRight: PIVOT_BORDER, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 1 }}>
            <Typography sx={{ fontFamily: FONT, fontSize: '9px', fontWeight: 700, color: 'var(--sheet-accent, #1f7a4d)', textAlign: 'center', lineHeight: 1.2 }}>
              ELITE AGRO{'\n'}UAE LLC
            </Typography>
          </Box>
          <Box sx={{ flex: 1, borderRight: PIVOT_BORDER, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 1 }}>
            <Typography sx={{ fontFamily: FONT, fontWeight: 700, fontSize: '14px' }}>
              ELITE AGRO UAE LLC
            </Typography>
            <Typography sx={{ fontFamily: FONT, fontWeight: 700, fontSize: '13px', mt: 0.5 }}>
              {sheetTitle}
            </Typography>
          </Box>
          <Box sx={{ width: 180, display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ flex: 1, borderBottom: PIVOT_BORDER, display: 'flex', alignItems: 'center', justifyContent: 'center', px: 1 }}>
              <Typography sx={{ fontFamily: FONT, fontSize: '10px', fontWeight: 600 }}>EAG/AFO/IMS/RC-130</Typography>
            </Box>
            <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', px: 1 }}>
              <Typography sx={{ fontFamily: FONT, fontSize: '9px' }}>Issue 03, 17-Sept-2020, Rev00</Typography>
            </Box>
          </Box>
        </Box>
      </Box>

      <TableContainer sx={{ border: PIVOT_BORDER, borderTop: 'none', overflowX: 'auto', borderRadius: 0 }}>
        <Table size="small" sx={{ borderCollapse: 'collapse', minWidth: tableMinWidth, tableLayout: 'fixed' }}>
          <TableHead>
            {/* Excel row 7 — category */}
            <TableRow>
              <TableCell rowSpan={3} sx={pivotHdr(PIVOT_SAGE, { width: 36, p: 0, minWidth: 36 })}>
                <SelectAllCheckbox
                  ids={records.map((r) => r.id)}
                  selectedIds={selection.selectedIds}
                  onToggleAll={selection.toggleAll}
                  label="Select all pivot harvest rows"
                />
              </TableCell>
              <TableCell colSpan={2} sx={pivotHdr(PIVOT_SAGE, { fontSize: '11px' })}>EAG Facility Name</TableCell>
              <TableCell colSpan={2} sx={pivotHdr(PIVOT_SAGE, { fontSize: '11px' })}>Location &amp; Country</TableCell>
              <TableCell colSpan={3} sx={pivotHdr(PIVOT_SAGE, { fontSize: '11px' })}>Product Name</TableCell>
              <TableCell colSpan={remarksColSpan} sx={pivotHdr(PIVOT_SAGE, { fontSize: '11px' })}>Remarks</TableCell>
              <TableCell sx={pivotHdr(PIVOT_SAGE, { width: 24, p: 0, minWidth: 24 })} />
            </TableRow>
            {/* Excel row 8 — note */}
            <TableRow>
              <TableCell colSpan={2} sx={{ ...pivotDCell, border: PIVOT_BORDER }} />
              <TableCell colSpan={2} sx={{ ...pivotDCell, border: PIVOT_BORDER }} />
              <TableCell colSpan={3} sx={{ ...pivotDCell, border: PIVOT_BORDER }} />
              <TableCell
                colSpan={remarksColSpan}
                sx={{
                  ...pivotDCell,
                  border: PIVOT_BORDER,
                  fontSize: '9px',
                  textAlign: 'left',
                  whiteSpace: 'normal',
                  fontWeight: 400,
                }}
              >
                {PIVOT_NOTE}
              </TableCell>
              <TableCell sx={{ ...pivotDCell, width: 24, p: 0, minWidth: 24 }} />
            </TableRow>
            {/* Excel row 9 — column headers */}
            <TableRow>
              {cols.map((col) => (
                <TableCell key={col.key} sx={pivotHdr(col.bg, { width: col.width, minWidth: col.width, maxWidth: col.width })}>
                  {col.label}
                </TableCell>
              ))}
              <TableCell sx={pivotHdr(PIVOT_SAGE, { width: 24, p: 0, minWidth: 24 })} />
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={colCount} align="center" sx={{ py: 2 }}><CircularProgress size={18} /></TableCell></TableRow>
            ) : (
              <>
                {records.map((r) => {
                  const extra = r.extraData || {};
                  const totalBales = extra.totalBales || 0;
                  const dispatched = extra.balesDispatched || 0;
                  const onStock = totalBales - dispatched;
                  const avgWeight = totalBales > 0 ? (r.totalQuantity / totalBales).toFixed(2) : '';
                  const fieldObj = fields.find(f => f.id === r.fieldId);
                  return (
                    <TableRow key={r.id} selected={selection.selectedIds.has(r.id)}>
                      <RowSelectCell
                        id={r.id}
                        selectedIds={selection.selectedIds}
                        onToggle={selection.toggle}
                        label={`Select pivot harvest ${r.id}`}
                      />
                      <TableCell sx={pivotDCell}>{fieldObj?.name || r.fieldName || ''}</TableCell>
                      <TableCell sx={pivotDCell}>{r.segmentId || ''}</TableCell>
                      <TableCell sx={pivotDCell}>{r.harvestedAreaHa ?? ''}</TableCell>
                      <TableCell sx={pivotDCell}>{pivotDateDisplay(r.date) || formatDate(r.date)}</TableCell>
                      <TableCell sx={pivotDCell}>{r.startTime ? formatTime24(r.startTime) : ''}</TableCell>
                      <TableCell sx={pivotDCell}>{extra.cutNumber ?? ''}</TableCell>
                      <TableCell sx={pivotDCell}>{extra.balingDate ? pivotDateDisplay(extra.balingDate) : ''}</TableCell>
                      <TableCell sx={pivotDCell}>{totalBales || ''}</TableCell>
                      {showBundles && <TableCell sx={pivotDCell}>{extra.bundles ?? 'NA'}</TableCell>}
                      <TableCell sx={pivotDCell}>{r.totalQuantity != null ? formatNum(r.totalQuantity) : ''}</TableCell>
                      <TableCell sx={pivotDCell}>{r.totalQuantity != null ? formatNum(r.totalQuantity / 1000) : ''}</TableCell>
                      <TableCell sx={pivotDCell}>{dispatched || ''}</TableCell>
                      <TableCell sx={pivotDCell}>{onStock || '-'}</TableCell>
                      <TableCell sx={pivotDCell}>{avgWeight}</TableCell>
                      <TableCell sx={pivotDCell}>{r.batchNumber || ''}</TableCell>
                      <TableCell sx={pivotDCell}>{r.authorizedBy || ''}</TableCell>
                      <TableCell sx={{ ...pivotDCell, px: 0 }}>
                        <IconButton size="small" onClick={() => handleDeleteRow(r.id)} sx={{ p: '2px' }} aria-label="Delete">
                          <Delete sx={{ fontSize: 14, color: 'var(--sheet-danger, #C62828)' }} />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {newRow && (
                  <TableRow sx={{ backgroundColor: 'var(--sheet-alt, #FAFAFA)' }}>
                    <TableCell sx={pivotDCell} />
                    <TableCell sx={{ ...pivotDCell, p: 0 }}>
                      <Select size="small" value={newRow.fieldId} sx={selectSx}
                        onChange={e => setNewRow(p => ({ ...p, fieldId: e.target.value }))}>
                        {fields.map(f => <MenuItem key={f.id} value={f.id} sx={{ fontSize: '11px' }}>{f.name}</MenuItem>)}
                      </Select>
                    </TableCell>
                    <TableCell sx={{ ...pivotDCell, p: 0 }}>
                      <Select size="small" value={newRow.segmentId} sx={selectSx}
                        onChange={e => setNewRow(p => ({ ...p, segmentId: e.target.value }))}>
                        <MenuItem value="LS" sx={{ fontSize: '11px' }}>LS</MenuItem>
                        <MenuItem value="RS" sx={{ fontSize: '11px' }}>RS</MenuItem>
                        <MenuItem value="LS, RS" sx={{ fontSize: '11px' }}>LS, RS</MenuItem>
                      </Select>
                    </TableCell>
                    <TableCell sx={{ ...pivotDCell, p: 0 }}>
                      <input value={newRow.harvestedAreaHa} onChange={e => setNewRow(p => ({ ...p, harvestedAreaHa: e.target.value }))} style={inputSx} />
                    </TableCell>
                    <TableCell sx={{ ...pivotDCell, p: 0 }}>
                      <input value={newRow.date} placeholder="dd/mm/yyyy" onChange={e => setNewRow(p => ({ ...p, date: e.target.value }))} style={inputSx} />
                    </TableCell>
                    <TableCell sx={{ ...pivotDCell, p: 0 }}>
                      <input value={newRow.startTime} placeholder="9:00" onChange={e => setNewRow(p => ({ ...p, startTime: e.target.value }))} style={inputSx} />
                    </TableCell>
                    <TableCell sx={{ ...pivotDCell, p: 0 }}>
                      <input type="number" value={newRow.cutNumber} onChange={e => setNewRow(p => ({ ...p, cutNumber: e.target.value }))} style={inputSx} />
                    </TableCell>
                    <TableCell sx={{ ...pivotDCell, p: 0 }}>
                      <input value={newRow.balingDate} placeholder="dd/mm/yyyy" onChange={e => setNewRow(p => ({ ...p, balingDate: e.target.value }))} style={inputSx} />
                    </TableCell>
                    <TableCell sx={{ ...pivotDCell, p: 0 }}>
                      <input type="number" value={newRow.totalBales} onChange={e => setNewRow(p => ({ ...p, totalBales: e.target.value }))} style={inputSx} />
                    </TableCell>
                    {showBundles && (
                      <TableCell sx={{ ...pivotDCell, p: 0 }}>
                        <input type="number" value={newRow.bundles} onChange={e => setNewRow(p => ({ ...p, bundles: e.target.value }))} style={inputSx} />
                      </TableCell>
                    )}
                    <TableCell sx={{ ...pivotDCell, p: 0 }}>
                      <input type="number" step="1" value={newRow.quantity} onChange={e => setNewRow(p => ({ ...p, quantity: e.target.value }))} style={inputSx} />
                    </TableCell>
                    <TableCell sx={pivotDCell}>
                      {newRow.quantity ? formatNum(parseFloat(newRow.quantity) / 1000) : ''}
                    </TableCell>
                    <TableCell sx={{ ...pivotDCell, p: 0 }}>
                      <input type="number" value={newRow.balesDispatched} onChange={e => setNewRow(p => ({ ...p, balesDispatched: e.target.value }))} style={inputSx} />
                    </TableCell>
                    <TableCell sx={pivotDCell}>
                      {newRow.totalBales && newRow.balesDispatched ? parseInt(newRow.totalBales) - parseInt(newRow.balesDispatched) : ''}
                    </TableCell>
                    <TableCell sx={pivotDCell}>
                      {newRow.quantity && newRow.totalBales ? (parseFloat(newRow.quantity) / parseInt(newRow.totalBales)).toFixed(2) : ''}
                    </TableCell>
                    <TableCell sx={{ ...pivotDCell, p: 0 }}>
                      <input value={newRow.batchNumber} onChange={e => setNewRow(p => ({ ...p, batchNumber: e.target.value }))} style={inputSx} />
                    </TableCell>
                    <TableCell sx={{ ...pivotDCell, p: 0 }}>
                      <input value={newRow.authorizedBy} onChange={e => setNewRow(p => ({ ...p, authorizedBy: e.target.value }))} style={inputSx} />
                    </TableCell>
                    <TableCell sx={{ ...pivotDCell, p: 0 }}>
                      <IconButton size="small" onClick={handleSaveRow} sx={{ p: '2px' }} aria-label="Confirm">
                        <Check sx={{ fontSize: 14, color: 'var(--sheet-accent, #1f7a4d)' }} />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                )}
              </>
            )}
          </TableBody>
        </Table>
      </TableContainer>
      <Box sx={{ mt: 1, display: 'flex', justifyContent: 'flex-end' }}>
        <Button size="small" variant="outlined" startIcon={<Add sx={{ fontSize: 14 }} />}
          onClick={handleAddRow} disabled={!!newRow}
          sx={{ fontFamily: FONT, fontSize: '11px', textTransform: 'none', borderColor: 'var(--sheet-border, #000)', color: 'var(--sheet-ink, #000)' }}>
          Add Row
        </Button>
      </Box>
      {phiDialog}
    </Box>
  );
}

function OpenFieldTab({
  fields, siteId, crops, onRefresh, readOnly = false,
  dateFrom, dateTo, cropFilter, varietyFilter, farmAreaId, filterFieldId,
}) {
  const notify = useNotification();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [varieties, setVarieties] = useState([]);
  const [newRow, setNewRow] = useState(null);
  const selection = useRowSelection();
  const draftRef = useScrollDraftIntoView(Boolean(newRow));

  const fieldIds = useMemo(() => {
    return fields
      .filter((f) => !farmAreaId || f.farmAreaId === farmAreaId)
      .filter((f) => !filterFieldId || f.id === filterFieldId)
      .map((f) => f.id);
  }, [fields, farmAreaId, filterFieldId]);
  const fieldNameMap = useMemo(() => Object.fromEntries(fields.map(f => [f.id, f.name])), [fields]);

  const loadRecords = useCallback(async () => {
    if (!fieldIds.length) { setRecords([]); setLoading(false); return; }
    setLoading(true);
    try {
      const params = { field_ids: fieldIds.join(','), site_id: siteId, limit: 500 };
      if (dateFrom) params.start_date = dateFrom;
      if (dateTo) params.end_date = dateTo;
      const { data } = await listHarvests(params);
      setRecords(data || []);
    } catch { setRecords([]); }
    setLoading(false);
  }, [fieldIds, siteId, dateFrom, dateTo]);

  useEffect(() => { loadRecords(); }, [loadRecords]);

  const { save: saveHarvest, dialog: phiDialog } = usePhiHarvestSave({
    notify,
    onSaved: () => {
      setNewRow(null);
      loadRecords();
      if (onRefresh) onRefresh();
    },
  });

  const loadVarieties = useCallback(async (cropId) => {
    if (!cropId) { setVarieties([]); return; }
    try {
      const res = await fetchVarieties(cropId);
      setVarieties(Array.isArray(res) ? res : res.data || []);
    } catch { setVarieties([]); }
  }, []);

  const handleAddRow = () => {
    setNewRow({
      fieldId: fields[0]?.id || '',
      date: farmTodayYmd(),
      startTime: '',
      endTime: '',
      shiftNumber: '',
      weekNumber: '',
      batchNumber: '',
      cropId: '',
      variety: '',
      segmentId: '',
      harvestedAreaHa: '',
      quantity: '',
      packhouse: '',
      authorizedBy: '',
    });
  };

  const handleSaveRow = async () => {
    if (readOnly) return;
    if (!newRow.quantity || !newRow.variety || !newRow.fieldId) {
      notify.error('Field, variety, and quantity are required');
      return;
    }
    const clockErr = harvestClockTimesError(newRow.startTime, newRow.endTime);
    if (clockErr) {
      notify.error(clockErr);
      return;
    }
    await saveHarvest({
      fieldId: newRow.fieldId,
      date: newRow.date,
      startTime: newRow.startTime || undefined,
      endTime: newRow.endTime || undefined,
      shiftNumber: newRow.shiftNumber || undefined,
      weekNumber: newRow.weekNumber || undefined,
      batchNumber: newRow.batchNumber || undefined,
      segmentId: newRow.segmentId || undefined,
      harvestedAreaHa: newRow.harvestedAreaHa ? parseFloat(newRow.harvestedAreaHa) : undefined,
      packhouse: newRow.packhouse || undefined,
      authorizedBy: newRow.authorizedBy || undefined,
      cropId: newRow.cropId || undefined,
      totalQuantity: parseFloat(newRow.quantity),
      varieties: [{ variety: newRow.variety, quantity: parseFloat(newRow.quantity), grade: 'A' }],
    });
  };

  const handleDeleteRow = async (id) => {
    try {
      await deleteHarvest(id);
      loadRecords();
      if (onRefresh) onRefresh();
    } catch (err) {
      notify.error(err.message || 'Failed to delete');
    }
  };

  const handleBulkDelete = async () => {
    const ids = [...selection.selectedIds];
    if (!ids.length) return;
    if (!window.confirm(`Delete ${ids.length} harvest ${ids.length === 1 ? 'record' : 'records'}?`)) return;
    const deleted = await deleteIdsSequentially(ids, deleteHarvest);
    selection.clear();
    loadRecords();
    if (onRefresh) onRefresh();
    notify.success(`Deleted ${deleted} ${deleted === 1 ? 'record' : 'records'}.`);
  };

  const visibleRecords = useMemo(
    () => filterHarvestEntries(records, { cropName: cropFilter, variety: varietyFilter }),
    [records, cropFilter, varietyFilter],
  );
  const totalQty = visibleRecords.reduce((s, r) => s + (r.totalQuantity || 0), 0);

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', px: 1, py: 0.5 }}>
        <DeleteSelectedButton count={selection.size} onClick={handleBulkDelete} disabled={readOnly} />
      </Box>
      <CompanyHeader fieldName="Open Field" />
      <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 480, borderRadius: 0, borderTop: 'none' }}>
        <Table size="small" sx={[excelTableSx, freezeColumnsSx([42, HARVEST_DATE_WIDTH]), harvestEntrySx]}>
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox" rowSpan={2} className="col-frozen-0">
                <SelectAllCheckbox
                  ids={visibleRecords.map((r) => r.id)}
                  selectedIds={selection.selectedIds}
                  onToggleAll={selection.toggleAll}
                  label="Select all open-field harvest rows"
                />
              </TableCell>
              <TableCell className="col-frozen-1">Date</TableCell>
              <TableCell>Start Time *</TableCell>
              <TableCell>End Time *</TableCell>
              <TableCell>Shift No</TableCell>
              <TableCell>Week Number</TableCell>
              <TableCell>Batch No</TableCell>
              <TableCell>Product</TableCell>
              <TableCell>Variety</TableCell>
              <TableCell>Field Name</TableCell>
              <TableCell>Segment</TableCell>
              <TableCell className="col-numeric">Area (Ha)</TableCell>
              <TableCell className="col-numeric">Qty (Kg)</TableCell>
              <TableCell>Packhouse</TableCell>
              <TableCell>Auth. By</TableCell>
              <TableCell />
            </TableRow>
            <TableRow>
              <TableCell colSpan={11} />
              <TableCell className="col-numeric">{totalQty.toFixed(1)}</TableCell>
              <TableCell colSpan={3} align="center">TOTAL</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={16} align="center" sx={{ py: 2 }}><CircularProgress size={18} /></TableCell></TableRow>
            ) : (
              <>
                {visibleRecords.map((r) => (
                  <TableRow key={r.id} hover selected={selection.selectedIds.has(r.id)}>
                    <RowSelectCell
                      id={r.id}
                      selectedIds={selection.selectedIds}
                      onToggle={selection.toggle}
                      label={`Select open-field harvest ${formatDate(r.date) || r.id}`}
                      className="col-frozen-0"
                    />
                    <TableCell className="col-frozen-1">{formatDate(r.date)}</TableCell>
                    <TableCell>{r.startTime ? formatTime(r.startTime) : ''}</TableCell>
                    <TableCell>{r.endTime ? formatTime(r.endTime) : ''}</TableCell>
                    <TableCell align="center">{r.shiftNumber || ''}</TableCell>
                    <TableCell align="center">{r.weekNumber || ''}</TableCell>
                    <TableCell>{r.batchNumber || ''}</TableCell>
                    <TableCell>{r.cropName || ''}</TableCell>
                    <TableCell>{r.varieties?.[0]?.variety || r.varietyName || ''}</TableCell>
                    <TableCell>{r.fieldName || fieldNameMap[r.fieldId] || ''}</TableCell>
                    <TableCell align="center">{r.segmentId || ''}</TableCell>
                    <TableCell className="col-numeric">{r.harvestedAreaHa || ''}</TableCell>
                    <TableCell className="col-numeric" sx={{ fontWeight: 600 }}>{r.totalQuantity?.toFixed(1)}</TableCell>
                    <TableCell>{r.packhouse || ''}</TableCell>
                    <TableCell>{r.authorizedBy || ''}</TableCell>
                    <TableCell align="center" sx={{ px: 0 }}>
                      <IconButton size="small" onClick={() => handleDeleteRow(r.id)} sx={{ p: '2px' }} aria-label="Delete">
                        <Delete sx={{ fontSize: 14, color: 'var(--sheet-danger, #C62828)' }} />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
                {newRow && (
                  <TableRow className="row-draft" ref={draftRef}>
                    <TableCell padding="checkbox" className="col-frozen-0" />
                    <TableCell className="col-frozen-1" sx={{ p: 0 }}>
                      <input type="date" value={newRow.date} onChange={e => setNewRow(p => ({ ...p, date: e.target.value }))} style={inputSx} />
                    </TableCell>
                    <TableCell sx={{ p: 0 }}>
                      <input type="time" value={newRow.startTime} onChange={e => setNewRow(p => ({ ...p, startTime: e.target.value }))} style={inputSx} />
                    </TableCell>
                    <TableCell sx={{ p: 0 }}>
                      <input type="time" value={newRow.endTime} onChange={e => setNewRow(p => ({ ...p, endTime: e.target.value }))} style={inputSx} />
                    </TableCell>
                    <TableCell sx={{ p: 0 }}>
                      <input value={newRow.shiftNumber} onChange={e => setNewRow(p => ({ ...p, shiftNumber: e.target.value }))} style={{ ...inputSx, textAlign: 'center' }} />
                    </TableCell>
                    <TableCell sx={{ p: 0 }}>
                      <input value={newRow.weekNumber} maxLength={20} onChange={e => setNewRow(p => ({ ...p, weekNumber: e.target.value }))} style={{ ...inputSx, textAlign: 'center' }} />
                    </TableCell>
                    <TableCell sx={{ p: 0 }}>
                      <input value={newRow.batchNumber} onChange={e => setNewRow(p => ({ ...p, batchNumber: e.target.value }))} style={inputSx} />
                    </TableCell>
                    <TableCell sx={{ p: 0 }}>
                      <Select size="small" value={newRow.cropId} sx={selectSx}
                        onChange={e => { setNewRow(p => ({ ...p, cropId: e.target.value, variety: '' })); loadVarieties(e.target.value); }}>
                        {crops.map(c => <MenuItem key={c.id} value={c.id} sx={{ fontSize: '11px' }}>{c.name}</MenuItem>)}
                      </Select>
                    </TableCell>
                    <TableCell sx={{ p: 0 }}>
                      <Select size="small" value={newRow.variety} sx={selectSx}
                        onChange={e => setNewRow(p => ({ ...p, variety: e.target.value }))}>
                        {varieties.map(v => <MenuItem key={v.id} value={v.name} sx={{ fontSize: '11px' }}>{v.name}</MenuItem>)}
                      </Select>
                    </TableCell>
                    <TableCell sx={{ p: 0 }}>
                      <Select size="small" value={newRow.fieldId} sx={selectSx}
                        onChange={e => setNewRow(p => ({ ...p, fieldId: e.target.value }))}>
                        {fields.map(f => <MenuItem key={f.id} value={f.id} sx={{ fontSize: '11px' }}>{f.name}</MenuItem>)}
                      </Select>
                    </TableCell>
                    <TableCell sx={{ p: 0 }}>
                      <input value={newRow.segmentId} onChange={e => setNewRow(p => ({ ...p, segmentId: e.target.value }))} style={{ ...inputSx, textAlign: 'center' }} />
                    </TableCell>
                    <TableCell className="col-numeric" sx={{ p: 0 }}>
                      <input type="number" step="0.01" value={newRow.harvestedAreaHa} onChange={e => setNewRow(p => ({ ...p, harvestedAreaHa: e.target.value }))} style={{ ...inputSx, textAlign: 'right' }} />
                    </TableCell>
                    <TableCell className="col-numeric" sx={{ p: 0 }}>
                      <input type="number" step="0.1" value={newRow.quantity} onChange={e => setNewRow(p => ({ ...p, quantity: e.target.value }))} style={{ ...inputSx, textAlign: 'right', fontWeight: 600 }} />
                    </TableCell>
                    <TableCell sx={{ p: 0 }}>
                      <input value={newRow.packhouse} onChange={e => setNewRow(p => ({ ...p, packhouse: e.target.value }))} style={inputSx} />
                    </TableCell>
                    <TableCell sx={{ p: 0 }}>
                      <input value={newRow.authorizedBy} onChange={e => setNewRow(p => ({ ...p, authorizedBy: e.target.value }))} style={inputSx} />
                    </TableCell>
                    <TableCell align="center" sx={{ p: 0 }}>
                      <IconButton size="small" onClick={handleSaveRow} sx={{ p: '2px' }} aria-label="Confirm">
                        <Check sx={{ fontSize: 14, color: HEADER_FILL }} />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                )}
              </>
            )}
          </TableBody>
        </Table>
      </TableContainer>
      <Box sx={{ mt: '4px' }}>
        <Button size="small" startIcon={<Add sx={{ fontSize: '13px !important' }} />} onClick={handleAddRow}
          sx={{ fontFamily: FONT, fontSize: '10.5px', textTransform: 'none', color: HEADER_FILL, border: GRID_BORDER, borderRadius: 0, px: 1, py: '2px', minHeight: 0 }}>
          Add Row
        </Button>
      </Box>
      {phiDialog}
    </Box>
  );
}

function HarvestEntry() {
  const readOnly = useReadOnlyMode(PAGE_KEYS.DATA_ENTRY);
  const { activeSiteId } = useActiveSite();
  const { data: masterData } = useMasterData();
  const { scrollRegionHeight } = useAppLayout();
  const notify = useNotification();
  const exportOpsExcel = useOpsExcelExport();
  const pageHeight = scrollRegionHeight(0);
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [importerOpen, setImporterOpen] = useState(false);
  const [cropHistory, setCropHistory] = useState([]);
  const [plantingRecords, setPlantingRecords] = useState([]);
  const defaultRange = defaultHarvestDateRange();
  const [dateFrom, setDateFrom] = useState(defaultRange.from);
  const [dateTo, setDateTo] = useState(defaultRange.to);
  const [filterFarmAreaId, setFilterFarmAreaId] = useState('');
  const [filterFieldId, setFilterFieldId] = useState('');
  const [filterCropName, setFilterCropName] = useState('');
  const [filterVariety, setFilterVariety] = useState('');
  const didAutoSelect = useRef(false);

  const siteFields = useMemo(() => {
    const fields = [];
    for (const country of masterData.countries || []) {
      for (const site of country.sites || []) {
        if (site.id !== activeSiteId) continue;
        for (const area of site.farmAreas || []) {
          for (const field of area.fields || []) {
            fields.push({ ...field, farmAreaName: area.name, farmAreaId: area.id });
          }
        }
      }
    }
    fields.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true }));
    return fields;
  }, [masterData.countries, activeSiteId]);

  const isOpenFieldType = (type) => {
    if (!type) return false;
    const t = type.toLowerCase();
    return t === 'open field' || t === 'farm plots';
  };
  const isPivotType = (type) => {
    if (!type) return false;
    return type.toLowerCase() === 'pivot';
  };
  const openFields = useMemo(() =>
    siteFields.filter(f => isOpenFieldType(f.type)),
    [siteFields]
  );
  const pivotFields = useMemo(() =>
    siteFields.filter(f => isPivotType(f.type)),
    [siteFields]
  );
  const otherFields = useMemo(() =>
    siteFields.filter(f => !isOpenFieldType(f.type) && !isPivotType(f.type)),
    [siteFields]
  );

  const crops = useMemo(() => masterData.crops || [], [masterData.crops]);
  const handleRefresh = useCallback(() => setRefreshKey(k => k + 1), []);

  const farmAreas = useMemo(() => {
    const areas = [];
    for (const country of masterData.countries || []) {
      for (const site of country.sites || []) {
        if (site.id !== activeSiteId) continue;
        for (const area of site.farmAreas || []) {
          areas.push({ id: area.id, name: area.name });
        }
      }
    }
    return areas.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [masterData.countries, activeSiteId]);

  const fieldOptions = useMemo(
    () => siteFields.filter((f) => !filterFarmAreaId || f.farmAreaId === filterFarmAreaId),
    [siteFields, filterFarmAreaId],
  );

  const varietyOptions = useMemo(
    () => uniqueHarvestVarieties(plantingRecords, cropHistory),
    [plantingRecords, cropHistory],
  );

  const fieldInfoMap = useMemo(() => {
    const map = {};
    siteFields.forEach((field) => {
      map[field.id] = { name: field.name, currentCrop: field.currentCrop };
    });
    return map;
  }, [siteFields]);

  const handleFarmAreaChange = (id) => {
    setFilterFarmAreaId(id);
    if (id && filterFieldId) {
      const field = siteFields.find((f) => f.id === filterFieldId);
      if (field && field.farmAreaId !== id) setFilterFieldId('');
    }
  };

  const handleFieldChange = (id) => {
    setFilterFieldId(id);
    selectFieldTab(id);
  };

  const handleDateFromChange = (value) => {
    const err = harvestDateRangeError(value, dateTo);
    if (err) {
      notify.error(err);
      return;
    }
    setDateFrom(value);
  };

  const handleDateToChange = (value) => {
    const err = harvestDateRangeError(dateFrom, value);
    if (err) {
      notify.error(err);
      return;
    }
    setDateTo(value);
  };

  const handleExport = async () => {
    if (!dateFrom || !dateTo) {
      notify.error('Choose a date from and date to before exporting');
      return;
    }
    const rangeErr = harvestDateRangeError(dateFrom, dateTo);
    if (rangeErr) {
      notify.error(rangeErr);
      return;
    }
    const params = { site_id: activeSiteId, start_date: dateFrom, end_date: dateTo };
    if (filterFieldId) {
      params.field_id = filterFieldId;
    } else if (filterFarmAreaId) {
      const ids = siteFields.filter((f) => f.farmAreaId === filterFarmAreaId).map((f) => f.id);
      if (!ids.length) {
        notify.warning('No harvest entries to export');
        return;
      }
      params.field_ids = ids.join(',');
    }
    try {
      const entries = await listHarvestsAll(params);
      const filtered = filterHarvestEntries(entries, { cropName: filterCropName, variety: filterVariety });
      if (!filtered.length) {
        notify.warning('No harvest entries to export');
        return;
      }
      const sheets = await buildHarvestExcelSheets(filtered, {
        siteId: activeSiteId,
        fieldInfoMap,
        variant: 'entry',
      });
      if (sheets.every((sheet) => sheet.rows.length === 0)) {
        notify.warning('No harvest entries to export');
        return;
      }
      const ok = await exportOpsExcel(null, {
        filename: `Harvest_Entries_${dateFrom}_to_${dateTo}`,
        sheets,
        ...OPS_EXPORT.harvest,
      });
      if (ok) notify.success('Harvest entries exported');
    } catch (err) {
      notify.error(err.message || 'Failed to export harvest entries');
    }
  };

  useEffect(() => {
    if (!activeSiteId) {
      setCropHistory([]);
      setPlantingRecords([]);
      return;
    }
    let cancelled = false;
    Promise.all([
      fetchCropHistoryBySite(activeSiteId).catch(() => []),
      fetchPlantingRecordsBySite(activeSiteId).catch(() => []),
    ]).then(([history, plantings]) => {
      if (cancelled) return;
      setCropHistory(Array.isArray(history) ? history : []);
      setPlantingRecords(Array.isArray(plantings) ? plantings : []);
    });
    return () => { cancelled = true; };
  }, [activeSiteId]);

  const allTabs = useMemo(() => {
    const tabs = [
      { label: 'Daily Harvest', component: 'daily' },
      { label: 'Summary', component: 'summary' },
      { label: 'Daily/Weekly', component: 'weekly' },
    ];
    if (pivotFields.length > 0) {
      tabs.push({ label: 'Alfalfa', pivotFields, pivotCrop: 'alfalfa' });
      tabs.push({ label: 'Rhodes', pivotFields, pivotCrop: 'rhodes' });
    }
    if (openFields.length > 0) {
      tabs.push({ label: 'Open Field', openFields });
    }
    otherFields.forEach(f => tabs.push({ label: f.name, field: f }));
    return tabs;
  }, [pivotFields, openFields, otherFields]);

  const selectFieldTab = useCallback((fieldId) => {
    if (!fieldId) return;
    const fieldIdx = allTabs.findIndex((t) => t.field && t.field.id === fieldId);
    if (fieldIdx >= 0) {
      setActiveTab(fieldIdx);
      return;
    }
    if (openFields.some((f) => f.id === fieldId)) {
      const openIdx = allTabs.findIndex((t) => t.openFields);
      if (openIdx >= 0) setActiveTab(openIdx);
      return;
    }
    if (pivotFields.some((f) => f.id === fieldId)) {
      const pivotIdx = allTabs.findIndex((t) => t.pivotFields);
      if (pivotIdx >= 0) setActiveTab(pivotIdx);
    }
  }, [allTabs, openFields, pivotFields]);

  useEffect(() => {
    if (didAutoSelect.current) return;
    const urlFieldId = searchParams.get('fieldId');
    if (!urlFieldId || allTabs.length <= 3) return;
    const idx = allTabs.findIndex(t => t.field && t.field.id === urlFieldId);
    if (idx >= 0) {
      setActiveTab(idx);
      didAutoSelect.current = true;
    }
  }, [allTabs, searchParams]);

  const safeTab = activeTab < allTabs.length ? activeTab : 0;
  const currentTab = allTabs[safeTab];

  const importerFields = useMemo(() => {
    if (currentTab?.pivotFields?.length) return currentTab.pivotFields;
    if (currentTab?.openFields?.length) return currentTab.openFields;
    if (currentTab?.field) return [currentTab.field];
    return siteFields;
  }, [currentTab, siteFields]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: pageHeight, fontFamily: FONT }}>
      {/* Spreadsheet content area */}
      <Box sx={{ flex: 1, overflow: 'auto', backgroundColor: 'var(--sheet-bg, #fff)', p: '12px 16px' }}>
        {readOnly && <Box sx={{ mb: 2 }}><ReadOnlyBanner /></Box>}
        <HarvestEntryToolbar
          farmAreas={farmAreas}
          farmAreaId={filterFarmAreaId}
          onFarmAreaChange={handleFarmAreaChange}
          fields={fieldOptions}
          fieldId={filterFieldId}
          onFieldChange={handleFieldChange}
          crops={crops}
          cropName={filterCropName}
          onCropChange={setFilterCropName}
          varieties={varietyOptions}
          variety={filterVariety}
          onVarietyChange={setFilterVariety}
          dateFrom={dateFrom}
          dateTo={dateTo}
          onDateFromChange={handleDateFromChange}
          onDateToChange={handleDateToChange}
          onExport={handleExport}
        />
        {currentTab?.component === 'daily' ? (
          <DailyWorksheetTab siteId={activeSiteId} key={`dw-${refreshKey}`} />
        ) : currentTab?.component === 'summary' ? (
          <SummaryTab siteId={activeSiteId} key={`sm-${refreshKey}`} />
        ) : currentTab?.component === 'weekly' ? (
          <WeeklySummaryTab siteId={activeSiteId} key={`ws-${refreshKey}`} />
        ) : currentTab?.pivotFields ? (
          <PivotHarvestTab
            key={`pv-${currentTab.pivotCrop}-${refreshKey}`}
            fields={currentTab.pivotFields}
            siteId={activeSiteId}
            crop={currentTab.pivotCrop}
            onRefresh={handleRefresh}
            readOnly={readOnly}
            dateFrom={dateFrom}
            dateTo={dateTo}
            farmAreaId={filterFarmAreaId}
            filterFieldId={filterFieldId}
          />
        ) : currentTab?.openFields ? (
          <OpenFieldTab
            key={`of-${refreshKey}`}
            fields={currentTab.openFields}
            siteId={activeSiteId}
            crops={crops}
            onRefresh={handleRefresh}
            readOnly={readOnly}
            dateFrom={dateFrom}
            dateTo={dateTo}
            cropFilter={filterCropName}
            varietyFilter={filterVariety}
            farmAreaId={filterFarmAreaId}
            filterFieldId={filterFieldId}
          />
        ) : currentTab?.field ? (
          <FieldTab
            key={currentTab.field.id}
            field={currentTab.field}
            siteId={activeSiteId}
            crops={crops}
            cropHistory={cropHistory}
            plantingRecords={plantingRecords}
            onRefresh={handleRefresh}
            readOnly={readOnly}
            dateFrom={dateFrom}
            dateTo={dateTo}
            cropFilter={filterCropName}
            varietyFilter={filterVariety}
            farmAreaId={filterFarmAreaId}
            filterFieldId={filterFieldId}
          />
        ) : null}
                      </Box>

      {/* Excel-style bottom tab bar */}
      <Box sx={{
        borderTop: '1px solid var(--sheet-border, #B0B0B0)',
        backgroundColor: 'var(--sheet-muted, #E0E0E0)',
        minHeight: 28,
        display: 'flex',
        alignItems: 'flex-end',
        px: '2px',
        pt: '2px',
        flexShrink: 0,
      }}>
        {!readOnly && (
        <Button size="small" startIcon={<FileUpload sx={{ fontSize: '13px !important' }} />}
          onClick={() => setImporterOpen(true)}
          sx={{ fontFamily: FONT, fontSize: '10px', textTransform: 'none', minHeight: 24, height: 24, px: '8px', mr: 1, borderRadius: 1, color: HEADER_FILL, border: '1px solid var(--sheet-border, #B0B0B0)', backgroundColor: 'var(--sheet-bg, #fff)' }}>
          Import Excel
        </Button>
        )}
        <Tabs
          value={safeTab}
          onChange={(_, v) => setActiveTab(v)}
          variant="scrollable"
          scrollButtons="auto"
                                sx={{
            minHeight: 26,
            '& .MuiTabs-indicator': { display: 'none' },
            '& .MuiTabs-flexContainer': { alignItems: 'flex-end' },
            '& .MuiTab-root': {
              textTransform: 'none',
              fontFamily: FONT,
              fontWeight: 500,
              fontSize: '11px',
              minHeight: 24,
              height: 24,
              py: 0,
              px: '10px',
              mr: '1px',
              borderTopLeftRadius: 3,
              borderTopRightRadius: 3,
              border: '1px solid var(--sheet-border, #B0B0B0)',
              borderBottom: 'none',
              backgroundColor: 'var(--sheet-select, #D6D6D6)',
              color: 'var(--sheet-ink, #333)',
              transition: 'none',
            },
            '& .Mui-selected': {
              backgroundColor: 'var(--sheet-bg, #fff) !important',
              color: 'var(--sheet-ink, #000) !important',
              fontWeight: 700,
              borderTop: `2px solid ${HEADER_FILL}`,
              zIndex: 1,
                                  },
                                }}
                              >
          {allTabs.map((tab, i) => (
            <Tab key={i} label={tab.label} />
          ))}
        </Tabs>
                    </Box>

      <HarvestImporter
        open={importerOpen}
        onClose={() => setImporterOpen(false)}
        fields={importerFields}
        onImportComplete={() => handleRefresh()}
      />
                    </Box>
  );
}

export default HarvestEntry;
