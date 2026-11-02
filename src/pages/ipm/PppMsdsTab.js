import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Autocomplete, Box, Button, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, IconButton, Paper, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, ToggleButton, ToggleButtonGroup,
  Tooltip, Typography,
} from '@mui/material';
import {
  Add, ArrowBack, ChevronLeft, ChevronRight, Delete, Download, PictureAsPdf, UploadFile,
} from '@mui/icons-material';
import api from '../../utils/api';
import { API_BASE } from '../../config/api';
import { getAuthHeaders } from '../../utils/authStorage';
import { useNotification } from '../../contexts/NotificationContext';
import { excelTableSx, GutterCell } from '../../components/table/ExcelTable';

const TABLE_MAX_HEIGHT = 'calc(100vh - 300px)';
const SWIPE_THRESHOLD = 60;

function flattenRows(products, filter, search) {
  const q = search.trim().toLowerCase();
  const rows = [];
  for (const product of products) {
    const pdfs = product.pdfs || [];
    if (pdfs.length === 0) {
      if (filter === 'with') continue;
      rows.push({
        key: `${product.id}-empty`,
        productId: product.id,
        productName: product.name,
        activeIngredient: product.active_ingredient || '',
        pdfId: null,
        filename: '',
        hasPdf: false,
      });
      continue;
    }
    if (filter === 'missing') continue;
    for (const pdf of pdfs) {
      rows.push({
        key: pdf.id,
        productId: product.id,
        productName: product.name,
        activeIngredient: product.active_ingredient || '',
        pdfId: pdf.id,
        filename: pdf.original_name || '',
        hasPdf: true,
      });
    }
  }
  const filtered = q
    ? rows.filter((row) => (
      row.productName.toLowerCase().includes(q)
      || row.activeIngredient.toLowerCase().includes(q)
      || row.filename.toLowerCase().includes(q)
    ))
    : rows;
  filtered.sort((a, b) => {
    if (a.hasPdf !== b.hasPdf) return a.hasPdf ? -1 : 1;
    const byName = a.productName.localeCompare(b.productName, undefined, { sensitivity: 'base' });
    if (byName !== 0) return byName;
    return a.filename.localeCompare(b.filename, undefined, { sensitivity: 'base' });
  });
  return filtered;
}

function statusColor(status) {
  if (status === 'matched') return 'success';
  if (status === 'suggested') return 'warning';
  return 'default';
}

