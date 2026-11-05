import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Button, Checkbox, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, FormControlLabel, IconButton, Paper, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Typography,
} from '@mui/material';
import { AddCircleOutlineOutlined as AddCircleOutline, DeleteOutlined as Delete, FileDownloadOutlined as FileDownload, FileUploadOutlined as FileUpload, SaveOutlined as SaveIcon } from '@mui/icons-material';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useNotification } from '../../contexts/NotificationContext';
import { apiRequest } from '../../utils/api';
import { excelTableSx, freezeColumnsSx, GutterCell, GUTTER_WIDTH } from '../../components/table/ExcelTable';
import { DeleteSelectedButton, RowSelectCell, SelectAllCheckbox } from '../../components/table/BulkSelect';
import { useRowSelection } from '../../hooks/useRowSelection';
import {
  dailyTotal, emptyLocationCell, entriesForLocations, isoWeekNumber, orderLocations,
  RC108_STRUCTURE_ORDER,
} from '../../utils/rc108Locations';
import { mergeImportedDays } from '../../utils/rc108ImportParser';
import Rc108Importer from '../../components/irrigation/Rc108Importer';
import useOpsExcelExport from '../../hooks/useOpsExcelExport';
import { OPS_EXPORT } from '../../utils/companyExcelExport';
import {
  buildRc108ExportSheets,
  irrigationDripFilename,
  RC108_STRUCTURE_LABELS,
} from '../../utils/irrigationExcelExport';
import InfoNote from '../../components/InfoNote';

const FLOW_KEY = (siteId) => `rc108-flow-rate-${siteId}`;
const FROZEN_COLS = [
  { label: 'Week\nNo', title: 'Week No' },
  { label: 'Date', title: 'Date' },
  { label: 'Method', title: 'Method of Application' },
  { label: 'Flow\n(m3)', title: 'Flow Rate (m3)' },
  { label: 'Operator\nName', title: 'Operator(s) Name' },
  { label: 'Authorized', title: 'Authorized and Verified By' },
];
const FROZEN_WIDTHS = [56, 148, 72, 60, 70, 80];
const LOC_COLS = [
  { label: 'Water\nQty', title: 'Water Qty (M3)' },
  { label: 'Freq', title: 'Frequency' },
  { label: 'Daily\nm3', title: 'Daily Total (m3)' },
  { label: 'Fert.\nType', title: 'Fertilizer Type' },
  { label: 'Fert.\nQty', title: 'Fertilizer Qty' },
];
const LOC_COL_WIDTHS = [72, 52, 64, 80, 72];
const HEAD_ROW1_H = 56;
const ROW_H = 36;
const SAVE_CHUNK = 40;
const locColSx = Object.fromEntries(LOC_COL_WIDTHS.flatMap((width, i) => [
  [`&& thead .loc-col-${i}`, {
    width,
    minWidth: width,
    maxWidth: width,
    overflow: 'hidden',
    whiteSpace: 'pre-line',
    textAlign: 'center',
    lineHeight: 1.15,
    paddingLeft: '4px !important',
    paddingRight: '4px !important',
  }],
  [`&& tbody .loc-col-${i}`, {
    width,
    minWidth: width,
    maxWidth: width,
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
    paddingLeft: '4px !important',
    paddingRight: '4px !important',
  }],
]));
const twoRowHeadSx = {
  '&& thead tr:first-of-type .MuiTableCell-head': {
    top: 0,
    whiteSpace: 'pre-line',
    textAlign: 'center',
    lineHeight: 1.15,
    overflow: 'hidden',
    height: HEAD_ROW1_H,
    verticalAlign: 'middle',
  },
  '&& thead tr:nth-of-type(2) .MuiTableCell-head': {
    top: HEAD_ROW1_H,
    overflow: 'hidden',
    whiteSpace: 'pre-line',
    textAlign: 'center',
    lineHeight: 1.15,
  },
  '&& thead .MuiTableCell-head.col-frozen-0, && thead .MuiTableCell-head.col-frozen-1, && thead .MuiTableCell-head.col-frozen-2, && thead .MuiTableCell-head.col-frozen-3, && thead .MuiTableCell-head.col-frozen-4, && thead .MuiTableCell-head.col-frozen-5, && thead .MuiTableCell-head.col-frozen-6': {
    textOverflow: 'unset',
  },
  '&& tbody .MuiTableCell-root': {
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
  },
  '&& tbody .col-frozen-2': {
    overflow: 'visible',
  },
  '&& tbody .col-frozen-2 input.rc108-date': {
    color: 'var(--sheet-ink, #111)',
    overflow: 'visible',
    fontSize: '0.75rem',
    colorScheme: 'light',
  },
  '&& tbody .col-frozen-2 input.rc108-date::-webkit-datetime-edit': {
    color: 'var(--sheet-ink, #111)',
    padding: 0,
  },
  '&& tbody .col-frozen-2 input.rc108-date::-webkit-datetime-edit-fields-wrapper': {
    color: 'var(--sheet-ink, #111)',
  },
  '&& tbody .col-frozen-2 input.rc108-date::-webkit-calendar-picker-indicator': {
    width: 14,
    height: 14,
    padding: 0,
    margin: 0,
    cursor: 'pointer',
    opacity: 1,
  },
  ...locColSx,
};
const draftSx = {
  '&&& .MuiTableBody-root .MuiTableRow-root.row-draft .MuiTableCell-root:not(.table-gutter)': {
    backgroundColor: 'var(--sheet-tint-yellow, #fffde7)',
  },
};

