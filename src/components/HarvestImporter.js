import { useState, useRef, useCallback, useMemo } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Box, Typography,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  CircularProgress, Chip, Alert, Stepper, Step, StepLabel,
  Select, MenuItem, FormControl, Collapse, IconButton,
} from '@mui/material';
import {
  CloudUploadOutlined as UploadIcon,
  CheckCircleOutlineOutlined as OkIcon,
  WarningAmberOutlined as WarnIcon,
  ErrorOutlineOutlined as ErrIcon,
  ExpandMoreOutlined as ExpandIcon,
  ExpandLessOutlined as CollapseIcon,
} from '@mui/icons-material';
import * as XLSX from 'xlsx';
import { bulkCreateHarvest } from '../utils/backendApi';
import {
  resolveHarvestField,
} from '../utils/irrigationImportParser';
import {
  detectHarvestColumns,
  detectHarvestHeaderRow,
  parseHarvestDataRows,
  shouldSkipHarvestSheet,
} from '../utils/harvestImportParse';
import InfoNote from './InfoNote';

const HEADER_FILL = '#165c3a';
const hdrStyle = {
  background: HEADER_FILL, color: '#fff', fontWeight: 700,
  fontSize: '0.6875rem', padding: '6px 8px', border: '1px solid #c8c8c8', whiteSpace: 'nowrap',
};
const cellStyle = { fontSize: '0.6875rem', padding: '5px 8px', border: '1px solid #c8c8c8' };

const STEPS = ['Upload Excel', 'Match Sheets', 'Validate (Dry Run)', 'Import Results'];

function parsePivotTimeInput(str) {
  if (!str || !String(str).trim()) return undefined;
  const m = String(str).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (m) return `${String(parseInt(m[1], 10)).padStart(2, '0')}:${m[2]}`;
  return String(str).trim();
}

function detectPivotCrop(sheetName) {
  const n = (sheetName || '').toLowerCase();
  if (n.includes('alfalfa') || n.includes('lucerne')) return 'alfalfa';
  if (n.includes('rhodes') || n.includes('grass')) return 'rhodes';
  return null;
}

function isPivotHarvestLayout(columns, sheetName) {
  if (detectPivotCrop(sheetName)) return true;
  const n = (sheetName || '').toLowerCase();
  if (n.includes('harvest record') || n.includes('forage')) return true;
  return columns.cutNumber !== undefined || columns.balingDate !== undefined || columns.totalBales !== undefined;
}

function pivotVarietyLabel(pivotCrop) {
  if (pivotCrop === 'alfalfa') return 'Alfalfa';
  if (pivotCrop === 'rhodes') return 'Rhodes';
  return null;
}

function parseIntVal(val) {
  if (val == null || val === '') return undefined;
  const n = parseInt(String(val).replace(/,/g, ''), 10);
  return Number.isFinite(n) ? n : undefined;
}

