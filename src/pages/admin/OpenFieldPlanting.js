import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { confirmAction } from '../../components/ConfirmDialog';
import {
  Box, Typography, Paper, Button, TextField, MenuItem, Chip,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Dialog, DialogTitle, DialogContent, DialogActions, IconButton, Tooltip,
  CircularProgress,
} from '@mui/material';
import {
  AddOutlined as Add, DeleteOutlined as Delete, SaveOutlined as SaveIcon, FileUploadOutlined as FileUpload,
  AddCircleOutlineOutlined as AddCircleOutline,
} from '@mui/icons-material';
import { apiRequest } from '../../utils/api';
import { useNotification } from '../../contexts/NotificationContext';
import { useActiveSeason } from '../../contexts/ActiveSeasonContext';
import OpenFieldImporter from '../../components/OpenFieldImporter';
import ActiveOccupancyPanel from '../../components/planting/ActiveOccupancyPanel';
import { excelTableSx, freezeColumnsSx, GutterCell, GUTTER_WIDTH } from '../../components/table/ExcelTable';
import usePlantingOccupancy from '../../hooks/usePlantingOccupancy';
import { PLANTING_OCCUPANCY_SOURCE } from '../../utils/plantingOccupancy';
import { openNativeDatePicker } from '../../utils/openNativeDatePicker';

const OF_FROZEN_WIDTHS = [120, 130];
const ofDraftSx = {
  '&&& .MuiTableBody-root .MuiTableRow-root.row-draft .MuiTableCell-root:not(.table-gutter)': {
    backgroundColor: '#fffde7',
  },
};

const UOM_OPTIONS = ['Kg', 'MT', 'PCS'];
const CROP_TYPE_OPTIONS = ['Annual', 'Permanent'];
const CREATE_NEW_VALUE = '__CREATE_NEW__';

function emptyRow() {
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
    cropType: 'Annual',
    breederId: '',
    lotBatchNo: '',
    quantity: '',
    uom: 'Kg',
    authorizedBy: '',
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
    cropType: r.crop_type || 'Annual',
    breederId: r.breeder_id || '',
    breederName: r.breeder_name || '',
    lotBatchNo: r.lot_batch_no || '',
    quantity: r.quantity != null ? String(r.quantity) : '',
    uom: r.uom || 'Kg',
    authorizedBy: r.authorized_by || '',
    cropHistoryId: r.crop_history_id || null,
    status: r.status || 'active',
  };
}

function CellInput({ value, onChange, type = 'text', placeholder, rowIdx, colIdx, totalCols, onAddRow, width, ...rest }) {
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
        const next = document.querySelector(`[data-ofp="${targetRow}-${targetCol}"]`);
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
      inputProps={{ 'data-ofp': `${rowIdx}-${colIdx}` }}
      {...rest}
    />
  );
}

