import { useState, useEffect, useMemo, useCallback } from 'react';
import { useConfirmDialog } from '../../components/ConfirmDialog';
import {
  Box,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  IconButton,
  TablePagination,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Button,
  CircularProgress,
} from '@mui/material';
import {
  DeleteOutlined as DeleteIcon,
  EditOutlined as EditIcon,
  SaveOutlined as SaveIcon,
  InboxOutlined as InboxIcon,
} from '@mui/icons-material';
import { listFertigationAll, listRecipesAll, deleteFertigation, updateFertigation } from '../../utils/backendApi';
import { useNotification } from '../../contexts/NotificationContext';
import useOpsExcelExport from '../../hooks/useOpsExcelExport';
import { OPS_EXPORT } from '../../utils/companyExcelExport';
import { buildFertigationExcelSheets } from '../../utils/fertigationExcelExport';
import { fertigationCropName, fertigationRecipeName } from '../../utils/fertigationEntryLabels';
import { isRecipeApproved, recipeOptionLabel, recipePickerOptions } from '../../utils/recipeApproval';
import EntryHistoryToolbar from '../../components/entries/EntryHistoryToolbar';
import { useEntryHistory } from '../../hooks/useEntryHistory';
import useSeasonListDates from '../../hooks/useSeasonListDates';
import { excelTableSx, freezeColumnsSx } from '../../components/table/ExcelTable';
import { DeleteSelectedButton, RowSelectCell, SelectAllHeadCell, deleteIdsSequentially } from '../../components/table/BulkSelect';
import { useRowSelection } from '../../hooks/useRowSelection';

const FERT_FROZEN_WIDTHS = [42, 90, 130];

const sortLabelSx = {
  '& .MuiTableSortLabel-root, & .MuiTableSortLabel-root:hover, & .MuiTableSortLabel-root.Mui-active': {
    color: 'inherit',
  },
  '& .MuiTableSortLabel-icon': { color: 'inherit !important' },
};

function buildFieldMap(masterData) {
  const map = {};
  masterData.countries?.forEach((country) => {
    country.sites?.forEach((site) => {
      site.farmAreas?.forEach((farmArea) => {
        farmArea.fields?.forEach((field) => {
          map[field.id] = {
            name: field.name,
            currentCrop: field.currentCrop,
            farmAreaId: farmArea.id,
            farmAreaName: farmArea.name,
            siteId: site.id,
          };
        });
      });
    });
  });
  return map;
}

function getStructureFieldIds(structureType, groupedFields) {
  switch (structureType) {
    case 'nethouse':
      return (groupedFields.nethouse || []).map((f) => f.id);
    case 'greenhouse':
      return (groupedFields.greenhouse || []).map((f) => f.id);
    case 'openfield':
      return (groupedFields.openField || []).map((f) => f.id);
    default:
      return [];
  }
}

