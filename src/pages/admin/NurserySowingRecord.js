import { createContext, useContext, useState, useEffect, useCallback, useMemo, Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box, Typography, Paper, Button, TextField, Chip, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  CircularProgress, IconButton, Tooltip,
} from '@mui/material';
import {
  SaveOutlined as SaveIcon, FileDownloadOutlined as FileDownload, FileUploadOutlined as FileUpload, AddCircleOutlineOutlined as AddCircleOutline, DeleteOutlined as Delete, LocalFloristOutlined as LocalFlorist,
} from '@mui/icons-material';
import { apiRequest } from '../../utils/api';
import { useNotification } from '../../contexts/NotificationContext';
import NurserySowingImporter from '../../components/NurserySowingImporter';
import { excelTableSx, freezeColumnsSx, GutterCell, GUTTER_WIDTH } from '../../components/table/ExcelTable';
import { DeleteSelectedButton, RowSelectCell, SelectAllCheckbox, deleteIdsSequentially } from '../../components/table/BulkSelect';
import { useRowSelection } from '../../hooks/useRowSelection';
import useOpsExcelExport from '../../hooks/useOpsExcelExport';
import { OPS_EXPORT } from '../../utils/companyExcelExport';
import { buildNurseryExportRows } from '../../utils/cropHistoryExcelExport';
import { useAuth } from '../../contexts/AuthContext';
import useReadOnlyMode from '../../hooks/useReadOnlyMode';
import ReadOnlyBanner from '../../components/ReadOnlyBanner';
import { isReadOnlyOnPage, PAGE_KEYS } from '../../utils/roleAccess';
import InfoNote from '../../components/InfoNote';

/** When true, every sowing grid cell renders disabled (view-only roles, closed season). */
const CellReadOnlyContext = createContext(false);

const SOWING_FROZEN_WIDTHS = [118, 120, 120];
const twoRowHeadSx = {
  '&& thead tr:first-of-type .MuiTableCell-head': { top: 0 },
  '&& thead tr:nth-of-type(2) .MuiTableCell-head': { top: 40 },
};
const sowingDraftSx = {
  '&&& .MuiTableBody-root .MuiTableRow-root.row-draft .MuiTableCell-root:not(.table-gutter)': {
    backgroundColor: '#fffde7',
  },
};

const UOM_OPTS = ['Lit', 'Kg', 'pcs'];

function emptyMedia() {
  return {
    perlite: { qty: '', uom: 'Lit' },
    peatMoss: { qty: '', uom: 'Lit' },
    compost: { qty: '', uom: 'Lit' },
    vermiculite: { qty: '', uom: 'Lit' },
  };
}

function emptyRow() {
  return {
    _key: `new-${Date.now()}-${Math.random()}`,
    _isNew: true,
    _dirty: false,
    seedingDate: '',
    cropId: '',
    varietyId: '',
    seedBatch: '',
    breederId: '',
    seedsPerCell: '',
    trayType: '',
    trayCount: '',
    growingMediaBrand: '',
    mediaComponents: emptyMedia(),
    seedlingCount: '',
    germinationPct: '',
    totalDays: '',
    readyToTransplantDate: '',
    releaseDate: '',
    seedlingsPlanted: '',
  };
}

