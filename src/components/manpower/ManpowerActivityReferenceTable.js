import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Autocomplete, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, IconButton, Menu, MenuItem, Paper, Tab, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Tabs, TextField, Tooltip, Typography,
} from '@mui/material';
import { AddOutlined as Add, DeleteOutlined as Delete, DriveFileMoveOutlined as DriveFileMove, SaveOutlined as Save } from '@mui/icons-material';
import { apiRequest } from '../../utils/api';
import { useNotification } from '../../contexts/NotificationContext';
import { excelTableSx, GutterCell } from '../table/ExcelTable';
import {
  ANY_CROP_LABEL,
  ANY_VARIETY_LABEL,
  REFERENCE_SHEETS,
  isGeneralReferenceSheet,
  matchSheetName,
  referenceSheetForActivity,
  resolveRowSheetId,
  rowMatchesSheet,
  visibleReferenceSheets,
} from '../../utils/manpowerReferenceSheets';
import InfoNote from '../InfoNote';

function emptyDraft(localId, crop, variety, sheet) {
  return {
    localId,
    id: null,
    activity: '',
    crop: crop || '',
    variety: variety || '',
    unit: '',
    target: '',
    sheet: sheet || '',
    dirty: true,
  };
}

function toFormRow(item) {
  return {
    localId: item.id,
    id: item.id,
    activity: item.activity || '',
    crop: item.crop || '',
    variety: item.variety || '',
    unit: item.unit || '',
    target: item.target == null || item.target === '' ? '' : String(item.target),
    sheet: item.sheet || '',
    dirty: false,
  };
}

function payloadFromRow(row, siteId) {
  const targetRaw = String(row.target ?? '').trim();
  return {
    siteId,
    activity: row.activity.trim(),
    crop: row.crop.trim() || null,
    variety: row.variety.trim() || null,
    unit: row.unit.trim() || null,
    target: targetRaw === '' ? null : Number(targetRaw),
    sheet: row.sheet || null,
  };
}

async function fetchVarietiesForCrop(cropName, findCropIdByName) {
  if (!cropName) return [];
  const cropId = findCropIdByName ? findCropIdByName(cropName) : null;
  const qs = cropId
    ? `crop_id=${encodeURIComponent(cropId)}`
    : `crop_name=${encodeURIComponent(cropName)}`;
  const list = await apiRequest(`/manpower/admin/varieties?${qs}`);
  return (list || []).map((v) => v.name).filter(Boolean);
}

function storedSheetForTab(sheetId, tabs) {
  const found = tabs.find((s) => s.id === sheetId);
  if (!found) return sheetId;
  return found.stored || found.id;
}

const sectionRowSx = {
  '& .MuiTableCell-root:not(.table-gutter)': {
    bgcolor: 'table.sectionBg',
    color: 'table.sectionText',
    fontWeight: 700,
  },
};

const varietyRowSx = {
  '& .MuiTableCell-root:not(.table-gutter)': {
    bgcolor: 'table.sectionBg',
    color: 'table.sectionText',
    fontWeight: 600,
    pl: 3,
  },
};

const tabSx = {
  textTransform: 'none',
  fontWeight: 600,
  minHeight: 42,
  '&.Mui-selected': { color: 'table.headerBg' },
};

