import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Box, Table, TableHead, TableBody, TableRow, TableCell, TableContainer,
  Button, MenuItem, Typography, IconButton, Select, CircularProgress, TextField, Autocomplete,
} from '@mui/material';
import { AddOutlined as Add, DeleteOutlined as Delete, CheckOutlined as Check, FileUploadOutlined as FileUpload } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useActiveSite } from '../../contexts/ActiveSiteContext';
import { useMasterData } from '../../utils/useMasterData';
import { useNotification } from '../../contexts/NotificationContext';
import { cropNameFromField } from '../../utils/plantingSegment';
import {
  listFertilizerProducts,
  ensureFertAppWorkbook,
  listFertAppRecords,
  createFertAppRecord,
  updateFertAppRecord,
  deleteFertAppRecord,
} from '../../utils/backendApi';
import PivotFertigationImporter from './PivotFertigationImporter';
import { DeleteSelectedButton, RowSelectCell, SelectAllCheckbox, deleteIdsSequentially } from '../table/BulkSelect';
import { useRowSelection } from '../../hooks/useRowSelection';

const FONT = '"Calibri", "Segoe UI", Arial, sans-serif';
const BORDER = '1px solid var(--sheet-border, #000)';
const HDR_BLUE = 'var(--sheet-tint-blue, #DBEEF4)';
const HDR_PEACH = 'var(--sheet-tint-peach, #FDEADA)';
const CALC_BG = 'var(--sheet-tint-green, #E2EFDA)';
const DOC_BG = 'var(--sheet-tint-blue, #E1F0FF)';

const RC132_COLS = [
  { key: 'date', label: 'Date (ddmmyyyy)', bg: HDR_BLUE, width: 100 },
  { key: 'fieldId', label: 'Field ID (Pivot, NG/GH)', bg: HDR_BLUE, width: 118 },
  { key: 'segmentId', label: ' Segment ID (Section)', bg: HDR_BLUE, width: 108 },
  { key: 'areaHa', label: 'Total Area (In Ha)', bg: HDR_BLUE, width: 88 },
  { key: 'crop', label: 'Crop', bg: HDR_BLUE, width: 80 },
  { key: 'fertilizerName', label: 'Fertilizer Name (Trade Name)', bg: HDR_BLUE, width: 148 },
  { key: 'ratePerHa', label: 'Rate of Fertilizer (Per Ha)', bg: HDR_PEACH, width: 98, calc: true },
  { key: 'totalKg', label: 'Total Fertilizer (in Kg)', bg: HDR_PEACH, width: 98 },
  { key: 'qtyTons', label: 'Qty (Tons)', bg: HDR_PEACH, width: 72, calc: true },
  { key: 'operatorName', label: 'Operator Name', bg: HDR_BLUE, width: 88 },
  { key: 'authorizedBy', label: '*Authorized and **Verified By', bg: HDR_BLUE, width: 128 },
  { key: 'misNo', label: 'MIS No', bg: HDR_BLUE, width: 108 },
  { key: 'docNo', label: 'DOC No', bg: HDR_BLUE, width: 108 },
];

function hdr(bg, extra = {}) {
  return {
    backgroundColor: `${bg} !important`,
    color: 'var(--sheet-ink, #000) !important',
    fontFamily: FONT,
    fontWeight: 700,
    fontSize: '10px',
    textAlign: 'center',
    textTransform: 'none',
    border: BORDER,
    whiteSpace: 'pre-line',
    py: '4px',
    px: '3px',
    lineHeight: 1.15,
    verticalAlign: 'middle',
    ...extra,
  };
}

