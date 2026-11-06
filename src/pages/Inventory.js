import { useState, useEffect, useCallback, Fragment } from 'react';
import {
  Box, Typography, Paper, Button, TextField, Tabs, Tab, Chip,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  CircularProgress, Alert, IconButton, Tooltip, Dialog, DialogTitle,
  DialogContent, DialogActions, FormControl, InputLabel, Select, MenuItem,
  InputAdornment, Collapse,
} from '@mui/material';
import { TableSkeleton } from '../components/LoadingSkeleton';
import {
  AddOutlined as Add, EditOutlined as Edit, DeleteOutlined as Delete, SearchOutlined as Search, Inventory2Outlined as Inventory2, WarningOutlined as Warning, ShoppingCartOutlined as ShoppingCart,
  ExpandMoreOutlined as ExpandMore, ExpandLessOutlined as ExpandLess, TrendingDownOutlined as TrendingDown, TrendingUpOutlined as TrendingUp,
} from '@mui/icons-material';
import { useNotification } from '../contexts/NotificationContext';
import { useActiveSite } from '../contexts/ActiveSiteContext';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { canWriteOpsStock } from '../utils/roleAccess';

import { API_BASE, getAuthHeaders } from '../config/api';
import InfoNote from '../components/InfoNote';

/** Missing numbers show as an em dash instead of NaN. */
const fmtNum = (v, digits) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? '—' : Number(v).toFixed(digits));

const API = API_BASE;
const headers = () => ({
  'Content-Type': 'application/json',
  ...getAuthHeaders(),
});

const CATEGORIES = [
  { value: '', label: 'All' },
  { value: 'fertilizer', label: 'Fertilizers' },
  { value: 'pesticide', label: 'Pesticides' },
  { value: 'biological', label: 'Biological' },
  { value: 'seed', label: 'Seeds' },
  { value: 'packaging', label: 'Packaging' },
  { value: 'other', label: 'Other' },
];

const UNITS = ['kg', 'L', 'units', 'sachets', 'bottles', 'bags', 'pcs'];

function stockStatus(current, min) {
  if (current <= 0) return { label: 'Out of Stock', color: 'error' };
  if (current <= min) return { label: 'Low', color: 'warning' };
  return { label: 'In Stock', color: 'success' };
}

const emptyForm = {
  name: '', category: 'fertilizer', unit: 'kg', minStockLevel: 0,
  currentStock: 0, costPerUnit: 0, currency: 'AED', supplier: '',
};