function CellSelect({ value, onChange, options, rowIdx, colIdx, allowEmpty, width }) {
  const handleKeyDown = (e) => {
    const { key } = e;
    let targetRow = null;
    if (key === 'ArrowDown' && e.altKey) return;
    if (key === 'ArrowDown') { e.preventDefault(); targetRow = rowIdx + 1; }
    else if (key === 'ArrowUp' && rowIdx > 0) { e.preventDefault(); targetRow = rowIdx - 1; }
    if (targetRow !== null) {
      setTimeout(() => {
        const next = document.querySelector(`[data-ofp="${targetRow}-${colIdx}"]`);
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
      InputProps={{ disableUnderline: false, sx: { fontSize: '0.8125rem' } }}
      sx={{ width: width || '100%', '& .MuiInput-input': { p: '2px 0' } }}
      SelectProps={{ native: true, inputProps: { 'data-ofp': `${rowIdx}-${colIdx}` } }}
    >
      {allowEmpty && <option value="" />}
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </TextField>
  );
}

export default function OpenFieldPlanting({ siteFilter, fields = [], crops = [], allVarietiesByCrop = {}, setAllVarietiesByCrop, refreshMaster }) {
  const notify = useNotification();
  const { isSeasonReadOnly } = useActiveSeason();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [breeders, setBreeders] = useState([]);
  const [importerOpen, setImporterOpen] = useState(false);
  const [createDialog, setCreateDialog] = useState({ open: false, type: '', rowIdx: -1, groupSpan: 1 });
  const [createName, setCreateName] = useState('');
  const [creating, setCreating] = useState(false);

  const filteredFields = useMemo(
    () => siteFilter ? fields.filter((f) => f.siteId === siteFilter) : fields,
    [fields, siteFilter]
  );

  const { occupancyByField, loading: occupancyLoading, reload: reloadOccupancy } =
    usePlantingOccupancy(PLANTING_OCCUPANCY_SOURCE.OPEN_FIELD, rows);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const params = siteFilter ? `?site_id=${siteFilter}` : '';
      const [data, bData] = await Promise.all([
        apiRequest(`/open-field-planting${params}`),
        apiRequest('/breeders').catch(() => []),
      ]);
      const existing = (data || []).map(serverToRow);
      setRows([...existing, emptyRow(), emptyRow(), emptyRow()]);
      setBreeders(bData || []);
    } catch (err) {
      notify.error(err.message || 'Failed to load open field records');
    } finally {
      setLoading(false);
    }
  }, [siteFilter, notify]);

  useEffect(() => { loadRecords(); }, [loadRecords]);

  const reloadVarieties = useCallback(async () => {
    if (!crops.length || !setAllVarietiesByCrop) return;
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
  }, [crops, setAllVarietiesByCrop]);

  useEffect(() => { if (crops.length) reloadVarieties(); }, [crops.length, reloadVarieties]);

  const updateRow = useCallback((idx, key, value) => {
    setRows((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [key]: value, _dirty: true };
      return next;
    });
  }, []);

  const addRow = useCallback(() => {
    setRows((prev) => [...prev, emptyRow()]);
  }, []);

  // Rows mirrored in a ref: the confirm and the delete run outside the state
  // updater (updaters can run twice), and the row stays if the delete fails.
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const removeRow = useCallback(async (idx) => {
    const row = rowsRef.current[idx];
    if (!row) return;
    if (row._serverId) {
      if (!(await confirmAction('Delete this record?'))) return;
      try {
        await apiRequest(`/open-field-planting/${row._serverId}`, { method: 'DELETE' });
      } catch (err) {
        notify.error(err?.message || 'Delete failed');
        return;
      }
    }
    setRows((prev) => prev.filter((r) => r !== row));
  }, [notify]);

  const handleVarietyChange = useCallback((idx, varietyId) => {
    setRows((prev) => {
      const next = [...prev];
      const row = { ...next[idx], varietyId, _dirty: true };
      if (varietyId && varietyId !== CREATE_NEW_VALUE) {
        const cropId = row.cropId;
        const varieties = allVarietiesByCrop[cropId] || [];
        const v = varieties.find((v2) => v2.id === varietyId);
        if (v && v.breederId) {
          row.breederId = v.breederId;
        }
      }
      next[idx] = row;
      return next;
    });
  }, [allVarietiesByCrop]);

  const varietyOptionsForCrop = useCallback((cropId) => {
    if (!cropId) return [];
    return (allVarietiesByCrop[cropId] || []).map((v) => ({ value: v.id, label: v.name }));
  }, [allVarietiesByCrop]);

  const breederOptions = useMemo(() =>
    breeders.map((b) => ({ value: b.id, label: b.name })),
    [breeders]
  );

  const saveRecords = async () => {
    const dirtyRows = rows.filter((r) => r._dirty && r.seedingDate);
    if (dirtyRows.length === 0) { notify.info('No changes to save'); return; }

    setSaving(true);
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
          cropType: r.cropType || 'Annual',
          breederId: r.breederId || null,
          lotBatchNo: r.lotBatchNo || null,
          quantity: r.quantity || null,
          uom: r.uom || null,
          authorizedBy: r.authorizedBy || null,
        }));
        await apiRequest('/open-field-planting/bulk', {
          method: 'POST', body: JSON.stringify({ entries }),
        });
      }

      for (const r of existingRows) {
        await apiRequest(`/open-field-planting/${r._serverId}`, {
          method: 'PUT',
          body: JSON.stringify({
            seedingDate: r.seedingDate,
            fieldId: r.fieldId || null,
            segment: r.segment || null,
            totalArea: r.totalArea || null,
            cropId: r.cropId || null,
            varietyId: r.varietyId || null,
            cropType: r.cropType || 'Annual',
            breederId: r.breederId || null,
            lotBatchNo: r.lotBatchNo || null,
            quantity: r.quantity || null,
            uom: r.uom || null,
            authorizedBy: r.authorizedBy || null,
          }),
        });
      }

      notify.success(`Saved ${dirtyRows.length} record(s)`);
      loadRecords();
      reloadOccupancy();
    } catch (err) {
      notify.error(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

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
        for (let g = 0; g < groupSpan; g++) updateRow(rowIdx + g, 'cropId', res.id);
        refreshMaster?.();
        notify.success(`Crop "${res.name}" created`);
      } else if (type === 'variety') {
        const row = rows[rowIdx];
        if (!row.cropId) { notify.error('Select a crop first'); setCreating(false); return; }
        const breederId = row.breederId || undefined;
        const res = await apiRequest(`/crops/${row.cropId}/varieties`, {
          method: 'POST', body: JSON.stringify({ name: createName.trim(), breederId }),
        });
        for (let g = 0; g < groupSpan; g++) updateRow(rowIdx + g, 'varietyId', res.id);
        setAllVarietiesByCrop?.((prev) => {
          const list = [...(prev[row.cropId] || []), res];
          return { ...prev, [row.cropId]: list };
        });
        notify.success(`Variety "${res.name}" created`);
      } else if (type === 'breeder') {
        const res = await apiRequest('/breeders', { method: 'POST', body: JSON.stringify({ name: createName.trim() }) });
        for (let g = 0; g < groupSpan; g++) {
          updateRow(rowIdx + g, 'breederId', res.id);
        }
        setBreeders((prev) => prev.some((b) => b.id === res.id) ? prev : [...prev, res]);
        notify.success(`Breeder "${res.name}" created`);
      }
      setCreateDialog({ open: false, type: '', rowIdx: -1, groupSpan: 1 });
    } catch (err) {
      notify.error(err.message || 'Failed to create');
    } finally {
      setCreating(false);
    }
  };

  const TOTAL_COLS = 12;
  const dirtyCount = rows.filter((r) => r._dirty && r.seedingDate).length;

  const isGroupEnd = useCallback((i) => {
    if (i >= rows.length - 1) return false;
    const cur = rows[i];
    const next = rows[i + 1];
    if (!cur.seedingDate || !cur.fieldId || !cur.cropId) return false;
    if (next._isNew && !next.seedingDate) return true;
    return cur.seedingDate !== next.seedingDate || cur.fieldId !== next.fieldId || cur.cropId !== next.cropId;
  }, [rows]);

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>;

  return (
    <>
      <Paper sx={{ p: 2, mb: 2, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
        <Chip label={`${rows.filter(r => !r._isNew).length} records`} variant="outlined" size="small" />
        {dirtyCount > 0 && <Chip label={`${dirtyCount} unsaved`} color="warning" size="small" />}
        <Box sx={{ flexGrow: 1 }} />
        <Button variant="outlined" startIcon={<FileUpload />} onClick={() => setImporterOpen(true)} disabled={isSeasonReadOnly}>
          Import Excel
        </Button>
        <Button variant="contained" startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
          onClick={saveRecords} disabled={saving || dirtyCount === 0 || isSeasonReadOnly}>
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </Paper>

      <ActiveOccupancyPanel
        occupancyByField={occupancyByField}
        loading={occupancyLoading}
        fields={filteredFields}
        source={PLANTING_OCCUPANCY_SOURCE.OPEN_FIELD}
        rows={rows}
        onUprootSuccess={() => { loadRecords(); reloadOccupancy(); }}
      />

      <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 'calc(100vh - 280px)', overflow: 'auto' }}>
        <Table size="small" sx={[excelTableSx, freezeColumnsSx(OF_FROZEN_WIDTHS, GUTTER_WIDTH), ofDraftSx, { minWidth: 1400 }]}>
          <TableHead>
            <TableRow>
              <GutterCell />
              <TableCell className="col-frozen-0">Seeding Date</TableCell>
              <TableCell className="col-frozen-1">Field</TableCell>
              <TableCell>Segment</TableCell>
              <TableCell>Total Area</TableCell>
              <TableCell>Crop Name</TableCell>
              <TableCell>Variety</TableCell>
              <TableCell>Crop Type</TableCell>
              <TableCell>Breeder</TableCell>
              <TableCell>Lot/Batch No</TableCell>
              <TableCell className="col-numeric">Quantity</TableCell>
              <TableCell>UOM</TableCell>
              <TableCell>Authorized By</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row, i) => {
              const groupEnd = isGroupEnd(i);
              const varOpts = varietyOptionsForCrop(row.cropId);
              const hasVarietyInList = !row.varietyId || varOpts.some(o => o.value === row.varietyId);

              return (
                <React.Fragment key={row._key}>
                <TableRow hover className={row._dirty ? 'row-draft' : undefined}>
                  <GutterCell index={i + 1} />

                  <TableCell className="col-frozen-0">
                    <CellInput value={row.seedingDate} type="date" rowIdx={i} colIdx={0} totalCols={TOTAL_COLS} onAddRow={addRow}
                      onChange={(v) => updateRow(i, 'seedingDate', v)} width={120} />
                  </TableCell>

                  <TableCell className="col-frozen-1">
                    <CellSelect value={row.fieldId} rowIdx={i} colIdx={1} allowEmpty
                      onChange={(v) => updateRow(i, 'fieldId', v)}
                      options={filteredFields.map((f) => ({ value: f.id, label: f.name }))}
                      width={110} />
                  </TableCell>

                  <TableCell>
                    <CellInput value={row.segment} rowIdx={i} colIdx={2} totalCols={TOTAL_COLS} onAddRow={addRow}
                      onChange={(v) => updateRow(i, 'segment', v)} placeholder="Seg" width={60} />
                  </TableCell>

                  <TableCell>
                    <CellInput value={row.totalArea} rowIdx={i} colIdx={3} totalCols={TOTAL_COLS} onAddRow={addRow}
                      onChange={(v) => updateRow(i, 'totalArea', v)} placeholder="e.g. 1 Ha" width={70} />
                  </TableCell>

                  <TableCell>
                    <CellSelect value={row.cropId} rowIdx={i} colIdx={4} allowEmpty
                      onChange={(v) => {
                        if (v === CREATE_NEW_VALUE) { openCreateDialog('crop', i); return; }
                        updateRow(i, 'cropId', v);
                        updateRow(i, 'varietyId', '');
                      }}
                      options={[
                        ...crops.map((c) => ({ value: typeof c === 'object' ? c.id : c, label: typeof c === 'object' ? c.name : c })),
                        { value: CREATE_NEW_VALUE, label: '+ Create New' },
                      ]}
                      width={100} />
                  </TableCell>

                  <TableCell>
                    <CellSelect value={row.varietyId} rowIdx={i} colIdx={5} allowEmpty
                      onChange={(v) => {
                        if (v === CREATE_NEW_VALUE) { openCreateDialog('variety', i); return; }
                        handleVarietyChange(i, v);
                      }}
                      options={[
                        ...varOpts,
                        ...(!hasVarietyInList && row.varietyName ? [{ value: row.varietyId, label: row.varietyName }] : []),
                        { value: CREATE_NEW_VALUE, label: '+ Create New' },
                      ]}
                      width={100} />
                  </TableCell>

                  <TableCell>
                    <CellSelect value={row.cropType} rowIdx={i} colIdx={6}
                      onChange={(v) => updateRow(i, 'cropType', v)}
                      options={CROP_TYPE_OPTIONS.map((t) => ({ value: t, label: t }))}
                      width={80} />
                  </TableCell>

                  <TableCell>
                    <CellSelect value={row.breederId} rowIdx={i} colIdx={7} allowEmpty
                      onChange={(v) => {
                        if (v === CREATE_NEW_VALUE) { openCreateDialog('breeder', i); return; }
                        updateRow(i, 'breederId', v);
                      }}
                      options={[
                        ...breederOptions,
                        { value: CREATE_NEW_VALUE, label: '+ Create New' },
                      ]}
                      width={110} />
                  </TableCell>

                  <TableCell>
                    <CellInput value={row.lotBatchNo} rowIdx={i} colIdx={8} totalCols={TOTAL_COLS} onAddRow={addRow}
                      onChange={(v) => updateRow(i, 'lotBatchNo', v)} placeholder="Lot#" width={80} />
                  </TableCell>

                  <TableCell className="col-numeric">
                    <CellInput value={row.quantity} rowIdx={i} colIdx={9} totalCols={TOTAL_COLS} onAddRow={addRow}
                      onChange={(v) => updateRow(i, 'quantity', v)} placeholder="0" width={60} type="number" />
                  </TableCell>

                  <TableCell>
                    <CellSelect value={row.uom} rowIdx={i} colIdx={10}
                      onChange={(v) => updateRow(i, 'uom', v)}
                      options={UOM_OPTIONS.map((u) => ({ value: u, label: u }))}
                      width={60} />
                  </TableCell>

                  <TableCell>
                    <CellInput value={row.authorizedBy} rowIdx={i} colIdx={11} totalCols={TOTAL_COLS} onAddRow={addRow}
                      onChange={(v) => updateRow(i, 'authorizedBy', v)} placeholder="" width={90} />
                  </TableCell>

                  <TableCell>
                    <IconButton size="small" color="error" onClick={() => removeRow(i)} aria-label="Delete">
                      <Delete sx={{ fontSize: 16 }} />
                    </IconButton>
                  </TableCell>
                </TableRow>
                {groupEnd && (
                  <TableRow>
                    <TableCell colSpan={14} sx={{ p: 0, height: '4px', bgcolor: 'table.headerBg', border: 'none' }} />
                  </TableRow>
                )}
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      <Box sx={{ mt: 1, display: 'flex', gap: 1 }}>
        <Button size="small" startIcon={<Add />} onClick={addRow} disabled={isSeasonReadOnly}>Add Row</Button>
      </Box>

      {/* Create Dialog */}
      <Dialog open={createDialog.open} onClose={() => setCreateDialog({ open: false, type: '', rowIdx: -1, groupSpan: 1 })} maxWidth="xs" fullWidth>
        <DialogTitle>Create New {createDialog.type === 'crop' ? 'Crop' : createDialog.type === 'variety' ? 'Variety' : 'Breeder'}</DialogTitle>
        <DialogContent>
          <TextField autoFocus fullWidth label="Name" value={createName} onChange={(e) => setCreateName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
            sx={{ mt: 1 }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialog({ open: false, type: '', rowIdx: -1, groupSpan: 1 })}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate} disabled={creating || !createName.trim()}>
            {creating ? <CircularProgress size={16} /> : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Importer */}
      <OpenFieldImporter
        open={importerOpen}
        onClose={() => setImporterOpen(false)}
        fields={filteredFields}
        crops={crops}
        allVarietiesByCrop={allVarietiesByCrop}
        breeders={breeders}
        existingRecords={rows.filter(r => !r._isNew)}
        siteId={siteFilter}
        onImportComplete={() => { loadRecords(); refreshMaster?.(); reloadVarieties(); reloadOccupancy(); }}
      />
    </>
  );
}
