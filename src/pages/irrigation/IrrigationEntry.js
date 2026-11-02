import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Box, Tabs, Tab, Table, TableHead, TableBody, TableRow, TableCell, TableContainer,
  Button, MenuItem, Typography, IconButton, Select, Dialog, DialogTitle,
  DialogContent, DialogActions, CircularProgress, TextField, Alert,
} from '@mui/material';
import { AddOutlined as Add, DeleteOutlined as Delete, CheckOutlined as Check, FileUploadOutlined as FileUpload } from '@mui/icons-material';
import { useActiveSite } from '../../contexts/ActiveSiteContext';
import useSeasonListDates from '../../hooks/useSeasonListDates';
import { useNotification } from '../../contexts/NotificationContext';
import {
  listIrrigationSheets,
  createIrrigationSheet,
  getIrrigationSummary,
  listIrrigationRecords,
  createIrrigationRecord,
  deleteIrrigationRecord,
} from '../../utils/backendApi';
import IrrigationImporter from '../../components/IrrigationImporter';
import IrrigationStructurePlaceholder from '../../components/irrigation/IrrigationStructurePlaceholder';
import Rc108IrrigationGrid from './Rc108IrrigationGrid';
import { IRRIGATION_STRUCTURES } from '../../utils/fieldTypeHelpers';
import { useActiveSiteStructures } from '../../hooks/useActiveSiteStructures';
import useAppLayout from '../../hooks/useAppLayout';
import useReadOnlyMode from '../../hooks/useReadOnlyMode';
import { DeleteSelectedButton, RowSelectCell, SelectAllCheckbox, deleteIdsSequentially } from '../../components/table/BulkSelect';
import { useRowSelection } from '../../hooks/useRowSelection';
import ReadOnlyBanner from '../../components/ReadOnlyBanner';
import { PAGE_KEYS } from '../../utils/roleAccess';

const FONT = '"Calibri", "Segoe UI", Arial, sans-serif';
const IRR_BORDER = '1px solid var(--sheet-border, #000)';
const IRR_BLUE = 'var(--sheet-tint-blue, #DBEEF4)';
const IRR_PEACH = 'var(--sheet-tint-peach, #FDEADA)';
const IRR_INFO = 'var(--sheet-tint-lavender, #E6E0EC)';
const IRR_TOTAL = 'var(--sheet-tint-blue, #DCE6F2)';
const IRR_DOC = 'var(--sheet-tint-blue, #E1F0FF)';
const SUMMARY_MULT = 220;

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function irrHdr(bg, extra = {}) {
  return {
    backgroundColor: `${bg} !important`,
    color: 'var(--sheet-ink, #000) !important',
    fontFamily: FONT,
    fontWeight: 700,
    fontSize: '10px',
    textAlign: 'center',
    textTransform: 'none',
    border: IRR_BORDER,
    whiteSpace: 'pre-line',
    py: '4px',
    px: '4px',
    lineHeight: 1.15,
    verticalAlign: 'middle',
    ...extra,
  };
}

