import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, FormControl, MenuItem, Paper, Select, Step, StepLabel, Stepper,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import {
  CheckCircleOutlineOutlined as OkIcon,
  CloudUploadOutlined as UploadIcon,
  ErrorOutlineOutlined as ErrIcon,
  WarningAmberOutlined as WarnIcon,
} from '@mui/icons-material';
import * as XLSX from 'xlsx';
import { apiRequest } from '../utils/api';
import {
  applyCreatedMasterIds,
  buildPlantationPreviewRow,
  canConfirmPlantationImport,
  collectImportMasterCreates,
  cropWillCreate,
  inspectPlantationSheet,
  matchVarietyId,
  mappingHasCoreColumns,
  parseMappedSheetRows,
  PLANTATION_IMPORT_COLUMNS,
  previewBlocksConfirm,
  rematchPreviewFields,
  varietyWillCreate,
  withPreviewStatus,
} from '../utils/plantationWorkbookImport';
import { normalizeMasterName } from '../utils/masterDataFuzzyMatch';
import { rowToClosingPayload, rowToOpeningPayload } from '../utils/plantationWorkbookRows';
import InfoNote from './InfoNote';

const STEPS = ['Upload Excel', 'Map Columns', 'Review matches', 'Imported'];
const headerBg = '#1d5a3c'; // = theme palette.table.headerBg
const cellBorder = '1px solid #c8c8c8';
const hdrStyle = {
  background: headerBg,
  color: '#fff',
  fontWeight: 700,
  fontSize: '0.6875rem',
  padding: '6px 8px',
  border: cellBorder,
  whiteSpace: 'nowrap',
};
const cellStyle = { fontSize: '0.6875rem', padding: '5px 8px', border: cellBorder };
const PORTAL_SELECT_PROPS = { MenuProps: { disablePortal: false } };

function sampleCell(row, idx) {
  const v = row?.[idx];
  if (v == null || v === '') return '';
  return String(v).slice(0, 40);
}

function PreviewMatchSelect({ value, onChange, options, disabled, label, helperText }) {
  return (
    <Box>
      <TextField
        select
        size="small"
        variant="standard"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        SelectProps={PORTAL_SELECT_PROPS}
        inputProps={{ 'aria-label': label }}
        sx={{ fontSize: '0.75rem', minWidth: 140 }}
      >
        <MenuItem value=""><em>—</em></MenuItem>
        {options.map((o) => (
          <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
        ))}
      </TextField>
      {helperText ? (
        <Typography variant="caption" color="warning.main" display="block" sx={{ lineHeight: 1.2 }}>
          {helperText}
        </Typography>
      ) : null}
    </Box>
  );
}

