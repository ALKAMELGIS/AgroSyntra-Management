import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box, Typography, Paper, Button, TextField, MenuItem, Chip, Alert,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Dialog, DialogTitle, DialogContent, DialogActions, IconButton, Tooltip,
  FormControl, InputLabel, Select, CircularProgress, Stack, Tabs, Tab,
} from '@mui/material';
import { AddOutlined as Add, EditOutlined as Edit, DeleteOutlined as Delete, FileDownloadOutlined as FileDownload, FileUploadOutlined as FileUpload } from '@mui/icons-material';
import * as XLSX from 'xlsx';
import { apiRequest } from '../../utils/api';
import { useNotification } from '../../contexts/NotificationContext';
import { excelTableSx, freezeColumnsSx, GutterCell } from '../../components/table/ExcelTable';
import { DeleteSelectedButton, RowSelectCell, SelectAllHeadCell, deleteIdsSequentially } from '../../components/table/BulkSelect';
import { useRowSelection } from '../../hooks/useRowSelection';
import StructureAndFieldToolbar from '../../components/planting/StructureAndFieldToolbar';
import UprootDialog from '../../components/planting/UprootDialog';
import usePlantingOccupancy from '../../hooks/usePlantingOccupancy';
import {
  occupancyForPickerFields,
  fieldsMissingRotation,
  filterAvailabilityRows,
  filterGapRows,
  filterHistoryRows,
} from '../../utils/cropPageFieldFilter';
import {
  occupancySheetRows,
  PLANTING_OCCUPANCY_SOURCE,
} from '../../utils/plantingOccupancy';
import useOpsExcelExport from '../../hooks/useOpsExcelExport';
import { OPS_EXPORT } from '../../utils/companyExcelExport';
import { buildRotationExportSheets } from '../../utils/cropHistoryExcelExport';
import useReadOnlyMode from '../../hooks/useReadOnlyMode';
import ReadOnlyBanner from '../../components/ReadOnlyBanner';
import { useAuth } from '../../contexts/AuthContext';
import { isReadOnlyOnPage, PAGE_KEYS } from '../../utils/roleAccess';

const EMPTY_FORM = { fieldId: '', cropId: '', varietyId: '', startDate: '', endDate: '' };
const ROTATION_FROZEN_WIDTHS = [160];
const SEASON_CLOSED_REASON = 'Season closed';

const bulkInvalidSx = {
  '&&& .MuiTableBody-root .MuiTableRow-root.row-invalid .MuiTableCell-root:not(.table-gutter)': {
    backgroundColor: 'table.errorBg',
  },
};

function formatUprooted(row) {
  if (!row?.uprooted_at) return { label: '—', seasonClosed: false };
  const date = String(row.uprooted_at).split('T')[0];
  const reason = row.uproot_reason || '';
  const seasonClosed = reason === SEASON_CLOSED_REASON;
  return {
    label: reason ? `${date} · ${reason}` : date,
    seasonClosed,
  };
}