const dCell = {
  fontFamily: FONT,
  fontSize: '11px',
  border: BORDER,
  py: '2px',
  px: '3px',
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

function computeRatePerHa(totalKg, areaHa) {
  const t = parseFloat(totalKg);
  const a = parseFloat(areaHa);
  if (!Number.isFinite(t) || !Number.isFinite(a) || a === 0) return '';
  return (t / a).toFixed(4).replace(/\.?0+$/, '') || '0';
}

function computeQtyTons(totalKg) {
  const t = parseFloat(totalKg);
  if (!Number.isFinite(t)) return '';
  return (t / 1000).toFixed(4).replace(/\.?0+$/, '') || '0';
}

function formatNum(n, decimals = 2) {
  if (n == null || n === '') return '';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function filterFertilizersStartsWith(options, inputValue) {
  const q = (inputValue || '').trim().toLowerCase();
  if (!q) return options;
  return options.filter((o) => o.name.toLowerCase().startsWith(q));
}

function emptyRow(pivotFields) {
  return {
    fieldId: pivotFields[0]?.id || '',
    date: new Date().toISOString().split('T')[0],
    segmentId: 'LS, RS',
    areaHa: '',
    crop: cropNameFromField(pivotFields[0]) || 'Rhodes',
    fertilizerProductId: '',
    fertilizerName: '',
    totalKg: '',
    operatorName: '',
    authorizedBy: '',
    misNo: '',
    docNo: '',
  };
}

function mapRecordToRow(r) {
  return {
    id: r.id,
    fieldId: r.fieldId,
    date: r.date?.split('T')[0] || r.date || '',
    segmentId: r.segmentId || '',
    areaHa: r.areaHa ?? '',
    crop: r.crop || '',
    fertilizerProductId: r.fertilizerProductId || '',
    fertilizerName: r.fertilizerName || '',
    totalKg: r.totalKg ?? '',
    operatorName: r.operatorName || '',
    authorizedBy: r.authorizedBy || '',
    misNo: r.misNo || '',
    docNo: r.docNo || '',
  };
}

/**
 * `readOnly`: the viewer may not write (only the data-entry worker and the
 * agronomist do; the API refuses everyone else) or the season is closed.
 */
export default function PivotFertigationTab({ readOnly = false }) {
  const { activeSiteId, activeSite } = useActiveSite();
  const { data: masterData } = useMasterData();
  const notify = useNotification();
  const { t } = useTranslation();

  const siteFields = useMemo(() => {
    const fields = [];
    for (const country of masterData.countries || []) {
      for (const site of country.sites || []) {
        if (site.id !== activeSiteId) continue;
        for (const area of site.farmAreas || []) {
          for (const field of area.fields || []) {
            fields.push({ ...field, farmAreaName: area.name });
          }
        }
      }
    }
    fields.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true }));
    return fields;
  }, [masterData.countries, activeSiteId]);

  const pivotFields = useMemo(() => {
    return siteFields.filter((f) => (f.type || '').toLowerCase() === 'pivot');
  }, [siteFields]);

  const [yearFilter, setYearFilter] = useState('all');
  const [records, setRecords] = useState([]);
  const [fertilizers, setFertilizers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newRow, setNewRow] = useState(null);
  const [savingId, setSavingId] = useState(null);
  const [importerOpen, setImporterOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const selection = useRowSelection();

  const farmName = activeSite?.name || '';
  const tableMinWidth = RC132_COLS.reduce((s, c) => s + c.width, 0) + 52;

  const fieldMap = useMemo(() => {
    const m = {};
    pivotFields.forEach((f) => { m[f.id] = f; });
    return m;
  }, [pivotFields]);

  const loadRecords = useCallback(async () => {
    if (!activeSiteId) {
      setRecords([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // Creating the workbook header is a write: viewers just list the records.
      if (!readOnly) await ensureFertAppWorkbook({ siteId: activeSiteId, farmName });
      const year = yearFilter === 'all' ? undefined : parseInt(yearFilter, 10);
      const data = await listFertAppRecords(activeSiteId, year);
      setRecords((data || []).map(mapRecordToRow));
    } catch {
      setRecords([]);
    }
    setLoading(false);
  }, [activeSiteId, farmName, yearFilter, readOnly]);

  const loadFertilizers = useCallback(async () => {
    try {
      const data = await listFertilizerProducts();
      setFertilizers(data || []);
    } catch {
      setFertilizers([]);
    }
  }, []);

  useEffect(() => { loadRecords(); }, [loadRecords, refreshKey]);
  useEffect(() => { loadFertilizers(); }, [loadFertilizers, refreshKey]);

  const availableYears = useMemo(() => {
    const years = new Set();
    records.forEach((r) => {
      if (r.date) years.add(r.date.slice(0, 4));
    });
    return [...years].sort();
  }, [records]);

  const buildPayload = (row) => ({
    siteId: activeSiteId,
    fieldId: row.fieldId,
    date: row.date,
    segmentId: row.segmentId || undefined,
    areaHa: row.areaHa !== '' ? parseFloat(row.areaHa) : undefined,
    crop: row.crop || undefined,
    fertilizerProductId: row.fertilizerProductId || undefined,
    fertilizerName: row.fertilizerName,
    totalKg: row.totalKg !== '' ? parseFloat(row.totalKg) : undefined,
    operatorName: row.operatorName || undefined,
    authorizedBy: row.authorizedBy || undefined,
    misNo: row.misNo || undefined,
    docNo: row.docNo || undefined,
  });

  const handleRefresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  const handleSaveNew = async () => {
    if (!newRow?.fieldId || !newRow?.date) {
      notify.error('Date and field are required');
      return;
    }
    if (!newRow?.fertilizerName) {
      notify.error('Fertilizer name is required');
      return;
    }
    setSavingId('new');
    try {
      await createFertAppRecord(buildPayload(newRow));
      notify.success('Saved');
      setNewRow(null);
      handleRefresh();
    } catch (err) {
      notify.error(err.message || 'Failed to save');
    } finally {
      setSavingId(null);
    }
  };

  const handleUpdateRow = async (row) => {
    if (!row.id) return;
    setSavingId(row.id);
    try {
      await updateFertAppRecord(row.id, buildPayload(row));
      notify.success('Updated');
      handleRefresh();
    } catch (err) {
      notify.error(err.message || 'Failed to update');
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this record?')) return;
    try {
      await deleteFertAppRecord(id);
      handleRefresh();
    } catch (err) {
      notify.error(err.message || 'Failed to delete');
    }
  };

  const handleBulkDelete = async () => {
    const ids = [...selection.selectedIds];
    if (!ids.length) return;
    if (!window.confirm(`Delete ${ids.length} fertigation ${ids.length === 1 ? 'record' : 'records'}?`)) return;
    const deleted = await deleteIdsSequentially(ids, deleteFertAppRecord);
    selection.clear();
    handleRefresh();
    notify.success(`Deleted ${deleted} ${deleted === 1 ? 'record' : 'records'}.`);
  };

  const handleFieldChange = (rowSetter, fieldId) => {
    const field = fieldMap[fieldId];
    rowSetter((prev) => ({
      ...prev,
      fieldId,
      crop: cropNameFromField(field) || prev.crop,
    }));
  };

  const handleFertilizerChange = (rowSetter, product) => {
    if (!product) {
      rowSetter((p) => ({ ...p, fertilizerProductId: '', fertilizerName: '' }));
      return;
    }
    rowSetter((p) => ({
      ...p,
      fertilizerProductId: product.id,
      fertilizerName: product.name,
    }));
  };

  const renderCell = (col, row, rowSetter) => {
    if (col.key === 'ratePerHa') {
      return (
        <TableCell
          key={col.key}
          title="Auto-calculated: Total Kg ÷ Area (Ha)"
          sx={{ ...dCell, backgroundColor: CALC_BG, fontWeight: 600, cursor: 'default' }}
        >
          {computeRatePerHa(row.totalKg, row.areaHa)}
        </TableCell>
      );
    }
    if (col.key === 'qtyTons') {
      return (
        <TableCell
          key={col.key}
          title="Auto-calculated: Total Kg ÷ 1000"
          sx={{ ...dCell, backgroundColor: CALC_BG, fontWeight: 600, cursor: 'default' }}
        >
          {computeQtyTons(row.totalKg)}
        </TableCell>
      );
    }

    const peachBg = col.key === 'totalKg' ? HDR_PEACH : undefined;
    const cellSx = { ...dCell, p: 0, ...(peachBg ? { backgroundColor: peachBg } : {}) };

    switch (col.key) {
      case 'date':
        return (
          <TableCell key={col.key} sx={cellSx}>
            <input
              type="date"
              value={row.date || ''}
              onChange={(e) => rowSetter((p) => ({ ...p, date: e.target.value }))}
              disabled={readOnly}
              style={inputSx}
            />
          </TableCell>
        );
      case 'fieldId':
        return (
          <TableCell key={col.key} sx={cellSx}>
            <Select size="small" value={row.fieldId} sx={selectSx} disabled={readOnly}
              onChange={(e) => handleFieldChange(rowSetter, e.target.value)}>
              <MenuItem value="" sx={{ fontSize: '11px' }}>—</MenuItem>
              {pivotFields.map((f) => (
                <MenuItem key={f.id} value={f.id} sx={{ fontSize: '11px' }}>{f.name}</MenuItem>
              ))}
            </Select>
          </TableCell>
        );
      case 'fertilizerName':
        return (
          <TableCell key={col.key} sx={{ ...cellSx, minWidth: 140 }}>
            <Autocomplete
              size="small"
              options={fertilizers}
              getOptionLabel={(o) => o.name || ''}
              value={fertilizers.find((f) => f.id === row.fertilizerProductId)
                || fertilizers.find((f) => f.name === row.fertilizerName)
                || null}
              onChange={(_, v) => handleFertilizerChange(rowSetter, v)}
              disabled={readOnly}
              filterOptions={(options, { inputValue }) => filterFertilizersStartsWith(options, inputValue)}
              renderInput={(params) => (
                <TextField {...params} variant="standard" placeholder="Type…"
                  InputProps={{ ...params.InputProps, disableUnderline: true }}
                  sx={{ '& input': { fontFamily: FONT, fontSize: '11px', py: 0 } }} />
              )}
              sx={{ width: '100%' }}
            />
          </TableCell>
        );
      case 'segmentId':
      case 'areaHa':
      case 'crop':
      case 'totalKg':
      case 'operatorName':
      case 'authorizedBy':
      case 'misNo':
      case 'docNo':
        return (
          <TableCell key={col.key} sx={cellSx}>
            <input
              value={row[col.key] ?? ''}
              onChange={(e) => rowSetter((p) => ({ ...p, [col.key]: e.target.value }))}
              disabled={readOnly}
              style={inputSx}
            />
          </TableCell>
        );
      default:
        return <TableCell key={col.key} sx={dCell} />;
    }
  };

  const renderDataRow = (row, { isNew = false } = {}) => {
    const rowSetter = isNew ? setNewRow : (fn) => {
      setRecords((prev) => prev.map((r) => (r.id === row.id ? (typeof fn === 'function' ? fn(r) : fn) : r)));
    };

    return (
      <TableRow key={row.id || 'new'} selected={!isNew && selection.selectedIds.has(row.id)} sx={isNew ? { backgroundColor: 'var(--sheet-alt, #FAFAFA)' } : undefined}>
        {isNew ? <TableCell padding="checkbox" /> : (
          <RowSelectCell
            id={row.id}
            selectedIds={selection.selectedIds}
            onToggle={selection.toggle}
            label={`Select pivot fertigation ${row.id}`}
          />
        )}
        {RC132_COLS.map((col) => renderCell(col, row, rowSetter))}
        <TableCell sx={{ ...dCell, p: 0, width: 52, position: 'sticky', right: 0, backgroundColor: 'var(--sheet-bg, #fff)', zIndex: 1 }}>
          {readOnly ? null : isNew ? (
            <IconButton size="small" onClick={handleSaveNew} disabled={savingId === 'new'} sx={{ p: '2px' }}>
              {savingId === 'new' ? <CircularProgress size={14} /> : <Check sx={{ fontSize: 16, color: 'var(--sheet-accent, #165c3a)' }} />}
            </IconButton>
          ) : (
            <>
              <IconButton size="small" onClick={() => handleUpdateRow(row)} disabled={savingId === row.id} sx={{ p: '2px' }}>
                {savingId === row.id ? <CircularProgress size={14} /> : <Check sx={{ fontSize: 16, color: 'var(--sheet-accent, #165c3a)' }} />}
              </IconButton>
              <IconButton size="small" onClick={() => handleDelete(row.id)} sx={{ p: '2px' }} aria-label="Delete">
                <Delete sx={{ fontSize: 16, color: 'var(--sheet-danger, #c62828)' }} />
              </IconButton>
            </>
          )}
        </TableCell>
      </TableRow>
    );
  };

  const totalKg = records.reduce((s, r) => s + (parseFloat(r.totalKg) || 0), 0);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 480, fontFamily: FONT }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1, flexWrap: 'wrap' }}>
        {!readOnly && (
          <>
            <DeleteSelectedButton count={selection.size} onClick={handleBulkDelete} />
            <Button size="small" startIcon={<FileUpload />} onClick={() => setImporterOpen(true)}
              sx={{ fontFamily: FONT, fontSize: '11px', textTransform: 'none', color: 'var(--sheet-accent, #165c3a)' }}>
              Import Excel
            </Button>
            <Button size="small" startIcon={<Add />} onClick={() => setNewRow(emptyRow(pivotFields))}
              disabled={!!newRow}
              sx={{ fontFamily: FONT, fontSize: '11px', textTransform: 'none' }}>
              Add Row
            </Button>
          </>
        )}
        <TextField select size="small" label="Filter year" value={yearFilter}
          onChange={(e) => setYearFilter(e.target.value)}
          sx={{ minWidth: 110, '& label': { fontSize: '12px' }, '& .MuiSelect-select': { fontSize: '12px', py: 0.75 } }}>
          <MenuItem value="all">All years</MenuItem>
          {availableYears.map((y) => (
            <MenuItem key={y} value={y}>{y}</MenuItem>
          ))}
        </TextField>
        <Typography sx={{ fontFamily: FONT, fontSize: '11px', color: 'var(--sheet-ink-2, #666)', ml: 'auto' }}>
          {records.length} record{records.length !== 1 ? 's' : ''}
        </Typography>
      </Box>

      <Box sx={{ border: BORDER, backgroundColor: 'var(--sheet-bg, #fff)', flex: 1, overflow: 'auto' }}>
        <Box sx={{ display: 'flex', minHeight: 64 }}>
          <Box sx={{ width: 120, borderRight: BORDER }} />
          <Box sx={{ flex: 1, borderRight: BORDER, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 1 }}>
            <Typography sx={{ fontFamily: FONT, fontWeight: 700, fontSize: '13px' }}>
              Elite Agriculture Management L.L.C
            </Typography>
            <Typography sx={{ fontFamily: FONT, fontWeight: 700, fontSize: '12px' }}>
              FERTILIZER APPLICATION RECORD
            </Typography>
            <Typography sx={{ fontFamily: FONT, fontSize: '10px', color: 'var(--sheet-ink-2, #444)' }}>
              EAG/AFO/IMS/RC-132 — Issue 03, 17-Sept-2020, Rev00
            </Typography>
          </Box>
          <Box sx={{ width: 120, borderLeft: BORDER, backgroundColor: DOC_BG, p: 1 }}>
            <Typography sx={{ fontFamily: FONT, fontSize: '9px', fontWeight: 600 }}>Farm Name</Typography>
            <Typography sx={{ fontFamily: FONT, fontSize: '10px' }}>{farmName || '—'}</Typography>
          </Box>
        </Box>

        {loading ? (
          <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress size={28} /></Box>
        ) : (
          <TableContainer sx={{ overflowX: 'auto', borderTop: BORDER, maxHeight: 'calc(100vh - 320px)' }}>
            <Table size="small" stickyHeader sx={{ borderCollapse: 'collapse', minWidth: tableMinWidth }}>
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox" sx={hdr(HDR_BLUE)}>
                    <SelectAllCheckbox
                      ids={records.map((r) => r.id)}
                      selectedIds={selection.selectedIds}
                      onToggleAll={selection.toggleAll}
                      label="Select all pivot fertigation rows"
                    />
                  </TableCell>
                  {RC132_COLS.map((col) => (
                    <TableCell key={col.key} sx={{ ...hdr(col.bg), minWidth: col.width, width: col.width }}>
                      {col.label}
                    </TableCell>
                  ))}
                  <TableCell sx={{ ...hdr(HDR_BLUE), width: 52, position: 'sticky', right: 0, zIndex: 3 }} />
                </TableRow>
              </TableHead>
              <TableBody>
                {records.map((row) => renderDataRow(row))}
                {newRow && renderDataRow(newRow, { isNew: true })}
                {records.length === 0 && !newRow && (
                  <TableRow>
                    <TableCell colSpan={RC132_COLS.length + 1} sx={{ ...dCell, py: 3, color: 'var(--sheet-ink-3, #888)' }}>
                      {readOnly ? t('dataEntryAccess.noRecordsYet') : 'No records yet. Import your RC-132 Excel or click Add Row.'}
                    </TableCell>
                  </TableRow>
                )}
                {records.length > 0 && (
                  <TableRow sx={{ backgroundColor: 'var(--sheet-tint-blue, #DCE6F2)' }}>
                    <TableCell colSpan={7} sx={{ ...dCell, fontWeight: 700, textAlign: 'right' }}>TOTAL</TableCell>
                    <TableCell sx={{ ...dCell, fontWeight: 700 }}>{formatNum(totalKg, 1)}</TableCell>
                    <TableCell colSpan={5} sx={dCell} />
                    <TableCell sx={dCell} />
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>

      <PivotFertigationImporter
        open={importerOpen}
        onClose={() => setImporterOpen(false)}
        siteId={activeSiteId}
        farmName={farmName}
        pivotFields={pivotFields}
        onImportComplete={() => handleRefresh()}
      />
    </Box>
  );
}
