import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Box, Typography,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  CircularProgress, Chip, Alert, Stepper, Step, StepLabel, Tooltip,
  MenuItem, Select, FormControl, Checkbox,
} from '@mui/material';
import {
  CloudUploadOutlined as UploadIcon,
  CheckCircleOutlineOutlined as OkIcon,
  WarningAmberOutlined as WarnIcon,
  ErrorOutlineOutlined as ErrIcon,
  FileDownloadOutlined as ImportIcon,
} from '@mui/icons-material';
import * as XLSX from 'xlsx';
import { bulkCreateFertigation, listRecipesAll } from '../utils/backendApi';
import {
  isInputFileSheet,
  defaultSelectedSheetNames,
  extractSheetData,
  autoMapHeaders,
  mismatchSheetNames,
  concatSelectedSheets,
  applyColumnMapping,
  matchFertilizerHeader,
  isTotalFertilizerHeader,
} from '../utils/fertigationExcelSheets';
import {
  blockedRecipeGroups,
  checkImportRecipe,
  fertilizersForImport,
  normalizeRecipeKey,
  recipeNotApprovedMessage,
} from '../utils/fertigationImportValidate';
import InfoNote from './InfoNote';

const headerBg = '#1d5a3c'; // = theme palette.table.headerBg
const bannerBg = '#164a31';
const bannerColor = '#fff';
const altRowBg = '#e8f5e9';
const cellBorder = '1px solid #c8c8c8';
const warnBg = '#fff8e1';
const errBg = '#ffebee';

const hdrStyle = {
  background: headerBg, color: '#fff', fontWeight: 700,
  fontSize: '0.6875rem', padding: '6px 8px', border: cellBorder, whiteSpace: 'nowrap',
};
const cellStyle = { fontSize: '0.6875rem', padding: '5px 8px', border: cellBorder };

const STEPS = ['Upload Excel', 'Choose sheets', 'Map Columns', 'Review & Validate', 'Import Results'];

const TEMPLATE_FIELDS = [
  { key: 'weekNo', label: 'Week No' },
  { key: 'date', label: 'Date' },
  { key: 'stationName', label: 'Station Name' },
  { key: 'system', label: 'System' },
  { key: 'method', label: 'Method' },
  { key: 'operator', label: 'Operator' },
  { key: 'authorizedBy', label: 'Authorized By' },
  { key: 'farm', label: 'Farm' },
  { key: 'fieldId', label: 'Field ID' },
  { key: 'valves', label: 'Number of Valves' },
  { key: 'crop', label: 'Crop' },
  { key: 'cropStage', label: 'Crop Stage' },
  { key: 'flowRate', label: 'Flow Rate (m3/hr)' },
  { key: 'waterQty', label: 'Water Qty (M3/Valve)' },
  { key: 'frequency', label: 'Frequency' },
  { key: 'dailyTotal', label: 'Daily Total (m3)' },
  { key: 'recipe', label: 'Recipe' },
];

function normalizeFieldName(name) {
  return (name || '').toString().trim().toLowerCase().replace(/[\s\-]+/g, '');
}

function getWeekNumber(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
}

