import { useState, useEffect, useCallback, useMemo } from 'react';
import FitTableContainer from '../../components/table/FitTableContainer';
import { confirmAction } from '../../components/ConfirmDialog';
import {
  Box, Typography, Paper, Table, TableBody, TableCell, TableHead, TableRow,
  Button, Dialog, DialogActions, TextField, MenuItem, Chip,
  IconButton, Alert, CircularProgress, Tooltip, Select,
  ToggleButtonGroup, ToggleButton, Checkbox,
} from '@mui/material';
import {
  AddOutlined as Add, CheckOutlined as Check, CloseOutlined as Close, Visibility, PrintOutlined as Print, DeleteOutlined as Delete, SendOutlined as Send, SaveOutlined as Save,
} from '@mui/icons-material';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../contexts/NotificationContext';
import { useActiveSite } from '../../contexts/ActiveSiteContext';
import { useMasterData } from '../../utils/useMasterData';
import { useActiveSeason } from '../../contexts/ActiveSeasonContext';
import ReadOnlyBanner from '../../components/ReadOnlyBanner';
import { canApprovePesticideApplication } from '../../utils/ipmAccess';
import SegmentSelector from '../../components/SegmentSelector';
import { refreshOperatorWorkOrderBadgeCount } from '../../hooks/useOperatorWorkOrderBadgeCount';
import { DeleteSelectedButton, RowSelectCell, SelectAllHeadCell, deleteIdsSequentially } from '../../components/table/BulkSelect';
import { useRowSelection } from '../../hooks/useRowSelection';
import {
  addOperatorMixture, addOperatorRow, alignOperatorRows, operatorRowProblems, operatorRowsPayload, removeOperatorRow, updateOperatorRow,
} from '../../utils/workOrderOperatorRows';
import {
  MAX_PRODUCTS_PER_MIXTURE, WORK_ORDER_LOCKED_KEYS, alignMixtures, canAddMixture, mixtureInsertIndex, mixtureMembers, rowLabels,
} from '../../utils/mixtureGroups';

const STATUS_COLORS = {
  draft: 'default', issued: 'info', in_progress: 'warning',
  completed: 'secondary', approved: 'success', rejected: 'error',
};
const STATUS_LABELS = {
  draft: 'Draft', issued: 'Issued', in_progress: 'In Progress',
  completed: 'Completed', approved: 'Approved', rejected: 'Rejected',
};

const JUSTIFICATION_PRESETS = [
  'Pest : Whitefly', 'Pest : Thrips', 'Pest : Red Spider Mite', 'Pest : Mealybug',
  'Pest : Worm (Caterpillar)', 'Pest : Aphids', 'Pest : Phytium',
  'Disease : Botrytis', 'Disease : Powdery Mildew', 'Disease : Downy Mildew', 'Preventive',
];

// Roles that may create, edit, cancel and delete work orders (CEO / farm manager view only).
const MANAGE_ROLES = ['operation_manager', 'agronomist', 'pest_agronomist'];

const timeOfDay = (t) => (t ? String(t).slice(0, 5) : '');

const emptyForm = () => ({
  applicationType: 'spray', dateIssued: new Date().toISOString().split('T')[0],
  justification: '', assignedTo: '', items: [emptyItem()],
});

const emptyItem = () => ({
  fieldId: '', segment: '', productId: '', rate: '',
  dateOfApplication: new Date().toISOString().split('T')[0],
  groupId: null, isMixtureChild: false,
  startTime: '', endTime: '', totalProductQty: '', totalWaterQty: '',
  actualQty: '', machineryRef: '', qualityCheck: false, completedByName: '',
});

// ─── Paper template styles ─────────────────────────────────────────
const B = '1px solid #333';
const headerBg = '#d9e2d5';
const inpSx = {
  '& .MuiInputBase-root': { fontSize: '10px', height: 22, p: 0 },
  '& .MuiOutlinedInput-notchedOutline': { border: 'none' },
  '& input': { p: '2px 4px', fontSize: '10px' },
  '& .MuiSelect-select': { p: '2px 4px !important', fontSize: '10px', minHeight: 'unset !important' },
};