export default function HarvestImporter({ open, onClose, fields = [], onImportComplete }) {
  const [step, setStep] = useState(0);
  const [parseError, setParseError] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState(null);
  const fileRef = useRef(null);
  const [sheetData, setSheetData] = useState([]);
  const [expandedSheet, setExpandedSheet] = useState(null);

  const resolveSheetField = useCallback((sheetName) => {
    return resolveHarvestField(fields, sheetName);
  }, [fields]);

  const handleFileUpload = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: 'array' });

        const sheets = [];
        for (const sheetName of workbook.SheetNames) {
          if (shouldSkipHarvestSheet(sheetName)) continue;

          const sheet = workbook.Sheets[sheetName];
          const allRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

          const field = resolveSheetField(sheetName);
          const headerIdx = detectHarvestHeaderRow(allRows);

          if (headerIdx === null) {
            sheets.push({ sheetName, field, matched: !!field, headerIdx: null, columns: {}, rows: [], error: 'No header row detected', pivotCrop: null, isPivotHarvest: false });
            continue;
          }

          const headerRow = allRows[headerIdx];
          const columns = detectHarvestColumns(headerRow);
          const pivotCrop = detectPivotCrop(sheetName);
          const isPivotHarvest = isPivotHarvestLayout(columns, sheetName);
          const hasFieldNameCol = columns.fieldName !== undefined;
          const rows = parseHarvestDataRows(allRows, headerIdx, columns, { isPivotHarvest });

          const isMultiField = hasFieldNameCol;
          sheets.push({
            sheetName,
            field,
            matched: !!field || isMultiField,
            isMultiField,
            isPivotHarvest,
            pivotCrop,
            headerIdx,
            columns,
            rows,
            error: null,
          });
        }

        if (sheets.length === 0) {
          setParseError('No sheets found in the Excel file.');
          return;
        }

        setSheetData(sheets);
        setStep(1);
      } catch (err) {
        setParseError('Failed to read Excel: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }, [resolveSheetField]);

  const handleManualMatch = useCallback((sheetIdx, fieldId) => {
    setSheetData(prev => prev.map((s, i) => {
      if (i !== sheetIdx) return s;
      if (fieldId === '__multi_field__') {
        return { ...s, field: null, matched: true, isMultiField: true };
      }
      if (!fieldId) return { ...s, field: null, matched: false, isMultiField: false };
      const f = fields.find(ff => ff.id === fieldId);
      return { ...s, field: f || null, matched: !!f, isMultiField: false };
    }));
  }, [fields]);

  const assignedFieldIds = useMemo(() => {
    const ids = new Set();
    sheetData.forEach(s => { if (s.field && !s.isMultiField) ids.add(s.field.id); });
    return ids;
  }, [sheetData]);

  const matchedSheets = useMemo(() => sheetData.filter(s => (s.matched || s.isMultiField) && s.rows.length > 0), [sheetData]);

  const validatedSheets = useMemo(() => {
    return matchedSheets.map(sheet => {
      let okCount = 0, warnCount = 0, errCount = 0;
      const validatedRows = sheet.rows.map((row, idx) => {
        const errors = [];
        const warnings = [];
        if (!row.date) errors.push('Missing date');
        if (!row.quantity || row.quantity <= 0) errors.push('Missing/invalid quantity');
        if (!sheet.isPivotHarvest) {
          if (!row.variety && !row.product) warnings.push('Missing variety (will use product name as fallback)');
          else if (!row.variety && row.product) warnings.push(`No variety, using product "${row.product}"`);
        }
        if (sheet.isMultiField && row.fieldName) {
          if (!resolveHarvestField(fields, row.fieldName)) errors.push(`Unknown field: "${row.fieldName}"`);
        } else if (sheet.isMultiField && !row.fieldName && !sheet.field) {
          errors.push('Missing field name');
        }

        if (errors.length > 0) errCount++;
        else if (warnings.length > 0) warnCount++;
        else okCount++;

        return { ...row, _errors: errors, _warnings: warnings, _idx: idx + 1 };
      });
      return { ...sheet, validatedRows, okCount, warnCount, errCount };
    });
  }, [matchedSheets, fields]);

  const totalCounts = useMemo(() => {
    let ok = 0, warn = 0, err = 0;
    validatedSheets.forEach(s => { ok += s.okCount; warn += s.warnCount; err += s.errCount; });
    return { ok, warn, err, total: ok + warn + err };
  }, [validatedSheets]);

  const handleImport = useCallback(async () => {
    setImporting(true);
    try {
      const entries = [];
      for (const sheet of validatedSheets) {
        for (const row of sheet.validatedRows) {
          if (row._errors.length > 0) continue;
          let fieldId = sheet.field?.id;
          if (row.fieldName) {
            const resolved = resolveHarvestField(fields, row.fieldName);
            if (resolved) fieldId = resolved.id;
            else if (sheet.isMultiField) continue;
          }
          if (!fieldId) continue;

          const pivotCrop = sheet.pivotCrop || (sheet.isPivotHarvest ? detectPivotCrop(sheet.sheetName) : null);
          const varietyLabel = pivotVarietyLabel(pivotCrop) || row.variety || row.product || 'Unknown';

          const entry = {
            fieldId,
            date: row.date,
            startTime: parsePivotTimeInput(row.startTime),
            endTime: parsePivotTimeInput(row.endTime),
            weekNumber: row.weekNumber || undefined,
            shiftNumber: row.shiftNumber || undefined,
            batchNumber: row.batchNumber || undefined,
            segmentId: row.segment || undefined,
            harvestedAreaHa: row.area || undefined,
            packhouse: row.packhouse || undefined,
            authorizedBy: row.authorizedBy || undefined,
            totalQuantity: row.quantity,
            varieties: [{ variety: varietyLabel, quantity: row.quantity, grade: 'A' }],
          };

          if (pivotCrop || sheet.isPivotHarvest) {
            const cropType = pivotCrop || (varietyLabel.toLowerCase().includes('alfalfa') ? 'alfalfa' : 'rhodes');
            entry.extraData = {
              cropType,
              cutNumber: parseIntVal(row.cutNumber),
              balingDate: row.balingDate || undefined,
              totalBales: parseIntVal(row.totalBales),
              bundles: parseIntVal(row.bundles),
              balesDispatched: parseIntVal(row.balesDispatched),
            };
            Object.keys(entry.extraData).forEach(k => {
              if (entry.extraData[k] === undefined) delete entry.extraData[k];
            });
          }

          entries.push(entry);
        }
      }

      const BATCH = 200;
      let totalInserted = 0;
      let totalSkipped = 0;
      const allErrors = [];

      for (let i = 0; i < entries.length; i += BATCH) {
        const batch = entries.slice(i, i + BATCH);
        const res = await bulkCreateHarvest(batch);
        totalInserted += res?.inserted || 0;
        totalSkipped += res?.skipped || 0;
        if (res?.errors?.length) allErrors.push(...res.errors);
      }

      setImportResults({ success: totalInserted, skipped: totalSkipped, failed: allErrors.length, errorDetails: allErrors });
      if (onImportComplete) onImportComplete({ inserted: totalInserted });
    } catch (err) {
      setImportResults({ success: 0, skipped: 0, failed: 0, errorDetails: [err.message || 'Import failed'] });
    }
    setStep(3);
    setImporting(false);
  }, [validatedSheets, onImportComplete, fields]);

  const handleClose = () => {
    setStep(0);
    setSheetData([]);
    setImportResults(null);
    setParseError(null);
    setExpandedSheet(null);
    if (fileRef.current) fileRef.current.value = '';
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="lg" fullWidth>
      <DialogTitle sx={{ background: HEADER_FILL, color: '#fff', fontWeight: 700, py: 1.5 }}>
        Import Harvest Excel
      </DialogTitle>
      <DialogContent sx={{ pt: '16px !important' }}>
        <Stepper activeStep={step} alternativeLabel sx={{ mb: 3 }}>
          {STEPS.map(label => <Step key={label}><StepLabel>{label}</StepLabel></Step>)}
        </Stepper>

        {step === 0 && (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Typography variant="body2" sx={{ mb: 2, color: '#555' }}>
              Upload an Excel harvest workbook. Greenhouse/net house sheets match by field name (e.g. &quot;NH 01&quot;).
              Pivot forage sheets (Alfalfa/Rhodes) use multi-field mode — field IDs come from the Field column.
            </Typography>
            {parseError && <Alert severity="error" sx={{ mb: 2 }}>{parseError}</Alert>}
            <Button variant="contained" component="label" startIcon={<UploadIcon />}
              sx={{ backgroundColor: HEADER_FILL, '&:hover': { backgroundColor: '#1f7a4d' } }}>
              Select Excel File
              <input type="file" hidden accept=".xlsx,.xls" ref={fileRef} onChange={handleFileUpload} />
            </Button>
          </Box>
        )}

        {step === 1 && (
          <Box>
            <Typography variant="body2" sx={{ mb: 1 }}>
              Found <strong>{sheetData.length}</strong> sheet(s). Matched <strong>{matchedSheets.length}</strong> to fields.
              Use the dropdown to manually assign unmatched sheets.
            </Typography>
            <InfoNote severity="info" sx={{ mb: 2, fontSize: '0.75rem' }}>
              Duplicates are automatically skipped — same field, date, variety, and shift (or start time if shift is blank) will not be imported again.
            </InfoNote>

            <TableContainer sx={{ maxHeight: 350 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={hdrStyle}>Sheet Name</TableCell>
                    <TableCell sx={hdrStyle}>Matched Field</TableCell>
                    <TableCell sx={hdrStyle}>Rows</TableCell>
                    <TableCell sx={hdrStyle}>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sheetData.map((s, idx) => (
                    <TableRow key={idx}>
                      <TableCell sx={cellStyle}>{s.sheetName}</TableCell>
                      <TableCell sx={cellStyle}>
                        {s.error ? (
                          '-'
                        ) : (
                          <FormControl size="small" sx={{ minWidth: 140 }}>
                            <Select
                              value={s.isMultiField ? '__multi_field__' : (s.field?.id || '')}
                              onChange={(e) => handleManualMatch(idx, e.target.value)}
                              displayEmpty
                              sx={{ fontSize: '0.6875rem', height: 28 }}
                            >
                              <MenuItem value="" sx={{ fontSize: '0.6875rem' }}><em>-- Select Field --</em></MenuItem>
                              <MenuItem value="__multi_field__" sx={{ fontSize: '0.6875rem', fontWeight: 600 }}>
                                Multi-field (field ID from column)
                              </MenuItem>
                              {fields.map(f => (
                                <MenuItem key={f.id} value={f.id} disabled={assignedFieldIds.has(f.id) && s.field?.id !== f.id} sx={{ fontSize: '0.6875rem' }}>
                                  {f.name}
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                        )}
                      </TableCell>
                      <TableCell sx={cellStyle}>{s.rows.length}</TableCell>
                      <TableCell sx={cellStyle}>
                        {s.isPivotHarvest && s.isMultiField && s.rows.length > 0 ? (
                          <Chip label={`Pivot ${s.pivotCrop || 'forage'}`} size="small" color="info" variant="outlined" sx={{ fontSize: '0.6875rem' }} />
                        ) : s.isMultiField && s.rows.length > 0 ? (
                          <Chip label="Multi-field" size="small" color="info" variant="outlined" sx={{ fontSize: '0.6875rem' }} />
                        ) : s.matched && s.rows.length > 0 ? (
                          <Chip label="Matched" size="small" color="success" variant="outlined" sx={{ fontSize: '0.6875rem' }} />
                        ) : s.error ? (
                          <Chip label={s.error} size="small" color="error" variant="outlined" sx={{ fontSize: '0.6875rem' }} />
                        ) : s.rows.length === 0 ? (
                          <Chip label="No data rows" size="small" color="default" variant="outlined" sx={{ fontSize: '0.6875rem' }} />
                        ) : (
                          <Chip label="Not assigned" size="small" color="warning" variant="outlined" sx={{ fontSize: '0.6875rem' }} />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}

        {step === 2 && (
          <Box>
            <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
              <Chip icon={<OkIcon />} label={`${totalCounts.ok} OK`} color="success" size="small" />
              <Chip icon={<WarnIcon />} label={`${totalCounts.warn} Warnings`} color="warning" size="small" />
              <Chip icon={<ErrIcon />} label={`${totalCounts.err} Errors`} color="error" size="small" />
              <Typography variant="body2" sx={{ ml: 'auto', color: '#555' }}>
                Total: {totalCounts.total} rows from {validatedSheets.length} sheets
              </Typography>
            </Box>

            <TableContainer sx={{ maxHeight: 400 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={hdrStyle}></TableCell>
                    <TableCell sx={hdrStyle}>Field</TableCell>
                    <TableCell sx={hdrStyle}>Total Rows</TableCell>
                    <TableCell sx={hdrStyle}>OK</TableCell>
                    <TableCell sx={hdrStyle}>Warnings</TableCell>
                    <TableCell sx={hdrStyle}>Errors</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {validatedSheets.map((s, idx) => {
                    const hasIssues = s.errCount > 0 || s.warnCount > 0;
                    const isExpanded = expandedSheet === idx;
                    const issueRows = s.validatedRows.filter(r => r._errors.length > 0 || r._warnings.length > 0);

                    return (
                      <>
                        <TableRow key={idx}>
                          <TableCell sx={{ ...cellStyle, width: 32, px: 0, textAlign: 'center' }}>
                            {hasIssues && (
                              <IconButton size="small" onClick={() => setExpandedSheet(isExpanded ? null : idx)} sx={{ p: '2px' }}>
                                {isExpanded ? <CollapseIcon sx={{ fontSize: 16 }} /> : <ExpandIcon sx={{ fontSize: 16 }} />}
                              </IconButton>
                            )}
                          </TableCell>
                          <TableCell sx={cellStyle}>
                            {s.isPivotHarvest && s.isMultiField
                              ? `${s.sheetName} (pivot multi-field)`
                              : s.isMultiField
                                ? `${s.sheetName} (multi-field)`
                                : (s.field?.name || s.sheetName)}
                          </TableCell>
                          <TableCell sx={cellStyle}>{s.validatedRows.length}</TableCell>
                          <TableCell sx={{ ...cellStyle, color: '#1f7a4d', fontWeight: 600 }}>{s.okCount}</TableCell>
                          <TableCell sx={{ ...cellStyle, color: '#F57C00', fontWeight: 600 }}>{s.warnCount}</TableCell>
                          <TableCell sx={{ ...cellStyle, color: '#C62828', fontWeight: 600 }}>{s.errCount}</TableCell>
                        </TableRow>
                        {hasIssues && (
                          <TableRow key={`${idx}-detail`}>
                            <TableCell colSpan={6} sx={{ p: 0, border: 'none' }}>
                              <Collapse in={isExpanded}>
                                <Box sx={{ px: 2, py: 1, backgroundColor: '#FAFAFA', maxHeight: 150, overflow: 'auto' }}>
                                  {issueRows.slice(0, 20).map((r, ri) => (
                                    <Typography key={ri} variant="caption" sx={{ display: 'block', lineHeight: 1.6 }}>
                                      Row {r._idx}:
                                      {r._errors.length > 0 && (
                                        <Box component="span" sx={{ color: '#C62828' }}> {r._errors.join('; ')}</Box>
                                      )}
                                      {r._warnings.length > 0 && (
                                        <Box component="span" sx={{ color: '#F57C00' }}>
                                          {r._errors.length > 0 ? ' · ' : ' '}{r._warnings.join('; ')}
                                        </Box>
                                      )}
                                    </Typography>
                                  ))}
                                  {issueRows.length > 20 && (
                                    <Typography variant="caption" sx={{ color: '#999', mt: 0.5, display: 'block' }}>
                                      ...and {issueRows.length - 20} more
                                    </Typography>
                                  )}
                                </Box>
                              </Collapse>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>

            {totalCounts.err > 0 && (
              <Alert severity="warning" sx={{ mt: 2, fontSize: '0.75rem' }}>
                {totalCounts.err} row(s) with errors will be skipped during import. Click the arrow to see details.
              </Alert>
            )}
          </Box>
        )}

        {step === 3 && importResults && (
          <Box sx={{ textAlign: 'center', py: 3 }}>
            {importResults.success > 0 && (
              <Alert severity="success" sx={{ mb: 2 }}>
                Successfully imported <strong>{importResults.success}</strong> harvest record(s).
              </Alert>
            )}
            {importResults.skipped > 0 && (
              <InfoNote mode="line" severity="info" sx={{ mb: 2 }}>
                <strong>{importResults.skipped}</strong> row(s) skipped (duplicates already exist in system).
              </InfoNote>
            )}
            {importResults.failed > 0 && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {importResults.failed} row(s) failed to import.
              </Alert>
            )}
            {importResults.errorDetails?.length > 0 && (
              <Box sx={{ textAlign: 'left', maxHeight: 200, overflow: 'auto', mt: 1 }}>
                {importResults.errorDetails.slice(0, 20).map((e, i) => (
                  <Typography key={i} variant="caption" sx={{ display: 'block', color: '#C62828' }}>{e}</Typography>
                ))}
              </Box>
            )}
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 1.5 }}>
        {step === 0 && (
          <Button onClick={handleClose}>Cancel</Button>
        )}
        {step === 1 && (
          <>
            <Button onClick={() => setStep(0)}>Back</Button>
            <Button variant="contained" disabled={matchedSheets.length === 0} onClick={() => setStep(2)}
              sx={{ backgroundColor: HEADER_FILL, '&:hover': { backgroundColor: '#1f7a4d' } }}>
              Validate ({matchedSheets.reduce((s, sh) => s + sh.rows.length, 0)} rows)
            </Button>
          </>
        )}
        {step === 2 && (
          <>
            <Button onClick={() => setStep(1)}>Back</Button>
            <Button variant="contained" disabled={importing || (totalCounts.ok + totalCounts.warn) === 0} onClick={handleImport}
              startIcon={importing ? <CircularProgress size={16} color="inherit" /> : null}
              sx={{ backgroundColor: HEADER_FILL, '&:hover': { backgroundColor: '#1f7a4d' } }}>
              {importing ? 'Importing...' : `Import ${totalCounts.ok + totalCounts.warn} rows`}
            </Button>
          </>
        )}
        {step === 3 && (
          <Button variant="contained" onClick={handleClose}
            sx={{ backgroundColor: HEADER_FILL, '&:hover': { backgroundColor: '#1f7a4d' } }}>
            Done
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