async function fetchPdfBlob(attachmentId) {
  const response = await fetch(`${API_BASE}/ipm/product-catalog/gap-pdfs/${attachmentId}/file`, {
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    throw new Error('Failed to load PDF');
  }
  return response.blob();
}

export default function PppMsdsTab({ canManage }) {
  const notify = useNotification();
  const notifyRef = useRef(notify);
  notifyRef.current = notify;
  const zipInputRef = useRef(null);
  const pdfInputRef = useRef(null);
  const addPdfProductRef = useRef(null);
  const touchStartX = useRef(null);

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [readerKey, setReaderKey] = useState(null);
  const [pdfUrl, setPdfUrl] = useState('');
  const [pdfLoading, setPdfLoading] = useState(false);

  const [importing, setImporting] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [batchId, setBatchId] = useState(null);
  const [reviewRows, setReviewRows] = useState([]);
  const [skippedZip, setSkippedZip] = useState([]);
  const [saving, setSaving] = useState(false);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/ipm/product-catalog/gap-pdfs');
      setProducts(res.data.data?.products || []);
    } catch (err) {
      notifyRef.current.error(err.message || 'Failed to load PPP MSDS files');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadList(); }, [loadList]);

  const rows = useMemo(() => flattenRows(products, filter, search), [products, filter, search]);
  const allPdfRows = useMemo(() => flattenRows(products, 'with', ''), [products]);
  const swipeRows = useMemo(() => flattenRows(products, 'with', search), [products, search]);
  const readerRow = readerKey ? (allPdfRows.find((row) => row.key === readerKey) || null) : null;
  const navRows = readerRow && swipeRows.some((row) => row.key === readerKey) ? swipeRows : allPdfRows;
  const readerIndex = readerRow ? navRows.findIndex((row) => row.key === readerKey) : -1;

  useEffect(() => {
    let revoked = false;
    let objectUrl = '';
    if (!readerRow?.pdfId) {
      setPdfUrl('');
      return undefined;
    }
    setPdfUrl('');
    setPdfLoading(true);
    fetchPdfBlob(readerRow.pdfId)
      .then((blob) => {
        if (revoked) return;
        objectUrl = URL.createObjectURL(blob);
        setPdfUrl(objectUrl);
      })
      .catch((err) => {
        if (!revoked) notifyRef.current.error(err.message || 'Failed to open PDF');
      })
      .finally(() => {
        if (!revoked) setPdfLoading(false);
      });
    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [readerRow?.pdfId]);

  const goRelative = useCallback((delta) => {
    if (navRows.length === 0 || readerIndex < 0) return;
    const next = (readerIndex + delta + navRows.length) % navRows.length;
    setReaderKey(navRows[next].key);
  }, [navRows, readerIndex]);

  useEffect(() => {
    if (!readerRow) return undefined;
    const onKey = (event) => {
      if (event.key === 'ArrowLeft') goRelative(-1);
      if (event.key === 'ArrowRight') goRelative(1);
      if (event.key === 'Escape') setReaderKey(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [readerRow, goRelative]);

  const handleSwipeStart = (event) => {
    touchStartX.current = event.changedTouches?.[0]?.clientX ?? null;
  };
  const handleSwipeEnd = (event) => {
    const start = touchStartX.current;
    touchStartX.current = null;
    if (start == null) return;
    const end = event.changedTouches?.[0]?.clientX;
    if (end == null) return;
    const delta = end - start;
    if (Math.abs(delta) < SWIPE_THRESHOLD) return;
    goRelative(delta < 0 ? 1 : -1);
  };

  const handleImportZip = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post('/ipm/product-catalog/gap-pdfs/import-zip', fd);
      const data = res.data.data || {};
      setBatchId(data.batchId);
      setSkippedZip(data.skipped || []);
      setReviewRows((data.files || []).map((row) => ({
        ...row,
        productId: row.suggestedProductId,
      })));
      setReviewOpen(true);
    } catch (err) {
      notify.error(err.message || 'Failed to import zip');
    } finally {
      setImporting(false);
    }
  };

  const handleConfirmImport = async () => {
    setSaving(true);
    try {
      await api.post('/ipm/product-catalog/gap-pdfs/confirm', {
        batchId,
        assignments: reviewRows.map((row) => ({
          stagingId: row.stagingId,
          productId: row.productId || null,
        })),
      });
      notify.success('PPP MSDS files saved');
      setReviewOpen(false);
      setBatchId(null);
      setReviewRows([]);
      loadList();
    } catch (err) {
      notify.error(err.message || 'Failed to save assignments');
    } finally {
      setSaving(false);
    }
  };

  const handleAddPdf = (product) => {
    addPdfProductRef.current = product;
    pdfInputRef.current?.click();
  };

  const handlePdfChosen = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    const product = addPdfProductRef.current;
    addPdfProductRef.current = null;
    if (!file || !product) return;
    try {
      const fd = new FormData();
      fd.append('file', file);
      await api.post(`/ipm/product-catalog/gap-pdfs/product/${product.id || product.productId}`, fd);
      notify.success(`Added ${file.name}`);
      loadList();
    } catch (err) {
      notify.error(err.message || 'Failed to upload PDF');
    }
  };

  const handleDelete = async (row) => {
    if (!row.pdfId) return;
    if (!window.confirm(`Delete ${row.filename}?`)) return;
    try {
      await api.delete(`/ipm/product-catalog/gap-pdfs/${row.pdfId}`);
      notify.success('PDF deleted');
      if (readerKey === row.key) setReaderKey(null);
      loadList();
    } catch (err) {
      notify.error(err.message || 'Failed to delete PDF');
    }
  };

  const handleDownload = async (row) => {
    if (!row.pdfId) return;
    try {
      const blob = await fetchPdfBlob(row.pdfId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = row.filename || 'msds.pdf';
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      notify.error(err.message || 'Failed to download PDF');
    }
  };

  const productOptions = useMemo(
    () => products.map((p) => ({ id: p.id, name: p.name, active_ingredient: p.active_ingredient })),
    [products],
  );

  if (readerRow) {
    return (
      <Box>
        <Box
          sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, flexWrap: 'wrap' }}
          onTouchStart={handleSwipeStart}
          onTouchEnd={handleSwipeEnd}
        >
          <Button startIcon={<ArrowBack />} onClick={() => setReaderKey(null)}>Table</Button>
          <TextField
            size="small"
            placeholder="Search to jump..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ width: 220 }}
          />
          <Autocomplete
            size="small"
            sx={{ width: 320 }}
            options={navRows}
            value={navRows.find((row) => row.key === readerKey) || null}
            isOptionEqualToValue={(a, b) => a.key === b.key}
            getOptionLabel={(opt) => `${opt.productName} — ${opt.filename}`}
            onChange={(_, value) => { if (value) setReaderKey(value.key); }}
            renderInput={(params) => <TextField {...params} placeholder="Jump to PDF" />}
          />
          <Box sx={{ flex: 1 }} />
          <IconButton onClick={() => goRelative(-1)} disabled={navRows.length < 2}><ChevronLeft /></IconButton>
          <Typography variant="body2">
            {readerIndex + 1} / {navRows.length}
          </Typography>
          <IconButton onClick={() => goRelative(1)} disabled={navRows.length < 2}><ChevronRight /></IconButton>
          <Button startIcon={<Download />} onClick={() => handleDownload(readerRow)}>Download</Button>
        </Box>
        <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
          {readerRow.productName}
          <Typography component="span" color="text.secondary" sx={{ ml: 1 }}>
            {readerRow.filename}
          </Typography>
        </Typography>
        <Paper variant="outlined" sx={{ height: 'calc(100vh - 280px)', overflow: 'hidden' }}>
          {pdfLoading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}><CircularProgress /></Box>
          )}
          {!pdfLoading && pdfUrl && (
            <Box
              component="iframe"
              title={readerRow.filename}
              src={pdfUrl}
              sx={{ width: '100%', height: '100%', border: 0 }}
            />
          )}
        </Paper>
      </Box>
    );
  }

  return (
    <Box>
      <input ref={zipInputRef} type="file" accept=".zip,application/zip" hidden onChange={handleImportZip} />
      <input ref={pdfInputRef} type="file" accept="application/pdf,.pdf" hidden onChange={handlePdfChosen} />

      <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center', flexWrap: 'wrap' }}>
        <TextField
          size="small"
          placeholder="Search product, ingredient, or filename..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ width: 360 }}
        />
        <ToggleButtonGroup
          exclusive
          size="small"
          value={filter}
          onChange={(_, value) => { if (value) setFilter(value); }}
        >
          <ToggleButton value="all">All</ToggleButton>
          <ToggleButton value="with">With PDF</ToggleButton>
          <ToggleButton value="missing">No PDF</ToggleButton>
        </ToggleButtonGroup>
        <Typography variant="body2" color="text.secondary">
          {allPdfRows.length} PDF{allPdfRows.length === 1 ? '' : 's'}
        </Typography>
        <Box sx={{ flex: 1 }} />
        {canManage && (
          <Button
            variant="outlined"
            startIcon={importing ? <CircularProgress size={16} /> : <UploadFile />}
            disabled={importing}
            onClick={() => zipInputRef.current?.click()}
          >
            Import zip
          </Button>
        )}
      </Box>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Product use instructions and risks (MSDS). Click a row to read. Swipe or use arrows to move between PDFs.
      </Typography>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>
      ) : (
        <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: TABLE_MAX_HEIGHT }}>
          <Table size="small" sx={excelTableSx}>
            <TableHead>
              <TableRow>
                <GutterCell />
                <TableCell>Product</TableCell>
                <TableCell>Active Ingredient</TableCell>
                <TableCell>PDF</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row, idx) => (
                <TableRow
                  key={row.key}
                  hover
                  sx={{ cursor: row.hasPdf ? 'pointer' : 'default' }}
                  onClick={() => { if (row.hasPdf) setReaderKey(row.key); }}
                >
                  <GutterCell index={idx + 1} />
                  <TableCell>{row.productName}</TableCell>
                  <TableCell>{row.activeIngredient || '-'}</TableCell>
                  <TableCell>
                    {row.hasPdf ? row.filename : (
                      <Typography color="text.secondary">No PDF</Typography>
                    )}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    {row.hasPdf && (
                      <Tooltip title="Open">
                        <IconButton size="small" onClick={() => setReaderKey(row.key)}>
                          <PictureAsPdf fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                    {row.hasPdf && (
                      <Tooltip title="Download">
                        <IconButton size="small" onClick={() => handleDownload(row)}>
                          <Download fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                    {canManage && (
                      <Tooltip title="Add PDF">
                        <IconButton size="small" onClick={() => handleAddPdf({ id: row.productId, name: row.productName })}>
                          <Add fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                    {canManage && row.hasPdf && (
                      <Tooltip title="Delete">
                        <IconButton size="small" color="error" onClick={() => handleDelete(row)}>
                          <Delete fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} align="center">
                    <Typography color="text.secondary" py={4}>
                      No PPP MSDS files yet. An auditor can import a zip of product PDFs.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog open={reviewOpen} onClose={() => !saving && setReviewOpen(false)} maxWidth="lg" fullWidth>
        <DialogTitle>Match PDFs to products</DialogTitle>
        <DialogContent>
          {skippedZip.length > 0 && (
            <Alert severity="info" sx={{ mb: 2 }}>
              Skipped {skippedZip.length} non-PDF file{skippedZip.length === 1 ? '' : 's'}:{' '}
              {skippedZip.map((s) => s.filename).join(', ')}
            </Alert>
          )}
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Keep the suggestion, search for a product on the right, or leave blank to skip that file.
          </Typography>
          <TableContainer sx={{ maxHeight: '60vh' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>PDF filename</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell sx={{ minWidth: 280 }}>Product</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {reviewRows.map((row, idx) => (
                  <TableRow key={row.stagingId}>
                    <TableCell>{row.filename}</TableCell>
                    <TableCell>
                      <Chip size="small" label={row.status} color={statusColor(row.status)} />
                    </TableCell>
                    <TableCell>
                      <Autocomplete
                        size="small"
                        options={productOptions}
                        value={productOptions.find((p) => p.id === row.productId) || null}
                        isOptionEqualToValue={(a, b) => a.id === b.id}
                        getOptionLabel={(opt) => (
                          opt.active_ingredient ? `${opt.name} (${opt.active_ingredient})` : (opt.name || '')
                        )}
                        onChange={(_, value) => {
                          setReviewRows((prev) => prev.map((item, i) => (
                            i === idx ? { ...item, productId: value?.id || null } : item
                          )));
                        }}
                        renderInput={(params) => <TextField {...params} placeholder="Search product" />}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReviewOpen(false)} disabled={saving}>Cancel</Button>
          <Button variant="contained" onClick={handleConfirmImport} disabled={saving}>
            {saving ? 'Saving…' : 'Save assignments'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
