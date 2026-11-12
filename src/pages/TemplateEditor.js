import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Container,
  Typography,
  Box,
  Grid,
  Card,
  Alert,
  Button,
  TextField,
  MenuItem,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Switch,
  FormControlLabel,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import {
  AddOutlined as AddIcon,
  DeleteOutlined as DeleteIcon,
  ArrowUpwardOutlined as UpIcon,
  ArrowDownwardOutlined as DownIcon,
  SaveOutlined as SaveIcon,
  UploadFileOutlined as UploadIcon,
  ArrowBackOutlined as BackIcon,
  ViewColumnOutlined as SectionIcon,
  FunctionsOutlined as FormulaIcon,
  VisibilityOutlined as PreviewIcon,
  ContentCopyOutlined as DuplicateIcon,
} from '@mui/icons-material';
import * as XLSX from 'xlsx';
import { useNotification } from '../contexts/NotificationContext';
import { useActiveSite } from '../contexts/ActiveSiteContext';
import { apiRequest } from '../utils/api';
import { excelTableSx, GutterCell } from '../components/table/ExcelTable';
import InfoNote from '../components/InfoNote';

function toCamelCase(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+(.)/g, (_, ch) => ch.toUpperCase())
    .replace(/^[^a-zA-Z]+/, '');
}

function inferType(values) {
  const nonEmpty = values.filter((v) => v !== null && v !== undefined && v !== '');
  if (nonEmpty.length === 0) return 'text';
  const numCount = nonEmpty.filter((v) => !isNaN(Number(v))).length;
  if (numCount / nonEmpty.length > 0.7) return 'number';
  const dateCount = nonEmpty.filter((v) => {
    if (typeof v === 'number') return false;
    const d = new Date(v);
    return !isNaN(d.getTime());
  }).length;
  if (dateCount / nonEmpty.length > 0.7) return 'date';
  return 'text';
}

const COLUMN_TYPES = [
  { value: 'number', label: 'Number' },
  { value: 'text', label: 'Text' },
  { value: 'date', label: 'Date' },
  { value: 'dropdown', label: 'Dropdown' },
  { value: 'calculated', label: 'Calculated' },
];

const twoRowHeadSx = {
  '&& thead tr:first-of-type .MuiTableCell-head': { top: 0 },
  '&& thead tr:nth-of-type(2) .MuiTableCell-head': { top: 40 },
};

const calcCellSx = {
  '&&& .MuiTableBody-root .MuiTableCell-root.cell-calc': {
    backgroundColor: 'table.sectionBg',
  },
};

const CATEGORIES = [
  { value: 'ecph', label: 'EC / PH' },
  { value: 'fertigation', label: 'Fertigation' },
  { value: 'harvest', label: 'Harvest' },
  { value: 'planting', label: 'Planting & Transplant' },
  { value: 'pest', label: 'Pest Applications' },
  { value: 'scouting', label: 'Scouting Reports' },
  { value: 'biological', label: 'Biological Control' },
  { value: 'weather', label: 'Weather' },
  { value: 'workforce', label: 'Workforce' },
  { value: 'other', label: 'Other' },
];

let nextId = 1;
const uid = () => `col_${nextId++}`;
const suid = () => `sec_${nextId++}`;

/** ASCII slug for keys; Arabic or symbol-only labels give '' so a fallback is used. */
const slug = (str) => String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

/**
 * One unique, stable key per item: its own key, else a slug of its label, else
 * `${prefix}_${n}`. Duplicates get _2, _3… so two columns never share a key
 * (they would overwrite each other's data) and sections point at the right ones.
 */
export function assignKeys(items, prefix) {
  const used = new Set();
  const out = new Map();
  items.forEach((it, i) => {
    // A key already saved in the template is kept as it is (entered data uses it).
    let base = ((it.savedKey || /[a-z0-9]/i.test(String(it.key || ''))) ? String(it.key || '').trim() : '') || slug(it.label) || `${prefix}_${i + 1}`;
    let key = base;
    for (let n = 2; used.has(key); n += 1) key = `${base}_${n}`;
    used.add(key);
    out.set(it._id, key);
  });
  return out;
}