function readFlowDefault(siteId) {
  if (!siteId) return '';
  try { return localStorage.getItem(FLOW_KEY(siteId)) || ''; } catch { return ''; }
}

function writeFlowDefault(siteId, value) {
  if (!siteId) return;
  try {
    if (value === '' || value == null) localStorage.removeItem(FLOW_KEY(siteId));
    else localStorage.setItem(FLOW_KEY(siteId), String(value));
  } catch { /* ignore */ }
}

function CellInput({ value, onChange, type = 'text', rowIdx, col, disabled }) {
  const isDate = type === 'date';
  return (
    <input
      data-rc108={`${rowIdx}-${col}`}
      className={isDate ? 'rc108-date' : undefined}
      type={type}
      disabled={disabled}
      value={value ?? ''}
      title={value ? String(value) : undefined}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: '100%',
        minWidth: 0,
        maxWidth: '100%',
        border: 'none',
        borderBottom: '1px solid rgba(0,0,0,0.42)',
        outline: 'none',
        fontSize: '0.75rem',
        fontFamily: 'inherit',
        background: 'transparent',
        color: 'var(--sheet-ink, #111)',
        padding: '2px 0',
        boxSizing: 'border-box',
        overflow: isDate ? 'visible' : 'hidden',
        textOverflow: isDate ? 'clip' : 'ellipsis',
        whiteSpace: 'nowrap',
      }}
    />
  );
}

function emptyDay(locations, flowRate) {
  const cells = {};
  locations.forEach((loc) => { cells[loc.label] = emptyLocationCell(); });
  const todayDate = new Date();
  const today = `${todayDate.getFullYear()}-${String(todayDate.getMonth() + 1).padStart(2, '0')}-${String(todayDate.getDate()).padStart(2, '0')}`;
  return {
    _key: `new-${Date.now()}-${Math.random()}`,
    _dirty: true,
    weekNo: isoWeekNumber(today),
    date: today,
    method: 'Drip',
    flowRate: flowRate ?? '',
    operatorName: '',
    authorizedBy: '',
    cells,
  };
}

