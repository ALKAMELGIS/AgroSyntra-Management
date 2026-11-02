import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Typography, Paper, Button, TextField, IconButton, Tooltip,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Dialog, DialogTitle, DialogContent, DialogActions, CircularProgress, Alert,
} from '@mui/material';
import {
  AddOutlined as Add, DeleteOutlined as Delete, EditOutlined as Edit, FileDownloadOutlined as FileDownload, FileUploadOutlined as FileUpload, SaveOutlined as SaveIcon,
} from '@mui/icons-material';
import { apiRequest } from '../../utils/api';
import { useNotification } from '../../contexts/NotificationContext';
import { excelTableSx, freezeColumnsSx } from '../../components/table/ExcelTable';
import {
  DeleteSelectedButton, RowCheckbox, RowSelectCell, SelectAllCheckbox, SelectAllHeadCell,
  deleteIdsSequentially,
} from '../../components/table/BulkSelect';
import { useRowSelection } from '../../hooks/useRowSelection';
import * as XLSX from 'xlsx';
import useOpsExcelExport from '../../hooks/useOpsExcelExport';
import { OPS_EXPORT } from '../../utils/companyExcelExport';
import { buildGerminationExportSheets } from '../../utils/cropHistoryExcelExport';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import useReadOnlyMode from '../../hooks/useReadOnlyMode';
import ReadOnlyBanner from '../../components/ReadOnlyBanner';
import { isReadOnlyOnPage, PAGE_KEYS } from '../../utils/roleAccess';

const GERM_FROZEN_WIDTHS = [140];
const twoRowHeadSx = {
  '&& thead tr:first-of-type .MuiTableCell-head': { top: 0 },
  '&& thead tr:nth-of-type(2) .MuiTableCell-head': { top: 28 },
};
const germDenseSx = {
  '&& .MuiTableCell-root': {
    padding: '4px 8px !important',
    fontSize: '0.75rem !important',
  },
  '&& .MuiTableCell-head': {
    padding: '4px 8px !important',
    fontSize: '0.6875rem !important',
  },
};
const germTintSx = {
  '&&& .MuiTableBody-root .MuiTableCell-root.cell-germ-high': { backgroundColor: '#e8f5e9' },
  '&&& .MuiTableBody-root .MuiTableCell-root.cell-germ-mid': { backgroundColor: '#fff3e0' },
  '&&& .MuiTableBody-root .MuiTableCell-root.cell-germ-low': { backgroundColor: '#fbe9e7' },
};

function getGermColor(pct) {
  if (pct == null || isNaN(pct)) return undefined;
  if (pct >= 90) return '#1f7a4d';
  if (pct >= 70) return '#e65100';
  return '#c62828';
}

function calcPercentages(count) {
  if (!count || !count.seeds_total || count.seeds_total === 0) return { noGermPct: null, germPct: null };
  const noGermPct = Math.round((count.seeds_no_germ / count.seeds_total) * 100);
  const germPct = 100 - noGermPct;
  return { noGermPct, germPct };
}

function ordinalLabel(n) {
  const suffixes = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]) + ' Counting';
}