export default function CropRotationTab({
  siteFilter,
  siteFields = [],
  pickerFields = [],
  structureFieldIds,
  fieldFilterId,
  availableTabs = [],
  structureId,
  onStructureChange,
  onFieldChange,
  allFields = [],
  crops = [],
  allVarietiesByCrop = {},
  setAllVarietiesByCrop,
  isSeasonReadOnly,
  reloadToken = 0,
  onOccupancyChange,
}) {
  const notify = useNotification();
  const exportOpsExcel = useOpsExcelExport();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState({ open: false, mode: 'add', id: null });
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [bulkDialog, setBulkDialog] = useState(false);
  const [bulkFile, setBulkFile] = useState(null);
  const [bulkPreview, setBulkPreview] = useState([]);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [gaps, setGaps] = useState([]);
  const [varieties, setVarieties] = useState([]);
  const [sheet, setSheet] = useState('history');
  const [availability, setAvailability] = useState([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [uprootTarget, setUprootTarget] = useState(null);
  const historySelection = useRowSelection();
  const { user } = useAuth();
  // Managers watch the rotation; only workers and agronomists record it.
  // A closed season locks everyone.
  const roleReadOnly = isReadOnlyOnPage(user, PAGE_KEYS.DATA_ENTRY);
  const pageReadOnly = useReadOnlyMode(PAGE_KEYS.DATA_ENTRY);
  const readOnly = pageReadOnly || Boolean(isSeasonReadOnly);

  const occupancySource = structureId === 'openfield'
    ? PLANTING_OCCUPANCY_SOURCE.OPEN_FIELD
    : PLANTING_OCCUPANCY_SOURCE.PLANTING_RECORDS;
  const occupancyQueryRows = useMemo(
    () => pickerFields.map((field) => ({ fieldId: field.id })),
    [pickerFields],
  );
  const {
    occupancyByField,
    loading: occupancyLoading,
    reload: reloadOccupancy,
  } = usePlantingOccupancy(occupancySource, occupancyQueryRows);

  const filterScope = useMemo(
    () => ({ structureFieldIds, fieldId: fieldFilterId }),
    [structureFieldIds, fieldFilterId],
  );
  const visibleHistory = useMemo(
    () => filterHistoryRows(history, filterScope),
    [history, filterScope],
  );
  const visibleGaps = useMemo(
    () => filterGapRows(gaps, filterScope),
    [gaps, filterScope],
  );
  const visibleAvailability = useMemo(
    () => filterAvailabilityRows(availability, filterScope),
    [availability, filterScope],
  );
  const scopedOccupancy = useMemo(
    () => occupancyForPickerFields(occupancyByField, pickerFields, fieldFilterId),
    [occupancyByField, pickerFields, fieldFilterId],
  );
  const visibleCurrent = useMemo(
    () => occupancySheetRows(scopedOccupancy, pickerFields),
    [scopedOccupancy, pickerFields],
  );
  const missingFields = useMemo(
    () => fieldsMissingRotation(siteFields, history, filterScope),
    [siteFields, history, filterScope],
  );
  const siteNameByFieldId = useMemo(() => {
    const map = {};
    (allFields || []).forEach((field) => {
      map[field.id] = field.siteName || '';
    });
    return map;
  }, [allFields]);

  const handleExportExcel = async () => {
    let availableRows = visibleAvailability;
    if (siteFilter && sheet !== 'available') {
      try {
        const data = await apiRequest(`/crop-history/availability?site_id=${siteFilter}`);
        availableRows = filterAvailabilityRows(data || [], filterScope);
      } catch {
        availableRows = visibleAvailability;
      }
    }
    const sheets = buildRotationExportSheets({
      available: availableRows,
      occupied: visibleCurrent,
      history: visibleHistory,
      includeSite: !siteFilter,
      siteNameByFieldId,
    });
    if (!sheets.length) {
      notify.error('Nothing to export');
      return;
    }
    await exportOpsExcel([], {
      sheets,
      filename: 'Crop-Rotation.xlsx',
      ...OPS_EXPORT.cropRotation,
    });
  };

  useEffect(() => {
    if (!form.cropId) { setVarieties([]); return; }
    if (allVarietiesByCrop[form.cropId]) { setVarieties(allVarietiesByCrop[form.cropId]); return; }
    apiRequest(`/crops/${form.cropId}/varieties`)
      .then((data) => {
        const next = data || [];
        setVarieties(next);
        setAllVarietiesByCrop?.((prev) => ({ ...prev, [form.cropId]: next }));
      })
      .catch(() => setVarieties([]));
  }, [form.cropId, allVarietiesByCrop, setAllVarietiesByCrop]);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const params = siteFilter ? `?site_id=${siteFilter}` : '';
      const [data, gapData] = await Promise.all([
        apiRequest(`/crop-history${params}`),
        apiRequest(`/crop-history/gaps${params}`).catch(() => []),
      ]);
      setHistory(data || []);
      setGaps(gapData || []);
    } catch (err) {
      notify.error(err.message || 'Failed to load crop history');
    } finally {
      setLoading(false);
    }
  }, [siteFilter, notify]);

  useEffect(() => { loadHistory(); }, [loadHistory, reloadToken]);

  const loadAvailability = useCallback(async () => {
    if (!siteFilter) {
      setAvailability([]);
      return;
    }
    setAvailabilityLoading(true);
    try {
      const data = await apiRequest(`/crop-history/availability?site_id=${siteFilter}`);
      setAvailability(data || []);
    } catch (err) {
      notify.error(err.message || 'Failed to load available fields');
      setAvailability([]);
    } finally {
      setAvailabilityLoading(false);
    }
  }, [siteFilter, notify]);

  useEffect(() => {
    if (sheet === 'available') loadAvailability();
  }, [sheet, loadAvailability, reloadToken]);

  useEffect(() => {
    if (!reloadToken) return undefined;
    reloadOccupancy();
    return undefined;
  }, [reloadToken, reloadOccupancy]);

  const openAdd = () => { setForm(EMPTY_FORM); setDialog({ open: true, mode: 'add', id: null }); };
  const openEdit = (row) => {
    setForm({
      fieldId: row.field_id,
      cropId: row.crop_id,
      varietyId: row.variety_id || '',
      startDate: row.start_date?.split('T')[0] || '',
      endDate: row.end_date?.split('T')[0] || '',
    });
    setDialog({ open: true, mode: 'edit', id: row.id });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (dialog.mode === 'add') {
        await apiRequest('/crop-history', { method: 'POST', body: JSON.stringify(form) });
        notify.success('Crop rotation added');
      } else {
        await apiRequest(`/crop-history/${dialog.id}`, { method: 'PUT', body: JSON.stringify(form) });
        notify.success('Updated');
      }
      setDialog({ open: false, mode: 'add', id: null });
      loadHistory();
    } catch (err) {
      notify.error(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this crop rotation entry?')) return;
    try {
      await apiRequest(`/crop-history/${id}`, { method: 'DELETE' });
      notify.success('Deleted');
      loadHistory();
    } catch (err) {
      notify.error(err.message || 'Failed to delete');
    }
  };

  const handleBulkDelete = async () => {
    const ids = [...historySelection.selectedIds];
    if (!ids.length) return;
    if (!window.confirm(`Delete ${ids.length} crop rotation ${ids.length === 1 ? 'entry' : 'entries'}?`)) return;
    const deleted = await deleteIdsSequentially(ids, (id) => apiRequest(`/crop-history/${id}`, { method: 'DELETE' }));
    historySelection.clear();
    loadHistory();
    notify.success(`Deleted ${deleted} ${deleted === 1 ? 'entry' : 'entries'}.`);
  };

  const parseCropVariety = useCallback((combined) => {
    const str = (combined || '').trim().toLowerCase();
    if (!str) return { cropId: null, varietyId: null };
    for (const c of crops) {
      const crop = typeof c === 'object' ? c : { name: c, id: null };
      if (!crop.name) continue;
      const cName = crop.name.toLowerCase();
      if (str.includes(cName)) {
        const remainder = str.replace(cName, '').trim();
        let varietyId = null;
        if (remainder) {
          const cropVarieties = allVarietiesByCrop[crop.id] || [];
          const match = cropVarieties.find((v2) => v2.name?.toLowerCase() === remainder);
          if (match) varietyId = match.id;
        }
        return { cropId: crop.id, varietyId };
      }
    }
    return { cropId: null, varietyId: null };
  }, [crops, allVarietiesByCrop]);

  const handleBulkFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBulkFile(file);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const wb = XLSX.read(evt.target.result, { type: 'binary', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
      const mapped = data.map((row) => {
        const fieldName = String(row['Field Name'] || row.field_name || row.Field || '').trim();
        const cropStr = String(row.Crop || row.crop || row['Crop Variety'] || '').trim();
        const startDate = String(row['Start Date'] || row.start_date || '').trim();
        const endDate = String(row['End Date'] || row.end_date || '').trim();
        const field = allFields.find((f) =>
          f.name.toLowerCase() === fieldName.toLowerCase()
          || f.name.toLowerCase().replace(/[\s\-_]+/g, '') === fieldName.toLowerCase().replace(/[\s\-_]+/g, ''),
        );
        const { cropId, varietyId } = parseCropVariety(cropStr);
        const crop = crops.find((c2) => (typeof c2 === 'object' ? c2.id : null) === cropId);
        const cropVarieties2 = cropId ? (allVarietiesByCrop[cropId] || []) : [];
        const variety = cropVarieties2.find((v) => v.id === varietyId);
        return {
          fieldId: field?.id || null,
          fieldName: field?.name || fieldName,
          cropId,
          cropName: crop?.name || cropStr,
          varietyId,
          varietyName: variety?.name || '',
          startDate,
          endDate,
          valid: !!(field?.id && cropId && startDate),
        };
      }).filter((r) => r.fieldName);
      setBulkPreview(mapped);
    };
    reader.readAsBinaryString(file);
  };

  const handleBulkUpload = async () => {
    const valid = bulkPreview.filter((r) => r.valid);
    if (valid.length === 0) { notify.error('No valid entries to upload'); return; }
    setBulkUploading(true);
    try {
      const entries = valid.map((r) => ({
        fieldId: r.fieldId,
        cropId: r.cropId,
        varietyId: r.varietyId || undefined,
        startDate: r.startDate,
        endDate: r.endDate || undefined,
      }));
      const res = await apiRequest('/crop-history/bulk', { method: 'POST', body: JSON.stringify({ entries }) });
      notify.success(`Created ${res.created} of ${res.total} entries`);
      setBulkDialog(false);
      setBulkFile(null);
      setBulkPreview([]);
      loadHistory();
    } catch (err) {
      notify.error(err.message || 'Bulk upload failed');
    } finally {
      setBulkUploading(false);
    }
  };

  const emptyCopy = fieldFilterId
    ? 'No crop rotation history for this field.'
    : 'No crop rotation history for this field type.';

  const dialogFields = dialog.mode === 'edit'
    ? siteFields
    : pickerFields;

  return (
    <>
      {roleReadOnly && (
        <ReadOnlyBanner message="View only — workers and agronomists record crop rotations." />
      )}
      <Paper sx={{ p: 2, mb: 2, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
        <StructureAndFieldToolbar
          availableTabs={availableTabs}
          structureId={structureId}
          onStructureChange={onStructureChange}
          pickerFields={pickerFields}
          fieldId={fieldFilterId}
          onFieldChange={onFieldChange}
        />
        <Tabs
          value={sheet}
          onChange={(_, next) => setSheet(next)}
          sx={{ minHeight: 36, '& .MuiTab-root': { textTransform: 'none', minHeight: 36, py: 0 } }}
        >
          <Tab value="history" label="History" />
          <Tab value="current" label="Current" />
          <Tab value="available" label="Available" />
        </Tabs>
        <Chip
          label={
            sheet === 'available'
              ? `${visibleAvailability.length} fields`
              : sheet === 'current'
                ? `${new Set(visibleCurrent.map((row) => row.fieldId)).size} occupied`
                : `${visibleHistory.length} entries`
          }
          variant="outlined"
          size="small"
        />
        <Box sx={{ flexGrow: 1 }} />
        <Button variant="outlined" startIcon={<FileDownload />} onClick={handleExportExcel}>
          Export
        </Button>
        {sheet === 'history' && (
          <>
            <DeleteSelectedButton count={historySelection.size} onClick={handleBulkDelete} disabled={readOnly} />
            <Button variant="outlined" startIcon={<FileUpload />} onClick={() => setBulkDialog(true)} disabled={readOnly}>
              Bulk Upload
            </Button>
            <Button variant="contained" startIcon={<Add />} onClick={openAdd} disabled={readOnly}>
              Add Entry
            </Button>
          </>
        )}
      </Paper>

      {sheet === 'available' && (
        availabilityLoading ? (
          <Box sx={{ textAlign: 'center', py: 4 }}><CircularProgress /></Box>
        ) : visibleAvailability.length === 0 ? (
          <Alert severity="info">
            {fieldFilterId
              ? 'This field is fully occupied, or has no free segments to show.'
              : 'No vacant or partly free fields for this type.'}
          </Alert>
        ) : (
          <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 'calc(100vh - 340px)' }}>
            <Table size="small" sx={[excelTableSx, freezeColumnsSx(ROTATION_FROZEN_WIDTHS)]}>
              <TableHead>
                <TableRow>
                  <TableCell className="col-frozen-0">Field</TableCell>
                  <TableCell>Farm Area</TableCell>
                  <TableCell>Availability</TableCell>
                  <TableCell>Occupied segments</TableCell>
                  <TableCell>Free / uprooted segments</TableCell>
                  <TableCell>This season</TableCell>
                  <TableCell>Last crop</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {visibleAvailability.map((row) => {
                  const seasonClosed = row.uproot_reason === SEASON_CLOSED_REASON;
                  let seasonText = 'Never planted this season';
                  if (row.kind === 'uprooted') {
                    const date = row.uprooted_at ? String(row.uprooted_at).split('T')[0] : '';
                    seasonText = row.uproot_reason ? `${date} · ${row.uproot_reason}` : `Uprooted ${date}`;
                  } else if (row.kind === 'partial') {
                    const date = row.uprooted_at ? String(row.uprooted_at).split('T')[0] : '';
                    seasonText = row.uproot_reason
                      ? `${date} · ${row.uproot_reason}`
                      : (date ? `Uprooted ${date}` : 'Partial');
                  } else if (row.planted_in_window) {
                    seasonText = 'Vacant';
                  }
                  return (
                    <TableRow key={row.field_id} hover>
                      <TableCell className="col-frozen-0" sx={{ fontWeight: 600 }}>{row.field_name}</TableCell>
                      <TableCell>{row.farm_area_name}</TableCell>
                      <TableCell>
                        <Chip
                          label={row.availability}
                          size="small"
                          color={row.availability === 'Vacant' ? 'success' : 'warning'}
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell>{(row.occupied_segments || []).join(', ') || '—'}</TableCell>
                      <TableCell>{(row.free_segments || []).join(', ') || (row.availability === 'Vacant' ? 'Entire field' : '—')}</TableCell>
                      <TableCell>
                        {seasonClosed
                          ? <Typography variant="body2" color="text.secondary">{seasonText}</Typography>
                          : seasonText}
                      </TableCell>
                      <TableCell>{row.last_crop || '—'}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )
      )}

      {sheet === 'current' && (
        occupancyLoading ? (
          <Box sx={{ textAlign: 'center', py: 4 }}><CircularProgress /></Box>
        ) : visibleCurrent.length === 0 ? (
          <Alert severity="info">
            {fieldFilterId
              ? 'No crop currently occupying this field.'
              : 'No crop currently occupying these fields.'}
          </Alert>
        ) : (
          <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 'calc(100vh - 340px)' }}>
            <Table size="small" sx={[excelTableSx, freezeColumnsSx(ROTATION_FROZEN_WIDTHS)]}>
              <TableHead>
                <TableRow>
                  <TableCell className="col-frozen-0">Field</TableCell>
                  <TableCell>Farm Area</TableCell>
                  <TableCell>Crop</TableCell>
                  <TableCell>Variety</TableCell>
                  <TableCell>Segments</TableCell>
                  <TableCell>Occupied since</TableCell>
                  <TableCell>Uproot</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {visibleCurrent.map((row) => (
                  <TableRow key={row.key} hover>
                    <TableCell className="col-frozen-0" title={row.fieldName} sx={{ fontWeight: 600 }}>{row.fieldName}</TableCell>
                    <TableCell>{row.farmAreaName || '—'}</TableCell>
                    <TableCell>
                      {row.cropName
                        ? <Chip label={row.cropName} size="small" color="primary" variant="outlined" />
                        : '—'}
                    </TableCell>
                    <TableCell>{row.varietyName || '—'}</TableCell>
                    <TableCell>{row.segmentsLabel || '—'}</TableCell>
                    <TableCell>{row.occupancyStart || '—'}</TableCell>
                    <TableCell>
                      <Button
                        size="small"
                        variant="outlined"
                        disabled={readOnly}
                        onClick={() => setUprootTarget({ fieldId: row.fieldId, fieldName: row.fieldName })}
                      >
                        Uproot
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )
      )}

      {sheet === 'history' && (
        <>
      {!loading && missingFields.length > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          <strong>{missingFields.length} field(s) have no crop rotation entry:</strong>{' '}
          {missingFields.map((f) => f.name).join(', ')}.
        </Alert>
      )}

      {!loading && visibleGaps.length > 0 && (
        <Alert severity="info" sx={{ mb: 2 }}>
          <strong>{visibleGaps.length} date gap(s) detected</strong> — some fields have periods between rotations
          where no crop is assigned.
          {visibleGaps.slice(0, 5).map((g, i) => (
            <Box key={i} sx={{ mt: 0.5, fontSize: '0.8125rem' }}>
              <strong>{g.field_name}</strong>: {g.gap_days}-day gap before {g.crop_name} (starts {g.start_date?.split('T')[0]})
            </Box>
          ))}
          {visibleGaps.length > 5 && (
            <Box sx={{ mt: 0.5, fontSize: '0.8125rem', fontStyle: 'italic' }}>...and {visibleGaps.length - 5} more</Box>
          )}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ textAlign: 'center', py: 4 }}><CircularProgress /></Box>
      ) : visibleHistory.length === 0 ? (
        <Alert severity="info">{history.length === 0 && !fieldFilterId && !structureFieldIds?.size ? 'No crop rotation history found.' : emptyCopy}</Alert>
      ) : (
        <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 'calc(100vh - 340px)' }}>
          <Table size="small" sx={[excelTableSx, freezeColumnsSx(ROTATION_FROZEN_WIDTHS)]}>
            <TableHead>
              <TableRow>
                <SelectAllHeadCell
                  ids={visibleHistory.map((row) => row.id)}
                  selectedIds={historySelection.selectedIds}
                  onToggleAll={historySelection.toggleAll}
                  label="Select all crop history rows"
                />
                <TableCell className="col-frozen-0">Field</TableCell>
                <TableCell>Farm Area</TableCell>
                <TableCell>Crop</TableCell>
                <TableCell>Variety</TableCell>
                <TableCell>Start Date</TableCell>
                <TableCell>End Date</TableCell>
                <TableCell>Uprooted</TableCell>
                <TableCell>Cycles</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {visibleHistory.map((row) => {
                const uprooted = formatUprooted(row);
                return (
                  <TableRow key={row.id} hover selected={historySelection.selectedIds.has(row.id)}>
                    <RowSelectCell
                      id={row.id}
                      selectedIds={historySelection.selectedIds}
                      onToggle={historySelection.toggle}
                      label={`Select crop history ${row.field_name || row.id}`}
                    />
                    <TableCell className="col-frozen-0" title={row.field_name || ''} sx={{ fontWeight: 600 }}>{row.field_name}</TableCell>
                    <TableCell>{row.farm_area_name}</TableCell>
                    <TableCell><Chip label={row.crop_name} size="small" color="primary" variant="outlined" /></TableCell>
                    <TableCell>{row.variety_name || '-'}</TableCell>
                    <TableCell>{row.start_date?.split('T')[0]}</TableCell>
                    <TableCell>{row.end_date?.split('T')[0] || <Chip label="Current" size="small" color="success" />}</TableCell>
                    <TableCell>
                      {uprooted.seasonClosed ? (
                        <Typography variant="body2" color="text.secondary">{uprooted.label}</Typography>
                      ) : uprooted.label}
                    </TableCell>
                    <TableCell>{row.cycle_count != null && Number(row.cycle_count) > 0 ? row.cycle_count : '—'}</TableCell>
                    <TableCell>
                      <Tooltip title="Edit" describeChild>
                        <span>
                          <IconButton size="small" disabled={readOnly} onClick={() => openEdit(row)} aria-label="Edit"><Edit fontSize="small" /></IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title="Delete" describeChild>
                        <span>
                          <IconButton size="small" color="error" disabled={readOnly} onClick={() => handleDelete(row.id)} aria-label="Delete"><Delete fontSize="small" /></IconButton>
                        </span>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
        </>
      )}

      <UprootDialog
        open={Boolean(uprootTarget)}
        onClose={() => setUprootTarget(null)}
        fieldId={uprootTarget?.fieldId}
        fieldName={uprootTarget?.fieldName}
        occupancy={uprootTarget ? scopedOccupancy[uprootTarget.fieldId] : null}
        source={occupancySource}
        onSuccess={() => {
          setUprootTarget(null);
          reloadOccupancy();
          loadHistory();
          onOccupancyChange?.();
        }}
      />

      <Dialog open={dialog.open} onClose={() => setDialog({ open: false, mode: 'add', id: null })} maxWidth="sm" fullWidth>
        <DialogTitle>{dialog.mode === 'add' ? 'Add Crop Rotation' : 'Edit Crop Rotation'}</DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <FormControl size="small" fullWidth>
              <InputLabel id="croprotationtab-field-label-1">Field *</InputLabel>
              <Select labelId="croprotationtab-field-label-1"
                value={form.fieldId}
                label="Field *"
                onChange={(e) => setForm({ ...form, fieldId: e.target.value })}
                disabled={dialog.mode === 'edit'}
              >
                {dialogFields.map((f) => (
                  <MenuItem key={f.id} value={f.id}>{f.name} ({f.farmAreaName})</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" fullWidth>
              <InputLabel id="croprotationtab-crop-label-2">Crop *</InputLabel>
              <Select labelId="croprotationtab-crop-label-2"
                value={form.cropId}
                label="Crop *"
                onChange={(e) => setForm({ ...form, cropId: e.target.value, varietyId: '' })}
              >
                {crops.map((c) => {
                  const crop = typeof c === 'object' ? c : { id: c, name: c };
                  return <MenuItem key={crop.id} value={crop.id}>{crop.name}</MenuItem>;
                })}
              </Select>
            </FormControl>
            {varieties.length > 0 && (
              <FormControl size="small" fullWidth>
                <InputLabel id="croprotationtab-variety-label-3">Variety</InputLabel>
                <Select labelId="croprotationtab-variety-label-3" value={form.varietyId} label="Variety"
                  onChange={(e) => setForm({ ...form, varietyId: e.target.value })}>
                  <MenuItem value=""><em>None</em></MenuItem>
                  {varieties.map((v) => <MenuItem key={v.id} value={v.id}>{v.name}</MenuItem>)}
                </Select>
              </FormControl>
            )}
            <TextField
              size="small"
              type="date"
              label="Start Date *"
              value={form.startDate}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              InputLabelProps={{ shrink: true }}
              helperText={dialog.id
                ? "Must stay within this rotation's season. For another season, add a new rotation there."
                : undefined}
              fullWidth
            />
            <TextField
              size="small"
              type="date"
              label="End Date"
              value={form.endDate}
              onChange={(e) => setForm({ ...form, endDate: e.target.value })}
              InputLabelProps={{ shrink: true }}
              fullWidth
              helperText="Leave empty if this crop is still active"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog({ open: false, mode: 'add', id: null })}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={saving || !form.fieldId || !form.cropId || !form.startDate}
          >
            {saving ? <CircularProgress size={20} /> : dialog.mode === 'add' ? 'Add' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={bulkDialog}
        onClose={() => { setBulkDialog(false); setBulkFile(null); setBulkPreview([]); }}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Bulk Upload Crop Rotation</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Upload an Excel file with columns: <strong>Field Name</strong>, <strong>Crop</strong>,
            <strong> Start Date</strong>, <strong>End Date</strong> (optional).
          </Typography>
          <Button variant="outlined" component="label" startIcon={<FileUpload />}>
            {bulkFile ? bulkFile.name : 'Choose Excel File'}
            <input type="file" hidden accept=".xlsx,.xls" onChange={handleBulkFile} />
          </Button>
          {bulkPreview.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
                <Chip label={`${bulkPreview.length} rows`} size="small" />
                <Chip label={`${bulkPreview.filter((r) => r.valid).length} valid`} size="small" color="success" />
                <Chip
                  label={`${bulkPreview.filter((r) => !r.valid).length} invalid`}
                  size="small"
                  color={bulkPreview.some((r) => !r.valid) ? 'error' : 'default'}
                />
              </Stack>
              <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 350 }}>
                <Table size="small" sx={[excelTableSx, bulkInvalidSx]}>
                  <TableHead>
                    <TableRow>
                      <GutterCell />
                      <TableCell>Field</TableCell>
                      <TableCell>Crop</TableCell>
                      <TableCell>Variety</TableCell>
                      <TableCell>Start</TableCell>
                      <TableCell>End</TableCell>
                      <TableCell>Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {bulkPreview.slice(0, 100).map((r, i) => (
                      <TableRow key={i} hover className={r.valid ? undefined : 'row-invalid'}>
                        <GutterCell index={i + 1} />
                        <TableCell sx={{ color: r.fieldId ? 'text.primary' : 'error.main' }}>{r.fieldName}</TableCell>
                        <TableCell sx={{ color: r.cropId ? 'text.primary' : 'error.main' }}>{r.cropName}</TableCell>
                        <TableCell>{r.varietyName || '-'}</TableCell>
                        <TableCell>{r.startDate}</TableCell>
                        <TableCell>{r.endDate || '-'}</TableCell>
                        <TableCell>
                          {r.valid
                            ? <Chip label="OK" size="small" color="success" />
                            : <Chip label={!r.fieldId ? 'Unknown field' : !r.cropId ? 'Unknown crop' : 'Missing date'} size="small" color="error" />}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setBulkDialog(false); setBulkFile(null); setBulkPreview([]); }}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleBulkUpload}
            disabled={bulkUploading || bulkPreview.filter((r) => r.valid).length === 0}
          >
            {bulkUploading ? <CircularProgress size={20} /> : `Upload ${bulkPreview.filter((r) => r.valid).length} Entries`}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