function serverToRow(r) {
  const media = r.mediaComponents || r.media_components || {};
  const row = {
    _key: r.id,
    _isNew: false,
    _dirty: false,
    _serverId: r.id,
    seedingDate: r.seedingDate?.split?.('T')[0] || r.seeding_date?.split?.('T')[0] || '',
    cropId: r.cropId || r.crop_id || '',
    varietyId: r.varietyId || r.variety_id || '',
    seedBatch: r.seedBatch || r.seed_batch || '',
    breederId: r.breederId || r.breeder_id || '',
    seedsPerCell: r.seedsPerCell != null ? String(r.seedsPerCell) : (r.seeds_per_cell != null ? String(r.seeds_per_cell) : ''),
    trayType: r.trayType != null ? String(r.trayType) : (r.tray_type != null ? String(r.tray_type) : ''),
    trayCount: r.trayCount != null ? String(r.trayCount) : (r.tray_count != null ? String(r.tray_count) : ''),
    growingMediaBrand: r.growingMediaBrand || r.growing_media_brand || '',
    mediaComponents: {
      perlite: { qty: media.perlite?.qty ?? '', uom: media.perlite?.uom || 'Lit' },
      peatMoss: { qty: media.peatMoss?.qty ?? '', uom: media.peatMoss?.uom || 'Lit' },
      compost: { qty: media.compost?.qty ?? '', uom: media.compost?.uom || 'Lit' },
      vermiculite: { qty: media.vermiculite?.qty ?? '', uom: media.vermiculite?.uom || 'Lit' },
    },
    seedlingCount: r.seedlingCount != null ? String(r.seedlingCount) : (r.seedling_count != null ? String(r.seedling_count) : ''),
    germinationPct: r.germinationPct != null ? String(r.germinationPct) : (r.germination_pct != null ? String(r.germination_pct) : ''),
    totalDays: '',
    readyToTransplantDate: r.readyToTransplantDate?.split?.('T')[0] || r.ready_to_transplant_date?.split?.('T')[0] || '',
    releaseDate: r.releaseDate?.split?.('T')[0] || r.release_date?.split?.('T')[0] || '',
    seedlingsPlanted: r.seedlingsPlanted != null ? String(r.seedlingsPlanted) : (r.seedlings_planted != null ? String(r.seedlings_planted) : ''),
  };
  row.totalDays = calcDays(row.seedingDate, row.readyToTransplantDate) || row.totalDays;
  return row;
}

function normalizeGermPct(val) {
  if (val === '' || val == null) return null;
  const n = Number(val);
  if (!Number.isFinite(n)) return null;
  if (n > 0 && n <= 1) return n * 100;
  return n;
}