export default function ManpowerActivityReferenceTable({
  siteId,
  canEdit,
  extraActivities = [],
  crops = [],
  findCropIdByName,
  tableHeight,
}) {
  const notify = useNotification();
  const [sheet, setSheet] = useState('preparation');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState(null);
  const [varietiesByCrop, setVarietiesByCrop] = useState({});
  const [addMenu, setAddMenu] = useState(null);
  const [moveMenu, setMoveMenu] = useState(null);
  const [newSheetDialog, setNewSheetDialog] = useState(null);
  const [newSheetName, setNewSheetName] = useState('');

  const catalogNames = useMemo(() => {
    return [...new Set((extraActivities || []).map((a) => a.name || a).filter(Boolean))];
  }, [extraActivities]);

  const tabs = useMemo(() => visibleReferenceSheets(rows), [rows]);
  const currentStoredSheet = storedSheetForTab(sheet, tabs);

  const sheetActivityOptions = useMemo(() => {
    const builtin = REFERENCE_SHEETS.some((s) => s.id === sheet);
    const fromCatalog = builtin
      ? catalogNames.filter((n) => referenceSheetForActivity(n) === sheet)
      : catalogNames;
    const fromRows = rows.filter((r) => rowMatchesSheet(r, sheet)).map((r) => r.activity).filter(Boolean);
    return [...new Set([...fromCatalog, ...fromRows])].sort((a, b) => a.localeCompare(b));
  }, [catalogNames, rows, sheet]);

  const load = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      const data = await apiRequest(`/manpower/activity-references?site_id=${encodeURIComponent(siteId)}`);
      setRows((data || []).map(toFormRow));
    } catch (err) {
      notify.error(err.message || 'Failed to load activity reference');
    } finally {
      setLoading(false);
    }
  }, [siteId, notify]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!tabs.some((t) => t.id === sheet)) setSheet('preparation');
  }, [tabs, sheet]);

  const cropNames = useMemo(() => {
    const set = new Set(crops || []);
    rows.forEach((r) => { if (r.crop) set.add(r.crop); });
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [crops, rows]);

  const cropKey = cropNames.join('\0');

  useEffect(() => {
    const names = cropKey ? cropKey.split('\0') : [];
    let cancelled = false;
    async function loadAllVarieties() {
      const next = {};
      await Promise.all(names.map(async (cropName) => {
        try {
          next[cropName] = await fetchVarietiesForCrop(cropName, findCropIdByName);
        } catch {
          next[cropName] = [];
        }
      }));
      if (!cancelled) setVarietiesByCrop(next);
    }
    if (names.length) loadAllVarieties();
    return () => { cancelled = true; };
  }, [cropKey, findCropIdByName]);

  const displayRows = useMemo(() => {
    const sheetRows = rows.filter((r) => rowMatchesSheet(r, sheet));
    if (isGeneralReferenceSheet(sheet)) {
      return sheetRows
        .slice()
        .sort((a, b) => a.activity.localeCompare(b.activity))
        .map((row) => ({ type: 'row', row }));
    }

    const out = [];
    const anyCropRows = sheetRows.filter((r) => !r.crop);
    if (anyCropRows.length) {
      out.push({ type: 'crop', crop: '', label: ANY_CROP_LABEL });
      anyCropRows
        .slice()
        .sort((a, b) => a.activity.localeCompare(b.activity))
        .forEach((row) => out.push({ type: 'row', row }));
    }

    for (const crop of cropNames) {
      out.push({ type: 'crop', crop, label: crop });
      out.push({ type: 'variety', crop, variety: '', label: ANY_VARIETY_LABEL });
      sheetRows
        .filter((r) => r.crop === crop && !r.variety)
        .sort((a, b) => a.activity.localeCompare(b.activity))
        .forEach((row) => out.push({ type: 'row', row }));

      const varieties = [...new Set([
        ...(varietiesByCrop[crop] || []),
        ...sheetRows.filter((r) => r.crop === crop && r.variety).map((r) => r.variety),
      ])].sort((a, b) => a.localeCompare(b));

      for (const variety of varieties) {
        out.push({ type: 'variety', crop, variety, label: variety });
        sheetRows
          .filter((r) => r.crop === crop && r.variety === variety)
          .sort((a, b) => a.activity.localeCompare(b.activity))
          .forEach((row) => out.push({ type: 'row', row }));
      }
    }
    return out;
  }, [rows, sheet, cropNames, varietiesByCrop]);

  const updateRow = (localId, patch) => {
    setRows((prev) => prev.map((r) => (
      r.localId === localId ? { ...r, ...patch, dirty: true } : r
    )));
  };

  const addUnder = (crop, variety) => {
    setRows((prev) => [...prev, emptyDraft(`new-${Date.now()}`, crop, variety, currentStoredSheet)]);
    setAddMenu(null);
  };

  const handleSave = async (row) => {
    if (!row.activity.trim()) {
      notify.error('Activity is required');
      return;
    }
    const body = payloadFromRow(row, siteId);
    if (body.target != null && Number.isNaN(body.target)) {
      notify.error('Target must be a number');
      return;
    }
    if (!body.sheet) body.sheet = currentStoredSheet;
    setSavingId(row.localId);
    try {
      if (row.id) {
        const saved = await apiRequest(`/manpower/activity-references/${row.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            activity: body.activity,
            crop: body.crop,
            variety: body.variety,
            unit: body.unit,
            target: body.target,
            sheet: body.sheet,
          }),
        });
        setRows((prev) => prev.map((r) => (r.localId === row.localId ? toFormRow(saved) : r)));
      } else {
        const saved = await apiRequest('/manpower/activity-references', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        setRows((prev) => prev.map((r) => (r.localId === row.localId ? toFormRow(saved) : r)));
      }
      notify.success('Reference saved');
    } catch (err) {
      notify.error(err.message || 'Failed to save reference');
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (row) => {
    if (!row.id) {
      setRows((prev) => prev.filter((r) => r.localId !== row.localId));
      return;
    }
    if (!window.confirm('Delete this reference row?')) return;
    try {
      await apiRequest(`/manpower/activity-references/${row.id}`, { method: 'DELETE' });
      setRows((prev) => prev.filter((r) => r.localId !== row.localId));
      notify.success('Reference deleted');
    } catch (err) {
      notify.error(err.message || 'Failed to delete reference');
    }
  };

  const applySheet = async (row, stored, nextId) => {
    setMoveMenu(null);
    setNewSheetDialog(null);
    setNewSheetName('');
    if (!row.id) {
      updateRow(row.localId, { sheet: stored });
      setSheet(nextId);
      return;
    }
    setSavingId(row.localId);
    try {
      const saved = await apiRequest(`/manpower/activity-references/${row.id}`, {
        method: 'PUT',
        body: JSON.stringify({ sheet: stored }),
      });
      setRows((prev) => prev.map((r) => (r.localId === row.localId ? toFormRow(saved) : r)));
      setSheet(nextId);
      notify.success('Moved to another sheet');
    } catch (err) {
      notify.error(err.message || 'Failed to move row');
    } finally {
      setSavingId(null);
    }
  };

  const submitNewSheet = () => {
    if (!newSheetDialog) return;
    const matched = matchSheetName(newSheetName, tabs);
    if (!matched) {
      notify.error('Enter a sheet name');
      return;
    }
    applySheet(newSheetDialog.row, matched.stored, matched.id);
  };

  const colCount = canEdit ? 5 : 4;
  const addCropVarieties = addMenu ? ['', ...(varietiesByCrop[addMenu.crop] || [])] : [];

  if (!siteId) {
    return (
      <Alert severity="warning">Select a site using the dropdown at the top left of the app.</Alert>
    );
  }

  let activityIndex = 0;

  return (
    <Box>
      <InfoNote severity="info" sx={{ mb: 2 }}>
        Existing activities and units are listed by crop. Targets stay blank until you fill them.
        A variety only needs the activities that differ; the rest stay on Any variety.
        Only Operation Managers can change this table.
      </InfoNote>
      {!canEdit && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          View only — ask an Operation Manager to change the reference.
        </Typography>
      )}

      <Tabs
        value={sheet}
        onChange={(_, v) => { if (v) setSheet(v); }}
        variant="scrollable"
        scrollButtons="auto"
        sx={{ mb: 1.5, minHeight: 42, '& .MuiTabs-indicator': { bgcolor: 'table.headerBg' } }}
      >
        {tabs.map((s) => (
          <Tab key={s.id} value={s.id} label={s.label} sx={tabSx} />
        ))}
      </Tabs>

      <Box sx={{ mb: 1.5, display: 'flex', gap: 1 }}>
        {canEdit && isGeneralReferenceSheet(sheet) && (
          <Button size="small" variant="contained" startIcon={<Add />} onClick={() => addUnder('', '')}>
            Add activity
          </Button>
        )}
        <Button size="small" variant="outlined" onClick={load} disabled={loading}>Refresh</Button>
      </Box>

      <TableContainer
        component={Paper}
        variant="outlined"
        sx={{
          maxHeight: tableHeight || 480,
          '&&& .MuiTableBody-root .MuiTableRow-root.row-section:hover .MuiTableCell-root:not(.table-gutter)': {
            bgcolor: 'table.sectionBg',
          },
        }}
      >
        <Table size="small" stickyHeader sx={excelTableSx}>
          <TableHead>
            <TableRow>
              <GutterCell />
              <TableCell>Activity</TableCell>
              <TableCell>Unit</TableCell>
              <TableCell className="col-numeric">Target</TableCell>
              {canEdit && <TableCell />}
            </TableRow>
          </TableHead>
          <TableBody>
            {!loading && displayRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={colCount}>
                  <Typography variant="body2" color="text.secondary">
                    {isGeneralReferenceSheet(sheet)
                      ? 'No general activities for this site yet.'
                      : 'No crops on this site yet, so field activities have nowhere to group.'}
                  </Typography>
                </TableCell>
              </TableRow>
            )}
            {displayRows.map((item) => {
              if (item.type === 'crop') {
                return (
                  <TableRow key={`crop-${item.crop || 'any'}`} className="row-section" sx={sectionRowSx}>
                    <GutterCell />
                    <TableCell colSpan={colCount - 1}>{item.label}</TableCell>
                  </TableRow>
                );
              }
              if (item.type === 'variety') {
                return (
                  <TableRow key={`var-${item.crop}-${item.variety || 'any'}`} className="row-section" sx={varietyRowSx}>
                    <GutterCell />
                    <TableCell colSpan={canEdit ? colCount - 2 : colCount - 1}>
                      {item.label}
                    </TableCell>
                    {canEdit && (
                      <TableCell>
                        <Button
                          size="small"
                          startIcon={<Add />}
                          onClick={async (e) => {
                            if (item.variety) {
                              addUnder(item.crop, item.variety);
                              return;
                            }
                            const anchor = e.currentTarget;
                            const crop = item.crop;
                            if (!(varietiesByCrop[crop] || []).length) {
                              try {
                                const names = await fetchVarietiesForCrop(crop, findCropIdByName);
                                setVarietiesByCrop((prev) => ({ ...prev, [crop]: names }));
                              } catch {
                                setVarietiesByCrop((prev) => ({ ...prev, [crop]: prev[crop] || [] }));
                              }
                            }
                            setAddMenu({ anchor, crop });
                          }}
                          sx={{ color: 'inherit', textTransform: 'none' }}
                        >
                          Add
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                );
              }

              const row = item.row;
              activityIndex += 1;
              const idx = activityIndex;
              return (
                <TableRow key={row.localId} hover>
                  <GutterCell index={idx} />
                  <TableCell sx={{ minWidth: 220 }}>
                    {canEdit ? (
                      <Autocomplete
                        size="small"
                        freeSolo
                        options={sheetActivityOptions}
                        value={row.activity}
                        onChange={(_, val) => updateRow(row.localId, { activity: val || '' })}
                        onInputChange={(_, val, reason) => {
                          if (reason === 'input') updateRow(row.localId, { activity: val });
                        }}
                        renderInput={(params) => (
                          <TextField {...params} placeholder="Activity" variant="standard" />
                        )}
                      />
                    ) : (row.activity || '—')}
                  </TableCell>
                  <TableCell sx={{ minWidth: 90 }}>
                    {canEdit ? (
                      <TextField
                        size="small"
                        variant="standard"
                        value={row.unit}
                        onChange={(e) => updateRow(row.localId, { unit: e.target.value })}
                        placeholder="Unit"
                        fullWidth
                      />
                    ) : (row.unit || '—')}
                  </TableCell>
                  <TableCell className="col-numeric" sx={{ minWidth: 90 }}>
                    {canEdit ? (
                      <TextField
                        size="small"
                        variant="standard"
                        type="number"
                        value={row.target}
                        onChange={(e) => updateRow(row.localId, { target: e.target.value })}
                      />
                    ) : (row.target === '' ? '—' : row.target)}
                  </TableCell>
                  {canEdit && (
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      <Tooltip title="Save" describeChild>
                        <span>
                          <IconButton
                            size="small"
                            onClick={() => handleSave(row)}
                            disabled={savingId === row.localId || !row.dirty}
                           aria-label="Save">
                            <Save fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title="Move to another sheet">
                        <IconButton
                          size="small"
                          onClick={(e) => setMoveMenu({ anchor: e.currentTarget, row })}
                          disabled={savingId === row.localId}
                        >
                          <DriveFileMove fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <IconButton size="small" onClick={() => handleDelete(row)}>
                          <Delete fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      <Menu
        anchorEl={addMenu?.anchor || null}
        open={Boolean(addMenu)}
        onClose={() => setAddMenu(null)}
      >
        {addCropVarieties.map((variety) => (
          <MenuItem
            key={variety || 'any'}
            onClick={() => addUnder(addMenu.crop, variety)}
          >
            {variety || ANY_VARIETY_LABEL}
          </MenuItem>
        ))}
      </Menu>

      <Menu
        anchorEl={moveMenu?.anchor || null}
        open={Boolean(moveMenu)}
        onClose={() => setMoveMenu(null)}
      >
        {tabs.filter((t) => t.id !== (moveMenu ? resolveRowSheetId(moveMenu.row) : sheet)).map((t) => (
          <MenuItem
            key={t.id}
            onClick={() => applySheet(moveMenu.row, storedSheetForTab(t.id, tabs), t.id)}
          >
            {t.label}
          </MenuItem>
        ))}
        <Divider />
        <MenuItem
          onClick={() => {
            setNewSheetDialog({ row: moveMenu.row });
            setNewSheetName('');
            setMoveMenu(null);
          }}
        >
          Create new sheet…
        </MenuItem>
      </Menu>

      <Dialog open={Boolean(newSheetDialog)} onClose={() => setNewSheetDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Create new sheet</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Sheet name"
            fullWidth
            value={newSheetName}
            onChange={(e) => setNewSheetName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submitNewSheet(); }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewSheetDialog(null)}>Cancel</Button>
          <Button variant="contained" onClick={submitNewSheet}>Move</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