export default function GerminationRecord({ siteFilter }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  // Only workers and agronomists record germination; everyone else watches.
  // `readOnly` also covers a closed season.
  const roleReadOnly = isReadOnlyOnPage(user, PAGE_KEYS.DATA_ENTRY);
  const readOnly = useReadOnlyMode(PAGE_KEYS.DATA_ENTRY);
  const notify = useNotification();
  const exportOpsExcel = useOpsExcelExport();
  const [sections, setSections] = useState([]);
  const [recordsBySection, setRecordsBySection] = useState({});
  const [loading, setLoading] = useState(false);
  const [editingName, setEditingName] = useState(null);
  const [tempName, setTempName] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const sectionSelection = useRowSelection();

  const siteId = siteFilter || '';

  const loadSections = useCallback(async () => {
    setLoading(true);
    try {
      const url = siteId ? `/germination/sections?site_id=${siteId}` : '/germination/sections';
      const res = await apiRequest(url);
      setSections(res || []);
    } catch (err) {
      notify.error('Failed to load germination sections');
    } finally {
      setLoading(false);
    }
  }, [siteId, notify]);

  useEffect(() => { loadSections(); }, [loadSections]);

  const loadRecords = useCallback(async (sectionId) => {
    try {
      const res = await apiRequest(`/germination/records?section_id=${sectionId}`);
      setRecordsBySection(prev => ({ ...prev, [sectionId]: res || [] }));
    } catch (err) {
      notify.error('Failed to load records');
    }
  }, [notify]);

  useEffect(() => {
    sections.forEach(s => loadRecords(s.id));
  }, [sections, loadRecords]);

  const maxCountings = useMemo(() => {
    const result = {};
    for (const [sectionId, records] of Object.entries(recordsBySection)) {
      let max = 1;
      (records || []).forEach(r => {
        const counts = r.counts || [];
        counts.forEach(c => { if (c.counting_number > max) max = c.counting_number; });
      });
      result[sectionId] = max;
    }
    return result;
  }, [recordsBySection]);

  const handleExportExcel = async () => {
    const dirty = Object.values(recordsBySection).some((list) => (list || []).some((r) => r._dirty));
    if (dirty) notify.warning('Unsaved germination cells are not in the file.');
    const sheets = buildGerminationExportSheets(sections, recordsBySection, maxCountings);
    if (!sheets.length) {
      notify.error('Nothing to export');
      return;
    }
    await exportOpsExcel([], {
      sheets,
      filename: 'Germination-Record.xlsx',
      ...OPS_EXPORT.germination,
    });
  };

  const handleAddSection = async () => {
    try {
      await apiRequest('/germination/sections', {
        method: 'POST',
        body: JSON.stringify({ name: 'New Table', siteId: siteId || null }),
      });
      loadSections();
    } catch (err) {
      notify.error('Failed to create section');
    }
  };

  const handleRenameSection = async (id) => {
    if (!tempName.trim()) return;
    try {
      await apiRequest(`/germination/sections/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ name: tempName.trim() }),
      });
      setEditingName(null);
      loadSections();
    } catch (err) {
      notify.error('Failed to rename section');
    }
  };

  const handleDeleteSection = async (id) => {
    if (!window.confirm('Delete this entire table and all its records?')) return;
    try {
      await apiRequest(`/germination/sections/${id}`, { method: 'DELETE' });
      setSections(prev => prev.filter(s => s.id !== id));
    } catch (err) {
      notify.error('Failed to delete section');
    }
  };

  const handleBulkDeleteSections = async () => {
    const ids = [...sectionSelection.selectedIds];
    if (!ids.length) return;
    if (!window.confirm(`Delete ${ids.length} germination ${ids.length === 1 ? 'table' : 'tables'} and all their records?`)) return;
    await deleteIdsSequentially(ids, (id) => apiRequest(`/germination/sections/${id}`, { method: 'DELETE' }));
    setSections((prev) => prev.filter((s) => !sectionSelection.selectedIds.has(s.id)));
    sectionSelection.clear();
  };

  const handleAddRow = async (sectionId) => {
    try {
      await apiRequest('/germination/records', {
        method: 'POST',
        body: JSON.stringify({ sectionId, varietyName: '', counts: [] }),
      });
      loadRecords(sectionId);
    } catch (err) {
      notify.error('Failed to add row');
    }
  };

  const handleAddCounting = (sectionId) => {
    const current = maxCountings[sectionId] || 1;
    const records = recordsBySection[sectionId] || [];
    if (records.length === 0) return;
    setRecordsBySection(prev => ({
      ...prev,
      [sectionId]: records.map(r => {
        const counts = [...(r.counts || [])];
        const hasNext = counts.some(c => c.counting_number === current + 1);
        if (!hasNext) {
          counts.push({ counting_number: current + 1, date: null, seeds_total: null, seeds_no_germ: null });
        }
        return { ...r, counts };
      }),
    }));
  };

  const handleCellChange = (sectionId, recordId, countingNumber, field, value) => {
    setRecordsBySection(prev => {
      const records = (prev[sectionId] || []).map(r => {
        if (r.id !== recordId) return r;
        if (field === 'varietyName') {
          return { ...r, variety_name: value, _dirty: true };
        }
        const counts = [...(r.counts || [])];
        const idx = counts.findIndex(c => c.counting_number === countingNumber);
        if (idx >= 0) {
          counts[idx] = { ...counts[idx], [field]: value };
        } else {
          counts.push({ counting_number: countingNumber, date: null, seeds_total: null, seeds_no_germ: null, [field]: value });
        }
        return { ...r, counts, _dirty: true };
      });
      return { ...prev, [sectionId]: records };
    });
  };

  const handleSaveRecord = async (sectionId, record) => {
    try {
      const counts = (record.counts || []).map(c => ({
        counting_number: c.counting_number,
        date: c.date || null,
        seeds_total: c.seeds_total != null ? Number(c.seeds_total) : null,
        seeds_no_germ: c.seeds_no_germ != null ? Number(c.seeds_no_germ) : null,
      }));
      await apiRequest(`/germination/records/${record.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          varietyName: record.variety_name || null,
          counts,
        }),
      });
      loadRecords(sectionId);
      notify.success('Saved');
    } catch (err) {
      notify.error('Failed to save');
    }
  };

  const handleDeleteRecord = async (sectionId, recordId) => {
    try {
      await apiRequest(`/germination/records/${recordId}`, { method: 'DELETE' });
      loadRecords(sectionId);
    } catch (err) {
      notify.error('Failed to delete');
    }
  };

  const handleImport = async (importData) => {
    try {
      await apiRequest('/germination/bulk', {
        method: 'POST',
        body: JSON.stringify({ siteId: siteId || null, sections: importData }),
      });
      notify.success('Import successful');
      setImportOpen(false);
      loadSections();
    } catch (err) {
      notify.error('Import failed');
    }
  };

  if (loading && sections.length === 0) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>;
  }

  return (
    <Box sx={{ mt: 2 }}>
      {roleReadOnly && (
        <ReadOnlyBanner message={t('cropHistoryAccess.germinationViewOnly')} />
      )}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6" fontWeight={700}>Seeds Germination Percentage</Typography>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <SelectAllCheckbox
            ids={sections.map((s) => s.id)}
            selectedIds={sectionSelection.selectedIds}
            onToggleAll={sectionSelection.toggleAll}
            label="Select all germination tables"
          />
          <DeleteSelectedButton count={sectionSelection.size} onClick={handleBulkDeleteSections} label="Delete selected tables" disabled={readOnly} />
          <Button size="small" variant="outlined" startIcon={<FileDownload />} onClick={handleExportExcel}>
            Export
          </Button>
          <Button size="small" variant="outlined" startIcon={<FileUpload />} onClick={() => setImportOpen(true)} disabled={readOnly}>
            Import Excel
          </Button>
        </Box>
      </Box>

      {sections.length === 0 && !loading && (
        <Alert severity="info" sx={{ mb: 2 }}>No germination tables yet. Click "Add New Table" to start.</Alert>
      )}

      {sections.map(section => (
        <SectionTable
          key={section.id}
          section={section}
          records={recordsBySection[section.id] || []}
          maxCounting={maxCountings[section.id] || 1}
          editingName={editingName}
          tempName={tempName}
          setEditingName={setEditingName}
          setTempName={setTempName}
          onRename={handleRenameSection}
          onDelete={handleDeleteSection}
          onAddRow={handleAddRow}
          onAddCounting={handleAddCounting}
          onCellChange={handleCellChange}
          onSaveRecord={handleSaveRecord}
          onDeleteRecord={handleDeleteRecord}
          sectionSelectedIds={sectionSelection.selectedIds}
          onToggleSection={sectionSelection.toggle}
          readOnly={readOnly}
        />
      ))}

      {!readOnly && (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
        <Button variant="contained" startIcon={<Add />} onClick={handleAddSection} sx={{ bgcolor: 'table.headerBg', '&:hover': { bgcolor: 'table.selection' } }}>
          Add New Table
        </Button>
      </Box>
      )}

      {importOpen && !readOnly && (
        <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} onImport={handleImport} />
      )}
    </Box>
  );
}