export default function WorkOrders() {
  const { user } = useAuth();
  // Work orders have their own role rules (below), so only a locked season makes the tab read-only —
  // not the IPM page flag, which marks the operations manager view-only.
  const { isSeasonReadOnly: readOnly } = useActiveSeason();
  const notify = useNotification();
  const navigate = useNavigate();
  const { activeSiteId, activeSite } = useActiveSite();
  const { data: masterData } = useMasterData();

  const [workOrders, setWorkOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [operators, setOperators] = useState([]);
  const [products, setProducts] = useState([]);
  const [fields, setFields] = useState([]);
  const [plantingRecords, setPlantingRecords] = useState([]);

  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);

  const [detailDialog, setDetailDialog] = useState({ open: false, wo: null });
  const [operatorMode, setOperatorMode] = useState(false);
  const [operatorItems, setOperatorItems] = useState([]);
  const [operatorJustification, setOperatorJustification] = useState('');
  // Pickers for the operator follow the work order's own site, not the selected site.
  const [operatorProducts, setOperatorProducts] = useState([]);
  const [operatorPlantingRecords, setOperatorPlantingRecords] = useState([]);
  const [operatorFields, setOperatorFields] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [saving, setSaving] = useState(false);

  // mode: 'send_back' (completed → operator) or 'cancel' (issued → rejected)
  const [rejectDialog, setRejectDialog] = useState({ open: false, id: null, mode: 'send_back' });
  const [rejectReason, setRejectReason] = useState('');
  const selection = useRowSelection();
  const deletableIds = useMemo(
    () => workOrders.filter((wo) => ['draft', 'rejected'].includes(wo.status)).map((wo) => wo.id),
    [workOrders],
  );

  const isOperator = user?.role === 'operator';
  const canApprove = !readOnly && canApprovePesticideApplication(user);
  const canManage = !readOnly && MANAGE_ROLES.includes(user?.role);
  const viewOnly = readOnly || (!canManage && !canApprove && !isOperator);

  const siteFields = useMemo(() => {
    if (!masterData?.countries) return [];
    const result = [];
    for (const c of masterData.countries) {
      for (const s of c.sites || []) {
        if (activeSiteId && s.id !== activeSiteId) continue;
        for (const fa of s.farmAreas || []) {
          for (const f of fa.fields || []) result.push({ id: f.id, name: f.name });
        }
      }
    }
    return result;
  }, [masterData, activeSiteId]);

  const loadWorkOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      // Operators see every order assigned to them, whatever site is selected.
      if (activeSiteId && !isOperator) params.set('site_id', activeSiteId);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const res = await api.get(`/ipm/work-orders?${params}`);
      setWorkOrders(res.data?.data || []);
    } catch (err) { notify.error(err.message || 'Failed to load work orders'); }
    finally { setLoading(false); }
  }, [activeSiteId, isOperator, statusFilter, notify]);

  const loadOperators = useCallback(async () => {
    try { const res = await api.get('/ipm/work-orders/operators'); setOperators(res.data?.data || []); } catch {}
  }, []);

  const loadProducts = useCallback(async () => {
    try {
      const res = activeSiteId
        ? await api.get(`/ipm/pesticide-products/site/${activeSiteId}`)
        : await api.get('/ipm/pesticide-products/active');
      setProducts(res.data?.data || []);
    } catch {}
  }, [activeSiteId]);

  // Segment options (valves / bays) come from the site's planting records, as on Pesticide Applications.
  const loadPlantingRecords = useCallback(async () => {
    if (!canManage) return;
    try {
      const res = await api.get(`/planting-records${activeSiteId ? `?site_id=${activeSiteId}` : ''}`);
      setPlantingRecords(res.data?.data || res.data || []);
    } catch { setPlantingRecords([]); }
  }, [activeSiteId, canManage]);

  useEffect(() => { loadWorkOrders(); }, [loadWorkOrders]);
  useEffect(() => { loadOperators(); loadProducts(); }, [loadOperators, loadProducts]);
  useEffect(() => { loadPlantingRecords(); }, [loadPlantingRecords]);
  useEffect(() => { setFields(siteFields); }, [siteFields]);

  // ─── Handlers ──────────────────────────────────────────────────────
  const closeCreate = () => { setShowCreate(false); setEditingId(null); setForm(emptyForm()); };

  const handleCreate = async () => {
    if (!canManage) return;
    if (!editingId && !activeSiteId) return notify.error('Select a site first');
    if (!form.assignedTo) return notify.error('Please assign an operator');
    if (form.items.length === 0) return notify.error('Add at least one item');
    setCreating(true);
    try {
      const body = {
        applicationType: form.applicationType,
        dateIssued: form.dateIssued, justification: form.justification,
        assignedTo: form.assignedTo, items: form.items,
      };
      if (editingId) {
        await api.put(`/ipm/work-orders/${editingId}`, body);
        notify.success('Work order updated');
      } else {
        await api.post('/ipm/work-orders', { ...body, siteId: activeSiteId });
        notify.success('Work order created and issued');
      }
      closeCreate();
      loadWorkOrders();
    } catch (err) { notify.error(err.message || 'Failed to save work order'); }
    finally { setCreating(false); }
  };

  const openEdit = (wo) => {
    // Field and product pickers follow the selected site, so edit from the order's own site.
    if (activeSiteId && wo.site_id && wo.site_id !== activeSiteId) {
      return notify.warning(`Switch to site "${wo.site_name || 'of this order'}" to edit this work order`);
    }
    setForm({
      siteName: wo.site_name || '',
      applicationType: wo.application_type || 'spray',
      dateIssued: (wo.date_issued || '').slice(0, 10),
      justification: wo.justification || '',
      assignedTo: wo.assigned_to || '',
      items: (wo.items || []).map((it) => ({
        fieldId: it.field_id || '', segment: it.segment || '', productId: it.product_id || '', rate: it.rate || '',
        dateOfApplication: (it.date_of_application || '').slice(0, 10),
        groupId: it.group_id || null, isMixtureChild: !!it.is_mixture_child,
        startTime: timeOfDay(it.start_time), endTime: timeOfDay(it.end_time),
        totalProductQty: it.total_product_qty || '', totalWaterQty: it.total_water_qty || '',
        actualQty: it.actual_qty || '', machineryRef: it.machinery_ref || '',
        qualityCheck: !!it.quality_check, completedByName: it.completed_by_name || '',
      })),
    });
    setEditingId(wo.id);
    setDetailDialog({ open: false, wo: null });
    setShowCreate(true);
  };

  const openDetail = async (wo) => {
    try {
      const res = await api.get(`/ipm/work-orders/${wo.id}`);
      const full = res.data?.data;
      setDetailDialog({ open: true, wo: full });
      if (isOperator && ['issued', 'in_progress'].includes(full.status)) {
        setOperatorMode(true);
        setOperatorJustification(full.justification || '');
        setOperatorItems(alignOperatorRows((full.items || []).map((it) => ({
          key: it.id, id: it.id, orig: it,
          fieldId: it.field_id || '', groupId: it.group_id || null,
          isMixtureChild: !!it.is_mixture_child, addedByOperator: !!it.added_by_operator,
          segment: it.segment || '', productId: it.product_id || '', rate: it.rate || '',
          dateOfApplication: (it.date_of_application || '').slice(0, 10),
          startTime: timeOfDay(it.start_time), endTime: timeOfDay(it.end_time),
          totalProductQty: it.total_product_qty || '', totalWaterQty: it.total_water_qty || '',
          actualQty: it.actual_qty || '', machineryRef: it.machinery_ref || '',
          qualityCheck: it.quality_check || false, completedByName: it.completed_by_name || '',
        }))));
        if (full.site_id) {
          const [prodRes, plantRes, fieldsRes] = await Promise.all([
            api.get(`/ipm/pesticide-products/site/${full.site_id}`).catch(() => null),
            api.get(`/planting-records?site_id=${full.site_id}`).catch(() => null),
            api.get(`/ipm/work-orders/${full.id}/fields`).catch(() => null),
          ]);
          setOperatorProducts(prodRes?.data?.data || []);
          setOperatorPlantingRecords(plantRes?.data?.data || plantRes?.data || []);
          setOperatorFields(fieldsRes?.data?.data || []);
        }
      } else { setOperatorMode(false); }
    } catch (err) { notify.error(err.message || 'Failed to load work order'); }
  };

  // Opened from a notification: ?wo=<id> shows that order (the fill form for its operator).
  const [searchParams, setSearchParams] = useSearchParams();
  const linkedWorkOrderId = searchParams.get('wo');
  useEffect(() => {
    if (!linkedWorkOrderId) return;
    openDetail({ id: linkedWorkOrderId });
    const next = new URLSearchParams(searchParams);
    next.delete('wo');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedWorkOrderId]);

  const operatorPayload = () => ({
    items: operatorRowsPayload(operatorItems),
    justification: operatorJustification,
  });

  // Point at the row to fix instead of sending rows the server would refuse.
  const operatorRowsReady = () => {
    const problems = operatorRowProblems(operatorItems);
    if (problems.length === 0) return true;
    const more = problems.length > 1 ? ` (and ${problems.length - 1} more)` : '';
    notify.error(`${problems[0].message}${more}`);
    return false;
  };

  const handleOperatorSave = async () => {
    if (!operatorRowsReady()) return;
    setSaving(true);
    try {
      await api.put(`/ipm/work-orders/${detailDialog.wo.id}/operator-save`, operatorPayload());
      notify.success('Work order saved');
      loadWorkOrders();
      await openDetail(detailDialog.wo);
    } catch (err) { notify.error(err.message || 'Failed to save'); }
    finally { setSaving(false); }
  };

  const handleOperatorSubmit = async () => {
    if (!operatorRowsReady()) return;
    if (!(await confirmAction('Complete this work order and send it to the pest agronomist for approval?'))) return;
    setSubmitting(true);
    try {
      await api.put(`/ipm/work-orders/${detailDialog.wo.id}/operator-submit`, operatorPayload());
      notify.success('Work order submitted for approval');
      refreshOperatorWorkOrderBadgeCount();
      setDetailDialog({ open: false, wo: null }); loadWorkOrders();
    } catch (err) { notify.error(err.message || 'Failed to submit'); }
    finally { setSubmitting(false); }
  };

  const handleApprove = async (id) => {
    try {
      await api.post(`/ipm/work-orders/${id}/approve`);
      notify.success('Work order approved — spray records are approved and count towards PHI');
      setDetailDialog({ open: false, wo: null }); loadWorkOrders();
    } catch (err) { notify.error(err.message || 'Failed to approve'); }
  };

  const handleReject = async () => {
    try {
      await api.post(`/ipm/work-orders/${rejectDialog.id}/reject`, { reason: rejectReason });
      notify.success(rejectDialog.mode === 'cancel'
        ? 'Work order cancelled'
        : 'Work order sent back to the operator');
      setRejectDialog({ open: false, id: null, mode: 'send_back' }); setRejectReason('');
      setDetailDialog({ open: false, wo: null }); loadWorkOrders();
    } catch (err) { notify.error(err.message || 'Failed to reject'); }
  };

  const handleDelete = async (id) => {
    if (!(await confirmAction('Delete this work order?'))) return;
    try { await api.delete(`/ipm/work-orders/${id}`); notify.success('Work order deleted'); loadWorkOrders(); }
    catch (err) { notify.error(err.message || 'Failed to delete'); }
  };

  const handleBulkDelete = async () => {
    const ids = [...selection.selectedIds];
    if (!ids.length) return;
    if (!(await confirmAction(`Delete ${ids.length} selected work order(s)?`))) return;
    const deleted = await deleteIdsSequentially(ids, (id) => api.delete(`/ipm/work-orders/${id}`));
    selection.clear();
    notify.success(`Deleted ${deleted} work order(s)`);
    loadWorkOrders();
  };

  const addItem = () => setForm((p) => ({ ...p, items: [...p.items, emptyItem()] }));
  // Removing a main row removes its mixtures too, so none is left without its main product.
  const removeItem = (idx) => setForm((p) => {
    const gone = new Set([idx, ...mixtureMembers(p.items, idx)]);
    return { ...p, items: p.items.filter((_, i) => !gone.has(i)) };
  });
  const updateItem = (idx, key, value) => {
    setForm((p) => {
      // Times, machinery and completed by are locked on mixtures: they follow the main row.
      if (p.items[idx]?.isMixtureChild && WORK_ORDER_LOCKED_KEYS.includes(key)) return p;
      const items = [...p.items];
      items[idx] = { ...items[idx], [key]: value };
      return { ...p, items: alignMixtures(items, WORK_ORDER_LOCKED_KEYS).rows };
    });
  };
  // From the main row or one of its mixtures: the new mixture goes after the group's last mixture.
  const addMixture = (idx) => {
    if (!canAddMixture(form.items, idx)) return;
    const parent = form.items[idx];
    const groupId = parent.groupId || crypto.randomUUID();
    setForm((p) => {
      const items = [...p.items];
      items[idx] = { ...items[idx], groupId };
      items.splice(mixtureInsertIndex(items, idx), 0, { ...emptyItem(), fieldId: parent.fieldId, segment: parent.segment, dateOfApplication: parent.dateOfApplication, groupId, isMixtureChild: true });
      return { ...p, items: alignMixtures(items, WORK_ORDER_LOCKED_KEYS).rows };
    });
  };
  const updateOperatorItem = (idx, key, value) => {
    setOperatorItems((prev) => updateOperatorRow(prev, idx, key, value));
  };
  // While filling in an issued order the operator may add rows (e.g. the issued pesticide ran short)
  // and mixtures, and remove only the rows he added.
  const addOperatorItemRow = () => {
    const fallbackDate = (detailDialog.wo?.date_issued || '').slice(0, 10);
    setOperatorItems((prev) => addOperatorRow(prev, { key: crypto.randomUUID(), fallbackDate }));
  };
  const addOperatorItemMixture = (idx) => {
    setOperatorItems((prev) => addOperatorMixture(prev, idx, { key: crypto.randomUUID(), newGroupId: crypto.randomUUID() }));
  };
  const removeOperatorItem = (idx) => {
    setOperatorItems((prev) => removeOperatorRow(prev, idx));
  };

  // ─── Render ────────────────────────────────────────────────────────
  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6" fontWeight={600}>Work Orders - Spraying Operation</Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {canManage && <DeleteSelectedButton count={selection.size} onClick={handleBulkDelete} />}
          {canManage && (
          <Button variant="contained" startIcon={<Add />} onClick={() => { setEditingId(null); setForm(emptyForm()); setShowCreate(true); }}>New Work Order</Button>
          )}
        </Box>
      </Box>
      {viewOnly && <Box sx={{ mb: 2 }}><ReadOnlyBanner message="View only — work orders cannot be modified." /></Box>}

      <ToggleButtonGroup value={statusFilter} exclusive onChange={(_, v) => v && setStatusFilter(v)} size="small" sx={{ mb: 2 }}>
        <ToggleButton value="all">All</ToggleButton>
        <ToggleButton value="issued">Issued</ToggleButton>
        <ToggleButton value="completed">Completed</ToggleButton>
        <ToggleButton value="approved">Approved</ToggleButton>
        <ToggleButton value="rejected">Rejected</ToggleButton>
      </ToggleButtonGroup>

      {loading ? <Box sx={{ textAlign: 'center', py: 4 }}><CircularProgress /></Box>
      : workOrders.length === 0 ? <Paper sx={{ p: { xs: 3, sm: 4 }, textAlign: 'center' }}><Typography color="text.secondary">No work orders found</Typography></Paper>
      : (
        <FitTableContainer component={Paper} >
          <Table stickyHeader size="small">
            <TableHead><TableRow>
              {canManage && (
                <SelectAllHeadCell
                  ids={deletableIds}
                  selectedIds={selection.selectedIds}
                  onToggleAll={selection.toggleAll}
                  label="Select all deletable work orders"
                  plain
                />
              )}
              <TableCell sx={{ fontWeight: 700 }}>WO #</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Type</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Justification</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Issued By</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Assigned To</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Items</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
              <TableCell sx={{ fontWeight: 700 }} align="center">Actions</TableCell>
            </TableRow></TableHead>
            <TableBody>
              {workOrders.map((wo) => (
                <TableRow key={wo.id} hover sx={{ cursor: 'pointer' }} onClick={() => openDetail(wo)}>
                  {canManage && (
                    ['draft', 'rejected'].includes(wo.status) ? (
                      <RowSelectCell
                        id={wo.id}
                        selectedIds={selection.selectedIds}
                        onToggle={selection.toggle}
                        label={`Select work order ${wo.work_order_number}`}
                      />
                    ) : (
                      <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()} />
                    )
                  )}
                  <TableCell sx={{ fontWeight: 600 }}>#{wo.work_order_number}</TableCell>
                  <TableCell>{wo.date_issued ? new Date(wo.date_issued).toLocaleDateString() : '-'}</TableCell>
                  <TableCell><Chip label={wo.application_type === 'drench' ? 'Drench' : 'Spray'} size="small" color={wo.application_type === 'drench' ? 'secondary' : 'primary'} variant="outlined" /></TableCell>
                  <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{wo.justification || '-'}</TableCell>
                  <TableCell>{wo.issued_by_name || '-'}</TableCell>
                  <TableCell>{wo.assigned_to_name || '-'}</TableCell>
                  <TableCell align="center">{wo.item_count || 0}</TableCell>
                  <TableCell><Chip label={STATUS_LABELS[wo.status] || wo.status} size="small" color={STATUS_COLORS[wo.status] || 'default'} /></TableCell>
                  <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                    <Tooltip title="View"><IconButton size="small" onClick={() => openDetail(wo)}><Visibility fontSize="small" /></IconButton></Tooltip>
                    <Tooltip title="Print"><IconButton size="small" onClick={() => navigate(`/ipm/work-orders/${wo.id}/print`)}><Print fontSize="small" /></IconButton></Tooltip>
                    {canManage && ['draft', 'rejected'].includes(wo.status) && <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => handleDelete(wo.id)}><Delete fontSize="small" /></IconButton></Tooltip>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </FitTableContainer>
      )}

      {/* ═══════════════ CREATE DIALOG — Paper Template Style ═══════════════ */}
      <Dialog open={showCreate} onClose={closeCreate} maxWidth={false} PaperProps={{ sx: { width: '95vw', maxWidth: 1200 } }}>
        <Box sx={{ p: 2, overflow: 'auto' }}>
          <TemplateSheet
            mode="create"
            form={form} setForm={setForm}
            fields={fields} products={products} operators={operators} plantingRecords={plantingRecords}
            activeSiteName={form.siteName || activeSite?.name || ''}
            addItem={addItem} removeItem={removeItem} updateItem={updateItem} addMixture={addMixture}
          />
        </Box>
        <DialogActions sx={{ px: 2, py: 1.5, borderTop: '1px solid #ddd' }}>
          <Button onClick={closeCreate}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate} disabled={creating}
            startIcon={creating ? <CircularProgress size={16} /> : <Send />}
            sx={{ bgcolor: 'var(--sheet-accent)', '&:hover': { bgcolor: 'var(--sheet-header)' } }}>
            {editingId ? 'Save Changes' : 'Issue Work Order'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ═══════════════ DETAIL / OPERATOR FILL DIALOG ═══════════════ */}
      <Dialog open={detailDialog.open} onClose={() => setDetailDialog({ open: false, wo: null })} maxWidth={false} PaperProps={{ sx: { width: '95vw', maxWidth: 1200 } }}>
        {detailDialog.wo && (() => {
          const wo = detailDialog.wo;
          return (
            <>
              <Box sx={{ p: 2, overflow: 'auto' }}>
                {wo.rejection_reason && wo.status === 'rejected' && <Alert severity="error" sx={{ mb: 1 }}>Rejected / cancelled: {wo.rejection_reason}</Alert>}
                {wo.rejection_reason && ['issued', 'in_progress'].includes(wo.status) && (
                  <Alert severity="warning" sx={{ mb: 1 }}>Sent back by the pest agronomist — please correct and resubmit: {wo.rejection_reason}</Alert>
                )}
                <TemplateSheet
                  mode={operatorMode ? 'operator-fill' : 'view'}
                  wo={wo}
                  operators={operators}
                  products={operatorProducts}
                  plantingRecords={operatorPlantingRecords}
                  fields={operatorFields}
                  onAddOperatorRow={addOperatorItemRow}
                  onAddOperatorMixture={addOperatorItemMixture}
                  onRemoveOperatorRow={removeOperatorItem}
                  operatorItems={operatorItems}
                  updateOperatorItem={updateOperatorItem}
                  operatorJustification={operatorJustification}
                  setOperatorJustification={setOperatorJustification}
                />
              </Box>
              <DialogActions sx={{ px: 2, py: 1.5, borderTop: '1px solid #ddd' }}>
                <Button onClick={() => setDetailDialog({ open: false, wo: null })}>Close</Button>
                <Button variant="outlined" onClick={() => navigate(`/ipm/work-orders/${wo.id}/print`)} startIcon={<Print />}>Print</Button>
                {operatorMode && (
                  <>
                    <Button variant="outlined" onClick={handleOperatorSave}
                      disabled={saving || submitting} startIcon={saving ? <CircularProgress size={16} /> : <Save />}>
                      Save
                    </Button>
                    <Button variant="contained" color="primary" onClick={handleOperatorSubmit}
                      disabled={saving || submitting} startIcon={submitting ? <CircularProgress size={16} /> : <Send />}>
                      Complete &amp; Submit
                    </Button>
                  </>
                )}
                {(canManage || canApprove) && ['draft', 'issued'].includes(wo.status) && (
                  <>
                    {canManage && <Button variant="outlined" onClick={() => openEdit(wo)}>Edit</Button>}
                    {wo.status === 'issued' && (
                      <Button variant="outlined" color="error" onClick={() => setRejectDialog({ open: true, id: wo.id, mode: 'cancel' })}>Cancel Order</Button>
                    )}
                  </>
                )}
                {canApprove && wo.status === 'completed' && (
                  <>
                    <Button variant="outlined" color="error" onClick={() => setRejectDialog({ open: true, id: wo.id, mode: 'send_back' })}>Send Back</Button>
                    <Button variant="contained" color="success" startIcon={<Check />} onClick={() => handleApprove(wo.id)}>Approve</Button>
                  </>
                )}
              </DialogActions>
            </>
          );
        })()}
      </Dialog>

      {/* ═══════════════ REJECT DIALOG ═══════════════ */}
      <Dialog open={rejectDialog.open} onClose={() => setRejectDialog({ open: false, id: null, mode: 'send_back' })} maxWidth="sm" fullWidth>
        <Box sx={{ p: 3 }}>
          <Typography fontWeight={700} sx={{ mb: 1 }}>
            {rejectDialog.mode === 'cancel' ? 'Cancel Work Order' : 'Send Back to Operator'}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {rejectDialog.mode === 'cancel'
              ? 'The order is closed as rejected and the operator is notified. It can then be deleted.'
              : 'The order returns to the operator as issued so they can correct it and submit again.'}
          </Typography>
          <TextField fullWidth multiline rows={3} label="Reason" value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)} />
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 2 }}>
            <Button onClick={() => setRejectDialog({ open: false, id: null, mode: 'send_back' })}>Back</Button>
            <Button variant="contained" color="error" onClick={handleReject} disabled={!rejectReason.trim()}>
              {rejectDialog.mode === 'cancel' ? 'Cancel Order' : 'Send Back'}
            </Button>
          </Box>
        </Box>
      </Dialog>
    </Box>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// TEMPLATE SHEET — looks like the physical paper work order