/** First problem that stops the template from being saved, or null. */
export function templateProblem({ name, category, columns }) {
  if (!String(name || '').trim()) return 'Template name is required';
  if (!category) return 'Category is required';
  if (!columns.length) return 'Add at least one column';
  const idx = columns.findIndex((c) => !String(c.label || '').trim());
  if (idx >= 0) return `Column ${idx + 1} needs a label`;
  const dd = columns.find((c) => c.type === 'dropdown' && !String(c.options || '').split(',').some((o) => o.trim()));
  if (dd) return `Add options for the dropdown column "${dd.label}"`;
  const calc = columns.find((c) => c.type === 'calculated' && !String(c.formula || '').trim());
  if (calc) return `Add a formula for the calculated column "${calc.label}"`;
  return null;
}

function makeColumn(overrides = {}) {
  return {
    _id: uid(),
    key: '',
    label: '',
    type: 'number',
    required: false,
    width: 100,
    options: '',
    formula: '',
    sectionId: null,
    ...overrides,
  };
}

function makeSection(overrides = {}) {
  return { _id: suid(), key: '', label: '', ...overrides };
}

export default function TemplateEditor() {
  const navigate = useNavigate();
  const { templateId } = useParams();
  const [searchParams] = useSearchParams();
  const notify = useNotification();
  const { activeSiteId } = useActiveSite();
  const fileRef = useRef(null);
  const isEdit = !!templateId;

  const [name, setName] = useState('');
  const [category, setCategory] = useState(searchParams.get('category') || '');
  const [description, setDescription] = useState('');
  const [columns, setColumns] = useState([]);
  const [sections, setSections] = useState([]);
  const [saving, setSaving] = useState(false);
  const [duplicateKeys, setDuplicateKeys] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [assignToSite, setAssignToSite] = useState(true);
  const [sectionDialog, setSectionDialog] = useState(false);
  const [newSectionLabel, setNewSectionLabel] = useState('');

  useEffect(() => {
    if (isEdit) loadExisting();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId]);

  const loadExisting = async () => {
    try {
      const all = await apiRequest('/form-templates');
      const tpl = all.find((t) => t.id === templateId);
      if (!tpl) {
        notify.error('Template not found');
        navigate('/templates');
        return;
      }
      setName(tpl.name);
      setCategory(tpl.category);
      setDescription(tpl.description || '');
      if (tpl.columns_config) {
        const config = typeof tpl.columns_config === 'string' ? JSON.parse(tpl.columns_config) : tpl.columns_config;
        // Saved columns point at a section by its key; in the editor they point at
        // the section's _id, so translate (otherwise sections are lost on edit).
        const loadedSections = (config.sections || []).map((sec) => makeSection(sec));
        const secIdByKey = new Map(loadedSections.map((sec) => [sec.key, sec._id]));
        const secIdByColumn = new Map();
        (config.sections || []).forEach((sec, i) => (sec.columns || []).forEach((k) => secIdByColumn.set(k, loadedSections[i]._id)));
        setSections(loadedSections);
        // Templates saved before round 32 could give several Arabic-labelled
        // columns the same key ('_'). Say so; saving now assigns unique keys.
        const savedKeys = (config.columns || []).map((c) => c.key);
        if (new Set(savedKeys).size !== savedKeys.length) {
          setDuplicateKeys(true);
        }
        if (config.columns) {
          setColumns(config.columns.map((c) => makeColumn({
            key: c.key,
            label: c.label,
            type: c.type || 'text',
            required: !!c.required,
            width: c.width || 100,
            options: Array.isArray(c.options) ? c.options.join(', ') : '',
            formula: c.formula || '',
            sectionId: (c.sectionId && secIdByKey.get(c.sectionId)) || secIdByColumn.get(c.key) || null,
          })).map((col, i, all) => (all.findIndex((o) => o.key === col.key) < i ? { ...col, key: '' } : { ...col, savedKey: !!col.key })));
        }
      }
    } catch (err) {
      notify.error('Failed to load template');
    }
  };

  // ---------- Excel upload (parsed client-side) ----------
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) { notify.error('Excel file has no sheets'); return; }
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
      if (rows.length === 0) { notify.error('Sheet is empty'); return; }

      const headers = (rows[0] || []).map((h) => String(h ?? '').trim()).filter(Boolean);
      const sampleRows = rows.slice(1, 21);

      const parsed = headers.map((header, colIdx) => {
        const sampleValues = sampleRows.map((row) => row[colIdx]);
        return makeColumn({
          key: toCamelCase(header) || `col${colIdx}`,
          label: header,
          type: inferType(sampleValues),
          width: Math.max(80, Math.min(200, header.length * 10)),
        });
      });

      setColumns(parsed);
      if (!name) setName(file.name.replace(/\.[^/.]+$/, ''));
      notify.success(`Imported ${parsed.length} columns from "${sheetName}" (${rows.length - 1} data rows)`);
    } catch (err) {
      notify.error(err.message || 'Failed to parse Excel file');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  // ---------- Column operations ----------
  const addColumn = () => setColumns((prev) => [...prev, makeColumn()]);
  const removeColumn = (id) => setColumns((prev) => prev.filter((c) => c._id !== id));
  const duplicateColumn = (id) => {
    setColumns((prev) => {
      const idx = prev.findIndex((c) => c._id === id);
      if (idx < 0) return prev;
      const clone = { ...prev[idx], _id: uid(), key: prev[idx].key + 'Copy', label: prev[idx].label + ' (copy)' };
      const next = [...prev];
      next.splice(idx + 1, 0, clone);
      return next;
    });
  };
  const moveColumn = (id, dir) => {
    setColumns((prev) => {
      const idx = prev.findIndex((c) => c._id === id);
      const target = idx + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };
  const updateColumn = (id, field, value) => {
    setColumns((prev) => prev.map((c) => (c._id === id ? { ...c, [field]: value } : c)));
  };

  // ---------- Section operations ----------
  const addSection = () => {
    if (!newSectionLabel.trim()) return;
    const key = slug(newSectionLabel);
    setSections((prev) => [...prev, makeSection({ key, label: newSectionLabel.trim() })]);
    setNewSectionLabel('');
    setSectionDialog(false);
  };
  const removeSection = (id) => {
    setSections((prev) => prev.filter((s) => s._id !== id));
    setColumns((prev) => prev.map((c) => (c.sectionId === id ? { ...c, sectionId: null } : c)));
  };

  // ---------- Save ----------
  const handleSave = async () => {
    const problem = templateProblem({ name, category, columns });
    if (problem) { notify.warning(problem); return; }

    setSaving(true);
    try {
      const colKeys = assignKeys(columns, 'col');
      const secKeys = assignKeys(sections, 'section');
      const columnsConfig = {
        sections: sections.map((s) => ({
          key: secKeys.get(s._id),
          label: s.label,
          columns: columns.filter((c) => c.sectionId === s._id).map((c) => colKeys.get(c._id)),
        })),
        columns: columns.map((c) => {
          const col = {
            key: colKeys.get(c._id),
            label: c.label.trim(),
            type: c.type,
            required: c.required,
            width: c.width,
          };
          if (c.sectionId && secKeys.has(c.sectionId)) col.sectionId = secKeys.get(c.sectionId);
          if (c.type === 'dropdown' && c.options) {
            col.options = c.options.split(',').map((o) => o.trim()).filter(Boolean);
          }
          if (c.type === 'calculated' && c.formula) {
            col.formula = c.formula;
          }
          return col;
        }),
      };

      if (isEdit) {
        await apiRequest(`/form-templates/${templateId}`, {
          method: 'PUT',
          body: JSON.stringify({ name: name.trim(), category, description: description.trim(), columnsConfig }),
        });
        notify.success('Template updated');
      } else {
        const created = await apiRequest('/form-templates', {
          method: 'POST',
          body: JSON.stringify({ name: name.trim(), category, description: description.trim(), columnsConfig, siteId: activeSiteId || undefined }),
        });
        if (assignToSite && activeSiteId && created?.id) {
          try {
            const existing = await apiRequest(`/form-templates/site/${activeSiteId}`);
            const ids = existing.map((t) => t.id);
            ids.push(created.id);
            await apiRequest(`/form-templates/site/${activeSiteId}/assign`, {
              method: 'POST',
              body: JSON.stringify({ templateIds: ids }),
            });
          } catch { /* best effort */ }
        }
        notify.success('Template created');
      }
      navigate('/templates');
    } catch (err) {
      notify.error(err.message || 'Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  // ---------- Render ----------
  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <IconButton onClick={() => navigate('/templates')} aria-label="Back"><BackIcon /></IconButton>
        <Typography variant="h4">
          {isEdit ? 'Edit Template' : 'Create Template'}
        </Typography>
      </Box>

      {duplicateKeys && (
        <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setDuplicateKeys(false)}>
          Some columns in this template share the same key, so their values overwrite each other. Saving gives each column its own key; data already entered under the shared key stays with the first column.
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* Left panel: Editor */}
        <Grid size={{ xs: 12, lg: 6 }}>
          {/* Meta fields */}
          <Card variant="outlined" sx={{ mb: 3, p: 3 }}>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  fullWidth label="Template Name" value={name} size="small"
                  onChange={(e) => setName(e.target.value)} required
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  fullWidth select label="Category" value={category} size="small"
                  onChange={(e) => setCategory(e.target.value)} required
                >
                  {CATEGORIES.map((c) => (
                    <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid size={12}>
                <TextField
                  fullWidth label="Description" value={description} size="small"
                  onChange={(e) => setDescription(e.target.value)} multiline rows={2}
                />
              </Grid>
            </Grid>
          </Card>

          {/* Upload / Start */}
          <Card variant="outlined" sx={{ mb: 3, p: 3 }}>
            <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>Start Building</Typography>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <Button
                variant="outlined" startIcon={<UploadIcon />}
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? 'Parsing...' : 'Upload Excel'}
              </Button>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={handleFileUpload} />
              <Button variant="outlined" startIcon={<AddIcon />} onClick={addColumn}>
                Add Column
              </Button>
              <Button variant="outlined" startIcon={<SectionIcon />} onClick={() => setSectionDialog(true)}>
                Add Section
              </Button>
            </Box>
          </Card>

          {/* Sections */}
          {sections.length > 0 && (
            <Card variant="outlined" sx={{ mb: 3, p: 3 }}>
              <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 600 }}>Sections (Column Groups)</Typography>
              {sections.map((sec) => (
                <Box key={sec._id} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <Chip label={sec.label} size="small" sx={{ fontWeight: 600 }} />
                  <Typography variant="caption" color="text.secondary">
                    {columns.filter((c) => c.sectionId === sec._id).length} columns
                  </Typography>
                  <IconButton size="small" color="error" onClick={() => removeSection(sec._id)} aria-label="Delete">
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
              ))}
            </Card>
          )}

          {/* Column list */}
          <Card variant="outlined" sx={{ p: 0 }}>
            <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                Columns ({columns.length})
              </Typography>
              <Button size="small" startIcon={<AddIcon />} onClick={addColumn}>Add</Button>
            </Box>

            {columns.length === 0 && (
              <InfoNote mode="line" severity="info" sx={{ m: 2 }}>
                Upload an Excel file or add columns manually to get started.
              </InfoNote>
            )}

            {columns.map((col, idx) => (
              <Box
                key={col._id}
                sx={{
                  p: 2,
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                  bgcolor: idx % 2 === 0 ? 'transparent' : 'action.hover',
                }}
              >
                <Grid container spacing={1} alignItems="center">
                  <Grid size={{ xs: 12, sm: 3 }}>
                    <TextField
                      fullWidth label="Label" value={col.label} size="small"
                      onChange={(e) => {
                        updateColumn(col._id, 'label', e.target.value);
                        // The key follows the label until it is set by hand (Arabic gives '', and
                        // a unique fallback key is chosen when saving).
                        if (!col.key || col.key === slug(col.label)) {
                          updateColumn(col._id, 'key', slug(e.target.value));
                        }
                      }}
                    />
                  </Grid>
                  <Grid size={{ xs: 6, sm: 2 }}>
                    <TextField
                      fullWidth select label="Type" value={col.type} size="small"
                      onChange={(e) => updateColumn(col._id, 'type', e.target.value)}
                    >
                      {COLUMN_TYPES.map((t) => (
                        <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
                      ))}
                    </TextField>
                  </Grid>
                  <Grid size={{ xs: 6, sm: 1 }}>
                    <TextField
                      fullWidth label="Width" type="number" value={col.width} size="small"
                      onChange={(e) => updateColumn(col._id, 'width', parseInt(e.target.value) || 80)}
                      inputProps={{ min: 40, max: 400, step: 10 }}
                    />
                  </Grid>
                  {sections.length > 0 && (
                    <Grid size={{ xs: 6, sm: 2 }}>
                      <TextField
                        fullWidth select label="Section" value={col.sectionId || ''} size="small"
                        onChange={(e) => updateColumn(col._id, 'sectionId', e.target.value || null)}
                      >
                        <MenuItem value="">None</MenuItem>
                        {sections.map((s) => (
                          <MenuItem key={s._id} value={s._id}>{s.label}</MenuItem>
                        ))}
                      </TextField>
                    </Grid>
                  )}
                  <Grid size={{ xs: 6, sm: 1 }}>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={col.required} size="small"
                          onChange={(e) => updateColumn(col._id, 'required', e.target.checked)}
                        />
                      }
                      label={<Typography variant="caption">Req</Typography>}
                    />
                  </Grid>
                  <Grid size={'auto'}>
                    <Box sx={{ display: 'flex', gap: 0.25 }}>
                      <IconButton size="small" onClick={() => moveColumn(col._id, -1)} disabled={idx === 0} aria-label="Move up">
                        <UpIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" onClick={() => moveColumn(col._id, 1)} disabled={idx === columns.length - 1} aria-label="Move down">
                        <DownIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" onClick={() => duplicateColumn(col._id)} aria-label="Duplicate">
                        <DuplicateIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" color="error" onClick={() => removeColumn(col._id)} aria-label="Delete">
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  </Grid>
                </Grid>

                {col.type === 'dropdown' && (
                  <TextField
                    fullWidth label="Options (comma-separated)" value={col.options} size="small"
                    onChange={(e) => updateColumn(col._id, 'options', e.target.value)}
                    sx={{ mt: 1 }}
                    placeholder="e.g. Sunny, Cloudy, Rainy, Foggy"
                  />
                )}
                {col.type === 'calculated' && (
                  <TextField
                    fullWidth label="Formula" value={col.formula} size="small"
                    onChange={(e) => updateColumn(col._id, 'formula', e.target.value)}
                    sx={{ mt: 1 }}
                    placeholder="e.g. waterQty * frequency * valves"
                    InputProps={{
                      startAdornment: <FormulaIcon sx={{ mr: 1, color: 'text.secondary', fontSize: 18 }} />,
                    }}
                  />
                )}
              </Box>
            ))}
          </Card>

          {/* Save */}
          <Box sx={{ mt: 3, display: 'flex', gap: 2, alignItems: 'center' }}>
            <Button
              variant="contained" size="large" startIcon={<SaveIcon />}
              onClick={handleSave} disabled={saving}
            >
              {saving ? 'Saving...' : isEdit ? 'Update Template' : 'Save Template'}
            </Button>
            {!isEdit && activeSiteId && (
              <FormControlLabel
                control={<Switch checked={assignToSite} onChange={(e) => setAssignToSite(e.target.checked)} />}
                label="Assign to current site"
              />
            )}
            <Button variant="outlined" onClick={() => navigate('/templates')}>Cancel</Button>
          </Box>
        </Grid>

        {/* Right panel: Live Preview */}
        <Grid size={{ xs: 12, lg: 6 }}>
          <Card variant="outlined" sx={{ p: 0, position: 'sticky', top: 80 }}>
            <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1 }}>
              <PreviewIcon fontSize="small" />
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>Live Preview</Typography>
              {columns.length > 0 && (
                <Chip label={`${columns.length} columns`} size="small" variant="outlined" sx={{ ml: 'auto' }} />
              )}
            </Box>

            {columns.length === 0 ? (
              <Box sx={{ p: 4, textAlign: 'center' }}>
                <Typography color="text.secondary">Add columns to see a preview</Typography>
              </Box>
            ) : (
              <TableContainer sx={{ maxHeight: 'calc(100vh - 200px)', overflowX: 'auto' }}>
                <Table size="small" sx={[excelTableSx, sections.length > 0 ? twoRowHeadSx : {}, calcCellSx]}>
                  <TableHead>
                    {sections.length > 0 && (
                      <TableRow>
                        <GutterCell />
                        {(() => {
                          const headerCells = [];
                          let i = 0;
                          while (i < columns.length) {
                            const col = columns[i];
                            if (col.sectionId) {
                              const sec = sections.find((s) => s._id === col.sectionId);
                              let span = 0;
                              while (i + span < columns.length && columns[i + span].sectionId === col.sectionId) span++;
                              headerCells.push(
                                <TableCell
                                  key={`sec-${col.sectionId}-${i}`}
                                  colSpan={span}
                                  align="center"
                                >
                                  {sec?.label || 'Section'}
                                </TableCell>
                              );
                              i += span;
                            } else {
                              headerCells.push(
                                <TableCell key={`nosec-${i}`} />
                              );
                              i++;
                            }
                          }
                          return headerCells;
                        })()}
                      </TableRow>
                    )}
                    <TableRow>
                      <GutterCell />
                      {columns.map((col) => (
                        <TableCell key={col._id}>
                          {col.label || '(unnamed)'}
                          {col.required && <span style={{ color: '#d32f2f' }}> *</span>}
                          {col.type === 'calculated' && (
                            <Chip label="fx" size="small" sx={{ ml: 0.5, height: 16, fontSize: '0.6875rem' }} />
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {[1, 2, 3].map((rowNum) => (
                      <TableRow key={rowNum} hover>
                        <GutterCell index={rowNum} />
                        {columns.map((col) => (
                          <TableCell
                            key={col._id}
                            className={col.type === 'calculated' ? 'cell-calc' : undefined}
                            sx={{
                              fontStyle: col.type === 'calculated' ? 'italic' : 'normal',
                            }}
                          >
                            {col.type === 'calculated' ? (
                              <Typography variant="caption" color="text.disabled">(auto)</Typography>
                            ) : col.type === 'dropdown' ? (
                              <Typography variant="caption" color="text.disabled">
                                {col.options ? col.options.split(',')[0]?.trim() + '...' : '(select)'}
                              </Typography>
                            ) : col.type === 'date' ? (
                              <Typography variant="caption" color="text.disabled">yyyy-mm-dd</Typography>
                            ) : (
                              <Box sx={{ height: 20, borderBottom: '1px dashed', borderColor: 'divider' }} />
                            )}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Card>
        </Grid>
      </Grid>

      {/* Section dialog */}
      <Dialog open={sectionDialog} onClose={() => setSectionDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Add Section (Column Group)</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Sections group related columns under a shared header, like "Valve 1" spanning EC In, pH In, EC Out, pH Out.
          </Typography>
          <TextField
            fullWidth label="Section Name" value={newSectionLabel} size="small"
            onChange={(e) => setNewSectionLabel(e.target.value)}
            placeholder="e.g. Valve 1, Water Data, Fertilizers"
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') addSection(); }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSectionDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={addSection} disabled={!newSectionLabel.trim()}>
            Add Section
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