export default function FertigationImporter({ open, onClose, fields = [], onImportComplete }) {
  const [step, setStep] = useState(0);
  const [parseError, setParseError] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState(null);
  const fileRef = useRef(null);

  const [sheetInfos, setSheetInfos] = useState([]);
  const [selectedSheetNames, setSelectedSheetNames] = useState([]);
  const [mapSourceSheet, setMapSourceSheet] = useState('');
  const [headerMismatchNames, setHeaderMismatchNames] = useState([]);

  const [excelHeaders, setExcelHeaders] = useState([]);
  const [columnMapping, setColumnMapping] = useState({});
  const [rawDataRows, setRawDataRows] = useState([]);
  const [sampleRows, setSampleRows] = useState([]);
  const [validatedRows, setValidatedRows] = useState([]);
  const [recipes, setRecipes] = useState([]);

  useEffect(() => {
    if (open) {
      listRecipesAll().then(items => setRecipes(items || [])).catch(() => setRecipes([]));
    }
  }, [open]);

  // Every recipe in the app (drafts included) so a draft name is reported as
  // "not approved" rather than silently treated as unknown.
  const recipeLookup = useMemo(() => {
    const m = {};
    recipes.forEach(r => {
      m[normalizeRecipeKey(r.name)] = r;
    });
    return m;
  }, [recipes]);

  const fieldLookup = useMemo(() => {
    const m = {};
    fields.forEach(f => {
      m[normalizeFieldName(f.name)] = f;
      const lower = (f.name || '').trim().toLowerCase();
      m[lower] = f;
    });
    return m;
  }, [fields]);

  const resolveField = useCallback((rawName) => {
    const norm = normalizeFieldName(rawName);
    return fieldLookup[norm] || fieldLookup[(rawName || '').trim().toLowerCase()] || null;
  }, [fieldLookup]);

  const selectedRowCount = useMemo(
    () => sheetInfos
      .filter((s) => selectedSheetNames.includes(s.name))
      .reduce((sum, s) => sum + (s.rows?.length || 0), 0),
    [sheetInfos, selectedSheetNames]
  );

  const prepareMapping = useCallback((infos, selectedNames) => {
    const ordered = infos.filter((s) => selectedNames.includes(s.name));
    if (ordered.length === 0) {
      setParseError('Select at least one sheet.');
      return false;
    }
    const first = ordered[0];
    const autoMap = autoMapHeaders(first.headers);
    const mismatched = mismatchSheetNames(infos, ordered.map((s) => s.name));
    const raw = concatSelectedSheets(infos, ordered.map((s) => s.name), autoMap);
    if (raw.length === 0) {
      setParseError('No data rows found after the header.');
      return false;
    }
    setExcelHeaders(first.headers);
    setColumnMapping(autoMap);
    setRawDataRows(raw);
    setSampleRows(raw.slice(0, 3));
    setMapSourceSheet(first.name);
    setHeaderMismatchNames(mismatched);
    setParseError(null);
    setStep(2);
    return true;
  }, []);

  const handleFileUpload = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const infos = [];
        for (const name of workbook.SheetNames) {
          const sheet = workbook.Sheets[name];
          const allRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
          const extracted = extractSheetData(allRows);
          if (extracted && extracted.rows.length > 0) {
            infos.push({ name, ...extracted });
          }
        }

        if (infos.length === 0) {
          setParseError('Could not find a header row with recognizable columns (Field ID, Valves, Flow Rate, etc.).');
          return;
        }

        setSheetInfos(infos);
        if (infos.length === 1) {
          setSelectedSheetNames([infos[0].name]);
          prepareMapping(infos, [infos[0].name]);
        } else {
          setSelectedSheetNames(defaultSelectedSheetNames(infos.map((s) => s.name)));
          setStep(1);
        }
      } catch (err) {
        setParseError('Failed to read Excel: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }, [prepareMapping]);

  const toggleSheet = useCallback((name) => {
    setSelectedSheetNames((prev) => (
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    ));
  }, []);

  const applyMappingAndValidate = useCallback(() => {
    const rows = applyColumnMapping(rawDataRows, columnMapping, excelHeaders);

    if (rows.length === 0) {
      setParseError('No valid rows after mapping. Make sure Field ID and Date are mapped.');
      return;
    }

    const validated = rows.map(entry => {
      const warnings = [];
      const errors = [];

      const field = resolveField(entry.fieldId);
      if (!entry.fieldId) {
        errors.push('Missing Field ID');
      } else if (!field) {
        errors.push(`Field "${entry.fieldId}" not found`);
      }

      if (!entry.date) errors.push('Missing date');

      const valves = parseInt(entry.valves, 10);
      if (!valves || valves <= 0) warnings.push('No valves specified');

      const waterQty = parseFloat(entry.waterQty);
      if (!waterQty || waterQty <= 0) warnings.push('No water qty');

      const recipeName = (entry.recipe || '').toString().trim();
      const { recipe: resolvedRecipe, blockedMessage } = checkImportRecipe(recipeName, recipeLookup);
      const excelFertCount = Object.keys(entry.fertilizers || {}).length;
      if (blockedMessage) {
        errors.push(blockedMessage);
      } else if (!recipeName && excelFertCount === 0) {
        warnings.push('No recipe and no fertilizer kg on this row');
      }

      const freq = parseInt(entry.frequency, 10) || 1;
      const calcDailyTotal = (waterQty || 0) * freq * (valves || 0);

      const status = errors.length > 0 ? 'error' : warnings.length > 0 ? 'warning' : 'ok';

      return {
        ...entry,
        _status: status,
        _errors: errors,
        _warnings: warnings,
        _resolvedFieldId: field?.id || null,
        _resolvedFieldName: field?.name || entry.fieldId,
        _resolvedRecipeId: resolvedRecipe?.id || null,
        _resolvedRecipeName: resolvedRecipe?.name || recipeName,
        _valves: valves || 0,
        _waterQty: waterQty || 0,
        _frequency: freq,
        _dailyTotal: calcDailyTotal,
        _recipe: resolvedRecipe,
        _recipeBlocked: Boolean(blockedMessage),
      };
    });

    setValidatedRows(validated);
    setStep(3);
  }, [rawDataRows, columnMapping, excelHeaders, resolveField, recipeLookup]);

  const recipeGroups = useMemo(() => blockedRecipeGroups(validatedRows), [validatedRows]);

  const importableRows = useMemo(
    () => validatedRows.filter((r) => r._status !== 'error' && !r._recipeBlocked),
    [validatedRows]
  );

  const blockedRecipeCount = useMemo(
    () => validatedRows.filter((r) => r._recipeBlocked).length,
    [validatedRows]
  );

  const counts = useMemo(() => {
    const ok = validatedRows.filter(r => r._status === 'ok').length;
    const warn = validatedRows.filter(r => r._status === 'warning').length;
    const err = validatedRows.filter(r => r._status === 'error').length;
    return { ok, warn, err, total: validatedRows.length };
  }, [validatedRows]);

  const handleImport = useCallback(async () => {
    setImporting(true);
    try {
      const payloads = importableRows.map(row => {
        const dailyTotal = row._dailyTotal;
        const { fertilizers, totalFertilizer } = fertilizersForImport(row);

        return {
          fieldId: row._resolvedFieldId,
          recipeId: row._resolvedRecipeId || undefined,
          date: row.date,
          weekNumber: parseInt(row.weekNo, 10) || getWeekNumber(row.date) || undefined,
          flowRate: parseFloat(row.flowRate) || undefined,
          frequency: row._frequency || undefined,
          valvesCount: row._valves || undefined,
          dailyWater: dailyTotal > 0 ? dailyTotal : undefined,
          fertilizers,
          totalFertilizer: totalFertilizer > 0 ? totalFertilizer : undefined,
        };
      }).filter(p => p.fieldId && p.date);

      const BATCH = 200;
      let totalInserted = 0;
      let totalUpdated = 0;
      let totalSkipped = 0;
      const allErrors = [];

      for (let i = 0; i < payloads.length; i += BATCH) {
        const batch = payloads.slice(i, i + BATCH);
        const res = await bulkCreateFertigation(batch);
        totalInserted += res?.inserted || 0;
        totalUpdated += res?.updated || 0;
        totalSkipped += res?.skipped || 0;
        if (res?.errors?.length) allErrors.push(...res.errors);
      }

      setImportResults({
        inserted: totalInserted,
        updated: totalUpdated,
        skipped: totalSkipped,
        failed: allErrors.length,
        errorDetails: allErrors,
      });
      if (onImportComplete) onImportComplete({ inserted: totalInserted, updated: totalUpdated });
    } catch (err) {
      setImportResults({
        inserted: 0,
        updated: 0,
        skipped: 0,
        failed: importableRows.length,
        errorDetails: [err.message || 'Bulk import failed'],
      });
    }
    setStep(4);
    setImporting(false);
  }, [importableRows, onImportComplete]);

  const resetImporter = () => {
    setStep(0);
    setValidatedRows([]);
    setImportResults(null);
    setParseError(null);
    setExcelHeaders([]);
    setColumnMapping({});
    setRawDataRows([]);
    setSampleRows([]);
    setSheetInfos([]);
    setSelectedSheetNames([]);
    setMapSourceSheet('');
    setHeaderMismatchNames([]);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleClose = () => {
    resetImporter();
    onClose();
  };

  const mappedCount = useMemo(() => Object.values(columnMapping).filter(Boolean).length, [columnMapping]);

  const handleMappingChange = useCallback((hIdx, value) => {
    setColumnMapping(prev => {
      const next = { ...prev };
      if (!value) {
        delete next[hIdx];
      } else {
        for (const k of Object.keys(next)) {
          if (next[k] === value && Number(k) !== hIdx) delete next[k];
        }
        next[hIdx] = value;
      }
      return next;
    });
  }, []);

  const showSheetColumn = sheetInfos.length > 1;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xl" fullWidth>
      <DialogTitle sx={{ background: bannerBg, color: bannerColor, py: 1.5 }}>
        <Typography sx={{ fontSize: '0.9375rem', fontWeight: 700 }}>
          Import Fertigation from Excel
        </Typography>
      </DialogTitle>
      <DialogContent sx={{ px: 2, pt: 2 }}>
        <Stepper activeStep={step} sx={{ mb: 2 }} alternativeLabel>
          {STEPS.map(label => <Step key={label}><StepLabel>{label}</StepLabel></Step>)}
        </Stepper>

        {step === 0 && (
          <Box>
            <Paper
              variant="outlined"
              sx={{ p: 5, textAlign: 'center', borderStyle: 'dashed', borderColor: headerBg, cursor: 'pointer', '&:hover': { background: 'rgba(31,122,77,0.05)' } }}
              onClick={() => fileRef.current?.click()}
            >
              <UploadIcon sx={{ fontSize: 56, color: headerBg, mb: 1 }} />
              <Typography sx={{ fontWeight: 600 }}>
                Click to upload Fertigation Excel file
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Supported: .xlsx, .xls — If the file has several field tabs, you will choose which sheets to import
              </Typography>
              <input ref={fileRef} type="file" hidden accept=".xlsx,.xls" onChange={handleFileUpload} />
            </Paper>
            {parseError && <Alert severity="error" sx={{ mt: 2 }}>{parseError}</Alert>}
          </Box>
        )}

        {step === 1 && (
          <Box>
            <InfoNote mode="line" severity="info" sx={{ mb: 2 }}>
              {sheetInfos.length} data sheets detected. Input file (all fields) is unchecked by default.
              Tick the field tabs to import, or tick Input file to import every field.
            </InfoNote>
            <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
              <Button size="small" onClick={() => setSelectedSheetNames(sheetInfos.map((s) => s.name))} sx={{ textTransform: 'none' }}>
                Select all
              </Button>
              <Button size="small" onClick={() => setSelectedSheetNames([])} sx={{ textTransform: 'none' }}>
                Select none
              </Button>
            </Box>
            <TableContainer sx={{ maxHeight: 420, border: cellBorder }}>
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ ...hdrStyle, width: 48 }} />
                    <TableCell sx={hdrStyle}>Sheet</TableCell>
                    <TableCell sx={{ ...hdrStyle, width: 120 }}>Rows</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sheetInfos.map((s, i) => {
                    const checked = selectedSheetNames.includes(s.name);
                    return (
                      <TableRow key={s.name} sx={{ background: i % 2 === 0 ? '#fff' : altRowBg }}>
                        <TableCell sx={cellStyle}>
                          <Checkbox
                            size="small"
                            checked={checked}
                            onChange={() => toggleSheet(s.name)}
                            inputProps={{ 'aria-label': `Select sheet ${s.name}` }}
                          />
                        </TableCell>
                        <TableCell sx={{ ...cellStyle, fontWeight: 600 }}>
                          {s.name}
                          {isInputFileSheet(s.name) && (
                            <Typography component="span" sx={{ ml: 1, fontSize: '0.6875rem', color: '#666', fontWeight: 400 }}>
                              all fields
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell sx={cellStyle}>{s.rows.length}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
            {parseError && <Alert severity="error" sx={{ mt: 2 }}>{parseError}</Alert>}
          </Box>
        )}

        {step === 2 && (
          <Box>
            <InfoNote mode="line" severity="info" sx={{ mb: 2 }}>
              {mappedCount} of {excelHeaders.length} columns mapped — {rawDataRows.length} data rows detected
              {mapSourceSheet ? ` from ${mapSourceSheet}` : ''}.
              Adjust any incorrect mappings below, then click "Continue".
            </InfoNote>
            {headerMismatchNames.length > 0 && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                Sheets {headerMismatchNames.join(', ')} have different header labels than {mapSourceSheet}.
                Mapping is applied by column position from {mapSourceSheet}.
              </Alert>
            )}
            <TableContainer sx={{ maxHeight: 420, border: cellBorder }}>
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ ...hdrStyle, width: 50 }}>#</TableCell>
                    <TableCell sx={hdrStyle}>Excel Column</TableCell>
                    <TableCell sx={{ ...hdrStyle, width: 200 }}>Maps To</TableCell>
                    <TableCell sx={hdrStyle}>Sample 1</TableCell>
                    <TableCell sx={hdrStyle}>Sample 2</TableCell>
                    <TableCell sx={hdrStyle}>Sample 3</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {excelHeaders.map((h, idx) => {
                    const mapped = columnMapping[idx] || '';
                    const s1 = sampleRows[0]?.cells[idx] ?? '';
                    const s2 = sampleRows[1]?.cells[idx] ?? '';
                    const s3 = sampleRows[2]?.cells[idx] ?? '';
                    if (!h && s1 === '' && s2 === '' && s3 === '') return null;
                    const fertName = matchFertilizerHeader(h);
                    const totalFert = isTotalFertilizerHeader(h);
                    const autoKgLabel = fertName
                      ? `${fertName} (kg from Excel)`
                      : (totalFert ? 'Total Fert (kg from Excel)' : '');
                    return (
                      <TableRow key={idx} sx={{ background: (mapped || autoKgLabel) ? '#e8f5e9' : (idx % 2 === 0 ? '#fff' : altRowBg) }}>
                        <TableCell sx={{ ...cellStyle, textAlign: 'center', color: '#888' }}>{idx + 1}</TableCell>
                        <TableCell sx={{ ...cellStyle, fontWeight: 600 }}>{h}</TableCell>
                        <TableCell sx={cellStyle}>
                          {autoKgLabel ? (
                            <Typography sx={{ fontSize: '0.6875rem', color: '#164a31', fontWeight: 600 }}>
                              {autoKgLabel}
                            </Typography>
                          ) : (
                            <FormControl size="small" fullWidth>
                              <Select
                                value={mapped}
                                onChange={(e) => handleMappingChange(idx, e.target.value)}
                                displayEmpty
                                sx={{ fontSize: '0.6875rem' }}
                              >
                                <MenuItem value="" sx={{ fontSize: '0.6875rem', color: '#999' }}>(skip)</MenuItem>
                                {TEMPLATE_FIELDS.map(f => (
                                  <MenuItem key={f.key} value={f.key} sx={{ fontSize: '0.6875rem' }}>{f.label}</MenuItem>
                                ))}
                              </Select>
                            </FormControl>
                          )}
                        </TableCell>
                        <TableCell sx={{ ...cellStyle, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {typeof s1 === 'number' ? s1 : String(s1).slice(0, 30)}
                        </TableCell>
                        <TableCell sx={{ ...cellStyle, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {typeof s2 === 'number' ? s2 : String(s2).slice(0, 30)}
                        </TableCell>
                        <TableCell sx={{ ...cellStyle, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {typeof s3 === 'number' ? s3 : String(s3).slice(0, 30)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
            {parseError && <Alert severity="error" sx={{ mt: 2 }}>{parseError}</Alert>}
          </Box>
        )}

        {step === 3 && (
          <Box>
            {recipeGroups.map((group) => (
              <Alert key={group.key} severity="error" sx={{ mb: 1.5 }}>
                {recipeNotApprovedMessage(group.display)} ({group.count} {group.count === 1 ? 'row' : 'rows'} not imported).
              </Alert>
            ))}
            <Box sx={{ display: 'flex', gap: 1.5, mb: 2, alignItems: 'center', flexWrap: 'wrap' }}>
              <Chip icon={<OkIcon />} label={`${counts.ok} Ready`} color="success" size="small" sx={{ fontWeight: 600 }} />
              <Chip icon={<WarnIcon />} label={`${counts.warn} Warnings`} color="warning" size="small" sx={{ fontWeight: 600 }} />
              <Chip icon={<ErrIcon />} label={`${counts.err} Errors`} color="error" size="small" sx={{ fontWeight: 600 }} />
              <Typography sx={{ fontSize: '0.75rem', color: '#666', ml: 1 }}>
                {counts.total} rows parsed — {importableRows.length} will be imported
                {blockedRecipeCount > 0 ? `, ${blockedRecipeCount} blocked by unapproved recipe` : ''}
                {counts.err > 0 ? ', errors skipped' : ''}
              </Typography>
            </Box>
            <TableContainer sx={{ maxHeight: 450, border: cellBorder }}>
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ ...hdrStyle, width: 36 }}>#</TableCell>
                    {showSheetColumn && <TableCell sx={hdrStyle}>Sheet</TableCell>}
                    <TableCell sx={hdrStyle}>Status</TableCell>
                    <TableCell sx={hdrStyle}>Date</TableCell>
                    <TableCell sx={hdrStyle}>Field</TableCell>
                    <TableCell sx={hdrStyle}>Valves</TableCell>
                    <TableCell sx={hdrStyle}>Water Qty</TableCell>
                    <TableCell sx={hdrStyle}>Freq</TableCell>
                    <TableCell sx={hdrStyle}>Daily Total</TableCell>
                    <TableCell sx={hdrStyle}>Recipe</TableCell>
                    <TableCell sx={hdrStyle}>Notes</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {validatedRows.map((r, i) => {
                    const bg = r._status === 'error' ? errBg : r._status === 'warning' ? warnBg : (i % 2 === 0 ? '#fff' : altRowBg);
                    const notes = [...r._errors, ...r._warnings].join('; ');
                    return (
                      <TableRow key={`${r._sheet || ''}-${r._rowNum}-${i}`} sx={{ background: bg }}>
                        <TableCell sx={{ ...cellStyle, textAlign: 'center', color: '#888' }}>{r._rowNum}</TableCell>
                        {showSheetColumn && <TableCell sx={cellStyle}>{r._sheet || ''}</TableCell>}
                        <TableCell sx={cellStyle}>
                          {r._status === 'ok' && <OkIcon sx={{ fontSize: 16, color: '#1f7a4d' }} />}
                          {r._status === 'warning' && <WarnIcon sx={{ fontSize: 16, color: '#a84b07' }} />}
                          {r._status === 'error' && <ErrIcon sx={{ fontSize: 16, color: '#c62828' }} />}
                        </TableCell>
                        <TableCell sx={cellStyle}>{r.date || ''}</TableCell>
                        <TableCell sx={{ ...cellStyle, fontWeight: 600 }}>{r._resolvedFieldName || r.fieldId}</TableCell>
                        <TableCell sx={cellStyle}>{r._valves || ''}</TableCell>
                        <TableCell sx={cellStyle}>{r._waterQty || ''}</TableCell>
                        <TableCell sx={cellStyle}>{r._frequency || ''}</TableCell>
                        <TableCell sx={{ ...cellStyle, fontWeight: 600 }}>{r._dailyTotal > 0 ? r._dailyTotal.toFixed(2) : ''}</TableCell>
                        <TableCell sx={cellStyle}>{r._resolvedRecipeName || ''}</TableCell>
                        <TableCell sx={{ ...cellStyle, fontSize: '0.6875rem', color: r._status === 'error' ? '#c62828' : '#e65100', maxWidth: 220 }}>
                          <Tooltip title={notes} describeChild><span>{notes.length > 60 ? notes.slice(0, 60) + '...' : notes}</span></Tooltip>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}

        {step === 4 && importResults && (
          <Box sx={{ textAlign: 'center', py: 3 }}>
            <OkIcon sx={{ fontSize: 56, color: 'success.main', mb: 1 }} />
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>Import Complete</Typography>
            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', mb: 2, flexWrap: 'wrap' }}>
              <Chip label={`${importResults.inserted ?? importResults.success ?? 0} inserted`} color="success" />
              {(importResults.updated || 0) > 0 && (
                <Chip label={`${importResults.updated} updated`} color="success" variant="outlined" />
              )}
              {(importResults.skipped || 0) > 0 && (
                <Chip label={`${importResults.skipped} skipped`} />
              )}
              {importResults.failed > 0 && <Chip label={`${importResults.failed} failed`} color="error" />}
            </Box>
            {importResults.errorDetails.length > 0 && (
              <Alert severity="warning" sx={{ textAlign: 'left', maxWidth: 600, mx: 'auto', maxHeight: 200, overflow: 'auto' }}>
                {importResults.errorDetails.slice(0, 50).map((e, i) => <div key={i}>{e}</div>)}
                {importResults.errorDetails.length > 50 && <div>... and {importResults.errorDetails.length - 50} more</div>}
              </Alert>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 2, py: 1.5 }}>
        {step === 1 && (
          <Button onClick={() => { resetImporter(); }} sx={{ textTransform: 'none', mr: 'auto' }}>
            Back
          </Button>
        )}
        {step === 2 && (
          <Button
            onClick={() => {
              setParseError(null);
              setStep(sheetInfos.length > 1 ? 1 : 0);
            }}
            sx={{ textTransform: 'none', mr: 'auto' }}
          >
            Back
          </Button>
        )}
        {step === 3 && (
          <Button onClick={() => setStep(2)} sx={{ textTransform: 'none', mr: 'auto' }}>
            Back to Mapping
          </Button>
        )}
        <Button onClick={handleClose} sx={{ textTransform: 'none' }}>
          {step === 4 ? 'Done' : 'Cancel'}
        </Button>
        {step === 1 && (
          <Button
            variant="contained"
            onClick={() => prepareMapping(sheetInfos, selectedSheetNames)}
            disabled={selectedSheetNames.length === 0}
            sx={{ textTransform: 'none', bgcolor: headerBg, '&:hover': { bgcolor: '#164a31' } }}
          >
            Continue — {selectedRowCount} rows
          </Button>
        )}
        {step === 2 && (
          <Button
            variant="contained"
            onClick={applyMappingAndValidate}
            disabled={!columnMapping || Object.values(columnMapping).filter(Boolean).length < 3}
            sx={{ textTransform: 'none', bgcolor: headerBg, '&:hover': { bgcolor: '#164a31' } }}
          >
            Continue — Validate {rawDataRows.length} rows
          </Button>
        )}
        {step === 3 && (
          <Button
            variant="contained"
            onClick={handleImport}
            disabled={importing || importableRows.length === 0}
            startIcon={importing ? <CircularProgress size={16} /> : <ImportIcon />}
            sx={{ textTransform: 'none', bgcolor: headerBg, '&:hover': { bgcolor: '#164a31' } }}
          >
            {importing ? 'Importing...' : `Import ${importableRows.length} rows`}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