// ═══════════════════════════════════════════════════════════════════════

function TemplateSheet({ mode, form, setForm, fields, products = [], operators = [], plantingRecords = [], activeSiteName, addItem, removeItem, updateItem, addMixture, wo, operatorItems, updateOperatorItem, operatorJustification = '', setOperatorJustification, onAddOperatorRow, onAddOperatorMixture, onRemoveOperatorRow }) {
  const { user } = useAuth();
  const isCreate = mode === 'create';
  const isOpFill = mode === 'operator-fill';
  // The issuer sets these at issue; the operator may still change them before completing.
  const canEditPlan = isCreate || isOpFill;

  // In operator mode the rows come from the operator's list, so rows he adds show up too
  // (a new row has no saved item, so it renders from an empty one).
  const items = isCreate
    ? (form?.items || [])
    : isOpFill
      ? (operatorItems || []).map((op) => op.orig || { id: op.key })
      : (wo?.items || []);
  const isMixtureRow = (row, i) => (isCreate ? row.isMixtureChild : isOpFill ? operatorItems[i]?.isMixtureChild : row.is_mixture_child);
  // Mixture rows show "+"; the others are numbered 1, 2, 3… without counting mixtures.
  const labels = rowLabels(items, isMixtureRow);
  const emptyRows = Math.max(0, 8 - items.length);

  const siteName = isCreate ? activeSiteName : (wo?.site_name || '');
  const woNumber = isCreate ? 'Auto' : wo?.work_order_number;
  const dateIssued = isCreate ? form.dateIssued : (wo?.date_issued || '');
  const appType = isCreate ? form.applicationType : (wo?.application_type || 'spray');
  const justification = isCreate ? form.justification : (wo?.justification || '');

  return (
    <Box sx={{ fontFamily: 'var(--font-sans, Inter, "IBM Plex Sans Arabic", system-ui, sans-serif)', minWidth: 1000 }}>
      {/* ─── Header ─────────────────────────────────────────────── */}
      <Box sx={{ display: 'flex', border: B }}>
        <Box sx={{ flex: 1, p: '6px 10px', borderRight: B }}>
          <Typography sx={{ fontSize: 13, fontWeight: 900 }}>ELITE AGRO UAE LLC</Typography>
        </Box>
        <Box sx={{ flex: 2, p: '6px 10px', borderRight: B, textAlign: 'center' }}>
          <Typography sx={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.8 }}>
            WORK ORDER - {appType === 'drench' ? 'DRENCH' : 'SPRAYING'} OPERATION
          </Typography>
          {isCreate && (
            <Box sx={{ mt: 0.5 }}>
              <Select size="small" value={form.applicationType} onChange={(e) => setForm((p) => ({ ...p, applicationType: e.target.value }))}
                sx={{ fontSize: '9px', height: 20, '& .MuiSelect-select': { py: 0, fontSize: '9px' } }}>
                <MenuItem value="spray" sx={{ fontSize: '11px' }}>Spray</MenuItem>
                <MenuItem value="drench" sx={{ fontSize: '11px' }}>Drench</MenuItem>
              </Select>
            </Box>
          )}
        </Box>
        <Box sx={{ flex: 1, p: '6px 10px', textAlign: 'right' }}>
          <Typography sx={{ fontSize: 8, color: 'var(--sheet-ink-2)' }}>EAG/AFO/IMS/RC-231</Typography>
          <Typography sx={{ fontSize: 8, color: 'var(--sheet-ink-2)' }}>Issue 03, 17-Sept-2020, Rev00</Typography>
          {wo?.status && <Chip label={STATUS_LABELS[wo.status]} size="small" color={STATUS_COLORS[wo.status]} sx={{ mt: 0.5, height: 18, fontSize: '9px' }} />}
        </Box>
      </Box>

      {/* ─── Meta Row ─────────────────────────────────────────────── */}
      <Box sx={{ display: 'flex', border: B, borderTop: 'none' }}>
        <Box sx={{ flex: 1, p: '4px 8px', borderRight: B }}>
          <Typography sx={{ fontSize: 7, color: 'var(--sheet-ink-2)', fontWeight: 600 }}>Work Order Number</Typography>
          <Typography sx={{ fontSize: 12, fontWeight: 700 }}>{woNumber}</Typography>
        </Box>
        <Box sx={{ flex: 1, p: '4px 8px', borderRight: B }}>
          <Typography sx={{ fontSize: 7, color: 'var(--sheet-ink-2)', fontWeight: 600 }}>Date (work order issue date)</Typography>
          {isCreate ? (
            <TextField type="date" size="small" value={form.dateIssued}
              onChange={(e) => setForm((p) => ({ ...p, dateIssued: e.target.value }))}
              sx={{ ...inpSx, mt: '2px' }} />
          ) : (
            <Typography sx={{ fontSize: 11, fontWeight: 700 }}>{dateIssued ? new Date(dateIssued).toLocaleDateString('en-GB') : '-'}</Typography>
          )}
        </Box>
        <Box sx={{ flex: 2, p: '4px 8px' }}>
          <Typography sx={{ fontSize: 7, color: 'var(--sheet-ink-2)', fontWeight: 600 }}>Operation Site/Farm</Typography>
          <Typography sx={{ fontSize: 11, fontWeight: 700 }}>{siteName || '-'}</Typography>
        </Box>
      </Box>

      {/* ─── Sub-header ───────────────────────────────────────────── */}
      <Box sx={{ bgcolor: headerBg, border: B, borderTop: 'none', p: '3px 8px' }}>
        <Typography sx={{ fontSize: 9, fontWeight: 700 }}>Work order - Authorization of application</Typography>
        {canEditPlan && (
          <Typography sx={{ fontSize: 8, color: 'var(--sheet-ink-2)' }}>
            {isCreate
              ? 'Start Time and End Time are optional — give the operator the date to spray.'
              : 'You can change the segment, pesticide, rate, date and justification before completing. Start Time and End Time are optional.'}
          </Typography>
        )}
      </Box>

      {/* ─── Column Headers ───────────────────────────────────────── */}
      <Box sx={{ display: 'flex', bgcolor: headerBg, border: B, borderTop: 'none' }}>
        <HC w={36} text="S.No." />
        <HC w={100} text="Field ID (GH/NH/OF)" />
        <HC w={80} text="Segment (Valve/Bay)" />
        <HC w={110} text="Pesticide (PPP)" />
        <HC w={55} text="Rate" />
        <HC w={80} text="Date of application" />
        <HC w={90} text="Justification" />
        <HC w={32} text="PHI" />
        <HC w={55} text="Start Time" />
        <HC w={55} text="End Time" />
        <HC w={65} text="Total Qty Product (ml)" />
        <HC w={65} text="Total Qty Water (L)" />
        <HC w={45} text="Actual" />
        <HC w={60} text="Machinery (Ref No.)" />
        <HC w={40} text="QC (Y)" />
        <HC w={80} text="Completed by" last />
      </Box>

      {/* ─── Data Rows ────────────────────────────────────────────── */}
      {items.map((item, idx) => {
        const rowNum = labels[idx];
        const opItem = operatorItems?.[idx];
        // Mixture rows show the main row's start / end time, machinery and completed by, locked.
        const lockedMix = (isCreate || isOpFill) && isMixtureRow(item, idx);
        const editShared = (isCreate || isOpFill) && !lockedMix;
        const liveValue = (key) => (isCreate ? item[key] : opItem?.[key]) || '';
        const lockedCell = (key) => (
          <Tooltip title="Same as the main row">
            <Typography sx={{ fontSize: 9, color: 'var(--sheet-ink-2)' }}>{liveValue(key) || '–'}</Typography>
          </Tooltip>
        );
        const isAddedRow = isOpFill ? !!opItem?.addedByOperator : !!item.added_by_operator;
        const isNewRow = isOpFill && !opItem?.id;
        const planValue = (key) => (isCreate ? item[key] : opItem?.[key]) || '';
        const setPlan = (key, value) => (isCreate ? updateItem(idx, key, value) : updateOperatorItem(idx, key, value));
        // Keep the issued pesticide selectable even if it is no longer on the site list.
        const productOptions = isOpFill && item.product_id && !products.some((p) => p.id === item.product_id)
          ? [...products, { id: item.product_id, name: item.product_name || 'Current pesticide', phi_days: item.phi_days }]
          : products;
        const selectedProductId = planValue('productId');

        return (
          <Box key={isCreate ? idx : (opItem?.key || item.id)} sx={{ display: 'flex', border: B, borderTop: 'none', minHeight: 26, bgcolor: isAddedRow ? '#fff8e1' : undefined, '&:hover': { bgcolor: '#fafff8' } }}>
            {/* S.No */}
            <DC w={36}>
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <Typography sx={{ fontSize: 9, fontWeight: 600 }}>{rowNum}</Typography>
                  {isCreate && canAddMixture(form.items, idx) && (
                    <Tooltip title={item.isMixtureChild ? `Add another mixture (up to ${MAX_PRODUCTS_PER_MIXTURE} products)` : 'Add mixture'}><IconButton size="small" sx={{ p: 0, ml: '2px' }} onClick={() => addMixture(idx)}><Add sx={{ fontSize: 12 }} /></IconButton></Tooltip>
                  )}
                  {isOpFill && canAddMixture(operatorItems, idx) && (
                    <Tooltip title={opItem?.isMixtureChild ? `Add another mixture (up to ${MAX_PRODUCTS_PER_MIXTURE} products)` : 'Add mixture'}><IconButton size="small" sx={{ p: 0, ml: '2px' }} onClick={() => onAddOperatorMixture(idx)}><Add sx={{ fontSize: 12 }} /></IconButton></Tooltip>
                  )}
                  {isOpFill && isAddedRow && (
                    <Tooltip title="Remove this row"><IconButton size="small" sx={{ p: 0 }} onClick={() => onRemoveOperatorRow(idx)}><Close sx={{ fontSize: 11, color: '#c00' }} /></IconButton></Tooltip>
                  )}
                </Box>
                {isAddedRow && (
                  <Tooltip title="Added by operator"><Typography sx={{ fontSize: 6.5, fontWeight: 700, color: '#a84b07', lineHeight: 1 }}>ADDED</Typography></Tooltip>
                )}
              </Box>
            </DC>

            {/* Field ID — chosen at issue; the operator picks it only for rows he adds */}
            <DC w={100}>
              {(isCreate || isNewRow) ? (
                <Select size="small" fullWidth value={isCreate ? item.fieldId : (opItem?.fieldId || '')} displayEmpty
                  disabled={isNewRow && opItem?.isMixtureChild}
                  onChange={(e) => setPlan('fieldId', e.target.value)} sx={{ ...inpSx['& .MuiInputBase-root'], fontSize: '9px', height: 22, '& .MuiSelect-select': { p: '2px 4px', fontSize: '9px' }, '& .MuiOutlinedInput-notchedOutline': { border: 'none' } }}>
                  <MenuItem value="" disabled sx={{ fontSize: '10px' }}>-</MenuItem>
                  {fields.map((f) => <MenuItem key={f.id} value={f.id} sx={{ fontSize: '10px' }}>{f.name}</MenuItem>)}
                </Select>
              ) : <Typography sx={{ fontSize: 9 }}>{item.field_name || ''}</Typography>}
            </DC>

            {/* Segment (Valve/Bay) */}
            <DC w={80}>
              {canEditPlan ? (
                <SegmentSelector compact
                  value={planValue('segment')}
                  fieldId={isCreate ? item.fieldId : (opItem?.fieldId || item.field_id)}
                  plantingRecords={plantingRecords}
                  onChange={(v) => setPlan('segment', v)} />
              ) : <Typography sx={{ fontSize: 9 }}>{item.segment === 'ALL' ? 'Entire Field' : (item.segment || '')}</Typography>}
            </DC>

            {/* Pesticide */}
            <DC w={110}>
              {canEditPlan ? (
                <Select size="small" fullWidth value={selectedProductId} displayEmpty onChange={(e) => setPlan('productId', e.target.value)} sx={{ fontSize: '9px', height: 22, '& .MuiSelect-select': { p: '2px 4px', fontSize: '9px' }, '& .MuiOutlinedInput-notchedOutline': { border: 'none' } }}>
                  <MenuItem value="" disabled sx={{ fontSize: '10px' }}>-</MenuItem>
                  {productOptions.map((p) => <MenuItem key={p.id} value={p.id} sx={{ fontSize: '10px' }}>{p.name}</MenuItem>)}
                </Select>
              ) : <Typography sx={{ fontSize: 9 }}>{item.product_name || ''}</Typography>}
            </DC>

            {/* Rate */}
            <DC w={55}>
              {canEditPlan ? (
                <TextField size="small" fullWidth value={planValue('rate')} placeholder="0.5ml"
                  onChange={(e) => setPlan('rate', e.target.value)} sx={inpSx} />
              ) : <Typography sx={{ fontSize: 9 }}>{item.rate || ''}</Typography>}
            </DC>

            {/* Date */}
            <DC w={80}>
              {canEditPlan ? (
                <TextField size="small" type="date" fullWidth value={planValue('dateOfApplication')}
                  onChange={(e) => setPlan('dateOfApplication', e.target.value)} sx={inpSx} />
              ) : <Typography sx={{ fontSize: 9 }}>{item.date_of_application ? new Date(item.date_of_application).toLocaleDateString('en-GB') : ''}</Typography>}
            </DC>

            {/* Justification (only first row shows it) */}
            <DC w={90}>
              {canEditPlan ? (
                idx === 0 ? (
                  <Select size="small" fullWidth displayEmpty
                    value={isCreate ? form.justification : operatorJustification}
                    onChange={(e) => (isCreate
                      ? setForm((p) => ({ ...p, justification: e.target.value }))
                      : setOperatorJustification(e.target.value))}
                    sx={{ fontSize: '8px', height: 22, '& .MuiSelect-select': { p: '2px 4px', fontSize: '8px' }, '& .MuiOutlinedInput-notchedOutline': { border: 'none' } }}>
                    <MenuItem value="" disabled sx={{ fontSize: '10px' }}>-</MenuItem>
                    {[...JUSTIFICATION_PRESETS, ...(isOpFill && justification && !JUSTIFICATION_PRESETS.includes(justification) ? [justification] : [])]
                      .map((j) => <MenuItem key={j} value={j} sx={{ fontSize: '10px' }}>{j}</MenuItem>)}
                  </Select>
                ) : <Typography sx={{ fontSize: 9, color: 'var(--sheet-ink-3)' }}>"</Typography>
              ) : <Typography sx={{ fontSize: 9 }}>{idx === 0 ? justification : '"'}</Typography>}
            </DC>

            {/* PHI */}
            <DC w={32}>
              <Typography sx={{ fontSize: 9 }}>
                {isOpFill && selectedProductId === item.product_id
                  ? (item.phi_days ?? '')
                  : canEditPlan
                    ? (selectedProductId ? (productOptions.find(p => p.id === selectedProductId)?.phi_days ?? '-') : '-')
                    : (item.phi_days ?? '')}
              </Typography>
            </DC>

            {/* Start Time */}
            <DC w={55}>
              {lockedMix ? lockedCell('startTime') : editShared ? (
                <TextField size="small" type="time" fullWidth
                  value={isCreate ? (item.startTime || '') : (opItem?.startTime || '')}
                  onChange={(e) => isCreate ? updateItem(idx, 'startTime', e.target.value) : updateOperatorItem(idx, 'startTime', e.target.value)}
                  sx={inpSx} InputLabelProps={{ shrink: true }} />
              ) : <Typography sx={{ fontSize: 9 }}>{timeOfDay(item.start_time)}</Typography>}
            </DC>

            {/* End Time */}
            <DC w={55}>
              {lockedMix ? lockedCell('endTime') : editShared ? (
                <TextField size="small" type="time" fullWidth
                  value={isCreate ? (item.endTime || '') : (opItem?.endTime || '')}
                  onChange={(e) => isCreate ? updateItem(idx, 'endTime', e.target.value) : updateOperatorItem(idx, 'endTime', e.target.value)}
                  sx={inpSx} InputLabelProps={{ shrink: true }} />
              ) : <Typography sx={{ fontSize: 9 }}>{timeOfDay(item.end_time)}</Typography>}
            </DC>

            {/* Total Qty Product */}
            <DC w={65}>
              {(isCreate || isOpFill) ? (
                <TextField size="small" type="number" fullWidth placeholder="ml"
                  value={isCreate ? (item.totalProductQty || '') : (opItem?.totalProductQty || '')}
                  onChange={(e) => isCreate ? updateItem(idx, 'totalProductQty', e.target.value) : updateOperatorItem(idx, 'totalProductQty', e.target.value)}
                  sx={inpSx} />
              ) : <Typography sx={{ fontSize: 9 }}>{item.total_product_qty || ''}</Typography>}
            </DC>

            {/* Total Qty Water */}
            <DC w={65}>
              {(isCreate || isOpFill) ? (
                <TextField size="small" type="number" fullWidth placeholder="L"
                  value={isCreate ? (item.totalWaterQty || '') : (opItem?.totalWaterQty || '')}
                  onChange={(e) => isCreate ? updateItem(idx, 'totalWaterQty', e.target.value) : updateOperatorItem(idx, 'totalWaterQty', e.target.value)}
                  sx={inpSx} />
              ) : <Typography sx={{ fontSize: 9 }}>{item.total_water_qty || ''}</Typography>}
            </DC>

            {/* Actual */}
            <DC w={45}>
              {(isCreate || isOpFill) ? (
                <TextField size="small" type="number" fullWidth
                  value={isCreate ? (item.actualQty || '') : (opItem?.actualQty || '')}
                  onChange={(e) => isCreate ? updateItem(idx, 'actualQty', e.target.value) : updateOperatorItem(idx, 'actualQty', e.target.value)}
                  sx={inpSx} />
              ) : <Typography sx={{ fontSize: 9 }}>{item.actual_qty || ''}</Typography>}
            </DC>

            {/* Machinery */}
            <DC w={60}>
              {lockedMix ? lockedCell('machineryRef') : editShared ? (
                <TextField size="small" fullWidth
                  value={isCreate ? (item.machineryRef || '') : (opItem?.machineryRef || '')}
                  onChange={(e) => isCreate ? updateItem(idx, 'machineryRef', e.target.value) : updateOperatorItem(idx, 'machineryRef', e.target.value)}
                  sx={inpSx} />
              ) : <Typography sx={{ fontSize: 9 }}>{item.machinery_ref || ''}</Typography>}
            </DC>

            {/* Quality Check */}
            <DC w={40}>
              {(isCreate || isOpFill) ? (
                <Checkbox slotProps={{ input: { 'aria-label': 'Select' } }} size="small"
                  checked={isCreate ? (item.qualityCheck || false) : (opItem?.qualityCheck || false)}
                  onChange={(e) => isCreate ? updateItem(idx, 'qualityCheck', e.target.checked) : updateOperatorItem(idx, 'qualityCheck', e.target.checked)}
                  sx={{ p: 0, '& .MuiSvgIcon-root': { fontSize: 14 } }} />
              ) : <Typography sx={{ fontSize: 9 }}>{item.quality_check ? '\u2713' : ''}</Typography>}
            </DC>

            {/* Completed by */}
            <DC w={80} last>
              {lockedMix ? lockedCell('completedByName') : editShared ? (
                <Select size="small" fullWidth displayEmpty
                  value={isCreate ? (item.completedByName || '') : (opItem?.completedByName || '')}
                  onChange={(e) => isCreate ? updateItem(idx, 'completedByName', e.target.value) : updateOperatorItem(idx, 'completedByName', e.target.value)}
                  sx={{ fontSize: '9px', height: 22, '& .MuiSelect-select': { p: '2px 4px', fontSize: '9px' }, '& .MuiOutlinedInput-notchedOutline': { border: 'none' } }}>
                  <MenuItem value="" sx={{ fontSize: '10px' }}>-</MenuItem>
                  {operators.map((op) => <MenuItem key={op.id} value={op.name} sx={{ fontSize: '10px' }}>{op.name}</MenuItem>)}
                </Select>
              ) : <Typography sx={{ fontSize: 9 }}>{item.completed_by_name || ''}</Typography>}
            </DC>

            {/* Remove button (create mode only) */}
            {isCreate && form.items.length > 1 && (
              <Box sx={{ position: 'absolute', right: -20, top: 3 }}>
                <IconButton size="small" onClick={() => removeItem(idx)} sx={{ p: 0 }} aria-label="Close"><Close sx={{ fontSize: 12, color: '#c00' }} /></IconButton>
              </Box>
            )}
          </Box>
        );
      })}

      {/* Empty rows */}
      {Array.from({ length: emptyRows }).map((_, idx) => (
        <Box key={`e-${idx}`} sx={{ display: 'flex', border: B, borderTop: 'none', minHeight: 22 }}>
          <DC w={36} /><DC w={100} /><DC w={80} /><DC w={110} /><DC w={55} /><DC w={80} />
          <DC w={90} /><DC w={32} /><DC w={55} /><DC w={55} /><DC w={65} /><DC w={65} />
          <DC w={45} /><DC w={60} /><DC w={40} /><DC w={80} last />
        </Box>
      ))}

      {/* Add Row button — the operator may add another application (e.g. the issued pesticide ran short) */}
      {(isCreate || isOpFill) && (
        <Box sx={{ borderLeft: B, borderRight: B, borderBottom: B, p: '4px 8px', textAlign: 'center' }}>
          <Button size="small" startIcon={<Add sx={{ fontSize: 12 }} />} onClick={isCreate ? addItem : onAddOperatorRow}
            sx={{ fontSize: '9px', textTransform: 'none', py: 0 }}>
            {isCreate ? 'Add Row' : 'Add application row'}
          </Button>
        </Box>
      )}

      {/* ─── Bottom: Instructions + Authorization ─────────────────── */}
      <Box sx={{ display: 'flex', border: B, borderTop: (isCreate || isOpFill) ? 'none' : B, mt: (isCreate || isOpFill) ? 0 : 1, minHeight: 140 }}>
        {/* Left: Important Instructions */}
        <Box sx={{ flex: 1, borderRight: B, p: '6px 8px' }}>
          <Typography sx={{ fontSize: 9, fontWeight: 800, mb: 0.5, textDecoration: 'underline' }}>IMPORTANT INSTRUCTIONS</Typography>
          <Typography sx={{ fontSize: 7.5, whiteSpace: 'pre-line', lineHeight: 1.5, color: '#333' }}>
{`1. The above label instruction is followed - The recommended rates are complied.
2. The safe time label instruction is followed.
3. All labourers are wearing all required PPEs (Overall, Respiratory, Safety boots, Goggles/face shield and rubber gloves).
4. Uniform walking/driving speed is followed and full canopy is covered/spot treatment is done as per the instruction.
5. Empty containers, hoses covered and caps are put on for storage.
6. The tankers, hoses, filters and nozzles are checked for appropriateness/applicability and are used for operation.
7. PPEs, spray machines are cleaned and stored in the designated storage area.
8. Containers are triple rinsed and returned or stored in the designated storage area.`}
          </Typography>
        </Box>

        {/* Right: Authorization & Completion */}
        <Box sx={{ flex: 1, p: '6px 8px' }}>
          <Typography sx={{ fontSize: 9, fontWeight: 800, mb: 1, textDecoration: 'underline' }}>AUTHORIZATION &amp; COMPLETION</Typography>

          <AuthLine label="Work Order Given by">
            {isCreate ? <Typography sx={{ fontSize: 10, fontWeight: 600 }}>{user?.name || '-'}</Typography>
            : <Typography sx={{ fontSize: 10, fontWeight: 600 }}>{wo?.issued_by_name || '-'}</Typography>}
          </AuthLine>

          <AuthLine label="Work Order Given to">
            {isCreate ? (
              <Select size="small" fullWidth value={form.assignedTo} displayEmpty
                onChange={(e) => setForm((p) => ({ ...p, assignedTo: e.target.value }))}
                sx={{ fontSize: '9px', height: 22, '& .MuiSelect-select': { p: '2px 4px', fontSize: '9px' }, '& .MuiOutlinedInput-notchedOutline': { border: 'none' } }}>
                <MenuItem value="" disabled sx={{ fontSize: '10px' }}>Select operator</MenuItem>
                {operators.filter((op) => op.role === 'operator').map((op) => <MenuItem key={op.id} value={op.id} sx={{ fontSize: '10px' }}>{op.name}</MenuItem>)}
              </Select>
            ) : <Typography sx={{ fontSize: 10, fontWeight: 600 }}>{wo?.assigned_to_name || '-'}</Typography>}
          </AuthLine>

          <AuthLine label="Work Order Completed by">
            <Typography sx={{ fontSize: 10, fontWeight: 600 }}>{isCreate ? '-' : (wo?.completed_by_name_user || '-')}</Typography>
          </AuthLine>

          {!isCreate && wo?.completed_at && (
            <Typography sx={{ fontSize: 8, color: 'var(--sheet-ink-2)', mt: 0.5 }}>Completed: {new Date(wo.completed_at).toLocaleString()}</Typography>
          )}
          {!isCreate && wo?.approved_by_name && (
            <Typography sx={{ fontSize: 8, color: 'var(--sheet-ink-2)', mt: 0.3 }}>Approved by: {wo.approved_by_name} ({new Date(wo.approved_at).toLocaleString()})</Typography>
          )}
        </Box>
      </Box>
    </Box>
  );
}

