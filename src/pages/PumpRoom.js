import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Typography, Paper, Button, TextField, IconButton,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Tabs, Tab, Dialog, DialogTitle, DialogContent, DialogActions,
  CircularProgress, Alert, Checkbox, FormControlLabel,
} from '@mui/material';
import {
  AddOutlined as Add, CloseOutlined as Close, DeleteOutlined as Delete, FileDownloadOutlined as FileDownload, FileUploadOutlined as FileUpload,
} from '@mui/icons-material';
import { apiRequest } from '../utils/api';
import { getFriendlyError } from '../utils/errorMessages';
import { useNotification } from '../contexts/NotificationContext';
import { useActiveSite } from '../contexts/ActiveSiteContext';
import { useAuth } from '../contexts/AuthContext';
import ReadOnlyBanner from '../components/ReadOnlyBanner';
import useAppLayout from '../hooks/useAppLayout';
import { excelTableSx, freezeColumnsSx, GutterCell, GUTTER_WIDTH } from '../components/table/ExcelTable';
import { DeleteSelectedButton, RowSelectCell, SelectAllHeadCell, deleteIdsSequentially } from '../components/table/BulkSelect';
import { useRowSelection } from '../hooks/useRowSelection';
import useOpsExcelExport from '../hooks/useOpsExcelExport';
import { OPS_EXPORT } from '../utils/companyExcelExport';
import { buildPumpExportSheets, pumpExportFilename } from '../utils/pumpRoomExcelExport';
import { computePumpTotals, parsePumpsFromRow, pumpCellUsage } from '../utils/pumpRoomMath';
import * as XLSX from 'xlsx';
import PageTitle from '../components/PageTitle';

const PUMP_FROZEN_WIDTHS = [160, 140, 110];

// Two header rows: Month banner on row 1, column names on row 2. excelTableSx
// parks every head cell at top: 0, which would stack them. Meter, Usage Area
// and Date stay visible once the pump columns have scrolled away.
const pumpTableSx = (theme) => ({
  '&& thead tr:first-of-type .MuiTableCell-head': { top: 0 },
  '&& thead tr:nth-of-type(2) .MuiTableCell-head': { top: 40 },
  '&&& .MuiTableBody-root .MuiTableRow-root.row-total .MuiTableCell-root': {
    backgroundColor: theme.palette.table.totalBg,
    color: theme.palette.table.totalText,
    fontWeight: 700,
  },
});

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const DEFAULT_CONFIG = {
  waterPumpCount: 2,
  electricityPumpCount: 2,
  foggerPumpCount: 2,
  waterPumpLabels: ['Pump 1', 'Pump 2'],
  electricityPumpLabels: ['Pump 1', 'Pump 2'],
  foggerPumpLabels: ['Pump 1', 'Pump 2'],
};