const irrDCell = {
  fontFamily: FONT,
  fontSize: '11px',
  border: IRR_BORDER,
  py: '3px',
  px: '4px',
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

function parsePivotDateInput(str) {
  if (!str || !str.trim()) return undefined;
  const s = str.trim();
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmy) {
    const y = dmy[3].length === 2 ? 2000 + parseInt(dmy[3], 10) : parseInt(dmy[3], 10);
    return `${y}-${String(dmy[2]).padStart(2, '0')}-${String(dmy[1]).padStart(2, '0')}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return undefined;
}

function pivotDateDisplay(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return isoStr;
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function formatNum(n, decimals = 0) {
  if (n == null || n === '') return '';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function computeVolume(flow, duration) {
  const f = parseFloat(flow);
  const d = parseFloat(duration);
  if (!Number.isFinite(f) || !Number.isFinite(d)) return '';
  return f * d;
}

function buildMonthDisplayRows(records) {
  const sorted = [...records].sort((a, b) => {
    const dateCmp = (a.date || '').localeCompare(b.date || '');
    if (dateCmp !== 0) return dateCmp;
    return (a.fieldName || '').localeCompare(b.fieldName || '', undefined, { numeric: true });
  });

  const displayRows = [];
  let currentDate = null;
  let dayVolume = 0;

  const flushDayTotal = (date) => {
    if (!date) return;
    displayRows.push({
      type: 'dayTotal',
      date,
      volumeM3: dayVolume,
      displayK: dayVolume * SUMMARY_MULT,
    });
    dayVolume = 0;
  };

  for (const r of sorted) {
    if (r.date !== currentDate) {
      if (currentDate != null) flushDayTotal(currentDate);
      currentDate = r.date;
    }
    displayRows.push({ type: 'record', data: r });
    dayVolume += r.volumeM3 || 0;
  }
  if (currentDate != null) flushDayTotal(currentDate);

  return displayRows;
}

const IRR_COLS = [
  { key: 'date', label: 'Date (ddmmyyyy)', bg: IRR_BLUE, width: 143 },
  { key: 'field', label: 'Field ID (Pivot, NG/GH)', bg: IRR_BLUE, width: 132 },
  { key: 'segment', label: ' Segment ID (Section)', bg: IRR_BLUE, width: 121 },
  { key: 'area', label: 'Total Area (In Ha)', bg: IRR_BLUE, width: 127 },
  { key: 'crop', label: 'Crop', bg: IRR_BLUE, width: 129 },
  { key: 'volume', label: 'Volume (per Water meter or irrigation unit)', bg: IRR_PEACH, width: 170 },
  { key: 'flow', label: 'Flow Rate\n(m3/hr)', bg: IRR_PEACH, width: 132 },
  { key: 'cycle', label: 'Cycle Duration ', bg: IRR_PEACH, width: 144 },
  { key: 'auth', label: 'Authorized and Verified By', bg: IRR_BLUE, width: 198 },
  { key: 'total220', label: '', bg: IRR_BLUE, width: 100 },
];

function IrrigationSummaryTab({ siteId, siteName, year }) {
  const [data, setData] = useState({ fields: [], cells: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getIrrigationSummary(siteId, year)
      .then(setData)
      .catch(() => setData({ fields: [], cells: [] }))
      .finally(() => setLoading(false));
  }, [siteId, year]);

  const cellMap = useMemo(() => {
    const m = new Map();
    for (const c of data.cells || []) {
      m.set(`${c.fieldId}:${c.month}`, c);
    }
    return m;
  }, [data.cells]);

  return (
    <Box sx={{ fontFamily: FONT }}>
      <Typography sx={{ fontFamily: FONT, fontWeight: 700, fontSize: '14px' }}>Elite Agro Management LLC</Typography>
      <Typography sx={{ fontFamily: FONT, fontWeight: 700, fontSize: '12px', mb: 1 }}>
        {siteName || 'Site'} Irrigation Water {year}
      </Typography>
      <Typography sx={{ fontFamily: FONT, fontWeight: 700, fontSize: '11px', mb: 1 }}>
        Daily Irrigation Record for {siteName || 'Site'} - {year}
      </Typography>
      <TableContainer sx={{ border: IRR_BORDER, overflowX: 'auto', borderRadius: 0 }}>
        <Table size="small" sx={{ borderCollapse: 'collapse', minWidth: 900 }}>
          <TableHead>
            <TableRow>
              <TableCell sx={irrHdr(IRR_BLUE, { width: 66 })}>Date</TableCell>
              {MONTH_LABELS.map((m) => (
                <TableCell key={m} sx={irrHdr(IRR_BLUE, { width: 86 })}>{m}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={13} align="center"><CircularProgress size={18} /></TableCell>
              </TableRow>
            ) : data.fields.length === 0 ? (
              <TableRow>
                <TableCell colSpan={13} sx={irrDCell}>No pivot fields — add month sheets and records</TableCell>
              </TableRow>
            ) : (
              data.fields.map((f, idx) => (
                <TableRow key={f.id}>
                  <TableCell sx={irrDCell}>{idx + 1}</TableCell>
                  {MONTH_LABELS.map((_, mi) => {
                    const cell = cellMap.get(`${f.id}:${mi + 1}`);
                    return (
                      <TableCell key={mi} sx={irrDCell}>
                        {cell?.displayValue ? formatNum(cell.displayValue) : ''}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
      <Typography sx={{ fontFamily: FONT, fontSize: '9px', color: 'var(--sheet-ink-2, #555)', mt: 1 }}>
        Summary values = monthly volume (m³) × {SUMMARY_MULT}
      </Typography>
    </Box>
  );
}

function PivotIrrigationMonthTab({ sheet, pivotFields, farmName, onRefresh, readOnly = false }) {
  const notify = useNotification();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newRow, setNewRow] = useState(null);
  const selection = useRowSelection();

  const monthLabel = MONTH_FULL[sheet.month - 1] || MONTH_LABELS[sheet.month - 1];
  const tableMinWidth = IRR_COLS.reduce((s, c) => s + c.width, 0) + 24;

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listIrrigationRecords(sheet.id);
      setRecords(data || []);
    } catch {
      setRecords([]);
    }
    setLoading(false);
  }, [sheet.id]);

  useEffect(() => { loadRecords(); }, [loadRecords]);

  const displayRows = useMemo(() => buildMonthDisplayRows(records), [records]);
  const totalVolume = records.reduce((s, r) => s + (r.volumeM3 || 0), 0);
  const totalDisplay = totalVolume * SUMMARY_MULT;

  const handleAddRow = () => {
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    setNewRow({
      fieldId: pivotFields[0]?.id || '',
      date: `${dd}/${mm}/${today.getFullYear()}`,
      segmentId: 'LS, RS',
      areaHa: '',
      crop: 'Rhodes',
      flowRate: '',
      cycleDuration: '',
      authorizedBy: '',
    });
  };

  const handleSaveRow = async () => {
    if (readOnly) return;
    const parsedDate = parsePivotDateInput(newRow.date);
    if (!parsedDate || !newRow.fieldId) {
      notify.error('Date (dd/mm/yyyy) and field are required');
      return;
    }
    try {
      await createIrrigationRecord({
        monthSheetId: sheet.id,
        fieldId: newRow.fieldId,
        date: parsedDate,
        segmentId: newRow.segmentId || undefined,
        areaHa: newRow.areaHa ? parseFloat(newRow.areaHa) : undefined,
        crop: newRow.crop || undefined,
        flowRateM3Hr: newRow.flowRate ? parseFloat(newRow.flowRate) : undefined,
        cycleDurationHr: newRow.cycleDuration ? parseFloat(newRow.cycleDuration) : undefined,
        authorizedBy: newRow.authorizedBy || undefined,
      });
      notify.success('Saved');
      setNewRow(null);
      loadRecords();
      if (onRefresh) onRefresh();
    } catch (err) {
      notify.error(err.message || 'Failed to save');
    }
  };

  const handleDeleteRow = async (id) => {
    try {
      await deleteIrrigationRecord(id);
      loadRecords();
      if (onRefresh) onRefresh();
    } catch (err) {
      notify.error(err.message || 'Failed to delete');
    }
  };

  const handleBulkDelete = async () => {
    const ids = [...selection.selectedIds];
    if (!ids.length) return;
    if (!window.confirm(`Delete ${ids.length} irrigation ${ids.length === 1 ? 'record' : 'records'}?`)) return;
    const deleted = await deleteIdsSequentially(ids, deleteIrrigationRecord);
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
      <Box sx={{ border: IRR_BORDER, backgroundColor: 'var(--sheet-bg, #fff)' }}>
        <Box sx={{ display: 'flex', minHeight: 64 }}>
          <Box sx={{ width: 120, borderRight: IRR_BORDER }} />
          <Box sx={{ flex: 1, borderRight: IRR_BORDER, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 1 }}>
            <Typography sx={{ fontFamily: FONT, fontWeight: 700, fontSize: '13px' }}>
              Elite Agriculture Management L.L.C
            </Typography>
            <Typography sx={{ fontFamily: FONT, fontWeight: 700, fontSize: '12px' }}>
              IRRIGATION RECORD
            </Typography>
          </Box>
          <Box sx={{ width: 200, display: 'flex', flexDirection: 'column' }}>
            {[
              ['Document No:', 'EAG/OPR/SQM/RC-133'],
              ['Issue Number', '01'],
              ['Issue Date', '01/09/2016'],
              ['Revision Number', '00'],
              ['Revision Date', 'NA'],
            ].map(([label, val], i, arr) => (
              <Box key={label} sx={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 1,
                borderBottom: i < arr.length - 1 ? IRR_BORDER : 'none',
                backgroundColor: IRR_DOC, fontSize: '9px', fontFamily: FONT,
              }}>
                <span>{label}</span>
                <span style={{ fontWeight: 600 }}>{val}</span>
              </Box>
            ))}
          </Box>
        </Box>
      </Box>

      <TableContainer sx={{ border: IRR_BORDER, borderTop: 'none', overflowX: 'auto', borderRadius: 0 }}>
        <Table size="small" sx={{ borderCollapse: 'collapse', minWidth: tableMinWidth, tableLayout: 'fixed' }}>
          <TableHead>
            <TableRow>
              <TableCell rowSpan={2} sx={irrHdr(IRR_BLUE, { width: 36, p: 0 })}>
                <SelectAllCheckbox
                  ids={records.map((r) => r.id)}
                  selectedIds={selection.selectedIds}
                  onToggleAll={selection.toggleAll}
                  label="Select all irrigation rows"
                />
              </TableCell>
              <TableCell colSpan={2} sx={irrHdr(IRR_INFO, { textAlign: 'left' })}>Farm Name</TableCell>
              <TableCell colSpan={3} sx={{ ...irrDCell, fontWeight: 600 }}>{farmName || '—'}</TableCell>
              <TableCell colSpan={2} sx={irrHdr(IRR_INFO)}>Month and Year</TableCell>
              <TableCell colSpan={3} sx={{ ...irrDCell, fontWeight: 600 }}>{monthLabel} {sheet.year}</TableCell>
              <TableCell sx={irrHdr(IRR_BLUE, { width: 24, p: 0 })} />
            </TableRow>
            <TableRow>
              {IRR_COLS.map((col) => (
                <TableCell key={col.key} sx={irrHdr(col.bg, { width: col.width, minWidth: col.width })}>
                  {col.label}
                </TableCell>
              ))}
              <TableCell sx={irrHdr(IRR_BLUE, { width: 24, p: 0 })} />
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={12} align="center"><CircularProgress size={18} /></TableCell></TableRow>
            ) : (
              <>
                {displayRows.map((row, idx) => {
                  if (row.type === 'dayTotal') {
                    return (
                      <TableRow key={`day-total-${row.date}-${idx}`}>
                        <TableCell sx={{ ...irrDCell, backgroundColor: IRR_TOTAL }} />
                        <TableCell sx={{ ...irrDCell, backgroundColor: IRR_TOTAL }} />
                        <TableCell sx={{ ...irrDCell, backgroundColor: IRR_TOTAL, fontWeight: 700 }}>TOTAL</TableCell>
                        <TableCell colSpan={3} sx={{ ...irrDCell, backgroundColor: IRR_TOTAL }} />
                        <TableCell sx={{ ...irrDCell, backgroundColor: IRR_TOTAL, fontWeight: 700 }}>
                          {formatNum(row.volumeM3, 0)}
                        </TableCell>
                        <TableCell colSpan={2} sx={{ ...irrDCell, backgroundColor: IRR_TOTAL }} />
                        <TableCell sx={{ ...irrDCell, backgroundColor: IRR_TOTAL }} />
                        <TableCell sx={{ ...irrDCell, backgroundColor: IRR_TOTAL, fontWeight: 700 }}>
                          {formatNum(row.displayK)}
                        </TableCell>
                        <TableCell sx={{ ...irrDCell, backgroundColor: IRR_TOTAL }} />
                      </TableRow>
                    );
                  }
                  const r = row.data;
                  return (
                  <TableRow key={r.id} selected={selection.selectedIds.has(r.id)}>
                    <RowSelectCell
                      id={r.id}
                      selectedIds={selection.selectedIds}
                      onToggle={selection.toggle}
                      label={`Select irrigation ${r.id}`}
                    />
                    <TableCell sx={irrDCell}>{pivotDateDisplay(r.date)}</TableCell>
                    <TableCell sx={irrDCell}>{r.fieldName || ''}</TableCell>
                    <TableCell sx={irrDCell}>{r.segmentId || ''}</TableCell>
                    <TableCell sx={irrDCell}>{r.areaHa ?? ''}</TableCell>
                    <TableCell sx={irrDCell}>{r.crop || ''}</TableCell>
                    <TableCell sx={{ ...irrDCell, backgroundColor: IRR_PEACH }}>{formatNum(r.volumeM3, 0)}</TableCell>
                    <TableCell sx={{ ...irrDCell, backgroundColor: IRR_PEACH }}>{r.flowRateM3Hr ?? ''}</TableCell>
                    <TableCell sx={{ ...irrDCell, backgroundColor: IRR_PEACH }}>{r.cycleDurationHr ?? ''}</TableCell>
                    <TableCell sx={irrDCell}>{r.authorizedBy || ''}</TableCell>
                    <TableCell sx={irrDCell} />
                    <TableCell sx={{ ...irrDCell, p: 0 }}>
                      <IconButton size="small" onClick={() => handleDeleteRow(r.id)} sx={{ p: '2px' }} aria-label="Delete">
                        <Delete sx={{ fontSize: 14, color: 'var(--sheet-danger, #C62828)' }} />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                  );
                })}
                {newRow && (
                  <TableRow sx={{ backgroundColor: 'var(--sheet-alt, #FAFAFA)' }}>
                    <TableCell sx={irrDCell} />
                    <TableCell sx={{ ...irrDCell, p: 0 }}>
                      <input value={newRow.date} placeholder="dd/mm/yyyy" onChange={e => setNewRow(p => ({ ...p, date: e.target.value }))} style={inputSx} />
                    </TableCell>
                    <TableCell sx={{ ...irrDCell, p: 0 }}>
                      <Select size="small" value={newRow.fieldId} sx={selectSx}
                        onChange={e => setNewRow(p => ({ ...p, fieldId: e.target.value }))}>
                        {pivotFields.map(f => <MenuItem key={f.id} value={f.id} sx={{ fontSize: '11px' }}>{f.name}</MenuItem>)}
                      </Select>
                    </TableCell>
                    <TableCell sx={{ ...irrDCell, p: 0 }}>
                      <Select size="small" value={newRow.segmentId} sx={selectSx}
                        onChange={e => setNewRow(p => ({ ...p, segmentId: e.target.value }))}>
                        <MenuItem value="LS" sx={{ fontSize: '11px' }}>LS</MenuItem>
                        <MenuItem value="RS" sx={{ fontSize: '11px' }}>RS</MenuItem>
                        <MenuItem value="LS, RS" sx={{ fontSize: '11px' }}>LS, RS</MenuItem>
                      </Select>
                    </TableCell>
                    <TableCell sx={{ ...irrDCell, p: 0 }}>
                      <input value={newRow.areaHa} onChange={e => setNewRow(p => ({ ...p, areaHa: e.target.value }))} style={inputSx} />
                    </TableCell>
                    <TableCell sx={{ ...irrDCell, p: 0 }}>
                      <Select size="small" value={newRow.crop} sx={selectSx}
                        onChange={e => setNewRow(p => ({ ...p, crop: e.target.value }))}>
                        {['Alfalfa', 'Rhodes', 'Alfalfa/Rhodes'].map(c => (
                          <MenuItem key={c} value={c} sx={{ fontSize: '11px' }}>{c}</MenuItem>
                        ))}
                      </Select>
                    </TableCell>
                    <TableCell sx={{ ...irrDCell, backgroundColor: IRR_PEACH, fontWeight: 600 }}>
                      {formatNum(computeVolume(newRow.flowRate, newRow.cycleDuration), 0)}
                    </TableCell>
                    <TableCell sx={{ ...irrDCell, p: 0, backgroundColor: IRR_PEACH }}>
                      <input value={newRow.flowRate} onChange={e => setNewRow(p => ({ ...p, flowRate: e.target.value }))} style={inputSx} />
                    </TableCell>
                    <TableCell sx={{ ...irrDCell, p: 0, backgroundColor: IRR_PEACH }}>
                      <input value={newRow.cycleDuration} onChange={e => setNewRow(p => ({ ...p, cycleDuration: e.target.value }))} style={inputSx} />
                    </TableCell>
                    <TableCell sx={{ ...irrDCell, p: 0 }}>
                      <input value={newRow.authorizedBy} onChange={e => setNewRow(p => ({ ...p, authorizedBy: e.target.value }))} style={inputSx} />
                    </TableCell>
                    <TableCell sx={irrDCell} />
                    <TableCell sx={{ ...irrDCell, p: 0 }}>
                      <IconButton size="small" onClick={handleSaveRow} sx={{ p: '2px' }} aria-label="Confirm">
                        <Check sx={{ fontSize: 14, color: 'var(--sheet-accent, #1f7a4d)' }} />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                )}
                <TableRow>
                  <TableCell sx={{ ...irrDCell, backgroundColor: IRR_TOTAL, fontWeight: 700 }}>TOTAL</TableCell>
                  <TableCell colSpan={4} sx={{ ...irrDCell, backgroundColor: IRR_TOTAL }} />
                  <TableCell sx={{ ...irrDCell, backgroundColor: IRR_TOTAL, fontWeight: 700 }}>
                    {formatNum(totalVolume, 0)}
                  </TableCell>
                  <TableCell colSpan={2} sx={{ ...irrDCell, backgroundColor: IRR_TOTAL }} />
                  <TableCell sx={{ ...irrDCell, backgroundColor: IRR_TOTAL }} />
                  <TableCell sx={{ ...irrDCell, backgroundColor: IRR_TOTAL, fontWeight: 700 }}>
                    {formatNum(totalDisplay)}
                  </TableCell>
                  <TableCell sx={{ ...irrDCell, backgroundColor: IRR_TOTAL }} />
                </TableRow>
              </>
            )}
          </TableBody>
        </Table>
      </TableContainer>
      <Box sx={{ mt: 1, display: 'flex', justifyContent: 'flex-end' }}>
        <Button size="small" variant="outlined" startIcon={<Add sx={{ fontSize: 14 }} />}
          onClick={handleAddRow} disabled={!!newRow || pivotFields.length === 0}
          sx={{ fontFamily: FONT, fontSize: '11px', textTransform: 'none', borderColor: 'var(--sheet-border, #000)', color: 'var(--sheet-ink, #000)' }}>
          Add Row
        </Button>
      </Box>
    </Box>
  );
}

export default function IrrigationEntry() {
  const readOnly = useReadOnlyMode(PAGE_KEYS.DATA_ENTRY);
  const { activeSiteId, activeSite } = useActiveSite();
  const notify = useNotification();
  const { scrollRegionHeight } = useAppLayout();
  const pageHeight = scrollRegionHeight(0);
  const {
    groupedFields: fieldsByStructure,
    availableStructureTabs,
    defaultStructureId,
  } = useActiveSiteStructures();
  const { seasonStart, seasonEnd, isReady: seasonDatesReady } = useSeasonListDates();
  const [year, setYear] = useState(new Date().getFullYear());
  const [importDateRange, setImportDateRange] = useState(null);
  const [sheets, setSheets] = useState([]);
  const [activeTab, setActiveTab] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [importerOpen, setImporterOpen] = useState(false);
  const [newMonth, setNewMonth] = useState(new Date().getMonth() + 1);
  const [activeStructure, setActiveStructure] = useState(null);

  useEffect(() => {
    if (!seasonDatesReady || !seasonStart) {
      setImportDateRange(null);
      return;
    }
    setYear(Number(seasonStart.slice(0, 4)));
    setImportDateRange({ start: seasonStart, end: seasonEnd });
  }, [activeSiteId, seasonDatesReady, seasonStart, seasonEnd]);

  useEffect(() => {
    if (!defaultStructureId) {
      setActiveStructure(null);
      return;
    }
    setActiveStructure((prev) => {
      if (prev && availableStructureTabs.some((tab) => tab.id === prev)) return prev;
      return defaultStructureId;
    });
  }, [defaultStructureId, availableStructureTabs]);

  const resolvedStructure = activeStructure ?? defaultStructureId ?? null;
  const structureTabValue =
    resolvedStructure && availableStructureTabs.some((tab) => tab.id === resolvedStructure)
      ? resolvedStructure
      : false;

  const pivotFields = fieldsByStructure.pivot;
  const isPivot = resolvedStructure === 'pivot';
  const isRc108 = resolvedStructure === 'nethouse'
    || resolvedStructure === 'greenhouse'
    || resolvedStructure === 'openfield';

  const placeholderFields = useMemo(() => {
    switch (resolvedStructure) {
      case 'nethouse': return fieldsByStructure.nethouse;
      case 'greenhouse': return fieldsByStructure.greenhouse;
      case 'openfield': return fieldsByStructure.openField;
      default: return [];
    }
  }, [resolvedStructure, fieldsByStructure]);

  const activeStructureLabel = IRRIGATION_STRUCTURES.find(s => s.id === resolvedStructure)?.label || '';

  const farmName = activeSite?.name || '';

  const loadSheets = useCallback(async () => {
    if (!activeSiteId) return;
    try {
      const data = await listIrrigationSheets(activeSiteId, year);
      setSheets(data || []);
    } catch {
      setSheets([]);
    }
  }, [activeSiteId, year]);

  useEffect(() => { loadSheets(); }, [loadSheets, refreshKey]);

  const allTabs = useMemo(() => {
    const tabs = [{ label: 'Summary', type: 'summary' }];
    const sorted = [...sheets].sort((a, b) => a.month - b.month);
    sorted.forEach(s => {
      tabs.push({
        label: MONTH_LABELS[s.month - 1] || String(s.month),
        type: 'month',
        sheet: s,
      });
    });
    return tabs;
  }, [sheets]);

  const handleRefresh = useCallback(() => setRefreshKey(k => k + 1), []);

  const handleCreateMonth = async () => {
    if (readOnly) return;
    if (!activeSiteId) return;
    try {
      await createIrrigationSheet({
        siteId: activeSiteId,
        year,
        month: newMonth,
        farmName,
      });
      notify.success(`${MONTH_LABELS[newMonth - 1]} ${year} sheet created`);
      setAddOpen(false);
      const data = await listIrrigationSheets(activeSiteId, year);
      setSheets(data || []);
      const idx = 1 + (data || []).sort((a, b) => a.month - b.month).findIndex(s => s.month === newMonth);
      setActiveTab(idx >= 1 ? idx : 0);
      handleRefresh();
    } catch (err) {
      notify.error(err.message || 'Failed to create month sheet');
    }
  };

  const safeTab = activeTab < allTabs.length ? activeTab : 0;
  const currentTab = allTabs[safeTab];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: pageHeight, fontFamily: FONT }}>
      <Box sx={{ px: 2, py: 1, borderBottom: '1px solid var(--sheet-grid, #ddd)' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
          <Typography sx={{ fontFamily: FONT, fontWeight: 600, fontSize: '13px' }}>Year</Typography>
          <TextField size="small" type="number" value={year} inputProps={{ 'aria-label': 'Year' }} onChange={e => {
            setYear(parseInt(e.target.value, 10) || year);
            setImportDateRange(null);
          }}
            sx={{ width: 90, '& input': { fontFamily: FONT, fontSize: '12px', py: 0.5 } }} />
        </Box>
        <Tabs
          value={structureTabValue}
          onChange={(_, v) => { setActiveStructure(v); setActiveTab(0); }}
          sx={{
            minHeight: 32,
            '& .MuiTab-root': {
              fontFamily: FONT,
              fontSize: '11px',
              textTransform: 'none',
              minHeight: 32,
              py: 0,
            },
            '& .Mui-selected': { fontWeight: 700, color: 'var(--sheet-accent, #165c3a) !important' },
          }}
        >
          {availableStructureTabs.map((s) => (
            <Tab key={s.id} value={s.id} label={s.label} />
          ))}
        </Tabs>
      </Box>

      <Box sx={{ flex: 1, overflow: 'auto', backgroundColor: 'var(--sheet-bg, #fff)', p: '12px 16px' }}>
        {readOnly && <Box sx={{ mb: 2 }}><ReadOnlyBanner /></Box>}
        {availableStructureTabs.length === 0 ? (
          <Alert severity="info">
            No fields configured for this site. Add fields in Management to enable irrigation entry.
          </Alert>
        ) : isPivot ? (
          currentTab?.type === 'summary' ? (
          <IrrigationSummaryTab
            key={`sum-${refreshKey}`}
            siteId={activeSiteId}
            siteName={farmName}
            year={year}
          />
        ) : currentTab?.type === 'month' ? (
          <PivotIrrigationMonthTab
            key={currentTab.sheet.id}
            sheet={currentTab.sheet}
            pivotFields={pivotFields}
            farmName={farmName}
            onRefresh={handleRefresh}
            readOnly={readOnly}
          />
        ) : null
        ) : isRc108 ? (
          <Rc108IrrigationGrid
            key={resolvedStructure}
            siteId={activeSiteId}
            year={year}
            fields={placeholderFields}
            readOnly={readOnly}
            locationOrder={resolvedStructure === 'openfield' ? 'fields' : 'excel'}
            structureFields={{
              nethouse: fieldsByStructure.nethouse,
              greenhouse: fieldsByStructure.greenhouse,
              openfield: fieldsByStructure.openField,
            }}
            importDateRange={importDateRange}
            onImportDateRange={setImportDateRange}
          />
        ) : resolvedStructure ? (
          <IrrigationStructurePlaceholder
            structureLabel={activeStructureLabel}
            siteName={farmName}
            year={year}
            fields={placeholderFields}
          />
        ) : null}
      </Box>

      {isPivot && (
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
        <>
        <Button size="small" startIcon={<FileUpload sx={{ fontSize: '13px !important' }} />}
          onClick={() => setImporterOpen(true)}
          sx={{ fontFamily: FONT, fontSize: '10px', textTransform: 'none', minHeight: 24, height: 24, px: '8px', mr: 1, borderRadius: 1, color: 'var(--sheet-accent, #165c3a)', border: '1px solid var(--sheet-border, #B0B0B0)', backgroundColor: 'var(--sheet-bg, #fff)' }}>
          Import Excel
        </Button>
        <Button size="small" startIcon={<Add sx={{ fontSize: '13px !important' }} />}
          onClick={() => setAddOpen(true)}
          sx={{ fontFamily: FONT, fontSize: '10px', textTransform: 'none', minHeight: 24, height: 24, px: '8px', mr: 1, borderRadius: 1, color: 'var(--sheet-accent, #165c3a)', border: '1px solid var(--sheet-border, #B0B0B0)', backgroundColor: 'var(--sheet-bg, #fff)' }}>
          Add Month
        </Button>
        </>
        )}
        <Tabs
          value={safeTab}
          onChange={(_, v) => setActiveTab(v)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            minHeight: 26,
            '& .MuiTabs-indicator': { display: 'none' },
            '& .MuiTab-root': {
              fontFamily: FONT,
              fontSize: '10px',
              textTransform: 'none',
              minHeight: 24,
              height: 24,
              py: 0,
              px: '10px',
              border: '1px solid var(--sheet-border, #B0B0B0)',
              borderBottom: 'none',
              borderRadius: '3px 3px 0 0',
              mr: '2px',
              backgroundColor: 'var(--sheet-select, #D5D5D5)',
              color: 'var(--sheet-ink, #333)',
            },
            '& .Mui-selected': {
              backgroundColor: 'var(--sheet-bg, #fff) !important',
              fontWeight: 700,
              color: 'var(--sheet-accent, #165c3a) !important',
            },
          }}
        >
          {allTabs.map((t, i) => (
            <Tab key={t.label + i} label={t.label} />
          ))}
        </Tabs>
      </Box>
      )}

      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontFamily: FONT, fontSize: '14px' }}>Add Month Sheet</DialogTitle>
        <DialogContent>
          <TextField select fullWidth label="Month" value={newMonth} onChange={e => setNewMonth(parseInt(e.target.value, 10))}
            sx={{ mt: 1, fontFamily: FONT }} size="small">
            {MONTH_LABELS.map((m, i) => (
              <MenuItem key={m} value={i + 1}>{m} {year}</MenuItem>
            ))}
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreateMonth}>Create</Button>
        </DialogActions>
      </Dialog>

      <IrrigationImporter
        open={importerOpen}
        onClose={() => setImporterOpen(false)}
        siteId={activeSiteId}
        year={year}
        farmName={farmName}
        pivotFields={pivotFields}
        onImportComplete={() => handleRefresh()}
      />
    </Box>
  );
}