// ─── Helper Components ──────────────────────────────────────────────

function HC({ w, text, last }) {
  return (
    <Box sx={{ width: w, minWidth: w, borderRight: last ? 'none' : B, p: '2px 3px', display: 'flex', alignItems: 'center' }}>
      <Typography sx={{ fontSize: 7, fontWeight: 700, lineHeight: 1.2 }}>{text}</Typography>
    </Box>
  );
}

function DC({ w, children, last, gray }) {
  return (
    <Box sx={{
      width: w, minWidth: w, borderRight: last ? 'none' : B,
      p: '1px 3px', display: 'flex', alignItems: 'center', position: 'relative',
      bgcolor: gray ? '#f5f5f5' : 'transparent',
    }}>
      {children}
    </Box>
  );
}

function AuthLine({ label, children }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.8, borderBottom: '1px solid #bbb', pb: 0.5 }}>
      <Typography sx={{ fontSize: 8, color: 'var(--sheet-ink-2)', minWidth: 120, flexShrink: 0 }}>{label}:</Typography>
      <Box sx={{ flex: 1 }}>{children}</Box>
      <Box sx={{ width: 80, borderBottom: '1px solid #999', textAlign: 'center' }}>
        <Typography sx={{ fontSize: 7, color: '#888' }}>Signature</Typography>
      </Box>
    </Box>
  );
}