function SectionTable({ section, records, maxCounting, editingName, tempName, setEditingName, setTempName, onRename, onDelete, onAddRow, onAddCounting, onCellChange, onSaveRecord, onDeleteRecord, sectionSelectedIds, onToggleSection, readOnly }) {
  const countingNumbers = Array.from({ length: maxCounting }, (_, i) => i + 1);
  const colsPerCounting = 5;
  const recordSelection = useRowSelection();

  const handleBulkDeleteRecords = async () => {
    const ids = [...recordSelection.selectedIds];
    if (!ids.length) return;
    if (!window.confirm(`Delete ${ids.length} germination ${ids.length === 1 ? 'row' : 'rows'}?`)) return;
    await deleteIdsSequentially(ids, (id) => onDeleteRecord(section.id, id));
    recordSelection.clear();
  };

  return (
    <Paper sx={{ mb: 3, overflow: 'hidden' }} elevation={2}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1, bgcolor: 'table.headerBg', color: 'table.headerText' }}>
        {editingName === section.id ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <TextField
              size="small"
              value={tempName}
              onChange={(e) => setTempName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onRename(section.id); if (e.key === 'Escape') setEditingName(null); }}
              autoFocus
              sx={{ width: 200 }}
            />
            <IconButton size="small" onClick={() => onRename(section.id)} sx={{ color: 'inherit' }}><SaveIcon fontSize="small" /></IconButton>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <RowCheckbox
              id={section.id}
              selectedIds={sectionSelectedIds}
              onToggle={onToggleSection}
              label={`Select germination table ${section.name}`}
            />
            <Typography variant="subtitle1" fontWeight={700} sx={{ color: 'inherit' }}>{section.name}</Typography>
            {!readOnly && <Tooltip title="Rename"><IconButton size="small" onClick={() => { setEditingName(section.id); setTempName(section.name); }} sx={{ color: 'inherit' }}><Edit fontSize="small" /></IconButton></Tooltip>}
          </Box>
        )}
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <DeleteSelectedButton count={recordSelection.size} onClick={handleBulkDeleteRecords} disabled={readOnly} />
          {!readOnly && (
            <>
              <Button size="small" variant="outlined" color="success" onClick={() => onAddCounting(section.id)}>
                + Add Counting
              </Button>
              <Tooltip title="Delete Table">
                <IconButton size="small" color="error" onClick={() => onDelete(section.id)}><Delete fontSize="small" /></IconButton>
              </Tooltip>
            </>
          )}
        </Box>
      </Box>

      <TableContainer sx={{ maxHeight: 480 }}>
        <Table size="small" sx={[excelTableSx, freezeColumnsSx(GERM_FROZEN_WIDTHS), twoRowHeadSx, germTintSx, germDenseSx]}>
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox" rowSpan={2}>
                <SelectAllCheckbox
                  ids={records.map((r) => r.id)}
                  selectedIds={recordSelection.selectedIds}
                  onToggleAll={recordSelection.toggleAll}
                  label="Select all germination rows"
                />
              </TableCell>
              <TableCell rowSpan={2} className="col-frozen-0">Variety</TableCell>
              {countingNumbers.map(n => (
                <TableCell key={n} colSpan={colsPerCounting} align="center">
                  {ordinalLabel(n)}
                </TableCell>
              ))}
              <TableCell rowSpan={2}>Actions</TableCell>
            </TableRow>
            <TableRow>
              {countingNumbers.map(n => (
                <React.Fragment key={n}>
                  <TableCell>Date</TableCell>
                  <TableCell className="col-numeric">Seeds Total</TableCell>
                  <TableCell className="col-numeric">No Germ</TableCell>
                  <TableCell className="col-numeric">No Germ %</TableCell>
                  <TableCell className="col-numeric">Germ %</TableCell>
                </React.Fragment>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {records.map(record => {
              const displayName = record.resolved_variety_name || record.variety_name || '';
              return (
                <TableRow key={record.id} hover selected={recordSelection.selectedIds.has(record.id)}>
                  <RowSelectCell
                    id={record.id}
                    selectedIds={recordSelection.selectedIds}
                    onToggle={recordSelection.toggle}
                    label={`Select germination row ${displayName || record.id}`}
                  />
                  <TableCell className="col-frozen-0" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                    <TextField
                      variant="standard"
                      size="small"
                      value={displayName}
                      onChange={(e) => onCellChange(section.id, record.id, null, 'varietyName', e.target.value)}
                      disabled={readOnly}
                      InputProps={{ disableUnderline: true, sx: { fontSize: '0.72rem', fontWeight: 600 } }}
                      fullWidth
                    />
                  </TableCell>
                  {countingNumbers.map(n => {
                    const count = (record.counts || []).find(c => c.counting_number === n) || {};
                    const { noGermPct, germPct } = calcPercentages(count);
                    const germClass = germPct == null ? undefined
                      : germPct >= 90 ? 'cell-germ-high'
                        : germPct >= 70 ? 'cell-germ-mid'
                          : 'cell-germ-low';
                    return (
                      <React.Fragment key={n}>
                        <TableCell>
                          <TextField
                            variant="standard"
                            type="date"
                            size="small"
                            value={count.date || ''}
                            onChange={(e) => onCellChange(section.id, record.id, n, 'date', e.target.value)}
                            disabled={readOnly}
                            InputProps={{ disableUnderline: true, sx: { fontSize: '0.68rem' } }}
                            sx={{ minWidth: 88, '& input': { py: 0, height: 22 } }}
                          />
                        </TableCell>
                        <TableCell className="col-numeric">
                          <TextField
                            variant="standard"
                            type="number"
                            size="small"
                            value={count.seeds_total ?? ''}
                            onChange={(e) => onCellChange(section.id, record.id, n, 'seeds_total', e.target.value ? Number(e.target.value) : null)}
                            disabled={readOnly}
                            InputProps={{ disableUnderline: true, sx: { fontSize: '0.72rem' } }}
                            sx={{ width: 56, '& input': { py: 0, height: 22 } }}
                          />
                        </TableCell>
                        <TableCell className="col-numeric">
                          <TextField
                            variant="standard"
                            type="number"
                            size="small"
                            value={count.seeds_no_germ ?? ''}
                            onChange={(e) => onCellChange(section.id, record.id, n, 'seeds_no_germ', e.target.value ? Number(e.target.value) : null)}
                            disabled={readOnly}
                            InputProps={{ disableUnderline: true, sx: { fontSize: '0.72rem' } }}
                            sx={{ width: 56, '& input': { py: 0, height: 22 } }}
                          />
                        </TableCell>
                        <TableCell className="col-numeric" sx={{ color: getGermColor(100 - (noGermPct || 0)), fontWeight: 600 }}>
                          {noGermPct != null ? `${noGermPct}%` : ''}
                        </TableCell>
                        <TableCell className={`col-numeric ${germClass || ''}`.trim()} sx={{ color: getGermColor(germPct), fontWeight: 700 }}>
                          {germPct != null ? `${germPct}%` : ''}
                        </TableCell>
                      </React.Fragment>
                    );
                  })}
                  <TableCell align="center">
                    <Box sx={{ display: 'flex', gap: 0.3 }}>
                      {record._dirty && !readOnly && (
                        <Tooltip title="Save"><IconButton size="small" color="primary" onClick={() => onSaveRecord(section.id, record)}><SaveIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip>
                      )}
                      {!readOnly && (
                        <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => onDeleteRecord(section.id, record.id)}><Delete sx={{ fontSize: 16 }} /></IconButton></Tooltip>
                      )}
                    </Box>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      {!readOnly && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 1, borderTop: '1px solid #e0e0e0' }}>
          <Button size="small" startIcon={<Add />} onClick={() => onAddRow(section.id)} sx={{ color: 'table.headerBg' }}>
            Add Row
          </Button>
        </Box>
      )}
    </Paper>
  );
}

function ImportDialog({ open, onClose, onImport }) {
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
        const parsed = parseWorkbook(wb);
        setPreview(parsed);
      } catch (err) {
        setPreview(null);
      }
      setParsing(false);
    };
    reader.readAsArrayBuffer(f);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Import Germination Data from Excel</DialogTitle>
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
          <Alert severity="success">
            Found {preview.length} section(s): {preview.map(s => `"${s.name}" (${s.records.length} rows)`).join(', ')}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!preview} onClick={() => onImport(preview)} color="success">
          Import
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function parseWorkbook(wb) {
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  const sections = [];
  let currentSection = null;
  let headerRowIdx = -1;
  let countingCols = [];

  for (let i = 0; i < raw.length; i++) {
    const row = raw[i];
    if (!row || row.every(c => c === '' || c == null)) {
      if (currentSection && currentSection.records.length > 0) {
        sections.push(currentSection);
        currentSection = null;
        headerRowIdx = -1;
      }
      continue;
    }

    const firstCell = String(row[0] || '').trim().toLowerCase();

    if (firstCell === 'variety' || (row.length > 1 && String(row[1] || '').toLowerCase().includes('counting'))) {
      if (currentSection && currentSection.records.length > 0) {
        sections.push(currentSection);
      }
      currentSection = { name: sections.length === 0 ? 'Main' : `Section ${sections.length + 1}`, records: [] };
      countingCols = parseHeaderForCountings(raw, i);
      headerRowIdx = i;
      if (raw[i + 1] && String(raw[i + 1][0] || '').toLowerCase() === 'variety') {
        headerRowIdx = i + 1;
        i++;
      }
      continue;
    }

    if (firstCell.includes('trial') || firstCell.includes('new variety')) {
      if (currentSection && currentSection.records.length > 0) {
        sections.push(currentSection);
      }
      currentSection = { name: row[0] || `Section ${sections.length + 1}`, records: [] };
      countingCols = [];
      headerRowIdx = -1;
      const nextRow = raw[i + 1];
      if (nextRow && String(nextRow[0] || '').toLowerCase() === 'variety') {
        countingCols = parseHeaderForCountings(raw, i + 1);
        headerRowIdx = i + 1;
        i++;
      }
      continue;
    }

    if (headerRowIdx < 0 && !currentSection) {
      const merged = String(row[0] || '').trim();
      if (merged && !merged.toLowerCase().includes('counting')) {
        continue;
      }
      if (String(row[0] || '').toLowerCase().includes('counting') || (row.length > 2 && String(row[1] || '').toLowerCase().includes('counting'))) {
        currentSection = { name: 'Main', records: [] };
        countingCols = parseHeaderForCountings(raw, i);
        const nextRow = raw[i + 1];
        if (nextRow && String(nextRow[0] || '').toLowerCase() === 'variety') {
          headerRowIdx = i + 1;
          i++;
        } else {
          headerRowIdx = i;
        }
        continue;
      }
      continue;
    }

    if (!currentSection) {
      currentSection = { name: 'Main', records: [] };
    }

    if (headerRowIdx >= 0 && i <= headerRowIdx) continue;

    const variety = String(row[0] || '').trim();
    if (!variety) continue;

    const counts = [];
    if (countingCols.length === 0) {
      const seedsTotal = Number(row[1]) || null;
      const seedsNoGerm = Number(row[2]) || null;
      if (seedsTotal) {
        counts.push({ counting_number: 1, date: null, seeds_total: seedsTotal, seeds_no_germ: seedsNoGerm || 0 });
      }
    } else {
      for (const cc of countingCols) {
        const dateVal = row[cc.dateCol] || null;
        const seedsTotal = Number(row[cc.seedsCol]) || null;
        const seedsNoGerm = Number(row[cc.noGermCol]) || null;
        if (seedsTotal) {
          let dateStr = null;
          if (dateVal) {
            if (typeof dateVal === 'number') {
              const d = XLSX.SSF.parse_date_code(dateVal);
              if (d) dateStr = `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
            } else {
              dateStr = String(dateVal);
            }
          }
          counts.push({ counting_number: cc.countingNumber, date: dateStr, seeds_total: seedsTotal, seeds_no_germ: seedsNoGerm || 0 });
        }
      }
    }

    currentSection.records.push({ varietyName: variety, counts });
  }

  if (currentSection && currentSection.records.length > 0) {
    sections.push(currentSection);
  }

  return sections.length > 0 ? sections : [{ name: 'Main', records: [] }];
}

function parseHeaderForCountings(raw, headerIdx) {
  const cols = [];
  const row = raw[headerIdx];
  const prevRow = headerIdx > 0 ? raw[headerIdx - 1] : null;

  let countingNumber = 0;
  for (let c = 1; c < (row?.length || 0); c++) {
    const cellAbove = prevRow ? String(prevRow[c] || '').toLowerCase() : '';
    const cell = String(row[c] || '').toLowerCase();

    if (cellAbove.includes('counting') || cell.includes('counting')) {
      countingNumber++;
      const match = (cellAbove + ' ' + cell).match(/(\d+)/);
      const num = match ? parseInt(match[1]) : countingNumber;

      let dateCol = -1, seedsCol = -1, noGermCol = -1;

      for (let offset = 0; offset < 6 && (c + offset) < row.length; offset++) {
        const h = String(row[c + offset] || '').toLowerCase();
        if ((h.includes('date') || h.includes('counting date')) && dateCol < 0) dateCol = c + offset;
        else if ((h.includes('seeds counting') || h.includes('seeds total') || h === 'no of seeds counting') && seedsCol < 0) seedsCol = c + offset;
        else if ((h.includes('no germination') || h.includes('no germ')) && !h.includes('%') && noGermCol < 0) noGermCol = c + offset;
      }

      if (seedsCol < 0) seedsCol = c;
      if (dateCol < 0) dateCol = c;
      if (noGermCol < 0) noGermCol = c + 2;

      cols.push({ countingNumber: num, dateCol, seedsCol, noGermCol });
      c += 4;
    }
  }

  if (cols.length === 0) {
    let dateCol = 1, seedsCol = 2, noGermCol = 3;
    for (let c = 1; c < (row?.length || 0); c++) {
      const cell = String(row[c] || '').toLowerCase();
      if (cell.includes('date')) dateCol = c;
      else if (cell.includes('seeds') && cell.includes('counting')) seedsCol = c;
      else if (cell.includes('no germination') && !cell.includes('%')) noGermCol = c;
    }
    cols.push({ countingNumber: 1, dateCol, seedsCol, noGermCol });
  }

  return cols;
}
