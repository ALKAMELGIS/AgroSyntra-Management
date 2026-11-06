import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import {
  Box, Paper, Typography, Button, Alert, Card, CardContent, CardHeader, Divider,
  FormControl, InputLabel, Select, MenuItem, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, Stack, LinearProgress, Tooltip,
  Collapse,
} from '@mui/material';
import {
  UploadFileOutlined as UploadIcon,
  PlayArrow as DryRunIcon,
  PublishOutlined as ExecuteIcon,
  RefreshOutlined as RefreshIcon,
  ExpandMoreOutlined as ExpandMoreIcon,
  ExpandLessOutlined as ExpandLessIcon,
  CheckCircleOutlined as CheckIcon,
  WarningOutlined as WarningIcon,
  AgricultureOutlined as CropIcon,
} from '@mui/icons-material';
import { API_BASE, getAuthHeaders } from '../../config/api';
import InfoNote from '../../components/InfoNote';
import PageTitle from '../../components/PageTitle';

function isExcelFile(name) {
  return /\.(xlsx|xls)$/i.test(name || '');
}

function parseExcelToRows(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array', cellDates: true });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
        resolve(rows);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

function computeDateRange(rows, mapping) {
  const dateCol = mapping?.date;
  if (!dateCol || !rows?.length) return null;
  let min = null;
  let max = null;
  for (const row of rows) {
    const d = row[dateCol];
    if (!d) continue;
    const str = String(d).trim();
    if (!str) continue;
    if (!min || str < min) min = str;
    if (!max || str > max) max = str;
  }
  return min && max ? { min, max } : null;
}

const SOURCE_COLORS = { column: 'info', history: 'success', none: 'error' };
const SOURCE_LABELS = { column: 'From Excel', history: 'From Rotation', none: 'Unresolved' };

export default function HistoricalImport() {
  const fileInputRef = useRef(null);

  const [targets, setTargets] = useState([]);
  const [selectedTarget, setSelectedTarget] = useState('');

  const [file, setFile] = useState(null);
  const [parsedRows, setParsedRows] = useState(null);
  const [preview, setPreview] = useState(null);

  const [mapping, setMapping] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const [cropPreview, setCropPreview] = useState(null);
  const [cropPreviewLoading, setCropPreviewLoading] = useState(false);
  const [cropPreviewExpanded, setCropPreviewExpanded] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/imports/targets`, { headers: getAuthHeaders() })
      .then((r) => r.json())
      .then((d) => { if (d.success) setTargets(d.data || []); })
      .catch(() => {});
  }, []);

  const target = useMemo(
    () => targets.find((t) => t.key === selectedTarget) || null,
    [targets, selectedTarget],
  );

  const resetAll = () => {
    setFile(null);
    setParsedRows(null);
    setPreview(null);
    setMapping({});
    setResult(null);
    setError('');
    setCropPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const autoMap = useCallback((headers) => {
    if (!target) return;
    const norm = (s) => String(s || '').toLowerCase().replace(/[\s_\-()]+/g, '');
    const headerMap = new Map((headers || []).map((h) => [norm(h), h]));
    const next = {};
    for (const f of target.fields) {
      const key = norm(f.key);
      const match = [...headerMap.entries()].find(([k]) => k.includes(key) || key.includes(k));
      if (match) next[f.key] = match[1];
    }
    setMapping(next);
  }, [target]);

  const pickFile = async (f) => {
    if (!f) return;
    setFile(f);
    setParsedRows(null);
    setPreview(null);
    setResult(null);
    setError('');
    setCropPreview(null);
    setBusy(true);
    try {
      if (isExcelFile(f.name)) {
        const rows = await parseExcelToRows(f);
        if (!rows.length) throw new Error('Excel file has no data rows');
        const headers = Object.keys(rows[0]);
        setParsedRows(rows);
        const previewData = { headers, sampleRows: rows.slice(0, 10), totalRows: rows.length, fileName: f.name };
        setPreview(previewData);
        autoMap(headers);
      } else {
        const fd = new FormData();
        fd.append('file', f);
        const res = await fetch(`${API_BASE}/imports/preview`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: fd,
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.error?.message || 'Preview failed');
        setParsedRows(null);
        setPreview(json.data);
        autoMap(json.data.headers);
      }
    } catch (err) {
      setError(err.message || 'Preview failed');
    } finally {
      setBusy(false);
    }
  };

  const dateRange = useMemo(
    () => computeDateRange(parsedRows || preview?.sampleRows, mapping),
    [parsedRows, preview, mapping],
  );

  const loadCropPreview = async () => {
    if (!parsedRows?.length && !preview) return;
    if (!mapping.field_name || !mapping.date) return;
    setCropPreviewLoading(true);
    setCropPreview(null);
    try {
      const rows = parsedRows || preview?.sampleRows || [];
      const res = await fetch(`${API_BASE}/imports/resolve-crops`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows, mapping }),
      });
      const json = await res.json();
      if (json.success) {
        setCropPreview(json.data);
        setCropPreviewExpanded(true);
      }
    } catch {
      // ignore
    } finally {
      setCropPreviewLoading(false);
    }
  };

  useEffect(() => {
    if (mapping.field_name && mapping.date && (parsedRows?.length || preview?.sampleRows?.length)) {
      loadCropPreview();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapping.field_name, mapping.date, mapping.crop_name]);

  const runImport = async (dryRun) => {
    if (!file || !target) return;
    const missing = target.fields.filter((f) => f.required && !mapping[f.key]);
    if (missing.length > 0) {
      setError(`Map these required fields first: ${missing.map((f) => f.label).join(', ')}`);
      return;
    }
    setBusy(true);
    setError('');
    try {
      let json;
      if (parsedRows) {
        const res = await fetch(`${API_BASE}/imports/execute-json`, {
          method: 'POST',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rows: parsedRows,
            target: target.key,
            mapping,
            dryRun,
            fileName: file.name,
          }),
        });
        json = await res.json();
      } else {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('target', target.key);
        fd.append('mapping', JSON.stringify(mapping));
        fd.append('dryRun', String(dryRun));
        const res = await fetch(`${API_BASE}/imports/execute`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: fd,
        });
        json = await res.json();
      }
      if (!json.success) throw new Error(json.error?.message || 'Import failed');
      setResult(json.data);
    } catch (err) {
      setError(err.message || 'Import failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1760, mx: 'auto' }}>
      <PageTitle sx={{ mb: 0.5 }}>
        Historical data import
      </PageTitle>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Upload a CSV or Excel file (.xlsx) from your old records and map its columns onto
        harvests, EC/pH, or fertigation entries. Crops are automatically resolved from your Crop Rotation history.
        Dry-run first — nothing is written until you click Execute.
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {/* Step 1: target selection */}
      <Card sx={{ mb: 2 }}>
        <CardHeader title="1. Pick what you're importing" />
        <CardContent>
          <FormControl fullWidth size="small">
            <InputLabel id="historicalimport-target-label-1">Target</InputLabel>
            <Select labelId="historicalimport-target-label-1"
              label="Target"
              value={selectedTarget}
              onChange={(e) => { setSelectedTarget(e.target.value); setMapping({}); setResult(null); setCropPreview(null); }}
            >
              {targets.map((t) => (
                <MenuItem key={t.key} value={t.key}>{t.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
          {target && (
            <InfoNote mode="line" severity="info" sx={{ mt: 2 }}>
              {target.description}
            </InfoNote>
          )}
        </CardContent>
      </Card>

      {/* Step 2: file pick */}
      <Card sx={{ mb: 2, opacity: selectedTarget ? 1 : 0.55 }}>
        <CardHeader title="2. Pick a file" />
        <CardContent>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            style={{ display: 'none' }}
            onChange={(e) => pickFile(e.target.files?.[0])}
          />
          <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
            <Button
              variant="outlined"
              startIcon={<UploadIcon />}
              onClick={() => fileInputRef.current?.click()}
              disabled={!selectedTarget || busy}
            >
              Choose CSV or Excel
            </Button>
            {file && (
              <Typography variant="body2" color="text.secondary">
                {file.name} ({(file.size / 1024).toFixed(1)} KB)
                {isExcelFile(file.name) && (
                  <Chip label="Excel" size="small" color="success" sx={{ ml: 1 }} />
                )}
              </Typography>
            )}
            {file && (
              <Button size="small" startIcon={<RefreshIcon />} onClick={resetAll}>
                Reset
              </Button>
            )}
          </Stack>
          {busy && <LinearProgress sx={{ mt: 2 }} />}
          {preview && (
            <Box sx={{ mt: 2 }}>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" sx={{ mb: 1 }}>
                <Typography variant="body2">
                  Found <strong>{preview.totalRows}</strong> row(s) and{' '}
                  <strong>{preview.headers.length}</strong> column(s).
                </Typography>
                {dateRange && (
                  <Chip
                    label={`Date range: ${dateRange.min} — ${dateRange.max}`}
                    size="small"
                    color="primary"
                    variant="outlined"
                  />
                )}
              </Stack>
              <TableContainer sx={{ maxHeight: 220 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      {preview.headers.map((h) => (
                        <TableCell key={h} sx={{ fontWeight: 600 }}>{h}</TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {preview.sampleRows.map((row, i) => (
                      <TableRow key={i}>
                        {preview.headers.map((h) => (
                          <TableCell key={h}>{row[h]}</TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Step 3: column mapping */}
      {target && preview && (
        <Card sx={{ mb: 2 }}>
          <CardHeader title="3. Map each target field to a file column" />
          <CardContent>
            <Stack spacing={1.5}>
              {target.fields.map((f) => (
                <Box key={f.key} sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                  <Box sx={{ minWidth: 220 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {f.label}
                      {f.required && <Chip label="required" size="small" color="warning" sx={{ ml: 1 }} />}
                    </Typography>
                    {f.description && (
                      <Typography variant="caption" color="text.secondary">{f.description}</Typography>
                    )}
                  </Box>
                  <FormControl size="small" sx={{ minWidth: 240 }}>
                    <InputLabel id="historicalimport-f-required-column-column-label-2">{f.required ? 'Column' : 'Column (optional)'}</InputLabel>
                    <Select labelId="historicalimport-f-required-column-column-label-2"
                      label={f.required ? 'Column' : 'Column (optional)'}
                      value={mapping[f.key] || ''}
                      onChange={(e) => setMapping((prev) => ({ ...prev, [f.key]: e.target.value }))}
                    >
                      <MenuItem value=""><em>— not mapped —</em></MenuItem>
                      {preview.headers.map((h) => (
                        <MenuItem key={h} value={h}>{h}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Box>
              ))}
            </Stack>
          </CardContent>
        </Card>
      )}

      {/* Step 3.5: Crop Resolution Preview */}
      {target && preview && mapping.field_name && mapping.date && (
        <Card sx={{ mb: 2 }}>
          <Box
            onClick={() => setCropPreviewExpanded((p) => !p)}
            sx={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              px: 2, py: 1.5, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' },
            }}
          >
            <Stack direction="row" spacing={1} alignItems="center">
              <CropIcon color="primary" />
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                Crop Resolution Preview
              </Typography>
              {cropPreviewLoading && <LinearProgress sx={{ width: 80, ml: 1 }} />}
              {cropPreview && (
                <Stack direction="row" spacing={0.5} sx={{ ml: 1 }}>
                  {cropPreview.summary.fromColumn > 0 && (
                    <Chip label={`${cropPreview.summary.fromColumn} from Excel`} size="small" color="info" />
                  )}
                  {cropPreview.summary.fromHistory > 0 && (
                    <Chip label={`${cropPreview.summary.fromHistory} from rotation`} size="small" color="success" />
                  )}
                  {cropPreview.summary.unresolved > 0 && (
                    <Chip label={`${cropPreview.summary.unresolved} unresolved`} size="small" color="error" />
                  )}
                </Stack>
              )}
            </Stack>
            {cropPreviewExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          </Box>
          <Collapse in={cropPreviewExpanded}>
            <CardContent sx={{ pt: 0 }}>
              {!cropPreview && !cropPreviewLoading && (
                <InfoNote severity="info">
                  Map the <strong>Field name</strong> and <strong>Date</strong> columns above to see how crops will be resolved.
                </InfoNote>
              )}
              {cropPreview?.summary.unresolved > 0 && (
                <Alert severity="warning" sx={{ mb: 2 }} icon={<WarningIcon />}>
                  <strong>{cropPreview.summary.unresolved}</strong> row(s) could not be matched to a crop.
                  {!mapping.crop_name && (
                    <> You can map a <strong>Crop + Variety</strong> column above, or add entries to <strong>Crop Rotation</strong> history first.</>
                  )}
                </Alert>
              )}
              {cropPreview?.summary.unresolved === 0 && cropPreview.summary.total > 0 && (
                <Alert severity="success" sx={{ mb: 2 }} icon={<CheckIcon />}>
                  All {cropPreview.summary.total} rows resolved to a crop successfully.
                </Alert>
              )}
              {cropPreview?.results?.length > 0 && (
                <TableContainer sx={{ maxHeight: 300 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700 }}>Row</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Field</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Crop</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Variety</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Source</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {cropPreview.results.slice(0, 50).map((r, i) => (
                        <TableRow key={i} sx={{ bgcolor: r.source === 'none' ? 'action.selected' : 'transparent' }}>
                          <TableCell>{r.row}</TableCell>
                          <TableCell>{r.fieldName}</TableCell>
                          <TableCell>{r.date}</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>{r.cropName || '—'}</TableCell>
                          <TableCell>{r.varietyName || '—'}</TableCell>
                          <TableCell>
                            <Chip
                              label={SOURCE_LABELS[r.source]}
                              size="small"
                              color={SOURCE_COLORS[r.source]}
                              variant={r.source === 'none' ? 'filled' : 'outlined'}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </CardContent>
          </Collapse>
        </Card>
      )}

      {/* Step 4: actions */}
      {target && preview && (
        <Paper sx={{ p: 2, mb: 2 }}>
          <Stack direction="row" spacing={2} justifyContent="flex-end" flexWrap="wrap">
            <Tooltip title="Preview what will happen without writing" describeChild>
              <span>
                <Button
                  variant="outlined"
                  startIcon={<DryRunIcon />}
                  onClick={() => runImport(true)}
                  disabled={busy}
                >
                  Dry run
                </Button>
              </span>
            </Tooltip>
            <Tooltip title="Write to the database" describeChild>
              <span>
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={<ExecuteIcon />}
                  onClick={() => {
                    if (!window.confirm('Write these rows to the database? This cannot be easily undone.')) return;
                    runImport(false);
                  }}
                  disabled={busy}
                >
                  Execute
                </Button>
              </span>
            </Tooltip>
          </Stack>
        </Paper>
      )}

      {/* Result */}
      {result && (
        <Card sx={{ mb: 2 }}>
          <CardHeader
            title={result.dryRun ? 'Dry-run result' : 'Import complete'}
            subheader={`Target: ${result.target}`}
          />
          <CardContent>
            <Stack direction="row" spacing={2} flexWrap="wrap" sx={{ mb: 2 }}>
              <Chip label={`Total rows: ${result.stats.total}`} />
              <Chip
                label={
                  result.dryRun
                    ? `Would insert: ${result.stats.toInsert}`
                    : `Inserted: ${result.stats.toInsert}`
                }
                color="success"
              />
              {!result.dryRun && (
                <Chip
                  label={`Skipped (duplicate): ${result.stats.skipped}`}
                  color={result.stats.skipped > 0 ? 'warning' : 'default'}
                />
              )}
              {result.stats.valvesInserted !== undefined && (
                <Chip label={`Valve readings: ${result.stats.valvesInserted}`} color="info" />
              )}
              <Chip
                label={`Errors: ${result.stats.errors.length}`}
                color={result.stats.errors.length > 0 ? 'error' : 'default'}
              />
            </Stack>

            {/* Crop resolution stats */}
            {result.stats.cropResolution && (
              <Alert
                severity={result.stats.cropResolution.unresolved > 0 ? 'warning' : 'success'}
                sx={{ mb: 2 }}
                icon={<CropIcon />}
              >
                <strong>Crop resolution:</strong>{' '}
                {result.stats.cropResolution.fromColumn > 0 && (
                  <>{result.stats.cropResolution.fromColumn} from Excel column, </>
                )}
                {result.stats.cropResolution.fromHistory > 0 && (
                  <>{result.stats.cropResolution.fromHistory} from rotation history, </>
                )}
                {result.stats.cropResolution.unresolved > 0 && (
                  <strong>{result.stats.cropResolution.unresolved} unresolved (no crop assigned)</strong>
                )}
                {result.stats.cropResolution.unresolved === 0 && (
                  <strong>all rows resolved</strong>
                )}
              </Alert>
            )}

            {result.stats.unmappedHeaders?.length > 0 && (
              <InfoNote mode="line" severity="info" sx={{ mb: 2 }}>
                These columns aren't used by this target and were ignored:{' '}
                <strong>{result.stats.unmappedHeaders.join(', ')}</strong>
              </InfoNote>
            )}

            {result.stats.errors.length > 0 && (
              <>
                <Typography variant="subtitle2" sx={{ mt: 1, mb: 1 }}>Row-level errors</Typography>
                <TableContainer sx={{ maxHeight: 300 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell>Row</TableCell>
                        <TableCell>Reason</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {result.stats.errors.map((e, i) => (
                        <TableRow key={i}>
                          <TableCell>{e.row}</TableCell>
                          <TableCell>{e.reason}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </>
            )}

            {result.stats.preview?.length > 0 && (
              <>
                <Divider sx={{ my: 2 }} />
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  Sample of resolved rows (first 5)
                </Typography>
                <TableContainer sx={{ maxHeight: 240 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        {Object.keys(result.stats.preview[0]).map((k) => (
                          <TableCell key={k} sx={{ fontWeight: 600 }}>{k}</TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {result.stats.preview.map((r, i) => (
                        <TableRow key={i}>
                          {Object.keys(result.stats.preview[0]).map((k) => (
                            <TableCell key={k}>{String(r[k] ?? '')}</TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </Box>
  );
}