function getMonthLabel(dateStr) {
  const d = new Date(dateStr + '-01');
  return `${MONTH_NAMES[d.getMonth()]}-${String(d.getFullYear()).slice(2)}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

function toDateInputValue(dateStr) {
  if (!dateStr) return '';
  return dateStr.split('T')[0];
}

function getTodayDateStr() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function getNextMissingMonth(months) {
  if (months.length === 0) {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
  const sorted = [...months].sort();
  for (let i = 0; i < sorted.length - 1; i++) {
    const [y1, m1] = sorted[i].split('-').map(Number);
    const [y2, m2] = sorted[i + 1].split('-').map(Number);
    const d1 = new Date(y1, m1 - 1, 1);
    const d2 = new Date(y2, m2 - 1, 1);
    const expectedNext = new Date(d1);
    expectedNext.setMonth(expectedNext.getMonth() + 1);
    if (expectedNext.getTime() < d2.getTime()) {
      return `${expectedNext.getFullYear()}-${String(expectedNext.getMonth() + 1).padStart(2, '0')}`;
    }
  }
  const last = sorted[sorted.length - 1];
  const [y, m] = last.split('-').map(Number);
  const nd = new Date(y, m, 1);
  return `${nd.getFullYear()}-${String(nd.getMonth() + 1).padStart(2, '0')}`;
}

function getDefaultDateForMonth(activeMonth, records) {
  const todayStr = getTodayDateStr();
  if (activeMonth === todayStr.substring(0, 7)) return todayStr;
  if (records.length > 0) {
    const lastDate = records[records.length - 1].record_date?.split('T')[0];
    if (lastDate) {
      const next = new Date(lastDate + 'T12:00:00');
      next.setDate(next.getDate() + 1);
      const nextStr = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
      if (nextStr.startsWith(activeMonth)) return nextStr;
    }
  }
  return `${activeMonth}-01`;
}

function parseExcelDate(raw) {
  if (typeof raw === 'number') {
    const d = XLSX.SSF.parse_date_code(raw);
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  } else if (raw) return String(raw);
  return null;
}

function parseImportRows(rows) {
  const allRecords = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    let base = 0;
    if (typeof row[0] !== 'number' && typeof row[1] === 'number') base = 1;
    if (typeof row[base] !== 'number') continue;

    const meterId = String(row[base + 1] || '').trim();
    const usageArea = String(row[base + 2] || '').trim();
    const dateStr = parseExcelDate(row[base + 3]);
    if (!dateStr) continue;

    const pumps = [];
    const r1 = row[base + 4] ? Number(row[base + 4]) : null;
    const r2 = row[base + 7] ? Number(row[base + 7]) : null;
    if (r1 != null) pumps.push({ reading: r1, usage: row[base + 5] ? Number(row[base + 5]) : null });
    if (r2 != null) pumps.push({ reading: r2, usage: row[base + 8] ? Number(row[base + 8]) : null });

    allRecords.push({ recordDate: dateStr, meterId, usageArea, pumps });
  }
  return allRecords;
}

function usePumpUsageState(apiPrefix, siteId, notify) {
  const [months, setMonths] = useState([]);
  const [activeMonth, setActiveMonth] = useState(null);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const loadMonths = useCallback(async () => {
    try {
      const url = siteId ? `${apiPrefix}?site_id=${siteId}` : apiPrefix;
      const res = await apiRequest(url);
      const monthSet = new Set();
      (res || []).forEach((r) => {
        const d = r.record_date?.split('T')[0];
        if (d) monthSet.add(d.substring(0, 7));
      });
      const sorted = [...monthSet].sort();
      setMonths((prev) => [...new Set([...sorted, ...prev])].sort());
      setActiveMonth((prev) => prev || (sorted.length > 0 ? sorted[sorted.length - 1] : null));
    } catch (err) {
      notify.error(getFriendlyError(err));
    }
  }, [apiPrefix, siteId, notify]);

  const loadRecords = useCallback(async () => {
    if (!activeMonth) return;
    setLoading(true);
    try {
      let url = `${apiPrefix}?month=${activeMonth}`;
      if (siteId) url += `&site_id=${siteId}`;
      const res = await apiRequest(url);
      setRecords(res || []);
    } catch (err) {
      notify.error(getFriendlyError(err));
    } finally {
      setLoading(false);
    }
  }, [apiPrefix, activeMonth, siteId, notify]);

  useEffect(() => { loadMonths(); }, [loadMonths]);
  useEffect(() => { loadRecords(); }, [loadRecords]);

  const removeMonthTab = (month) => {
    setMonths((prev) => {
      const remaining = prev.filter((m) => m !== month);
      if (activeMonth === month) {
        setActiveMonth(remaining.length ? remaining[remaining.length - 1] : null);
      }
      return remaining;
    });
  };

  const handleAddMonth = () => {
    const nextMonth = getNextMissingMonth(months);
    if (!months.includes(nextMonth)) setMonths((prev) => [...prev, nextMonth].sort());
    setActiveMonth(nextMonth);
  };

  const handleDeleteSheetRequest = async (month) => {
    let count = 0;
    if (month === activeMonth) {
      count = records.length;
    } else {
      try {
        let url = `${apiPrefix}?month=${month}`;
        if (siteId) url += `&site_id=${siteId}`;
        const res = await apiRequest(url);
        count = res?.length || 0;
      } catch {
        notify.error('Failed to check sheet data');
        return;
      }
    }
    if (count === 0) {
      removeMonthTab(month);
      return;
    }
    setDeleteConfirm({ month, count });
  };

  const handleDeleteSheetConfirm = async () => {
    if (!deleteConfirm) return;
    const { month } = deleteConfirm;
    try {
      let url = `${apiPrefix}/sheet?month=${month}`;
      if (siteId) url += `&site_id=${siteId}`;
      await apiRequest(url, { method: 'DELETE' });
      notify.success(`Deleted ${getMonthLabel(month)} sheet`);
      removeMonthTab(month);
      setDeleteConfirm(null);
      loadMonths();
    } catch {
      notify.error('Failed to delete sheet');
    }
  };

  const handleAddRow = async () => {
    if (!activeMonth) return;
    const dateStr = getDefaultDateForMonth(activeMonth, records);
    let lastRecord = records.length > 0 ? records[records.length - 1] : null;
    if (!lastRecord) {
      try {
        let url = siteId ? `${apiPrefix}?site_id=${siteId}` : apiPrefix;
        const all = await apiRequest(url);
        if (all?.length) {
          lastRecord = [...all].sort((a, b) => new Date(a.record_date) - new Date(b.record_date)).pop();
        }
      } catch { /* ignore */ }
    }
    try {
      await apiRequest(apiPrefix, {
        method: 'POST',
        body: JSON.stringify({
          siteId: siteId || null,
          recordDate: dateStr,
          meterId: lastRecord?.meter_id || '',
          usageArea: lastRecord?.usage_area || '',
          pumps: [],
        }),
      });
      loadRecords();
      loadMonths();
    } catch {
      notify.error('Failed to add row');
    }
  };

  const handleCellSave = async (id, field, value) => {
    try {
      let body;
      if (field.startsWith('pumpReading')) {
        const pumpIndex = parseInt(field.replace('pumpReading', ''), 10);
        body = { pumpIndex, reading: value };
      } else {
        body = { [field]: value };
      }
      await apiRequest(`${apiPrefix}/${id}`, { method: 'PUT', body: JSON.stringify(body) });
      loadRecords();
    } catch {
      notify.error('Failed to save');
    }
  };

  const handleDeleteRow = async (id) => {
    try {
      await apiRequest(`${apiPrefix}/${id}`, { method: 'DELETE' });
      setRecords((prev) => prev.filter((r) => r.id !== id));
    } catch {
      notify.error('Failed to delete');
    }
  };

  const handleImport = async (importRecords) => {
    try {
      await apiRequest(`${apiPrefix}/bulk`, {
        method: 'POST',
        body: JSON.stringify({ siteId: siteId || null, records: importRecords }),
      });
      notify.success('Import successful');
      setImportOpen(false);
      loadMonths();
      loadRecords();
    } catch {
      notify.error('Import failed');
    }
  };

  return {
    months, activeMonth, setActiveMonth, records, loading, importOpen, setImportOpen,
    deleteConfirm, setDeleteConfirm, handleAddMonth, handleDeleteSheetRequest,
    handleDeleteSheetConfirm, handleAddRow, handleCellSave, handleDeleteRow, handleImport,
  };
}

export default function PumpRoom() {
  const notify = useNotification();
  const { user } = useAuth();
  const { activeSiteId } = useActiveSite();
  const [mainTab, setMainTab] = useState(0);
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const siteId = activeSiteId || '';
  // Only the data-entry worker records pump readings; everyone else views and exports.
  const canWrite = user?.role === 'worker';

  const elec = usePumpUsageState('/pump-room/electricity', siteId, notify);
  const water = usePumpUsageState('/pump-room/water', siteId, notify);
  const fogger = usePumpUsageState('/pump-room/fogger', siteId, notify);

  const loadConfig = useCallback(async () => {
    try {
      if (!siteId) {
        setConfig(DEFAULT_CONFIG);
        return;
      }
      const res = await apiRequest(`/pump-room/config?site_id=${siteId}`);
      setConfig(res || DEFAULT_CONFIG);
    } catch {
      setConfig(DEFAULT_CONFIG);
    }
  }, [siteId]);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  const handleAddPump = async (type) => {
    if (!canWrite) return;
    if (!siteId) {
      notify.error('Select a site first');
      return;
    }
    const countKey = type === 'water'
      ? 'waterPumpCount'
      : type === 'fogger'
        ? 'foggerPumpCount'
        : 'electricityPumpCount';
    const labelsKey = type === 'water'
      ? 'waterPumpLabels'
      : type === 'fogger'
        ? 'foggerPumpLabels'
        : 'electricityPumpLabels';
    const newCount = config[countKey] + 1;
    if (newCount > 10) {
      notify.error('Maximum 10 pumps');
      return;
    }
    const newLabels = [...(config[labelsKey] || []), `Pump ${newCount}`];
    try {
      await apiRequest('/pump-room/config', {
        method: 'PUT',
        body: JSON.stringify({
          siteId,
          waterPumpCount: type === 'water' ? newCount : config.waterPumpCount,
          electricityPumpCount: type === 'electricity' ? newCount : config.electricityPumpCount,
          foggerPumpCount: type === 'fogger' ? newCount : config.foggerPumpCount,
          waterPumpLabels: type === 'water' ? newLabels : config.waterPumpLabels,
          electricityPumpLabels: type === 'electricity' ? newLabels : config.electricityPumpLabels,
          foggerPumpLabels: type === 'fogger' ? newLabels : config.foggerPumpLabels,
        }),
      });
      notify.success(`Added ${newLabels[newLabels.length - 1]}`);
      loadConfig();
    } catch {
      notify.error('Failed to add pump');
    }
  };

  const activeState = mainTab === 0 ? elec : mainTab === 1 ? water : fogger;
  const deleteConfirm = activeState.deleteConfirm;

  return (
    <Box sx={{ width: '100%' }}>
      <PageTitle sx={{ mb: 1 }}>Pump Room</PageTitle>
      {!canWrite && (
        <ReadOnlyBanner message="View only — only the data-entry worker can edit the pump room." />
      )}

      <Paper sx={{ mb: 2 }}>
        <Tabs value={mainTab} onChange={(_, v) => setMainTab(v)}>
          <Tab label="Electricity Usage" />
          <Tab label="Water Usage" />
          <Tab label="Fogger Usage" />
        </Tabs>
      </Paper>

      {mainTab === 0 && (
        <PumpUsageTab
          title="ELECTRICITY USAGE RECORD"
          docRef="EAG/AFO/IMS/RC-109"
          usageUnit="KW"
          remarks="Accommodation & HR Office & Packing House All Area Usage"
          pumpCount={config.electricityPumpCount || 2}
          pumpLabels={config.electricityPumpLabels || ['Pump 1', 'Pump 2']}
          canWrite={canWrite}
          onAddPump={() => handleAddPump('electricity')}
          importTitle="Import Electricity Data from Excel"
          apiPrefix="/pump-room/electricity"
          siteId={siteId}
          exportOpts={OPS_EXPORT.pumpElectricity}
          exportKind="Electricity"
          {...elec}
        />
      )}

      {mainTab === 1 && (
        <PumpUsageTab
          title="WATER USAGE RECORD"
          docRef="EAG/OPR/IMS/RC-129"
          usageUnit="m³"
          remarks="All Area Usage"
          pumpCount={config.waterPumpCount || 2}
          pumpLabels={config.waterPumpLabels || ['Pump 1', 'Pump 2']}
          canWrite={canWrite}
          onAddPump={() => handleAddPump('water')}
          importTitle="Import Water Data from Excel"
          apiPrefix="/pump-room/water"
          siteId={siteId}
          exportOpts={OPS_EXPORT.pumpWater}
          exportKind="Water"
          {...water}
        />
      )}

      {mainTab === 2 && (
        <PumpUsageTab
          title="FOGGER USAGE RECORD"
          docRef="EAG/OPR/IMS/RC-129"
          usageUnit="m³"
          remarks="All Area Usage"
          pumpCount={config.foggerPumpCount || 2}
          pumpLabels={config.foggerPumpLabels || ['Pump 1', 'Pump 2']}
          canWrite={canWrite}
          onAddPump={() => handleAddPump('fogger')}
          importTitle="Import Fogger Data from Excel"
          apiPrefix="/pump-room/fogger"
          siteId={siteId}
          exportOpts={OPS_EXPORT.pumpFogger}
          exportKind="Fogger"
          {...fogger}
        />
      )}

      <Dialog open={!!deleteConfirm} onClose={() => activeState.setDeleteConfirm(null)}>
        <DialogTitle>Delete sheet?</DialogTitle>
        <DialogContent>
          <Typography>
            Delete all {deleteConfirm?.count} record{deleteConfirm?.count === 1 ? '' : 's'} for{' '}
            {deleteConfirm ? getMonthLabel(deleteConfirm.month) : ''}? Managers can restore this from Admin → Recovery.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => activeState.setDeleteConfirm(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={activeState.handleDeleteSheetConfirm}>Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function PumpUsageTab({
  title, docRef, usageUnit, remarks, pumpCount, pumpLabels, canWrite, onAddPump, importTitle,
  months, activeMonth, setActiveMonth, records, loading, importOpen, setImportOpen,
  handleAddMonth, handleDeleteSheetRequest, handleAddRow, handleCellSave, handleDeleteRow, handleImport,
  apiPrefix, siteId, exportOpts, exportKind,
}) {
  const { scrollRegionHeight } = useAppLayout();
  const notify = useNotification();
  const exportOpsExcel = useOpsExcelExport();
  const totals = useMemo(() => computePumpTotals(records, pumpCount), [records, pumpCount]);
  // The row-select column only exists for the worker.
  const selectCols = canWrite ? 1 : 0;
  const totalCols = 3 + selectCols + pumpCount * 3;
  const selection = useRowSelection();
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportMonths, setExportMonths] = useState([]);

  const openExportDialog = () => {
    setExportMonths(months);
    setExportOpen(true);
  };

  const handleExportExcel = async () => {
    setExporting(true);
    try {
      let url = apiPrefix;
      if (siteId) url += `?site_id=${siteId}`;
      const all = await apiRequest(url);
      const sheets = buildPumpExportSheets(all || [], {
        selectedMonths: exportMonths,
        pumpLabels,
        pumpCount,
      });
      if (!sheets.length) {
        notify.error('Nothing to export for the selected months.');
        return;
      }
      const year = exportMonths[0]?.slice(0, 4);
      const ok = await exportOpsExcel([], {
        sheets,
        filename: pumpExportFilename(exportKind, year),
        ...exportOpts,
      });
      if (ok) setExportOpen(false);
    } catch (err) {
      notify.error(err.message || 'Failed to export Excel');
    } finally {
      setExporting(false);
    }
  };

  const handleBulkDelete = async () => {
    const ids = [...selection.selectedIds];
    if (!ids.length) return;
    if (!window.confirm(`Delete ${ids.length} pump ${ids.length === 1 ? 'row' : 'rows'}?`)) return;
    await deleteIdsSequentially(ids, handleDeleteRow);
    selection.clear();
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1, gap: 1 }}>
        {canWrite && <DeleteSelectedButton count={selection.size} onClick={handleBulkDelete} />}
        {canWrite && (
          <Button size="small" variant="outlined" startIcon={<Add />} onClick={onAddPump}>
            Add Pump
          </Button>
        )}
        <Button size="small" variant="outlined" startIcon={<FileDownload />} onClick={openExportDialog}>
          Export
        </Button>
        {canWrite && (
          <Button size="small" variant="outlined" startIcon={<FileUpload />} onClick={() => setImportOpen(true)}>
            Import Excel
          </Button>
        )}
        {canWrite && (
          <Button
            size="small"
            variant="contained"
            startIcon={<Add />}
            onClick={handleAddRow}
            sx={{ bgcolor: 'table.headerBg', '&:hover': { bgcolor: 'table.selection' } }}
          >
            Add Row
          </Button>
        )}
      </Box>

      <Paper sx={{ mb: 0, borderRadius: '8px 8px 0 0', overflow: 'hidden' }} variant="outlined">
        <Box sx={{ bgcolor: 'table.headerBg', color: 'table.headerText', p: 1.5, textAlign: 'center' }}>
          <Typography variant="subtitle1" fontWeight={700}>{title}</Typography>
          <Typography variant="caption" sx={{ color: 'inherit', opacity: 0.9 }}>{docRef}</Typography>
        </Box>
        <Box sx={{ display: 'flex', borderBottom: 1, borderColor: 'table.gridline', bgcolor: 'background.paper', p: 1, gap: 3, flexWrap: 'wrap', justifyContent: 'center' }}>
          <Typography variant="caption"><strong>Facility:</strong> Al Maha GH</Typography>
          <Typography variant="caption"><strong>Country:</strong> UAE</Typography>
          <Typography variant="caption"><strong>Year:</strong> {activeMonth ? activeMonth.split('-')[0] : new Date().getFullYear()}</Typography>
          <Typography variant="caption"><strong>Remarks:</strong> {remarks}</Typography>
        </Box>
      </Paper>

      <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: scrollRegionHeight(320), borderRadius: 0, mb: 0 }}>
        <Table size="small" sx={[excelTableSx, freezeColumnsSx(PUMP_FROZEN_WIDTHS, GUTTER_WIDTH), pumpTableSx]}>
          <TableHead>
            <TableRow>
              <TableCell colSpan={totalCols}>
                Month: {activeMonth ? getMonthLabel(activeMonth) : '—'}
              </TableCell>
            </TableRow>
            <TableRow>
              <GutterCell />
              {canWrite && (
                <SelectAllHeadCell
                  ids={records.map((r) => r.id)}
                  selectedIds={selection.selectedIds}
                  onToggleAll={selection.toggleAll}
                  label="Select all pump rows"
                />
              )}
              <TableCell className="col-frozen-0">Meter ID/Serial No</TableCell>
              <TableCell className="col-frozen-1">Usage Area</TableCell>
              <TableCell className="col-frozen-2">Date</TableCell>
              {Array.from({ length: pumpCount }, (_, p) => (
                <React.Fragment key={p}>
                  <TableCell className="col-numeric">{pumpLabels[p] || `Pump ${p + 1}`} Reading</TableCell>
                  <TableCell className="col-numeric">Total Usage ({usageUnit})</TableCell>
                  {p < pumpCount - 1 && <TableCell>Date</TableCell>}
                </React.Fragment>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={totalCols} align="center" sx={{ py: 4 }}><CircularProgress size={24} /></TableCell></TableRow>
            ) : records.length === 0 ? (
              <TableRow><TableCell colSpan={totalCols} align="center" sx={{ py: 3, color: 'text.secondary' }}>{canWrite ? <>No records. Click &quot;Add Row&quot; or import.</> : 'No records.'}</TableCell></TableRow>
            ) : (
              records.map((row, idx) => (
                <PumpUsageRow
                  key={row.id}
                  row={row}
                  idx={idx}
                  prevRow={idx > 0 ? records[idx - 1] : null}
                  pumpCount={pumpCount}
                  onSave={handleCellSave}
                  onDelete={handleDeleteRow}
                  canWrite={canWrite}
                  selectedIds={selection.selectedIds}
                  onToggleSelect={selection.toggle}
                />
              ))
            )}
            {records.length > 0 && (
              <TableRow className="row-total">
                <TableCell colSpan={3 + selectCols}>Total</TableCell>
                <TableCell />
                {Array.from({ length: pumpCount }, (_, p) => (
                  <React.Fragment key={p}>
                    <TableCell />
                    <TableCell className="col-numeric">{totals[p]?.toLocaleString()}</TableCell>
                    {p < pumpCount - 1 && <TableCell />}
                  </React.Fragment>
                ))}
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Paper sx={{ borderRadius: '0 0 8px 8px', borderTop: 1, borderColor: 'table.gridline', display: 'flex', alignItems: 'center', overflow: 'auto' }} variant="outlined">
        {months.map((m) => (
          <Box
            key={m}
            onClick={() => setActiveMonth(m)}
            sx={{
              display: 'flex', alignItems: 'center', gap: 0.5,
              px: 1.5, py: 0.8, cursor: 'pointer', fontSize: '0.6875rem', fontWeight: 600,
              borderRight: 1, borderColor: 'divider', whiteSpace: 'nowrap',
              bgcolor: m === activeMonth ? 'background.paper' : 'action.hover',
              color: m === activeMonth ? 'table.headerBg' : 'text.secondary',
              borderBottom: m === activeMonth ? '2px solid' : '2px solid transparent',
              borderBottomColor: m === activeMonth ? 'table.headerBg' : 'transparent',
              '&:hover': { bgcolor: 'table.rowHover' },
              '&:hover .tab-close': { opacity: 1 },
            }}
          >
            {getMonthLabel(m)}
            {canWrite && (
              <IconButton
                className="tab-close"
                size="small"
                aria-label={`Delete ${getMonthLabel(m)} sheet`}
                onClick={(e) => { e.stopPropagation(); handleDeleteSheetRequest(m); }}
                sx={{ opacity: 0.4, p: 0.2, '&:hover': { opacity: 1, color: 'error.main' } }}
              >
                <Close sx={{ fontSize: 12 }} />
              </IconButton>
            )}
          </Box>
        ))}
        {canWrite && (
          <Box onClick={handleAddMonth} sx={{ px: 2, py: 0.8, cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 700, color: 'table.headerBg', '&:hover': { bgcolor: 'table.rowHover' } }}>
            +
          </Box>
        )}
      </Paper>

      {canWrite && importOpen && (
        <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} onImport={handleImport} title={importTitle} />
      )}
      <Dialog open={exportOpen} onClose={() => !exporting && setExportOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Export {title}</DialogTitle>
        <DialogContent>
          {months.map((month) => (
            <FormControlLabel
              key={month}
              control={(
                <Checkbox slotProps={{ input: { 'aria-label': 'Select' } }}
                  checked={exportMonths.includes(month)}
                  onChange={(e) => {
                    setExportMonths((prev) => (
                      e.target.checked ? [...prev, month] : prev.filter((item) => item !== month)
                    ));
                  }}
                />
              )}
              label={getMonthLabel(month)}
            />
          ))}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setExportOpen(false)} disabled={exporting}>Cancel</Button>
          <Button variant="contained" onClick={handleExportExcel} disabled={exporting || exportMonths.length === 0}>
            {exporting ? 'Exporting…' : 'Export'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function PumpUsageRow({ row, idx, prevRow, pumpCount, onSave, onDelete, canWrite, selectedIds, onToggleSelect }) {
  const [editing, setEditing] = useState(null);
  const [tempVal, setTempVal] = useState('');
  const date = row.record_date?.split('T')[0] || '';
  const pumps = parsePumpsFromRow(row);
  const prevPumps = prevRow ? parsePumpsFromRow(prevRow) : [];

  const startEdit = (field, currentVal) => {
    setEditing(field);
    setTempVal(currentVal != null ? String(currentVal) : '');
  };

  const commitEdit = (field) => {
    setEditing(null);
    const isPump = field.startsWith('pumpReading');
    const val = isPump ? (tempVal ? Number(tempVal) : null) : tempVal;
    onSave(row.id, field, val);
  };

  const renderEditableCell = (field, value, isNumber = false) => {
    if (canWrite && editing === field) {
      return (
        <TextField
          variant="standard"
          size="small"
          type={field === 'recordDate' ? 'date' : (isNumber ? 'number' : 'text')}
          value={tempVal}
          onChange={(e) => setTempVal(e.target.value)}
          onBlur={() => commitEdit(field)}
          onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(field); }}
          autoFocus
          InputProps={{ disableUnderline: true, sx: { fontSize: '0.6875rem', textAlign: 'center' } }}
          sx={{ width: '100%' }}
        />
      );
    }
    const display = field === 'recordDate'
      ? formatDate(value)
      : (value != null ? (isNumber ? Number(value).toLocaleString() : value) : '');
    if (!canWrite) {
      return <Box sx={{ minHeight: 20, width: '100%' }}>{display}</Box>;
    }
    return (
      <Box
        onClick={() => startEdit(field, field === 'recordDate' ? toDateInputValue(value) : value)}
        sx={{ cursor: 'pointer', minHeight: 20, width: '100%' }}
      >
        {display}
      </Box>
    );
  };

  const cells = [];
  for (let p = 0; p < pumpCount; p++) {
    const reading = pumps[p]?.reading ?? null;
    const usage = pumpCellUsage(pumps[p], prevPumps[p], idx === 0);
    const isLast = p === pumpCount - 1;

    cells.push(
      <TableCell key={`r${p}`} className="col-numeric">{renderEditableCell(`pumpReading${p}`, reading, true)}</TableCell>,
      <TableCell
        key={`u${p}`}
        className="col-numeric"
        sx={{
          fontWeight: 600,
          color: usage != null && idx > 0 ? 'success.main' : 'text.disabled',
          position: isLast ? 'relative' : undefined,
        }}
      >
        {usage != null && idx > 0 ? usage.toLocaleString() : ''}
        {isLast && canWrite && (
          <IconButton
            className="delete-btn"
            size="small"
            color="error"
            onClick={() => onDelete(row.id)}
            sx={{ position: 'absolute', right: -2, top: '50%', transform: 'translateY(-50%)', opacity: 0, transition: 'opacity 0.2s' }}
           aria-label="Delete">
            <Delete sx={{ fontSize: 14 }} />
          </IconButton>
        )}
      </TableCell>
    );
    if (!isLast) {
      cells.push(<TableCell key={`d${p}`}>{formatDate(date)}</TableCell>);
    }
  }

  return (
    <TableRow hover selected={selectedIds?.has(row.id)} sx={{ '&:hover .delete-btn': { opacity: 1 } }}>
      <GutterCell index={idx + 1} />
      {canWrite && (
        <RowSelectCell
          id={row.id}
          selectedIds={selectedIds}
          onToggle={onToggleSelect}
          label={`Select pump row ${idx + 1}`}
        />
      )}
      <TableCell className="col-frozen-0" title={row.meter_id || ''}>{renderEditableCell('meterId', row.meter_id)}</TableCell>
      <TableCell className="col-frozen-1" title={row.usage_area || ''}>{renderEditableCell('usageArea', row.usage_area)}</TableCell>
      <TableCell className="col-frozen-2">{renderEditableCell('recordDate', date)}</TableCell>
      {cells}
    </TableRow>
  );
}

function ImportDialog({ open, onClose, onImport, title }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [parsing, setParsing] = useState(false);

  const handleFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setParsing(true);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'array' });
        const allRecords = [];
        for (const sheetName of wb.SheetNames) {
          const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' });
          allRecords.push(...parseImportRows(rows));
        }
        setPreview(allRecords);
      } catch {
        setPreview(null);
      }
      setParsing(false);
    };
    reader.readAsArrayBuffer(f);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Box sx={{ my: 2 }}>
          <Button variant="outlined" component="label" startIcon={<FileUpload />}>
            Choose File
            <input type="file" hidden accept=".xlsx,.xls" onChange={handleFile} />
          </Button>
          {file && <Typography variant="body2" sx={{ mt: 1 }}>{file.name}</Typography>}
        </Box>
        {parsing && <CircularProgress size={24} />}
        {preview && (
          <Alert severity="success">Found {preview.length} records across all sheets</Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!preview || preview.length === 0} onClick={() => onImport(preview)}>
          Import
        </Button>
      </DialogActions>
    </Dialog>
  );
}