export default function PlantationWorkbookImporter({
  open,
  onClose,
  siteId,
  siteMeta,
  fields = [],
  crops = [],
  getVarieties,
  onImported,
  refreshMaster,
  canWriteClosing = true,
}) {
  const fileRef = useRef(null);
  const [step, setStep] = useState(0);
  const [parseError, setParseError] = useState('');
  const [workbookSheets, setWorkbookSheets] = useState([]);
  const [rawBySheet, setRawBySheet] = useState({});
  const [activeSheet, setActiveSheet] = useState('');
  const [previewRows, setPreviewRows] = useState([]);
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState(null);
  const [fetchedFields, setFetchedFields] = useState([]);
  const [fieldsFetchDone, setFieldsFetchDone] = useState(false);

  const matchFields = useMemo(
    () => ((fields || []).length ? fields : fetchedFields),
    [fields, fetchedFields],
  );

  const activeMeta = workbookSheets.find((s) => s.name === activeSheet) || workbookSheets[0] || null;

  const reset = useCallback(() => {
    setStep(0);
    setParseError('');
    setWorkbookSheets([]);
    setRawBySheet({});
    setActiveSheet('');
    setPreviewRows([]);
    setImporting(false);
    setImportResults(null);
    setFetchedFields([]);
    setFieldsFetchDone(false);
    if (fileRef.current) fileRef.current.value = '';
  }, []);

  const handleClose = () => {
    reset();
    onClose?.();
  };

  useEffect(() => {
    if (!open) return undefined;
    if ((fields || []).length > 0) {
      setFetchedFields([]);
      setFieldsFetchDone(true);
      return undefined;
    }
    if (!siteId) {
      setFieldsFetchDone(true);
      return undefined;
    }
    let cancelled = false;
    setFieldsFetchDone(false);
    (async () => {
      try {
        const data = await apiRequest(`/fields?site_id=${encodeURIComponent(siteId)}&limit=10000`);
        if (!cancelled) setFetchedFields(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setFetchedFields([]);
      } finally {
        if (!cancelled) setFieldsFetchDone(true);
      }
    })();
    return () => { cancelled = true; };
  }, [open, siteId, fields]);

  useEffect(() => {
    if (!matchFields.length) return;
    setPreviewRows((prev) => rematchPreviewFields(prev, matchFields));
  }, [matchFields]);

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError('');
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'array' });
        const nextRaw = {};
        const inspected = [];
        wb.SheetNames.forEach((name) => {
          const raw = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' });
          nextRaw[name] = raw;
          const info = inspectPlantationSheet(name, raw);
          if (info) inspected.push(info);
        });
        if (!inspected.length) {
          setParseError('No Opening or Closing sheets found in this workbook.');
          return;
        }
        const usable = inspected.filter((s) => s.headerIdx >= 0);
        if (!usable.length) {
          setParseError(inspected.map((s) => s.error).filter(Boolean).join(' ') || 'Could not detect header rows.');
          return;
        }
        setRawBySheet(nextRaw);
        setWorkbookSheets(usable);
        setActiveSheet(usable[0].name);
        setStep(1);
      } catch (err) {
        setParseError(err.message || 'Failed to read Excel');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleMappingChange = (colIdx, value) => {
    setWorkbookSheets((prev) => prev.map((sheet) => {
      if (sheet.name !== (activeMeta?.name || '')) return sheet;
      const mapping = { ...sheet.mapping };
      if (!value) {
        delete mapping[colIdx];
      } else {
        Object.keys(mapping).forEach((k) => {
          if (mapping[k] === value && Number(k) !== colIdx) delete mapping[k];
        });
        mapping[colIdx] = value;
      }
      return { ...sheet, mapping, error: mappingHasCoreColumns(mapping) ? '' : sheet.error };
    }));
  };

  const buildPreview = () => {
    const missing = workbookSheets.filter((s) => !mappingHasCoreColumns(s.mapping));
    if (missing.length) {
      setParseError(`Map Field, Family Code, Variety, or Requested date on: ${missing.map((s) => s.name).join(', ')}`);
      return;
    }
    const rows = [];
    workbookSheets.forEach((sheet) => {
      const parsed = parseMappedSheetRows(rawBySheet[sheet.name], sheet.headerIdx, sheet.mapping);
      parsed.forEach((item) => {
        rows.push(buildPlantationPreviewRow({
          mapped: item.mapped,
          sheetKind: sheet.kind,
          sheetName: sheet.name,
          siteMeta,
          fields: matchFields,
          crops,
          getVarieties,
          index: rows.length,
        }));
      });
    });
    if (!rows.length) {
      setParseError('No data rows found after applying the column map.');
      return;
    }
    setParseError('');
    setPreviewRows(rows);
    setStep(2);
  };

  const updatePreviewRow = (key, patch) => {
    setPreviewRows((prev) => prev.map((row) => {
      if (row._key !== key) return row;
      let next = { ...row, ...patch };
      if (patch.cropId !== undefined) {
        const varietyMatch = matchVarietyId(row.excelVariety, patch.cropId, getVarieties);
        next.varietyId = varietyMatch?.id || (patch.cropId === row.cropId ? row.varietyId : '');
      }
      return withPreviewStatus(next);
    }));
  };

  const confirmReady = canConfirmPlantationImport(previewRows);
  const unmatchedCount = previewRows.filter(previewBlocksConfirm).length;
  const reviewCount = previewRows.filter((r) => r.status === 'review').length;
  const masterCreates = collectImportMasterCreates(previewRows);
  const willCreateCount = masterCreates.crops.length + masterCreates.varieties.length;

  const handleConfirm = async () => {
    if (!confirmReady || !siteId) return;
    setImporting(true);
    const warnings = [];
    try {
      let rows = previewRows;
      const cropCreates = collectImportMasterCreates(rows).crops;
      const cropIdsByName = {};
      for (let i = 0; i < cropCreates.length; i += 1) {
        const name = cropCreates[i];
        const crop = await apiRequest('/crops', {
          method: 'POST',
          body: JSON.stringify({ name }),
        });
        cropIdsByName[normalizeMasterName(name)] = crop.id;
      }
      rows = applyCreatedMasterIds(rows, cropIdsByName);

      const varietyCreates = collectImportMasterCreates(rows).varieties;
      const varietyIdsByCropAndName = {};
      for (let i = 0; i < varietyCreates.length; i += 1) {
        const item = varietyCreates[i];
        if (!item.cropId) {
          warnings.push(`Skipped variety "${item.name}": no family/crop to attach it to.`);
          continue;
        }
        const variety = await apiRequest(`/crops/${item.cropId}/varieties`, {
          method: 'POST',
          body: JSON.stringify({ name: item.name }),
        });
        varietyIdsByCropAndName[`${item.cropId}::${normalizeMasterName(item.name)}`] = variety.id;
      }
      rows = applyCreatedMasterIds(rows, {}, varietyIdsByCropAndName);

      const opening = rows.filter((r) => r.sheetKind === 'opening');
      if (opening.length) {
        await apiRequest('/plantation-workbook/opening/bulk', {
          method: 'POST',
          body: JSON.stringify({
            siteId,
            records: opening.map((r) => rowToOpeningPayload(r, siteId)),
          }),
        });
      }
      const closing = rows.filter((r) => r.sheetKind === 'closing');
      let closingPending = 0;
      if (closing.length && !canWriteClosing) {
        warnings.push(
          `Skipped ${closing.length} closing row${closing.length === 1 ? '' : 's'}: you can view closing sheets but not change them.`,
        );
      } else if (closing.length) {
        const byCrop = new Map();
        closing.forEach((row) => {
          if (!row.cropId) {
            warnings.push(`Skipped a closing row on ${row.sheetName}: no family/crop matched.`);
            return;
          }
          if (!byCrop.has(row.cropId)) byCrop.set(row.cropId, []);
          byCrop.get(row.cropId).push(row);
        });
        const entries = Array.from(byCrop.entries());
        for (let i = 0; i < entries.length; i += 1) {
          const cropId = entries[i][0];
          const cropRows = entries[i][1];
          const result = await apiRequest('/plantation-workbook/closing/bulk', {
            method: 'POST',
            body: JSON.stringify({
              siteId,
              cropId,
              records: cropRows.map((r) => rowToClosingPayload(r)),
            }),
          });
          if (result?.approvalStatus === 'pending') closingPending += cropRows.length;
        }
      }
      setImportResults({ success: rows.length, warnings, closingPending });
      setStep(3);
      await refreshMaster?.();
      await onImported?.();
    } catch (err) {
      setParseError(err.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const fieldOptions = useMemo(
    () => matchFields.map((f) => ({ value: f.id || f.value, label: f.name || f.label })).filter((o) => o.value && o.label),
    [matchFields],
  );
  const cropOptions = useMemo(
    () => (crops || []).map((c) => ({ value: c.id || c.value, label: c.name || c.label })),
    [crops],
  );

  const mappingEntries = activeMeta
    ? activeMeta.headers.map((h, idx) => ({ idx, header: h }))
      .filter((c) => c.header || activeMeta.mapping[c.idx] || activeMeta.mapping[String(c.idx)])
    : [];

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xl" fullWidth disableEnforceFocus>
      <DialogTitle sx={{ background: headerBg, color: '#fff', py: 1.5 }}>
        Import plantation workbook
      </DialogTitle>
      <DialogContent sx={{ px: 2, pt: 2 }}>
        <Stepper activeStep={step} sx={{ mb: 2 }} alternativeLabel>
          {STEPS.map((label) => (
            <Step key={label}><StepLabel>{label}</StepLabel></Step>
          ))}
        </Stepper>

        {step === 0 && (
          <Box>
            <Paper
              variant="outlined"
              sx={{
                p: 5,
                textAlign: 'center',
                borderStyle: 'dashed',
                borderColor: headerBg,
                cursor: 'pointer',
                '&:hover': { background: 'rgba(31,122,77,0.05)' },
              }}
              onClick={() => fileRef.current?.click()}
            >
              <UploadIcon sx={{ fontSize: 56, color: headerBg, mb: 1 }} />
              <Typography sx={{ fontWeight: 600 }}>Click to upload Excel file</Typography>
              <Typography variant="caption" color="text.secondary">
                Opening and Closing sheets are mapped, then you confirm Field matches. New Family Code and Variety names are created on import.
              </Typography>
              <input ref={fileRef} type="file" hidden accept=".xlsx,.xls" onChange={handleFileUpload} />
            </Paper>
            {parseError && <Alert severity="error" sx={{ mt: 2 }}>{parseError}</Alert>}
          </Box>
        )}

        {step === 1 && activeMeta && (
          <Box>
            <InfoNote severity="info" sx={{ mb: 2 }}>
              Headers are matched by name (spaces and hyphens ignored). Change any binding before the dry run.
            </InfoNote>
            {workbookSheets.length > 1 && (
              <FormControl size="small" sx={{ mb: 2, minWidth: 220 }}>
                <Select
                  value={activeMeta.name}
                  onChange={(e) => setActiveSheet(e.target.value)}
                >
                  {workbookSheets.map((s) => (
                    <MenuItem key={s.name} value={s.name}>{s.name} ({s.kind})</MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
            <TableContainer sx={{ maxHeight: 420, border: cellBorder }}>
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={hdrStyle}>Excel Column</TableCell>
                    <TableCell sx={{ ...hdrStyle, width: 240 }}>Maps To</TableCell>
                    <TableCell sx={hdrStyle}>Sample 1</TableCell>
                    <TableCell sx={hdrStyle}>Sample 2</TableCell>
                    <TableCell sx={hdrStyle}>Sample 3</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {mappingEntries.map(({ idx, header }) => {
                    const mapped = activeMeta.mapping[idx] || activeMeta.mapping[String(idx)] || '';
                    return (
                      <TableRow key={`${activeMeta.name}-${idx}`}>
                        <TableCell sx={{ ...cellStyle, fontWeight: 600 }}>{header || `(column ${idx + 1})`}</TableCell>
                        <TableCell sx={cellStyle}>
                          <FormControl size="small" fullWidth>
                            <Select
                              value={mapped}
                              onChange={(e) => handleMappingChange(idx, e.target.value)}
                              displayEmpty
                              sx={{ fontSize: '0.6875rem' }}
                            >
                              <MenuItem value="">(skip)</MenuItem>
                              {PLANTATION_IMPORT_COLUMNS.map((f) => (
                                <MenuItem key={f.key} value={f.key}>{f.label}</MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                        </TableCell>
                        <TableCell sx={cellStyle}>{sampleCell(activeMeta.sampleRows[0], idx)}</TableCell>
                        <TableCell sx={cellStyle}>{sampleCell(activeMeta.sampleRows[1], idx)}</TableCell>
                        <TableCell sx={cellStyle}>{sampleCell(activeMeta.sampleRows[2], idx)}</TableCell>
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
            <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
              <Chip icon={<OkIcon />} label={`${previewRows.length - unmatchedCount} ready`} color="success" size="small" />
              <Chip icon={<WarnIcon />} label={`${reviewCount} close match`} color="warning" size="small" />
              {willCreateCount > 0 && (
                <Chip icon={<WarnIcon />} label={`${willCreateCount} new family/variety`} color="warning" size="small" variant="outlined" />
              )}
              {unmatchedCount > 0 && (
                <Chip icon={<ErrIcon />} label={`${unmatchedCount} need a pick`} color="error" size="small" />
              )}
            </Box>
            {!confirmReady && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                Choose a Field for every unmatched Excel value before import. New Family Code and Variety names are created when you confirm.
              </Alert>
            )}
            {confirmReady && willCreateCount > 0 && (
              <InfoNote mode="line" severity="info" sx={{ mb: 2 }}>
                {willCreateCount} new family/variety name{willCreateCount === 1 ? '' : 's'} will be created when you confirm. Nothing is saved until then.
              </InfoNote>
            )}
            {fieldsFetchDone && fieldOptions.length === 0 && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                No fields loaded for this site. Field dropdowns stay empty until fields exist on the site.
              </Alert>
            )}
            <TableContainer sx={{ maxHeight: 460, border: cellBorder }}>
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={hdrStyle}>Sheet</TableCell>
                    <TableCell sx={hdrStyle}>Excel Field</TableCell>
                    <TableCell sx={hdrStyle}>Field</TableCell>
                    <TableCell sx={hdrStyle}>Excel Family Code</TableCell>
                    <TableCell sx={hdrStyle}>Family Code</TableCell>
                    <TableCell sx={hdrStyle}>Excel Variety</TableCell>
                    <TableCell sx={hdrStyle}>Variety Sown Code</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {previewRows.map((row) => {
                    const blocked = previewBlocksConfirm(row);
                    const vOpts = getVarieties?.(row.cropId) || [];
                    return (
                      <TableRow key={row._key} sx={{ background: blocked ? '#ffebee' : row.status === 'review' ? '#fff8e1' : undefined }}>
                        <TableCell sx={cellStyle}>{row.sheetName}</TableCell>
                        <TableCell sx={cellStyle}>{row.excelField}</TableCell>
                        <TableCell sx={cellStyle}>
                          <PreviewMatchSelect
                            value={row.fieldId}
                            onChange={(v) => updatePreviewRow(row._key, { fieldId: v })}
                            options={fieldOptions}
                            label={`Field match for ${row.excelField || row._key}`}
                          />
                        </TableCell>
                        <TableCell sx={cellStyle}>{row.excelFamily}</TableCell>
                        <TableCell sx={cellStyle}>
                          <PreviewMatchSelect
                            value={row.cropId}
                            onChange={(v) => updatePreviewRow(row._key, { cropId: v })}
                            options={cropOptions}
                            label={`Family Code match for ${row.excelFamily || row._key}`}
                            helperText={cropWillCreate(row) ? `Will create “${row.excelFamily}”` : ''}
                          />
                        </TableCell>
                        <TableCell sx={cellStyle}>{row.excelVariety}</TableCell>
                        <TableCell sx={cellStyle}>
                          <PreviewMatchSelect
                            value={row.varietyId}
                            onChange={(v) => updatePreviewRow(row._key, { varietyId: v })}
                            options={vOpts.map((v) => ({ value: v.id, label: v.name }))}
                            disabled={!row.cropId}
                            label={`Variety Sown Code match for ${row.excelVariety || row._key}`}
                            helperText={varietyWillCreate(row) ? `Will create “${row.excelVariety}”` : ''}
                          />
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

        {step === 3 && importResults && (
          <Box sx={{ textAlign: 'center', py: 3 }}>
            <OkIcon sx={{ fontSize: 56, color: 'success.main', mb: 1 }} />
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>Import complete</Typography>
            <Chip label={`${importResults.success} rows processed`} color="success" />
            {importResults.closingPending > 0 && (
              <InfoNote mode="line" severity="info" sx={{ mt: 2, textAlign: 'left' }}>
                Closing rows sent for operation manager approval ({importResults.closingPending}).
              </InfoNote>
            )}
            {importResults.warnings?.length > 0 && (
              <Alert severity="warning" sx={{ mt: 2, textAlign: 'left' }}>
                {importResults.warnings.map((w) => <div key={w}>{w}</div>)}
              </Alert>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 2, py: 1.5 }}>
        <Button onClick={handleClose}>{step === 3 ? 'Close' : 'Cancel'}</Button>
        {step === 1 && (
          <Button variant="contained" onClick={buildPreview}>Continue to dry run</Button>
        )}
        {step === 2 && (
          <Button
            variant="contained"
            onClick={handleConfirm}
            disabled={!confirmReady || importing}
          >
            {importing ? <CircularProgress size={18} /> : 'Confirm import'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