export default function FertigationEntriesTable({
  siteId,
  masterData,
  structureType,
  groupedFields,
  refreshTrigger = 0,
}) {
  const notify = useNotification();
  const exportOpsExcel = useOpsExcelExport();
  const [confirm, confirmDialog] = useConfirmDialog();
  const { seasonStart, seasonEnd, isReady: seasonDatesReady } = useSeasonListDates();
  const [datePreset, setDatePreset] = useState('season');
  const [filterText, setFilterText] = useState('');
  const [filterFarmAreaId, setFilterFarmAreaId] = useState('');
  const [filterFieldId, setFilterFieldId] = useState('');
  const [orderBy, setOrderBy] = useState('date');
  const [order, setOrder] = useState('desc');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [recipes, setRecipes] = useState([]);
  const [editOpen, setEditOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const selection = useRowSelection();

  const fieldMap = useMemo(() => buildFieldMap(masterData), [masterData]);
  const fieldIdSet = useMemo(
    () => new Set(getStructureFieldIds(structureType, groupedFields)),
    [structureType, groupedFields]
  );
  const structureFields = useMemo(() => {
    switch (structureType) {
      case 'nethouse': return groupedFields.nethouse || [];
      case 'greenhouse': return groupedFields.greenhouse || [];
      case 'openfield': return groupedFields.openField || [];
      default: return [];
    }
  }, [structureType, groupedFields]);
  const farmAreaOptions = useMemo(() => {
    const seen = new Map();
    structureFields.forEach((f) => {
      const areaId = f.farmAreaId || fieldMap[f.id]?.farmAreaId;
      const areaName = f.farmAreaName || fieldMap[f.id]?.farmAreaName || areaId;
      if (areaId && !seen.has(areaId)) seen.set(areaId, { id: areaId, name: areaName });
    });
    return [...seen.values()].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true }),
    );
  }, [structureFields, fieldMap]);
  const fieldOptions = useMemo(() => {
    return structureFields
      .filter((f) => {
        if (!filterFarmAreaId) return true;
        return (f.farmAreaId || fieldMap[f.id]?.farmAreaId) === filterFarmAreaId;
      })
      .map((f) => ({ id: f.id, name: f.name || fieldMap[f.id]?.name || f.id }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  }, [structureFields, filterFarmAreaId, fieldMap]);

  useEffect(() => {
    setFilterFarmAreaId('');
    setFilterFieldId('');
  }, [siteId, structureType]);

  const filterRow = useCallback((entry) => fieldIdSet.has(entry.fieldId), [fieldIdSet]);

  const fetchAll = useCallback((params) => listFertigationAll(params), []);
  const { rows: rawRows, loading, refresh } = useEntryHistory({
    fetchAll,
    siteId,
    datePreset,
    seasonRange: { startDate: seasonStart, endDate: seasonEnd },
    enabled: Boolean(siteId) && fieldIdSet.size > 0 && seasonDatesReady,
    filterRow,
  });

  useEffect(() => {
    listRecipesAll().then(setRecipes).catch(() => setRecipes([]));
  }, []);

  useEffect(() => {
    if (refreshTrigger > 0) refresh();
  }, [refreshTrigger, refresh]);

  const fertilizerNames = useMemo(() => {
    const names = new Set();
    rawRows.forEach((entry) => {
      Object.keys(entry.fertilizers || {}).forEach((n) => names.add(n));
    });
    return Array.from(names).sort();
  }, [rawRows]);

  const getFieldLabel = useCallback((fieldId) => {
    return fieldMap[fieldId]?.name || fieldId || 'Unknown';
  }, [fieldMap]);

  const filteredAndSortedEntries = useMemo(() => {
    let filtered = rawRows.filter((entry) => {
      if (filterFieldId && entry.fieldId !== filterFieldId) return false;
      if (filterFarmAreaId) {
        const areaId = fieldMap[entry.fieldId]?.farmAreaId;
        if (areaId !== filterFarmAreaId) return false;
      }
      if (!filterText) return true;
      const q = filterText.toLowerCase();
      const field = getFieldLabel(entry.fieldId).toLowerCase();
      const crop = fertigationCropName(entry, fieldMap).toLowerCase();
      const recipe = fertigationRecipeName(entry, recipes).toLowerCase();
      return field.includes(q) || crop.includes(q) || recipe.includes(q) || entry.date?.includes(q);
    });

    filtered.sort((a, b) => {
      let aVal;
      let bVal;
      if (orderBy === 'field') {
        aVal = getFieldLabel(a.fieldId);
        bVal = getFieldLabel(b.fieldId);
      } else if (orderBy === 'recipe') {
        aVal = fertigationRecipeName(a, recipes);
        bVal = fertigationRecipeName(b, recipes);
      } else {
        aVal = a[orderBy];
        bVal = b[orderBy];
      }
      if (order === 'asc') return aVal > bVal ? 1 : -1;
      return aVal < bVal ? 1 : -1;
    });

    return filtered;
  }, [rawRows, filterText, filterFarmAreaId, filterFieldId, orderBy, order, getFieldLabel, fieldMap, recipes]);

  const paginatedEntries = useMemo(
    () => filteredAndSortedEntries.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage),
    [filteredAndSortedEntries, page, rowsPerPage]
  );

  const handleSort = (property) => {
    const isAsc = orderBy === property && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(property);
  };

  const handleDelete = async (id) => {
    if (await confirm('Delete this fertigation entry?', { title: 'Delete Entry' })) {
      try {
        await deleteFertigation(id);
        refresh();
        notify.success('Entry deleted.');
      } catch (err) {
        notify.error(err.message || 'Failed to delete');
      }
    }
  };

  const handleBulkDelete = async () => {
    const ids = [...selection.selectedIds];
    if (!ids.length) return;
    if (!(await confirm(`Delete ${ids.length} fertigation ${ids.length === 1 ? 'entry' : 'entries'}?`, { title: 'Bulk Delete' }))) return;
    const deleted = await deleteIdsSequentially(ids, deleteFertigation);
    selection.clear();
    refresh();
    notify.success(`Deleted ${deleted} ${deleted === 1 ? 'entry' : 'entries'}.`);
  };

  const handleEditSave = async () => {
    if (!editingEntry) return;
    try {
      await updateFertigation(editingEntry.id, {
        flowRate: editingEntry.flowRate ? parseFloat(editingEntry.flowRate) : undefined,
        frequency: editingEntry.frequency ? parseInt(editingEntry.frequency, 10) : undefined,
        valvesCount: editingEntry.valvesCount ? parseInt(editingEntry.valvesCount, 10) : undefined,
        dailyWater: editingEntry.dailyWater ? parseFloat(editingEntry.dailyWater) : undefined,
        recipeId: editingEntry.recipeId || undefined,
      });
      setEditOpen(false);
      setEditingEntry(null);
      refresh();
      notify.success('Entry updated.');
    } catch (err) {
      notify.error(err.message || 'Failed to update');
    }
  };

  const handleExport = async () => {
    if (filteredAndSortedEntries.length === 0) {
      notify.error('No entries to export.');
      return;
    }
    const sheets = await buildFertigationExcelSheets(filteredAndSortedEntries, {
      siteId,
      getFieldLabel: (entry) => getFieldLabel(entry.fieldId),
      getRecipeName: (entry) => fertigationRecipeName(entry, recipes),
      getCrop: (entry) => fertigationCropName(entry, fieldMap),
      includeFertilizers: true,
    });
    await exportOpsExcel(null, {
      filename: `Fertigation_Entries_${new Date().toISOString().split('T')[0]}`,
      sheets,
      ...OPS_EXPORT.fertigation,
    });
  };

  if (fieldIdSet.size === 0) return null;

  return (
    <Box sx={{ mt: 4 }}>
      <Paper elevation={0} sx={{ overflow: 'hidden' }}>
        <EntryHistoryToolbar
          title="All Entries"
          datePreset={datePreset}
          onDatePresetChange={(v) => { setDatePreset(v); setPage(0); }}
          filterText={filterText}
          onFilterTextChange={(v) => { setFilterText(v); setPage(0); }}
          farmAreas={farmAreaOptions}
          farmAreaId={filterFarmAreaId}
          onFarmAreaChange={(id) => {
            setFilterFarmAreaId(id);
            if (id && filterFieldId) {
              const field = structureFields.find((f) => f.id === filterFieldId);
              const areaId = field?.farmAreaId || fieldMap[filterFieldId]?.farmAreaId;
              if (areaId && areaId !== id) setFilterFieldId('');
            }
            setPage(0);
          }}
          fields={fieldOptions}
          fieldId={filterFieldId}
          onFieldChange={(id) => { setFilterFieldId(id); setPage(0); }}
          onExport={handleExport}
          loading={loading}
          entryCount={filteredAndSortedEntries.length}
          bulkDeleteSlot={(
            <DeleteSelectedButton count={selection.size} onClick={handleBulkDelete} />
          )}
        />

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress />
          </Box>
        ) : paginatedEntries.length === 0 ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 8, px: 2 }}>
            <InboxIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
            <Typography variant="h6" color="text.secondary" gutterBottom>
              {filterText ? 'No entries found' : 'No entries in this date range'}
            </Typography>
            <Typography variant="body2" color="text.secondary" textAlign="center">
              Change the date filter or add a new entry above
            </Typography>
          </Box>
        ) : (
          <>
            <TableContainer sx={{ maxHeight: 520 }}>
              <Table size="small" sx={[excelTableSx, freezeColumnsSx(FERT_FROZEN_WIDTHS), sortLabelSx]}>
                <TableHead>
                  <TableRow>
                    <SelectAllHeadCell
                      ids={paginatedEntries.map((e) => e.id)}
                      selectedIds={selection.selectedIds}
                      onToggleAll={selection.toggleAll}
                      label="Select all fertigation entries"
                      className="col-frozen-0"
                    />
                    <TableCell className="col-frozen-1">
                      <TableSortLabel active={orderBy === 'date'} direction={orderBy === 'date' ? order : 'asc'} onClick={() => handleSort('date')}>
                        Date
                      </TableSortLabel>
                    </TableCell>
                    <TableCell className="col-frozen-2">
                      <TableSortLabel active={orderBy === 'field'} direction={orderBy === 'field' ? order : 'asc'} onClick={() => handleSort('field')}>
                        Field
                      </TableSortLabel>
                    </TableCell>
                    <TableCell>Crop</TableCell>
                    <TableCell>
                      <TableSortLabel active={orderBy === 'recipe'} direction={orderBy === 'recipe' ? order : 'asc'} onClick={() => handleSort('recipe')}>
                        Recipe
                      </TableSortLabel>
                    </TableCell>
                    <TableCell className="col-numeric">Valves</TableCell>
                    <TableCell className="col-numeric">Flow Rate</TableCell>
                    <TableCell className="col-numeric">Frequency</TableCell>
                    <TableCell className="col-numeric">Daily Total (m³)</TableCell>
                    {fertilizerNames.map((name) => (
                      <TableCell key={name} className="col-numeric">{name.length > 14 ? `${name.slice(0, 12)}..` : name}</TableCell>
                    ))}
                    <TableCell className="col-numeric">Total Fert (kg)</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {paginatedEntries.map((entry) => (
                    <TableRow key={entry.id} hover selected={selection.selectedIds.has(entry.id)}>
                      <RowSelectCell
                        id={entry.id}
                        selectedIds={selection.selectedIds}
                        onToggle={selection.toggle}
                        label={`Select fertigation ${entry.date || entry.id}`}
                        className="col-frozen-0"
                      />
                      <TableCell className="col-frozen-1" title={entry.date || ''}>{entry.date}</TableCell>
                      <TableCell className="col-frozen-2" title={getFieldLabel(entry.fieldId) || ''}>
                        {getFieldLabel(entry.fieldId)}
                      </TableCell>
                      <TableCell>{fertigationCropName(entry, fieldMap) || '-'}</TableCell>
                      <TableCell>{fertigationRecipeName(entry, recipes) || '-'}</TableCell>
                      <TableCell className="col-numeric">{entry.valvesCount ?? '-'}</TableCell>
                      <TableCell className="col-numeric">{entry.flowRate ?? '-'}</TableCell>
                      <TableCell className="col-numeric">{entry.frequency ?? '-'}</TableCell>
                      <TableCell className="col-numeric">{entry.dailyWater != null ? Number(entry.dailyWater).toFixed(2) : '-'}</TableCell>
                      {fertilizerNames.map((name) => (
                        <TableCell key={name} className="col-numeric">
                          {entry.fertilizers?.[name] != null ? Number(entry.fertilizers[name]).toFixed(3) : '-'}
                        </TableCell>
                      ))}
                      <TableCell className="col-numeric">
                        {entry.totalFertilizer != null ? Number(entry.totalFertilizer).toFixed(3) : '-'}
                      </TableCell>
                      <TableCell>
                        <IconButton size="small" color="primary" onClick={() => { setEditingEntry({ ...entry }); setEditOpen(true); }}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" color="error" onClick={() => handleDelete(entry.id)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              component="div"
              count={filteredAndSortedEntries.length}
              page={page}
              onPageChange={(_, p) => setPage(p)}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
              rowsPerPageOptions={[5, 10, 25, 50]}
            />
          </>
        )}
      </Paper>

      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Edit Fertigation Entry</DialogTitle>
        <DialogContent>
          {editingEntry && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
              <Typography variant="body2" color="text.secondary">
                {getFieldLabel(editingEntry.fieldId)} — {editingEntry.date}
              </Typography>
              <TextField
                select
                label="Recipe"
                value={editingEntry.recipeId || ''}
                onChange={(e) => setEditingEntry({ ...editingEntry, recipeId: e.target.value })}
                fullWidth
              >
                {recipePickerOptions(recipes, editingEntry.recipeId).map((r) => (
                  <MenuItem key={r.id} value={r.id} disabled={!isRecipeApproved(r)}>{recipeOptionLabel(r)}</MenuItem>
                ))}
              </TextField>
              <TextField label="Valves" type="number" value={editingEntry.valvesCount ?? ''} onChange={(e) => setEditingEntry({ ...editingEntry, valvesCount: e.target.value })} fullWidth />
              <TextField label="Flow Rate (m3/hr)" type="number" value={editingEntry.flowRate ?? ''} onChange={(e) => setEditingEntry({ ...editingEntry, flowRate: e.target.value })} fullWidth />
              <TextField label="Frequency" type="number" value={editingEntry.frequency ?? ''} onChange={(e) => setEditingEntry({ ...editingEntry, frequency: e.target.value })} fullWidth />
              <TextField label="Daily Total (m³)" type="number" value={editingEntry.dailyWater ?? ''} onChange={(e) => setEditingEntry({ ...editingEntry, dailyWater: e.target.value })} fullWidth />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>Cancel</Button>
          <Button variant="contained" startIcon={<SaveIcon />} onClick={handleEditSave}>Save</Button>
        </DialogActions>
      </Dialog>
      {confirmDialog}
    </Box>
  );
}