function entriesToRows(entries, locations) {
  const byDate = new Map();
  (entries || []).forEach((e) => {
    const date = (e.date || '').split('T')[0];
    if (!date) return;
    if (!byDate.has(date)) {
      const cells = {};
      locations.forEach((loc) => { cells[loc.label] = emptyLocationCell(); });
      byDate.set(date, {
        _key: date,
        _dirty: false,
        weekNo: e.weekNumber != null ? String(e.weekNumber) : isoWeekNumber(date),
        date,
        method: e.method || 'Drip',
        flowRate: e.flowRateM3 ?? '',
        operatorName: e.operatorName || '',
        authorizedBy: e.authorizedBy || '',
        cells,
      });
    }
    const row = byDate.get(date);
    const loc = locations.find((l) => l.label === e.locationLabel)
      || locations.find((l) => l.fieldId && l.fieldId === e.fieldId && (l.valveRange || '') === (e.valveRange || ''));
    const key = loc?.label || e.locationLabel;
    if (!row.cells[key]) row.cells[key] = emptyLocationCell();
    row.cells[key] = {
      waterQty: e.waterQtyM3 ?? '',
      frequency: e.frequency ?? '',
      fertilizerType: e.fertilizerType || '',
      fertilizerQty: e.fertilizerQty ?? '',
    };
  });
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function locationCellHasData(cell) {
  if (!cell) return false;
  if (cell.waterQty !== '' && cell.waterQty != null) return true;
  if (cell.frequency !== '' && cell.frequency != null) return true;
  if (cell.fertilizerType && String(cell.fertilizerType).trim()) return true;
  if (cell.fertilizerQty !== '' && cell.fertilizerQty != null) return true;
  return false;
}

function rowDateSpan(rowList) {
  const dates = (rowList || []).map((r) => r.date).filter(Boolean).sort();
  if (dates.length === 0) return null;
  return { start: dates[0], end: dates[dates.length - 1] };
}

function rowToDayPayload(row, locations) {
  return {
    date: row.date,
    weekNumber: row.weekNo === '' ? null : Number(row.weekNo) || null,
    method: row.method || 'Drip',
    flowRateM3: Number.isFinite(Number(row.flowRate)) ? Number(row.flowRate) : null,
    operatorName: row.operatorName || null,
    authorizedBy: row.authorizedBy || null,
    locations: locations.map((loc) => {
      const cell = row.cells?.[loc.label] || emptyLocationCell();
      const waterQty = cell.waterQty === '' ? null : Number(cell.waterQty);
      const frequency = cell.frequency === '' ? null : Number(cell.frequency);
      const fertilizerQty = cell.fertilizerQty === '' ? null : Number(cell.fertilizerQty);
      return {
        locationLabel: loc.label,
        fieldId: loc.fieldId || null,
        valveRange: loc.valveRange || null,
        waterQtyM3: Number.isFinite(waterQty) ? waterQty : null,
        frequency: Number.isFinite(frequency) ? frequency : null,
        dailyWater: dailyTotal(cell) === '' ? null : Number(dailyTotal(cell)),
        fertilizerType: cell.fertilizerType || null,
        fertilizerQty: Number.isFinite(fertilizerQty) ? fertilizerQty : null,
      };
    }),
  };
}

export default function Rc108IrrigationGrid({
  siteId, year, fields, readOnly = false, locationOrder = 'excel', structureFields,
  importDateRange, onImportDateRange,
}) {
  const notify = useNotification();
  const exportOpsExcel = useOpsExcelExport();
  const locations = useMemo(
    () => orderLocations(fields, { useExcelOrder: locationOrder !== 'fields' }),
    [fields, locationOrder],
  );
  const structureLocations = useMemo(() => ({
    nethouse: orderLocations(structureFields?.nethouse || (locationOrder !== 'fields' ? fields : []), { useExcelOrder: true }),
    greenhouse: orderLocations(structureFields?.greenhouse || [], { useExcelOrder: true }),
    openfield: orderLocations(structureFields?.openfield || (locationOrder === 'fields' ? fields : []), { useExcelOrder: false }),
  }), [structureFields, fields, locationOrder]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportSelected, setExportSelected] = useState([]);
  const [saveProgress, setSaveProgress] = useState('');
  const selection = useRowSelection();
  const flowDefaultRef = useRef('');
  const scrollRef = useRef(null);
  const colCount = 8 + locations.length * 5 + (readOnly ? 0 : 1);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_H,
    overscan: 12,
  });

  const load = useCallback(async (range) => {
    if (!siteId) {
      setRows([]);
      return;
    }
    setLoading(true);
    try {
      const start = range?.start || importDateRange?.start || `${year}-01-01`;
      const end = range?.end || importDateRange?.end || `${year}-12-31`;
      const data = await apiRequest(`/irrigation-drip?site_id=${siteId}&start_date=${start}&end_date=${end}`);
      const next = entriesToRows(entriesForLocations(data || [], locations), locations);
      setRows(next);
      const lastFlow = [...next].reverse().find((r) => r.flowRate !== '' && r.flowRate != null)?.flowRate;
      if (lastFlow !== undefined && lastFlow !== '') {
        flowDefaultRef.current = String(lastFlow);
        writeFlowDefault(siteId, lastFlow);
      } else {
        flowDefaultRef.current = readFlowDefault(siteId);
      }
    } catch (e) {
      notify.error(e.message || 'Failed to load irrigation records');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [siteId, year, locations, notify, importDateRange]);

  useEffect(() => { load(); }, [load]);

  const patchRow = (key, patch) => {
    setRows((prev) => prev.map((r) => (r._key === key ? { ...r, ...patch, _dirty: true } : r)));
  };

  const patchCell = (key, locLabel, field, value) => {
    setRows((prev) => prev.map((r) => {
      if (r._key !== key) return r;
      return {
        ...r,
        _dirty: true,
        cells: {
          ...r.cells,
          [locLabel]: { ...(r.cells[locLabel] || emptyLocationCell()), [field]: value },
        },
      };
    }));
  };

  const handleFlowChange = (key, value) => {
    patchRow(key, { flowRate: value });
    if (value !== '') {
      flowDefaultRef.current = value;
      writeFlowDefault(siteId, value);
    }
  };

  const handleDateChange = (key, value) => {
    patchRow(key, { date: value, weekNo: isoWeekNumber(value) });
  };

  const addRow = () => {
    const last = rows[rows.length - 1];
    const flow = last?.flowRate !== '' && last?.flowRate != null
      ? last.flowRate
      : flowDefaultRef.current;
    const next = emptyDay(locations, flow);
    if (last?.date) {
      const d = new Date(`${last.date}T00:00:00`);
      d.setDate(d.getDate() + 1);
      next.date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      next.weekNo = isoWeekNumber(next.date);
    }
    next.operatorName = last?.operatorName || '';
    next.authorizedBy = last?.authorizedBy || '';
    next.method = last?.method || 'Drip';
    setRows((prev) => [...prev, next]);
  };

  const removeRow = async (row) => {
    if (row.date && !String(row._key).startsWith('new-')) {
      try {
        const params = new URLSearchParams({
          site_id: siteId,
          date: row.date,
          location_labels: locations.map((l) => l.label).join(','),
        });
        await apiRequest(`/irrigation-drip/day?${params.toString()}`, { method: 'DELETE' });
      } catch (e) {
        notify.error(e.message || 'Delete failed');
        return;
      }
    }
    setRows((prev) => prev.filter((r) => r._key !== row._key));
  };

  const removeSelectedRows = async () => {
    const keys = [...selection.selectedIds];
    if (!keys.length) return;
    if (!window.confirm(`Delete ${keys.length} irrigation ${keys.length === 1 ? 'row' : 'rows'}?`)) return;
    const chosen = rows.filter((r) => keys.includes(r._key));
    for (const row of chosen) {
      if (row.date && !String(row._key).startsWith('new-')) {
        try {
          const params = new URLSearchParams({
            site_id: siteId,
            date: row.date,
            location_labels: locations.map((l) => l.label).join(','),
          });
          await apiRequest(`/irrigation-drip/day?${params.toString()}`, { method: 'DELETE' });
        } catch (e) {
          notify.error(e.message || 'Delete failed');
          return;
        }
      }
    }
    const keySet = new Set(keys);
    setRows((prev) => prev.filter((r) => !keySet.has(r._key)));
    selection.clear();
  };

  const handleSave = async () => {
    const dirty = rows.filter((r) => r._dirty && r.date);
    if (dirty.length === 0) {
      notify.info('Nothing to save');
      return;
    }
    setSaving(true);
    try {
      const payloads = dirty.map((r) => rowToDayPayload(r, locations));
      for (let i = 0; i < payloads.length; i += SAVE_CHUNK) {
        const chunk = payloads.slice(i, i + SAVE_CHUNK);
        if (payloads.length > SAVE_CHUNK) {
          setSaveProgress(`${Math.min(i + chunk.length, payloads.length)}/${payloads.length}`);
        }
        await apiRequest('/irrigation-drip/bulk', {
          method: 'POST',
          body: JSON.stringify({ siteId, days: chunk }),
        });
      }
      notify.success('Irrigation record saved');
      await load(rowDateSpan(rows) || undefined);
    } catch (e) {
      notify.error(e.message || 'Save failed');
    } finally {
      setSaving(false);
      setSaveProgress('');
    }
  };

  const exportableStructures = useMemo(
    () => RC108_STRUCTURE_ORDER.filter((id) => (structureLocations[id] || []).length > 0),
    [structureLocations],
  );

  const openExportDialog = () => {
    setExportSelected(exportableStructures);
    setExportOpen(true);
  };

  const handleExportExcel = async () => {
    if (rows.some((row) => row._dirty)) {
      notify.warning('Unsaved irrigation rows are not in the file.');
    }
    setExporting(true);
    try {
      const start = importDateRange?.start || `${year}-01-01`;
      const end = importDateRange?.end || `${year}-12-31`;
      const data = await apiRequest(`/irrigation-drip?site_id=${siteId}&start_date=${start}&end_date=${end}`);
      const sheets = buildRc108ExportSheets({
        entries: data || [],
        structureLocations,
        selectedStructures: exportSelected,
      });
      if (!sheets.length) {
        notify.error('Nothing to export for the selected structures.');
        return;
      }
      const ok = await exportOpsExcel([], {
        sheets,
        filename: irrigationDripFilename(year),
        ...OPS_EXPORT.irrigationDrip,
      });
      if (ok) setExportOpen(false);
    } catch (err) {
      notify.error(err.message || 'Failed to export Excel');
    } finally {
      setExporting(false);
    }
  };

  const handleImportApply = async (preview) => {
    const remapped = preview.remapped;
    const merged = mergeImportedDays(rows, remapped.days, locations);
    const lastFlow = [...merged].reverse().find((r) => r.flowRate !== '' && r.flowRate != null)?.flowRate;
    if (lastFlow !== undefined && lastFlow !== '') {
      flowDefaultRef.current = String(lastFlow);
      writeFlowDefault(siteId, lastFlow);
    }
    setRows(merged);
    const payloads = remapped.days
      .map((day) => {
        const locs = remapped.matchedLocations.filter((loc) => locationCellHasData(day.cells?.[loc.label]));
        if (locs.length === 0) return null;
        return rowToDayPayload(day, locs);
      })
      .filter(Boolean);
    if (payloads.length === 0) return;
    setSaving(true);
    try {
      for (let i = 0; i < payloads.length; i += SAVE_CHUNK) {
        const chunk = payloads.slice(i, i + SAVE_CHUNK);
        if (payloads.length > SAVE_CHUNK) {
          setSaveProgress(`${Math.min(i + chunk.length, payloads.length)}/${payloads.length}`);
        }
        await apiRequest('/irrigation-drip/bulk', {
          method: 'POST',
          body: JSON.stringify({ siteId, days: chunk }),
        });
      }
      const { nethouse, openfield, greenhouse } = remapped.counts;
      notify.success(`Imported ${nethouse} nethouse, ${openfield} open-field, ${greenhouse} greenhouse columns`);
      const span = rowDateSpan(merged);
      if (span && onImportDateRange) onImportDateRange(span);
      await load(span || undefined);
    } catch (e) {
      notify.error(e.message || 'Import save failed');
      throw e;
    } finally {
      setSaving(false);
      setSaveProgress('');
    }
  };

  const virtualRows = rowVirtualizer.getVirtualItems();
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0;
  const paddingBottom = virtualRows.length > 0
    ? rowVirtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end
    : 0;

  if (!siteId) {
    return <InfoNote mode="line" severity="info">Select a site to enter irrigation.</InfoNote>;
  }
  if (locations.length === 0) {
    return <InfoNote mode="line" severity="info">No fields on this site for this structure.</InfoNote>;
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          Irrigation and Fertigation Record — Drip
        </Typography>
        <Box sx={{ flex: 1 }} />
        <DeleteSelectedButton count={selection.size} onClick={removeSelectedRows} disabled={readOnly} />
        <Button size="small" startIcon={<FileDownload />} onClick={openExportDialog} sx={{ textTransform: 'none' }}>
          Export
        </Button>
        {!readOnly && (
          <>
            <Button size="small" startIcon={<FileUpload />} onClick={() => setImportOpen(true)} sx={{ textTransform: 'none' }}>
              Import Excel
            </Button>
            <Button size="small" startIcon={<AddCircleOutline />} onClick={addRow} sx={{ textTransform: 'none' }}>
              Add row
            </Button>
            <Button size="small" variant="contained" startIcon={saving ? <CircularProgress size={14} color="inherit" /> : <SaveIcon />}
              disabled={saving} onClick={handleSave} sx={{ textTransform: 'none' }}>
              {saveProgress ? `Saving ${saveProgress}` : 'Save'}
            </Button>
          </>
        )}
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress size={28} /></Box>
      ) : (
        <TableContainer ref={scrollRef} component={Paper} variant="outlined" sx={{ maxHeight: '68vh', overflow: 'auto' }}>
          <Table
            size="small"
            sx={[excelTableSx, freezeColumnsSx([42, ...FROZEN_WIDTHS], GUTTER_WIDTH), twoRowHeadSx, draftSx]}
          >
            <TableHead>
              <TableRow>
                <TableCell className="table-gutter" />
                <TableCell padding="checkbox" rowSpan={2} className="col-frozen-0">
                  <SelectAllCheckbox
                    ids={rows.map((r) => r._key)}
                    selectedIds={selection.selectedIds}
                    onToggleAll={selection.toggleAll}
                    label="Select all drip irrigation rows"
                  />
                </TableCell>
                {FROZEN_COLS.map((col, i) => (
                  <TableCell key={col.title} className={`col-frozen-${i + 1}`} title={col.title}>{col.label}</TableCell>
                ))}
                {locations.map((loc) => (
                  <TableCell key={loc.label} colSpan={5} align="center">{loc.label}</TableCell>
                ))}
                {!readOnly && <TableCell />}
              </TableRow>
              <TableRow>
                <TableCell className="table-gutter" />
                {FROZEN_COLS.map((col, i) => (
                  <TableCell key={`sp-${col.title}`} className={`col-frozen-${i + 1}`} />
                ))}
                {locations.map((loc) => (
                  LOC_COLS.map((h, i) => (
                    <TableCell key={`${loc.label}-${h.title}`} className={`loc-col-${i}`} title={h.title}>{h.label}</TableCell>
                  ))
                ))}
                {!readOnly && <TableCell />}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={colCount} align="center">
                    No rows this year. Add a row or import RC-108 Excel.
                  </TableCell>
                </TableRow>
              )}
              {paddingTop > 0 && (
                <TableRow>
                  <TableCell colSpan={colCount} sx={{ height: paddingTop, p: 0, border: 0 }} />
                </TableRow>
              )}
              {virtualRows.map((vr) => {
                const row = rows[vr.index];
                const rowIdx = vr.index;
                return (
                <TableRow key={row._key} hover className={row._dirty ? 'row-draft' : undefined}>
                  <GutterCell index={rowIdx + 1} />
                  <RowSelectCell
                    id={row._key}
                    selectedIds={selection.selectedIds}
                    onToggle={selection.toggle}
                    label={`Select drip row ${rowIdx + 1}`}
                    className="col-frozen-0"
                  />
                  <TableCell className="col-frozen-1">
                    <CellInput value={row.weekNo} onChange={(v) => patchRow(row._key, { weekNo: v })} type="number" rowIdx={rowIdx} col="week" disabled={readOnly} />
                  </TableCell>
                  <TableCell className="col-frozen-2">
                    <CellInput value={row.date} onChange={(v) => handleDateChange(row._key, v)} type="date" rowIdx={rowIdx} col="date" disabled={readOnly} />
                  </TableCell>
                  <TableCell className="col-frozen-3">
                    <CellInput value={row.method} onChange={(v) => patchRow(row._key, { method: v })} rowIdx={rowIdx} col="method" disabled={readOnly} />
                  </TableCell>
                  <TableCell className="col-frozen-4">
                    <CellInput value={row.flowRate} onChange={(v) => handleFlowChange(row._key, v)} type="number" rowIdx={rowIdx} col="flow" disabled={readOnly} />
                  </TableCell>
                  <TableCell className="col-frozen-5">
                    <CellInput value={row.operatorName} onChange={(v) => patchRow(row._key, { operatorName: v })} rowIdx={rowIdx} col="op" disabled={readOnly} />
                  </TableCell>
                  <TableCell className="col-frozen-6">
                    <CellInput value={row.authorizedBy} onChange={(v) => patchRow(row._key, { authorizedBy: v })} rowIdx={rowIdx} col="auth" disabled={readOnly} />
                  </TableCell>
                  {locations.map((loc) => {
                    const cell = row.cells?.[loc.label] || emptyLocationCell();
                    return (
                      [
                        <TableCell key={`${loc.label}-wq`} className="loc-col-0">
                          <CellInput value={cell.waterQty} onChange={(v) => patchCell(row._key, loc.label, 'waterQty', v)} type="number" rowIdx={rowIdx} col={`${loc.label}-wq`} disabled={readOnly} />
                        </TableCell>,
                        <TableCell key={`${loc.label}-fr`} className="loc-col-1">
                          <CellInput value={cell.frequency} onChange={(v) => patchCell(row._key, loc.label, 'frequency', v)} type="number" rowIdx={rowIdx} col={`${loc.label}-fr`} disabled={readOnly} />
                        </TableCell>,
                        <TableCell key={`${loc.label}-dt`} className="loc-col-2">
                          <Typography variant="caption" noWrap title={String(dailyTotal(cell))}>{dailyTotal(cell) === '' ? '' : dailyTotal(cell)}</Typography>
                        </TableCell>,
                        <TableCell key={`${loc.label}-ft`} className="loc-col-3">
                          <CellInput value={cell.fertilizerType} onChange={(v) => patchCell(row._key, loc.label, 'fertilizerType', v)} rowIdx={rowIdx} col={`${loc.label}-ft`} disabled={readOnly} />
                        </TableCell>,
                        <TableCell key={`${loc.label}-fq`} className="loc-col-4">
                          <CellInput value={cell.fertilizerQty} onChange={(v) => patchCell(row._key, loc.label, 'fertilizerQty', v)} type="number" rowIdx={rowIdx} col={`${loc.label}-fq`} disabled={readOnly} />
                        </TableCell>,
                      ]
                    );
                  })}
                  {!readOnly && (
                    <TableCell>
                      <IconButton size="small" onClick={() => removeRow(row)} aria-label="Delete row">
                        <Delete fontSize="small" />
                      </IconButton>
                    </TableCell>
                  )}
                </TableRow>
                );
              })}
              {paddingBottom > 0 && (
                <TableRow>
                  <TableCell colSpan={colCount} sx={{ height: paddingBottom, p: 0, border: 0 }} />
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Rc108Importer
        open={importOpen}
        onClose={() => setImportOpen(false)}
        locations={locations}
        structureLocations={structureLocations}
        onApply={handleImportApply}
      />
      <Dialog open={exportOpen} onClose={() => !exporting && setExportOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Export Irrigation Record</DialogTitle>
        <DialogContent>
          {exportableStructures.map((id) => (
            <FormControlLabel
              key={id}
              control={(
                <Checkbox
                  checked={exportSelected.includes(id)}
                  onChange={(e) => {
                    setExportSelected((prev) => (
                      e.target.checked ? [...prev, id] : prev.filter((item) => item !== id)
                    ));
                  }}
                />
              )}
              label={`Export ${RC108_STRUCTURE_LABELS[id]}`}
            />
          ))}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setExportOpen(false)} disabled={exporting}>Cancel</Button>
          <Button variant="contained" onClick={handleExportExcel} disabled={exporting || exportSelected.length === 0}>
            {exporting ? 'Exporting…' : 'Export'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