export default function Inventory() {
  const notify = useNotification();
  const { user } = useAuth();
  const { t } = useTranslation();
  // Operation manager and data entry worker add items and record stock; others view only.
  const canWrite = canWriteOpsStock(user);
  const { activeSiteId } = useActiveSite();
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState({ total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [search, setSearch] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [lowStockCount, setLowStockCount] = useState(0);

  // Dialogs
  const [itemDialog, setItemDialog] = useState({ open: false, mode: 'add' });
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [receiveDialog, setReceiveDialog] = useState({ open: false, item: null });
  const [receiveForm, setReceiveForm] = useState({ quantity: '', notes: '' });
  const [expandedRow, setExpandedRow] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [txLoading, setTxLoading] = useState(false);

  // Load items
  const loadItems = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (catFilter) params.set('category', catFilter);
      if (search) params.set('search', search);
      if (lowStockOnly) params.set('low_stock', 'true');
      if (activeSiteId) params.set('site_id', activeSiteId);
      params.set('page', String(page));
      params.set('limit', '50');

      const res = await fetch(`${API}/inventory?${params}`, { headers: headers() });
      const data = await res.json();
      if (data.success) {
        setItems(data.data || []);
        setMeta(data.meta || { total: 0 });
      } else {
        setError(data.error?.message || 'Failed to load');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [catFilter, search, lowStockOnly, page, activeSiteId]);

  const loadLowStockCount = useCallback(async () => {
    try {
      const res = await fetch(`${API}/inventory/low-stock`, { headers: headers() });
      const data = await res.json();
      if (data.success) setLowStockCount(data.data?.length || 0);
    } catch {}
  }, []);

  useEffect(() => { loadItems(); }, [loadItems]);
  useEffect(() => { loadLowStockCount(); }, [loadLowStockCount]);

  // Load transactions for expanded row
  const toggleRow = async (id) => {
    if (expandedRow === id) { setExpandedRow(null); return; }
    setExpandedRow(id);
    setTxLoading(true);
    try {
      const res = await fetch(`${API}/inventory/${id}/transactions`, { headers: headers() });
      const data = await res.json();
      setTransactions(data.success ? data.data : []);
    } catch { setTransactions([]); }
    finally { setTxLoading(false); }
  };

  // Save item (add / edit)
  const handleSave = async () => {
    setSaving(true);
    try {
      const isEdit = itemDialog.mode === 'edit';
      const url = isEdit ? `${API}/inventory/${form.id}` : `${API}/inventory`;
      const res = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: headers(),
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.success) {
        notify.success(isEdit ? 'Item updated' : 'Item added');
        setItemDialog({ open: false, mode: 'add' });
        loadItems();
        loadLowStockCount();
      } else {
        notify.error(data.error?.message || 'Failed');
      }
    } catch (err) {
      notify.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Receive stock
  const handleReceive = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API}/inventory/${receiveDialog.item.id}/transactions`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          type: 'purchase',
          quantity: Number(receiveForm.quantity),
          notes: receiveForm.notes,
        }),
      });
      const data = await res.json();
      if (data.success) {
        notify.success('Stock received');
        setReceiveDialog({ open: false, item: null });
        setReceiveForm({ quantity: '', notes: '' });
        loadItems();
        loadLowStockCount();
      } else {
        notify.error(data.error?.message || 'Failed');
      }
    } catch (err) {
      notify.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Delete item
  const handleDelete = async (id) => {
    if (!window.confirm('Deactivate this inventory item?')) return;
    try {
      await fetch(`${API}/inventory/${id}`, { method: 'DELETE', headers: headers() });
      notify.success('Item deactivated');
      loadItems();
      loadLowStockCount();
    } catch (err) {
      notify.error(err.message);
    }
  };

  const openAdd = () => {
    setForm({ ...emptyForm });
    setItemDialog({ open: true, mode: 'add' });
  };

  const openEdit = (item) => {
    setForm({
      id: item.id,
      name: item.name,
      category: item.category,
      unit: item.unit,
      minStockLevel: item.min_stock_level,
      costPerUnit: item.cost_per_unit,
      currency: item.currency,
      supplier: item.supplier || '',
    });
    setItemDialog({ open: true, mode: 'edit' });
  };

  const catIndex = CATEGORIES.findIndex((c) => c.value === catFilter);

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Inventory2 color="primary" sx={{ fontSize: 32 }} />
          <Typography variant="h4">Inventory</Typography>
        </Box>
        {canWrite && <Button variant="contained" startIcon={<Add />} onClick={openAdd}>Add Item</Button>}
      </Box>
      {!canWrite && (
        <InfoNote severity="info" sx={{ mb: 2 }}>{t('adminAccess.inventoryViewOnly')}</InfoNote>
      )}

      {/* Low stock alert */}
      {lowStockCount > 0 && (
        <Alert
          severity="warning"
          icon={<Warning />}
          action={
            <Button color="inherit" size="small" onClick={() => { setLowStockOnly(!lowStockOnly); setPage(1); }}>
              {lowStockOnly ? 'Show All' : 'Show Low Stock'}
            </Button>
          }
          sx={{ mb: 2 }}
        >
          {`${lowStockCount} ${lowStockCount === 1 ? 'item' : 'items'} below minimum stock level`}
        </Alert>
      )}

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Filters */}
      <Paper sx={{ mb: 2 }}>
        <Tabs value={catIndex >= 0 ? catIndex : 0} onChange={(_, v) => { setCatFilter(CATEGORIES[v].value); setPage(1); }}>
          {CATEGORIES.map((c) => <Tab key={c.value} label={c.label} />)}
        </Tabs>
      </Paper>

      <Paper sx={{ p: 2, mb: 2, display: 'flex', gap: 2, alignItems: 'center' }}>
        <TextField
          size="small" placeholder="Search items or supplier..."
          value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          InputProps={{ startAdornment: <InputAdornment position="start"><Search /></InputAdornment> }}
          sx={{ width: 300 }}
        />
        <Typography variant="body2" color="text.secondary" sx={{ ml: 'auto' }}>
          {`${meta.total} ${meta.total === 1 ? 'item' : 'items'}`}
        </Typography>
      </Paper>

      {/* Table */}
      {loading ? (
        <TableSkeleton rows={8} columns={6} />
      ) : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell />
                <TableCell><strong>Name</strong></TableCell>
                <TableCell><strong>Category</strong></TableCell>
                <TableCell><strong>Unit</strong></TableCell>
                <TableCell align="right"><strong>Current Stock</strong></TableCell>
                <TableCell align="right"><strong>Min Level</strong></TableCell>
                <TableCell><strong>Status</strong></TableCell>
                <TableCell align="right"><strong>Cost/Unit</strong></TableCell>
                <TableCell><strong>Supplier</strong></TableCell>
                <TableCell align="center"><strong>Actions</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((item) => {
                const status = stockStatus(Number(item.current_stock), Number(item.min_stock_level));
                const isExpanded = expandedRow === item.id;
                return (
                  <Fragment key={item.id}>
                    <TableRow hover sx={{ '& > *': { borderBottom: isExpanded ? 'none' : undefined } }}>
                      <TableCell sx={{ width: 40 }}>
                        <IconButton size="small" onClick={() => toggleRow(item.id)} aria-label={isExpanded ? 'Collapse row' : 'Expand row'}>
                          {isExpanded ? <ExpandLess /> : <ExpandMore />}
                        </IconButton>
                      </TableCell>
                      <TableCell><strong>{item.name}</strong></TableCell>
                      <TableCell>
                        <Chip label={item.category} size="small" variant="outlined" sx={{ textTransform: 'capitalize' }} />
                      </TableCell>
                      <TableCell>{item.unit}</TableCell>
                      <TableCell align="right">
                        <Typography fontWeight={600} color={status.color === 'error' ? 'error' : status.color === 'warning' ? 'warning.main' : 'text.primary'}>
                          {fmtNum(item.current_stock, 1)}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">{fmtNum(item.min_stock_level, 1)}</TableCell>
                      <TableCell><Chip label={status.label} color={status.color} size="small" /></TableCell>
                      <TableCell align="right">{fmtNum(item.cost_per_unit, 2)} {item.currency}</TableCell>
                      <TableCell>{item.supplier || '—'}</TableCell>
                      <TableCell align="center">
                        {canWrite && (<>
                        <Tooltip title="Receive Stock">
                          <IconButton size="small" color="success" onClick={() => {
                            setReceiveDialog({ open: true, item });
                            setReceiveForm({ quantity: '', notes: '' });
                          }}>
                            <ShoppingCart fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Edit">
                          <IconButton size="small" onClick={() => openEdit(item)}><Edit fontSize="small" /></IconButton>
                        </Tooltip>
                        <Tooltip title="Deactivate">
                          <IconButton size="small" color="error" onClick={() => handleDelete(item.id)}><Delete fontSize="small" /></IconButton>
                        </Tooltip>
                        </>)}
                      </TableCell>
                    </TableRow>

                    {/* Expanded transaction history */}
                    <TableRow>
                      <TableCell colSpan={10} sx={{ py: 0, px: 0 }}>
                        <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                          <Box sx={{ p: 2, bgcolor: 'action.hover' }}>
                            <Typography variant="subtitle2" gutterBottom>Transaction History</Typography>
                            {txLoading ? <CircularProgress size={20} /> : (
                              transactions.length === 0 ? (
                                <Typography variant="body2" color="text.secondary">No transactions yet</Typography>
                              ) : (
                                <Table size="small">
                                  <TableHead>
                                    <TableRow>
                                      <TableCell>Date</TableCell>
                                      <TableCell>Type</TableCell>
                                      <TableCell align="right">Quantity</TableCell>
                                      <TableCell align="right">Balance</TableCell>
                                      <TableCell>Source</TableCell>
                                      <TableCell>Notes</TableCell>
                                      <TableCell>By</TableCell>
                                    </TableRow>
                                  </TableHead>
                                  <TableBody>
                                    {transactions.map((tx) => (
                                      <TableRow key={tx.id}>
                                        <TableCell>{tx.date?.split('T')[0]}</TableCell>
                                        <TableCell>
                                          <Chip
                                            label={tx.type}
                                            size="small"
                                            color={tx.type === 'purchase' ? 'success' : tx.type === 'usage' ? 'error' : 'default'}
                                            variant="outlined"
                                            icon={Number(tx.quantity) >= 0 ? <TrendingUp /> : <TrendingDown />}
                                          />
                                        </TableCell>
                                        <TableCell align="right" sx={{ color: Number(tx.quantity) >= 0 ? 'success.main' : 'error.main', fontWeight: 600 }}>
                                          {Number(tx.quantity) > 0 ? '+' : ''}{fmtNum(tx.quantity, 1)}
                                        </TableCell>
                                        <TableCell align="right">{fmtNum(tx.balance_after, 1)}</TableCell>
                                        <TableCell>
                                          <Chip label={tx.reference_type || 'manual'} size="small" variant="outlined" />
                                        </TableCell>
                                        <TableCell>{tx.notes || '—'}</TableCell>
                                        <TableCell>{tx.created_by_name || '—'}</TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              )
                            )}
                          </Box>
                        </Collapse>
                      </TableCell>
                    </TableRow>
                  </Fragment>
                );
              })}

              {items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} align="center">
                    <Typography color="text.secondary" py={4}>No inventory items found</Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Pagination */}
      {!loading && meta.total > 0 && (
        <Paper sx={{ p: 1.5, mt: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            Showing {Math.min((page - 1) * 50 + 1, meta.total)}–{Math.min(page * 50, meta.total)} of {meta.total}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button size="small" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
            <Chip label={`Page ${page} / ${meta.totalPages || 1}`} size="small" variant="outlined" />
            <Button size="small" disabled={page * 50 >= meta.total} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </Box>
        </Paper>
      )}

      {/* ─── Add / Edit Item Dialog ─────────────────────────── */}
      <Dialog open={itemDialog.open} onClose={() => setItemDialog({ open: false, mode: 'add' })} maxWidth="sm" fullWidth>
        <DialogTitle>{itemDialog.mode === 'edit' ? 'Edit Item' : 'Add Inventory Item'}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} fullWidth required />
            <Box sx={{ display: 'flex', gap: 2 }}>
              <FormControl fullWidth>
                <InputLabel id="inventory-category-label-1">Category</InputLabel>
                <Select labelId="inventory-category-label-1" value={form.category} label="Category" onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  {CATEGORIES.filter((c) => c.value).map((c) => <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>)}
                </Select>
              </FormControl>
              <FormControl fullWidth>
                <InputLabel id="inventory-unit-label-2">Unit</InputLabel>
                <Select labelId="inventory-unit-label-2" value={form.unit} label="Unit" onChange={(e) => setForm({ ...form, unit: e.target.value })}>
                  {UNITS.map((u) => <MenuItem key={u} value={u}>{u}</MenuItem>)}
                </Select>
              </FormControl>
            </Box>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="Min Stock Level" type="number" fullWidth
                value={form.minStockLevel} onChange={(e) => setForm({ ...form, minStockLevel: Number(e.target.value) })}
              />
              {itemDialog.mode === 'add' && (
                <TextField
                  label="Initial Stock" type="number" fullWidth
                  value={form.currentStock} onChange={(e) => setForm({ ...form, currentStock: Number(e.target.value) })}
                />
              )}
            </Box>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="Cost per Unit" type="number" fullWidth
                value={form.costPerUnit} onChange={(e) => setForm({ ...form, costPerUnit: Number(e.target.value) })}
                InputProps={{ endAdornment: <InputAdornment position="end">{form.currency}</InputAdornment> }}
              />
              <TextField
                label="Supplier" fullWidth
                value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })}
              />
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setItemDialog({ open: false, mode: 'add' })}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving || !form.name}>
            {saving ? <CircularProgress size={20} /> : itemDialog.mode === 'edit' ? 'Update' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ─── Receive Stock Dialog ────────────────────────────── */}
      <Dialog open={receiveDialog.open} onClose={() => setReceiveDialog({ open: false, item: null })} maxWidth="xs" fullWidth>
        <DialogTitle>Receive Stock: {receiveDialog.item?.name}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Current stock: {fmtNum(receiveDialog.item?.current_stock || 0, 1)} {receiveDialog.item?.unit}
            </Typography>
            <TextField
              label="Quantity Received" type="number" fullWidth autoFocus
              value={receiveForm.quantity}
              onChange={(e) => setReceiveForm({ ...receiveForm, quantity: e.target.value })}
              InputProps={{ endAdornment: <InputAdornment position="end">{receiveDialog.item?.unit}</InputAdornment> }}
            />
            <TextField
              label="Notes (PO number, supplier, etc.)" fullWidth multiline rows={2}
              value={receiveForm.notes}
              onChange={(e) => setReceiveForm({ ...receiveForm, notes: e.target.value })}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReceiveDialog({ open: false, item: null })}>Cancel</Button>
          <Button variant="contained" color="success" onClick={handleReceive} disabled={saving || !receiveForm.quantity || Number(receiveForm.quantity) <= 0}>
            {saving ? <CircularProgress size={20} /> : 'Receive'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