function calcDays(seedingDate, readyDate) {
  if (!seedingDate || !readyDate) return '';
  const a = new Date(`${seedingDate}T12:00:00`);
  const b = new Date(`${readyDate}T12:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return '';
  return String(Math.round((b - a) / 86400000));
}

function addCalendarDays(seedingDate, daysStr) {
  const days = parseInt(String(daysStr ?? '').trim(), 10);
  if (!seedingDate || !Number.isFinite(days)) return { ready: '', release: '' };
  const d = new Date(`${seedingDate}T12:00:00`);
  if (Number.isNaN(d.getTime())) return { ready: '', release: '' };
  d.setDate(d.getDate() + days);
  const iso = d.toISOString().slice(0, 10);
  return { ready: iso, release: iso };
}

function applyTotalDaysToRow(row) {
  const { ready, release } = addCalendarDays(row.seedingDate, row.totalDays);
  if (!ready) return row;
  return { ...row, readyToTransplantDate: ready, releaseDate: release };
}

function calcRemaining(seedlingCount, planted) {
  const t = parseFloat(seedlingCount);
  const p = parseFloat(planted);
  if (!Number.isFinite(t)) return '';
  if (!Number.isFinite(p)) return t.toFixed(1);
  return (t - p).toFixed(1);
}

function CellInput({ value, onChange, type = 'text', width, ...rest }) {
  const readOnly = useContext(CellReadOnlyContext);
  return (
    <TextField
      size="small" variant="standard" value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      type={type}
      InputProps={{ sx: { fontSize: '0.72rem' } }}
      sx={{ width: width || '100%' }}
      {...rest}
      disabled={readOnly || rest.disabled}
    />
  );
}

function CellSelect({ value, onChange, options, allowEmpty, width }) {
  const readOnly = useContext(CellReadOnlyContext);
  return (
    <TextField
      size="small" select variant="standard" value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      disabled={readOnly}
      SelectProps={{ native: true }}
      sx={{ width: width || '100%' }}
    >
      {allowEmpty && <option value="" />}
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </TextField>
  );
}

function rowToPayload(row, siteId) {
  return {
    siteId,
    seedingDate: row.seedingDate,
    cropId: row.cropId || null,
    varietyId: row.varietyId || null,
    seedBatch: row.seedBatch || null,
    breederId: row.breederId || null,
    seedsPerCell: row.seedsPerCell || null,
    trayType: row.trayType || null,
    trayCount: row.trayCount || null,
    growingMediaBrand: row.growingMediaBrand || null,
    mediaComponents: row.mediaComponents,
    seedlingCount: row.seedlingCount || null,
    germinationPct: normalizeGermPct(row.germinationPct),
    readyToTransplantDate: row.readyToTransplantDate || null,
    releaseDate: row.releaseDate || null,
    seedlingsPlanted: row.seedlingsPlanted || null,
  };
}

export default function NurserySowingRecord({
  siteFilter,
  crops,
  allVarietiesByCrop,
  breeders,
  onStartTransplant,
}) {
  const notify = useNotification();
  const exportOpsExcel = useOpsExcelExport();
  const { t } = useTranslation();
  const { user } = useAuth();
  // Only workers and agronomists record sowing; everyone else watches.
  // `readOnly` also covers a closed season.
  const roleReadOnly = isReadOnlyOnPage(user, PAGE_KEYS.DATA_ENTRY);
  const readOnly = useReadOnlyMode(PAGE_KEYS.DATA_ENTRY);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importerOpen, setImporterOpen] = useState(false);
  const rowSelection = useRowSelection();

  const cropOptions = useMemo(() =>
    crops.map((c) => {
      const crop = typeof c === 'object' ? c : { id: c, name: c };
      return { value: crop.id, label: crop.name };
    }),
    [crops]
  );

  const breederOptions = useMemo(() =>
    breeders.map((b) => ({ value: b.id, label: b.name })),
    [breeders]
  );

  const varietyOptionsForCrop = useCallback((cropId) => {
    if (!cropId) return [];
    return (allVarietiesByCrop[cropId] || []).map((v) => ({ value: v.id, label: v.name }));
  }, [allVarietiesByCrop]);

  const loadRecords = useCallback(async () => {
    if (!siteFilter) {
      setRows([]);
      return;
    }
    setLoading(true);
    try {
      const data = await apiRequest(`/nursery-sowing-records?site_id=${siteFilter}`);
      const existing = (data || []).map(serverToRow);
      setRows([...existing, emptyRow(), emptyRow()]);
    } catch (err) {
      notify.error(err.message || 'Failed to load sowing records');
    } finally {
      setLoading(false);
    }
  }, [siteFilter, notify]);

  useEffect(() => { loadRecords(); }, [loadRecords]);

  const updateRow = useCallback((idx, key, value) => {
    setRows((prev) => {
      const next = [...prev];
      let row = { ...next[idx], [key]: value, _dirty: true };
      if (key === 'seedingDate' || key === 'totalDays') {
        row = applyTotalDaysToRow(row);
      }
      next[idx] = row;
      return next;
    });
  }, []);

  const updateMedia = useCallback((idx, comp, field, value) => {
    setRows((prev) => {
      const next = [...prev];
      const mc = { ...next[idx].mediaComponents, [comp]: { ...next[idx].mediaComponents[comp], [field]: value } };
      next[idx] = { ...next[idx], mediaComponents: mc, _dirty: true };
      return next;
    });
  }, []);

  const addRow = () => setRows((prev) => [...prev, emptyRow()]);

  const removeRow = (idx) => {
    setRows((prev) => {
      const row = prev[idx];
      if (row._serverId) {
        if (!window.confirm('Delete this sowing record?')) return prev;
        apiRequest(`/nursery-sowing-records/${row._serverId}`, { method: 'DELETE' }).catch(() => {});
      }
      return prev.filter((_, i) => i !== idx);
    });
  };

  const removeRowsByKeys = async (keys) => {
    if (!keys.length) return;
    if (!window.confirm(`Delete ${keys.length} sowing ${keys.length === 1 ? 'record' : 'records'}?`)) return;
    const keySet = new Set(keys);
    const chosen = rows.filter((r) => keySet.has(r._key));
    await deleteIdsSequentially(
      chosen.filter((r) => r._serverId).map((r) => r._serverId),
      (id) => apiRequest(`/nursery-sowing-records/${id}`, { method: 'DELETE' }),
    );
    setRows((prev) => prev.filter((r) => !keySet.has(r._key)));
    rowSelection.clear();
  };

  const saveRecords = async () => {
    if (!siteFilter) {
      notify.error('Select a site first');
      return;
    }
    const dirtyRows = rows.filter((r) => r._dirty && r.seedingDate);
    if (dirtyRows.length === 0) {
      notify.info('No changes to save');
      return;
    }
    setSaving(true);
    try {
      const newRows = dirtyRows.filter((r) => r._isNew);
      const existingRows = dirtyRows.filter((r) => !r._isNew && r._serverId);

      if (newRows.length > 0) {
        await apiRequest('/nursery-sowing-records/bulk', {
          method: 'POST',
          body: JSON.stringify({ entries: newRows.map((r) => rowToPayload(r, siteFilter)) }),
        });
      }
      for (const r of existingRows) {
        await apiRequest(`/nursery-sowing-records/${r._serverId}`, {
          method: 'PUT',
          body: JSON.stringify(rowToPayload(r, siteFilter)),
        });
      }
      notify.success(`Saved ${dirtyRows.length} record(s)`);
      loadRecords();
    } catch (err) {
      notify.error(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const dirtyCount = rows.filter((r) => r._dirty && r.seedingDate).length;

  const handleExportExcel = async () => {
    if (dirtyCount > 0) notify.warning('Unsaved sowing rows are not in the file.');
    const varietyNameById = {};
    Object.values(allVarietiesByCrop || {}).forEach((list) => {
      (list || []).forEach((v) => { varietyNameById[v.id] = v.name; });
    });
    const exportRows = buildNurseryExportRows(rows, {
      cropNameById: Object.fromEntries(crops.map((c) => [c.id || c, c.name || c])),
      varietyNameById,
      breederNameById: Object.fromEntries(breeders.map((b) => [b.id, b.name])),
    });
    if (!exportRows.length) {
      notify.error('Nothing to export');
      return;
    }
    await exportOpsExcel(exportRows, {
      filename: 'Nursery-Sowing-RC-241.xlsx',
      ...OPS_EXPORT.nurserySowing,
    });
  };

  if (!siteFilter) {
    return <InfoNote severity="info">Select a site to enter nursery sowing records (RC-241).</InfoNote>;
  }

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>;
  }

  return (
    <CellReadOnlyContext.Provider value={readOnly}>
      {roleReadOnly && (
        <ReadOnlyBanner message={t('cropHistoryAccess.sowingViewOnly')} />
      )}
      <Paper sx={{ p: 2, mb: 2, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
        <Chip label="RC-241 Sowing Record" color="success" variant="outlined" size="small" />
        <Chip label={`${rows.filter((r) => !r._isNew).length} saved`} size="small" variant="outlined" />
        {dirtyCount > 0 && <Chip label={`${dirtyCount} unsaved`} color="warning" size="small" />}
        <Box sx={{ flexGrow: 1 }} />
        <DeleteSelectedButton
          count={rowSelection.size}
          onClick={() => removeRowsByKeys([...rowSelection.selectedIds])}
          disabled={readOnly}
        />
        <Button variant="outlined" startIcon={<FileDownload />} onClick={handleExportExcel} disabled={!siteFilter}>
          Export
        </Button>
        <Button variant="outlined" startIcon={<FileUpload />} onClick={() => setImporterOpen(true)} disabled={readOnly}>
          Import Excel
        </Button>
        <Button variant="outlined" startIcon={<AddCircleOutline />} onClick={addRow} disabled={readOnly}>Add row</Button>
        <Button variant="contained" startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
          onClick={saveRecords} disabled={saving || dirtyCount === 0 || readOnly}>
          Save
        </Button>
      </Paper>

      <Box sx={{ bgcolor: 'table.headerBg', color: 'table.headerText', px: 2, py: 1, borderRadius: '4px 4px 0 0' }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.8rem' }}>
          SOWING RECORD — NURSERY (RC-241)
        </Typography>
      </Box>

      <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 'calc(100vh - 320px)', overflow: 'auto', borderRadius: '0 0 4px 4px' }}>
        <Table size="small" sx={[excelTableSx, freezeColumnsSx(SOWING_FROZEN_WIDTHS, GUTTER_WIDTH), twoRowHeadSx, sowingDraftSx, { minWidth: 2200 }]}>
          <TableHead>
            <TableRow>
              <TableCell className="table-gutter" rowSpan={2} />
              <TableCell padding="checkbox" rowSpan={2}>
                <SelectAllCheckbox
                  ids={rows.map((r) => r._key)}
                  selectedIds={rowSelection.selectedIds}
                  onToggleAll={rowSelection.toggleAll}
                  label="Select all sowing rows"
                />
              </TableCell>
              <TableCell className="col-frozen-0" rowSpan={2}>Date of sowing</TableCell>
              <TableCell className="col-frozen-1" rowSpan={2}>Crop</TableCell>
              <TableCell className="col-frozen-2" rowSpan={2}>Variety</TableCell>
              <TableCell rowSpan={2}>Seed Batch</TableCell>
              <TableCell rowSpan={2}>Breeder</TableCell>
              <TableCell rowSpan={2}>Seeds/cell</TableCell>
              <TableCell rowSpan={2}>Tray type</TableCell>
              <TableCell rowSpan={2}>No. trays</TableCell>
              <TableCell rowSpan={2}>Growing Media</TableCell>
              <TableCell colSpan={8}>Quantity of Media used</TableCell>
              <TableCell rowSpan={2}>No. Seedling</TableCell>
              <TableCell rowSpan={2}>Germ %</TableCell>
              <TableCell rowSpan={2}>Ready to transplant</TableCell>
              <TableCell rowSpan={2}>Days</TableCell>
              <TableCell rowSpan={2}>Release date</TableCell>
              <TableCell rowSpan={2}>Seedlings planted</TableCell>
              <TableCell rowSpan={2}>Remaining</TableCell>
              <TableCell rowSpan={2} />
            </TableRow>
            <TableRow>
              {['Perlite', 'UoM', 'Peat moss', 'UoM', 'Compost', 'UoM', 'Vermiculite', 'UoM'].map((label) => (
                <TableCell key={label}>{label}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row, ri) => (
              <TableRow key={row._key} hover selected={rowSelection.selectedIds.has(row._key)} className={row._dirty ? 'row-draft' : undefined}>
                <GutterCell index={ri + 1} />
                <RowSelectCell
                  id={row._key}
                  selectedIds={rowSelection.selectedIds}
                  onToggle={rowSelection.toggle}
                  label={`Select sowing row ${ri + 1}`}
                />
                <TableCell className="col-frozen-0">
                  <CellInput type="date" value={row.seedingDate} onChange={(v) => updateRow(ri, 'seedingDate', v)} width={115} />
                </TableCell>
                <TableCell className="col-frozen-1">
                  <CellSelect value={row.cropId} allowEmpty width={115}
                    options={cropOptions}
                    onChange={(v) => {
                      setRows((prev) => {
                        const next = [...prev];
                        next[ri] = { ...next[ri], cropId: v, varietyId: '', _dirty: true };
                        return next;
                      });
                    }} />
                </TableCell>
                <TableCell className="col-frozen-2">
                  <CellSelect value={row.varietyId} allowEmpty width={115}
                    options={varietyOptionsForCrop(row.cropId)}
                    onChange={(v) => updateRow(ri, 'varietyId', v)} />
                </TableCell>
                <TableCell>
                  <CellInput value={row.seedBatch} onChange={(v) => updateRow(ri, 'seedBatch', v)} width={95} />
                </TableCell>
                <TableCell>
                  <CellSelect value={row.breederId} allowEmpty width={105} options={breederOptions}
                    onChange={(v) => updateRow(ri, 'breederId', v)} />
                </TableCell>
                <TableCell>
                  <CellInput type="number" value={row.seedsPerCell} onChange={(v) => updateRow(ri, 'seedsPerCell', v)} width={70} />
                </TableCell>
                <TableCell>
                  <CellInput value={row.trayType} onChange={(v) => updateRow(ri, 'trayType', v)} width={65} />
                </TableCell>
                <TableCell>
                  <CellInput type="number" value={row.trayCount} onChange={(v) => updateRow(ri, 'trayCount', v)} width={65} />
                </TableCell>
                <TableCell>
                  <CellInput value={row.growingMediaBrand} onChange={(v) => updateRow(ri, 'growingMediaBrand', v)} width={90} />
                </TableCell>
                {(['perlite', 'peatMoss', 'compost', 'vermiculite']).map((comp) => (
                  <Fragment key={comp}>
                    <TableCell>
                      <CellInput type="number" value={row.mediaComponents[comp].qty}
                        onChange={(v) => updateMedia(ri, comp, 'qty', v)} width={55} />
                    </TableCell>
                    <TableCell>
                      <CellSelect value={row.mediaComponents[comp].uom} width={52}
                        options={UOM_OPTS.map((u) => ({ value: u, label: u }))}
                        onChange={(v) => updateMedia(ri, comp, 'uom', v)} />
                    </TableCell>
                  </Fragment>
                ))}
                <TableCell>
                  <CellInput type="number" value={row.seedlingCount} onChange={(v) => updateRow(ri, 'seedlingCount', v)} width={85} />
                </TableCell>
                <TableCell>
                  <CellInput type="number" value={row.germinationPct} onChange={(v) => updateRow(ri, 'germinationPct', v)} width={70} />
                </TableCell>
                <TableCell>
                  <Typography variant="body2" sx={{ fontSize: '0.72rem' }}>
                    {row.readyToTransplantDate || '—'}
                  </Typography>
                </TableCell>
                <TableCell>
                  <CellInput type="number" value={row.totalDays} onChange={(v) => updateRow(ri, 'totalDays', v)} width={70} />
                </TableCell>
                <TableCell>
                  <Typography variant="body2" sx={{ fontSize: '0.72rem' }}>
                    {row.releaseDate || '—'}
                  </Typography>
                </TableCell>
                <TableCell>
                  <CellInput type="number" value={row.seedlingsPlanted} onChange={(v) => updateRow(ri, 'seedlingsPlanted', v)} width={85} />
                </TableCell>
                <TableCell>
                  <Typography variant="body2" sx={{ fontSize: '0.72rem' }}>
                    {calcRemaining(row.seedlingCount, row.seedlingsPlanted) || '—'}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', gap: 0.25 }}>
                    {row._serverId && onStartTransplant && !readOnly && (
                      <Tooltip title="Start transplant from this batch">
                        <IconButton size="small" color="primary" onClick={() => onStartTransplant(row)}>
                          <LocalFlorist fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                    {!readOnly && (
                      <IconButton size="small" onClick={() => removeRow(ri)} aria-label="Delete"><Delete fontSize="small" /></IconButton>
                    )}
                  </Box>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <NurserySowingImporter
        open={importerOpen}
        onClose={() => setImporterOpen(false)}
        siteId={siteFilter}
        crops={crops}
        allVarietiesByCrop={allVarietiesByCrop}
        breeders={breeders}
        onImportComplete={loadRecords}
      />
    </CellReadOnlyContext.Provider>
  );
}
