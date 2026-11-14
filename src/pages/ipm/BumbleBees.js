import { useState, useEffect, useCallback, useMemo } from 'react';
import FitTableContainer from '../../components/table/FitTableContainer';
import { confirmAction } from '../../components/ConfirmDialog';
import { useNavigate } from 'react-router-dom';
import { computeBumbleBeeSummary, formatLastDeployDate } from '../../utils/bumbleBeeSummary';
import {
  Box, Typography, Paper, Table, TableBody, TableCell, TableHead, TableRow,
  Button, TextField, MenuItem, Chip,
  CircularProgress, Grid, FormControl, Select, Tabs, Tab, Alert, Card, CardContent,
  IconButton, Tooltip, Dialog, DialogTitle, DialogContent, DialogActions,
} from '@mui/material';
import { CheckOutlined as Check, DeleteOutlined as Delete, AddCircleOutlineOutlined as AddCircleOutline,} from '@mui/icons-material';
import api from '../../utils/api';
import { useActiveSite } from '../../contexts/ActiveSiteContext';
import { useNotification } from '../../contexts/NotificationContext';
import useOpsExcelExport from '../../hooks/useOpsExcelExport';
import { OPS_EXPORT } from '../../utils/companyExcelExport';
import { buildBumbleBeesSheets } from '../../utils/bumbleBeesExcelExport';
import ReadOnlyBanner from '../../components/ReadOnlyBanner';
import { canCreateBumbleBeeInspection } from '../../utils/roleAccess';
import { canManageBumbleBees, canProposeBumbleBees } from '../../utils/ipmAccess';
import {
  ENTITY_BUMBLE_BEE_BOX_INSPECTION,
  ENTITY_BUMBLE_BEE_DEPLOYMENT,
  ENTITY_BUMBLE_BEE_INVENTORY,
  ENTITY_BUMBLE_BEE_ORDER,
  bumbleBeeProposalTitle,
  changeRequestChangeLines,
} from '../../utils/changeRequestAccess';
import { sumInspectionBuckets, sumInspectionFromDb, deployTotalOnField, buildInspectionPayloadFromDraft, buildInspectionPayloadFromRow, inspectionPayloadsEqual, diffInspectionChangeRequest } from '../../utils/bumbleBeeInspection';
import { refreshChangeRequestBadgeCount } from '../../hooks/useChangeRequestBadgeCount';
import { useAuth } from '../../contexts/AuthContext';
import { useActiveSeason } from '../../contexts/ActiveSeasonContext';
import { excelTableSx, freezeColumnsSx, GutterCell, GUTTER_WIDTH } from '../../components/table/ExcelTable';
import { DeleteSelectedButton, RowCheckbox, SelectAllCheckbox, deleteIdsSequentially } from '../../components/table/BulkSelect';
import { useRowSelection } from '../../hooks/useRowSelection';
import InfoNote from '../../components/InfoNote';
import PageTitle from '../../components/PageTitle';
import ExportButton from '../../components/ExportButton';

function TabPanel({ children, value, index }) {
  if (value !== index) return null;
  return <Box sx={{ pt: 2 }}>{children}</Box>;
}

const CELL = { sx: { verticalAlign: 'middle' } };

/**
 * Row state for the rows being edited: yellow while a draft is unsaved, amber
 * while a delivery is pending.
 *
 * Painted from the table rather than on each cell for two reasons. The hover
 * rule in excelTableSx matches at the same weight, so cell-level colour would
 * grey out the moment the mouse crossed a row someone was typing into; and the
 * frozen columns carry their own background, which a row-level colour would
 * not reach.
 */
const rowStateSx = {
  '&&& .MuiTableBody-root .MuiTableRow-root.row-draft .MuiTableCell-root:not(.table-gutter)': {
    backgroundColor: 'var(--sheet-tint-yellow)',
  },
  '&&& .MuiTableBody-root .MuiTableRow-root.row-pending .MuiTableCell-root:not(.table-gutter)': {
    backgroundColor: 'var(--sheet-tint-yellow)',
  },
};

// Field and the date answer "which visit am I reading" once the strength
// columns have scrolled the rest away. They start after the gutter.
const VISIT_FROZEN_WIDTHS = [150, 120];
const TABLE_MAX_HEIGHT = 'calc(100vh - 320px)';

function emptyDraftRow() {
  return {
    _key: `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    fieldId: '',
    datePlaced: new Date().toISOString().split('T')[0],
    boxesBefore: '',
    boxesRemoved: '0',
    boxesAdded: '',
    notes: '',
    lastForField: null,
    saving: false,
    error: '',
  };
}

function calcTotalOnField(row) {
  const before = Number(row.boxesBefore) || 0;
  const removed = Number(row.boxesRemoved) || 0;
  const added = Number(row.boxesAdded) || 0;
  return before - removed + added;
}

function calcDaysSinceLast(lastRecord, datePlaced) {
  if (!lastRecord?.date_placed || !datePlaced) return null;
  const prev = new Date(String(lastRecord.date_placed).split('T')[0]);
  const cur = new Date(datePlaced);
  const diff = Math.round((cur - prev) / 86400000);
  return diff >= 0 ? diff : null;
}

function formatDateCell(value) {
  if (!value) return '—';
  return new Date(String(value).split('T')[0]).toLocaleDateString();
}

/** A scouter's write comes back as "sent for approval" instead of the saved record. */
function isPendingApproval(res) {
  return Boolean(res?.data?.data?.pendingApproval);
}

function errorMessage(err, fallback) {
  return err?.message || fallback;
}

/** What a proposal would change, as short lines (inspections use the inspection diff). */
function proposalLines(req) {
  if (req.entityType === ENTITY_BUMBLE_BEE_BOX_INSPECTION) {
    if (req.action === 'delete') return ['Delete this inspection'];
    return diffInspectionChangeRequest(req.snapshotBefore, req.proposedPayload)
      .map((c) => `${c.label}: ${c.before} → ${c.after}`);
  }
  return changeRequestChangeLines(req);
}

/**
 * Proposals waiting for the pest agronomist and the scouter's own rejected ones,
 * shown above the tabs. Rejected ones carry the reviewer's reason and a
 * "Correct & resubmit" button that reopens the change pre-filled.
 */
function ProposalPanel({ pending, rejected, canReview, onReview, onResubmit }) {
  if (!pending.length && !rejected.length) return null;
  return (
    <Box sx={{ mb: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
      {pending.length > 0 && (
        <Alert
          severity="warning"
          action={canReview ? (
            <Button color="inherit" size="small" onClick={onReview}>Review</Button>
          ) : null}
        >
          <strong>
            {pending.length} change{pending.length === 1 ? '' : 's'} pending approval
          </strong>
          {' — not applied until the pest agronomist approves.'}
          {pending.slice(0, 6).map((req) => (
            <Typography key={req.id} variant="body2" sx={{ mt: 0.5 }}>
              {bumbleBeeProposalTitle(req)}
              {proposalLines(req).length ? ` — ${proposalLines(req).join('; ')}` : ''}
              {req.requestedByName ? ` (${req.requestedByName})` : ''}
            </Typography>
          ))}
          {pending.length > 6 && (
            <Typography variant="body2" sx={{ mt: 0.5 }}>+{pending.length - 6} more</Typography>
          )}
        </Alert>
      )}
      {rejected.map((req) => (
        <Alert
          key={req.id}
          severity="error"
          action={(
            <Button color="inherit" size="small" onClick={() => onResubmit(req)}>
              Correct &amp; resubmit
            </Button>
          )}
        >
          <strong>Rejected: {bumbleBeeProposalTitle(req)}</strong>
          {proposalLines(req).length ? ` — ${proposalLines(req).join('; ')}` : ''}
          <Typography variant="body2" sx={{ mt: 0.5 }}>
            Reason: {req.reviewerComment || 'No reason given'}
            {req.reviewedByName ? ` (${req.reviewedByName})` : ''}
          </Typography>
        </Alert>
      ))}
    </Box>
  );
}

function emptyInspectionDraftRow() {
  return {
    _key: `insp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    fieldId: '',
    inspectionDate: new Date().toISOString().split('T')[0],
    boxes100: '0',
    boxes80: '0',
    boxes60: '0',
    boxes40: '0',
    boxes20: '0',
    boxes0: '0',
    notes: '',
    deployTotal: null,
    saving: false,
    error: '',
  };
}

function emptyOrderDraftRow() {
  const today = new Date().toISOString().split('T')[0];
  return {
    _key: `ord-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    quantityExpected: '',
    orderDate: today,
    expectedDeliveryDate: '',
    notes: '',
    saving: false,
    error: '',
  };
}

function SpreadsheetInput({ value, onChange, type = 'text', inputProps, error, sx }) {
  return (
    <TextField
      size="small"
      variant="standard"
      fullWidth
      type={type}
      value={value}
      onChange={onChange}
      error={error}
      InputProps={{ disableUnderline: false, sx: { fontSize: '0.6875rem', ...sx } }}
      inputProps={inputProps}
    />
  );
}

export default function BumbleBees() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { isSeasonReadOnly } = useActiveSeason();
  // This page decides for itself (the IPM view-only list includes the scouter):
  // pest agronomist / IPM admin write live, the scouter's changes wait for
  // approval, everyone else watches. A closed season locks everyone.
  const canLiveEdit = canManageBumbleBees(user) && !isSeasonReadOnly;
  const canPropose = canProposeBumbleBees(user) && !isSeasonReadOnly;
  const readOnly = !canLiveEdit && !canPropose;
  const canCreateInspection = canCreateBumbleBeeInspection(user);
  const currentUserId = user?.id || user?.userId;
  const { activeSiteId } = useActiveSite();
  const notify = useNotification();
  const exportOpsExcel = useOpsExcelExport();
  const [tab, setTab] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [deployments, setDeployments] = useState([]);
  const [fields, setFields] = useState([]);
  const [inventory, setInventory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [draftRows, setDraftRows] = useState([]);
  const [saveToast, setSaveToast] = useState('');

  const [onHandInput, setOnHandInput] = useState('');
  const [savingInventory, setSavingInventory] = useState(false);
  const [incomingOrders, setIncomingOrders] = useState([]);
  const [orderDraftRows, setOrderDraftRows] = useState([]);
  const [pendingLocal, setPendingLocal] = useState({});
  const [inspections, setInspections] = useState([]);
  const [inspectionDraftRows, setInspectionDraftRows] = useState([]);
  const [inspectionEditId, setInspectionEditId] = useState(null);
  const [inspectionEditDraft, setInspectionEditDraft] = useState(null);
  const [inspectionEditPurpose, setInspectionEditPurpose] = useState(null);
  const [inspectionEditOriginal, setInspectionEditOriginal] = useState(null);
  const [inspectionProposalSaved, setInspectionProposalSaved] = useState(false);
  const [inspChangeDialog, setInspChangeDialog] = useState({ open: false, action: 'update', insp: null });
  const [inspChangeReason, setInspChangeReason] = useState('');
  const [inspChangeSubmitting, setInspChangeSubmitting] = useState(false);
  // Pending proposals of the site + the caller's own rejected ones (GET /bumble-bees/proposals).
  const [proposals, setProposals] = useState([]);
  // Which rejected request a correction replaces (sent as resubmitOf).
  const [inventoryResubmitOf, setInventoryResubmitOf] = useState(null);
  const [inspResubmitOf, setInspResubmitOf] = useState(null);
  const inspectionSelection = useRowSelection();

  const pendingProposals = useMemo(() => proposals.filter((p) => p.status === 'pending'), [proposals]);
  const rejectedProposals = useMemo(
    () => proposals.filter((p) => p.status === 'rejected' && p.requestedBy === currentUserId),
    [proposals, currentUserId],
  );
  /** Pending request per existing record (inspection, order, deployment). */
  const pendingByEntity = useMemo(() => {
    const map = {};
    pendingProposals.forEach((p) => { if (p.entityId) map[p.entityId] = p; });
    return map;
  }, [pendingProposals]);
  const pendingDeploymentCreates = pendingProposals.filter(
    (p) => p.entityType === ENTITY_BUMBLE_BEE_DEPLOYMENT && p.action === 'create',
  );
  const pendingOrderCreates = pendingProposals.filter(
    (p) => p.entityType === ENTITY_BUMBLE_BEE_ORDER && p.action === 'create',
  );
  const pendingInventorySet = pendingProposals.find((p) => p.entityType === ENTITY_BUMBLE_BEE_INVENTORY);

  const siteParam = activeSiteId ? `site_id=${activeSiteId}` : '';

  const loadData = useCallback(async () => {
    if (!activeSiteId) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const [depRes, fieldRes, invRes, ordRes, inspRes, propRes] = await Promise.all([
        api.get(`/ipm/bumble-bees?limit=500&${siteParam}`),
        api.get(`/fields?limit=10000&${siteParam}`),
        api.get(`/ipm/bumble-bees/inventory?${siteParam}`),
        api.get(`/ipm/bumble-bees/incoming-orders?${siteParam}`),
        api.get(`/ipm/bumble-bees/inspections?${siteParam}`),
        // One call for every proposal the page highlights (replaces a lookup per inspection).
        api.get(`/ipm/bumble-bees/proposals?${siteParam}`).catch(() => ({ data: { data: [] } })),
      ]);
      setDeployments(depRes.data.data || []);
      setFields(fieldRes.data.data || []);
      setInventory(invRes.data.data || null);
      setOnHandInput(String(invRes.data.data?.quantityOnHand ?? 0));
      setInventoryResubmitOf(null);
      setInspections(inspRes.data.data || []);
      setProposals(propRes.data.data || []);
      const orders = ordRes.data.data || [];
      setIncomingOrders(orders);
      const today = new Date().toISOString().split('T')[0];
      const nextPending = {};
      orders.filter((o) => o.status === 'pending').forEach((o) => {
        nextPending[o.id] = {
          quantityExpected: String(o.quantity_expected ?? ''),
          orderDate: String(o.order_date || o.created_at || '').split('T')[0],
          expectedDeliveryDate: String(o.expected_delivery_date || '').split('T')[0],
          receivedDate: today,
          quantityReceived: String(o.quantity_expected ?? ''),
          saving: false,
          error: '',
        };
      });
      setPendingLocal(nextPending);
    } catch (err) {
      console.error('Failed to load:', err);
    } finally {
      setLoading(false);
    }
  }, [activeSiteId, siteParam]);

  useEffect(() => { loadData(); }, [loadData]);

  /** After a save: "Sent for approval" for the scouter, the usual toast otherwise. */
  const afterWrite = (res, savedMessage) => {
    const pending = isPendingApproval(res);
    setSaveToast(pending ? 'Sent for approval — the pest agronomist will review it' : savedMessage);
    setTimeout(() => setSaveToast(''), pending ? 4000 : 2500);
    if (pending) refreshChangeRequestBadgeCount();
    return pending;
  };

  const onHand = inventory?.quantityOnHand ?? 0;
  const pendingIncoming = inventory?.incoming || [];

  const summary = useMemo(
    () => computeBumbleBeeSummary(deployments, inventory),
    [deployments, inventory],
  );

  const handleExportExcel = async () => {
    if (draftRows.length || inspectionDraftRows.length || orderDraftRows.length) {
      notify.warning('Unsaved rows will not be included. Save first if you need the latest figures.');
    }
    const sheets = buildBumbleBeesSheets({
      summary,
      deployments,
      inspections,
      incomingOrders,
    });
    if (!sheets.length) {
      notify.error('Nothing to export');
      return;
    }
    setExporting(true);
    try {
      await exportOpsExcel([], {
        ...OPS_EXPORT.bumbleBees,
        sheets,
        filename: 'Bumble Bees.xlsx',
      });
    } finally {
      setExporting(false);
    }
  };

  const updateDraft = (key, patch) => {
    setDraftRows((prev) => prev.map((r) => (r._key === key ? { ...r, ...patch, error: '' } : r)));
  };

  const prefetchLastForField = async (key, fieldId, currentBefore) => {
    if (!fieldId) {
      updateDraft(key, { lastForField: null });
      return;
    }
    try {
      const res = await api.get(`/ipm/bumble-bees/last-for-field?field_id=${fieldId}`);
      const last = res.data.data;
      const patch = { lastForField: last };
      if (currentBefore === '' || currentBefore == null) {
        patch.boxesBefore = last
          ? String(last.box_count_total ?? last.box_count ?? 0)
          : '0';
      }
      updateDraft(key, patch);
    } catch {
      updateDraft(key, { lastForField: null });
    }
  };

  const addDraftRow = () => {
    setDraftRows((prev) => [...prev, emptyDraftRow()]);
  };

  const removeDraftRow = (key) => {
    setDraftRows((prev) => prev.filter((r) => r._key !== key));
  };

  const saveDraftRow = async (row) => {
    if (readOnly) return;
    const boxesBeforeNum = Number(row.boxesBefore) || 0;
    const boxesRemovedNum = Number(row.boxesRemoved) || 0;
    const boxesAddedNum = Number(row.boxesAdded) || 0;
    const total = calcTotalOnField(row);

    if (!row.fieldId) {
      updateDraft(row._key, { error: 'Select a field' });
      return;
    }
    if (!row.datePlaced) {
      updateDraft(row._key, { error: 'Enter deployment date' });
      return;
    }
    if (total < 0) {
      updateDraft(row._key, { error: 'Total on field cannot be negative' });
      return;
    }
    if (boxesAddedNum > onHand) {
      updateDraft(row._key, { error: `Only ${onHand} boxes on hand` });
      return;
    }

    updateDraft(row._key, { saving: true, error: '' });
    try {
      const res = await api.post('/ipm/bumble-bees', {
        fieldId: row.fieldId,
        datePlaced: row.datePlaced,
        boxesBefore: boxesBeforeNum,
        boxesRemoved: boxesRemovedNum,
        boxesAdded: boxesAddedNum,
        notes: row.notes,
        ...(row.resubmitOf ? { resubmitOf: row.resubmitOf } : {}),
      });
      setDraftRows((prev) => prev.filter((r) => r._key !== row._key));
      afterWrite(res, 'Row saved');
      await loadData();
    } catch (err) {
      updateDraft(row._key, { saving: false, error: errorMessage(err, 'Save failed') });
    }
  };

  const updateInspectionDraft = (key, patch) => {
    setInspectionDraftRows((prev) => prev.map((r) => (r._key === key ? { ...r, ...patch, error: '' } : r)));
  };

  const prefetchDeployTotalForInspection = async (key, fieldId) => {
    if (!fieldId) {
      updateInspectionDraft(key, { deployTotal: null });
      return;
    }
    try {
      const res = await api.get(`/ipm/bumble-bees/last-for-field?field_id=${fieldId}`);
      updateInspectionDraft(key, { deployTotal: deployTotalOnField(res.data.data) });
    } catch {
      updateInspectionDraft(key, { deployTotal: null });
    }
  };

  const addInspectionDraftRow = () => {
    setInspectionDraftRows((prev) => [...prev, emptyInspectionDraftRow()]);
  };

  const removeInspectionDraftRow = (key) => {
    setInspectionDraftRows((prev) => prev.filter((r) => r._key !== key));
  };

  const saveInspectionDraftRow = async (row) => {
    if (!canCreateInspection) return;
    const total = sumInspectionBuckets(row);
    const deployTotal = row.deployTotal;

    if (!row.fieldId) {
      updateInspectionDraft(row._key, { error: 'Select a field' });
      return;
    }
    if (!row.inspectionDate) {
      updateInspectionDraft(row._key, { error: 'Enter inspection date' });
      return;
    }
    if (deployTotal == null || deployTotal < 1) {
      updateInspectionDraft(row._key, { error: 'No deployment total on this field' });
      return;
    }
    if (total < 1) {
      updateInspectionDraft(row._key, { error: 'Count at least one box' });
      return;
    }
    if (total !== deployTotal) {
      updateInspectionDraft(row._key, {
        error: `Total ${total} must match last deploy total (${deployTotal})`,
      });
      return;
    }

    updateInspectionDraft(row._key, { saving: true, error: '' });
    try {
      await api.post('/ipm/bumble-bees/inspections', {
        fieldId: row.fieldId,
        inspectionDate: row.inspectionDate,
        boxes100: Number(row.boxes100) || 0,
        boxes80: Number(row.boxes80) || 0,
        boxes60: Number(row.boxes60) || 0,
        boxes40: Number(row.boxes40) || 0,
        boxes20: Number(row.boxes20) || 0,
        boxes0: Number(row.boxes0) || 0,
        notes: row.notes,
      });
      setInspectionDraftRows((prev) => prev.filter((r) => r._key !== row._key));
      setSaveToast('Inspection saved');
      setTimeout(() => setSaveToast(''), 2500);
      await loadData();
    } catch (err) {
      updateInspectionDraft(row._key, { saving: false, error: errorMessage(err, 'Save failed') });
    }
  };

  // prefill: the values of a rejected proposal being corrected (else the saved row).
  const startInspectionEdit = (insp, purpose = 'direct', deployTotalOverride = null, prefill = null) => {
    const from = prefill || buildInspectionPayloadFromRow(insp);
    setInspectionEditId(insp.id);
    setInspectionEditPurpose(purpose);
    setInspectionEditOriginal(buildInspectionPayloadFromRow(insp));
    setInspectionProposalSaved(false);
    setInspectionEditDraft({
      inspectionDate: String(from.inspectionDate || '').split('T')[0],
      boxes100: String(from.boxes100 ?? 0),
      boxes80: String(from.boxes80 ?? 0),
      boxes60: String(from.boxes60 ?? 0),
      boxes40: String(from.boxes40 ?? 0),
      boxes20: String(from.boxes20 ?? 0),
      boxes0: String(from.boxes0 ?? 0),
      notes: from.notes || '',
      deployTotal: deployTotalOverride ?? insp.total_boxes,
      saving: false,
      error: '',
    });
  };

  const beginChangeRequestEdit = async (insp, prefill = null, resubmitOf = null) => {
    let deployTotal = insp.total_boxes;
    if (insp.field_id) {
      try {
        const res = await api.get(`/ipm/bumble-bees/last-for-field?field_id=${insp.field_id}`);
        const fromDeploy = deployTotalOnField(res.data.data);
        if (fromDeploy != null) deployTotal = fromDeploy;
      } catch {
        // keep insp.total_boxes as fallback
      }
    }
    startInspectionEdit(insp, 'change_request', deployTotal, prefill);
    setInspResubmitOf(resubmitOf);
  };

  const cancelInspectionEdit = () => {
    setInspectionEditId(null);
    setInspectionEditDraft(null);
    setInspectionEditPurpose(null);
    setInspectionEditOriginal(null);
    setInspectionProposalSaved(false);
    setInspResubmitOf(null);
  };

  const touchInspectionEditDraft = (patch) => {
    setInspectionProposalSaved(false);
    setInspectionEditDraft((d) => ({ ...d, ...patch, error: '' }));
  };

  const saveInspectionEdit = async () => {
    if (!inspectionEditId || !inspectionEditDraft) return;
    const total = sumInspectionBuckets(inspectionEditDraft);
    const deployTotal = inspectionEditDraft.deployTotal;
    if (total !== deployTotal || total < 1) {
      setInspectionEditDraft((d) => ({ ...d, error: `Total must be ${deployTotal}` }));
      return;
    }
    setInspectionEditDraft((d) => ({ ...d, saving: true, error: '' }));
    try {
      await api.put(`/ipm/bumble-bees/inspections/${inspectionEditId}`, {
        inspectionDate: inspectionEditDraft.inspectionDate,
        boxes100: Number(inspectionEditDraft.boxes100) || 0,
        boxes80: Number(inspectionEditDraft.boxes80) || 0,
        boxes60: Number(inspectionEditDraft.boxes60) || 0,
        boxes40: Number(inspectionEditDraft.boxes40) || 0,
        boxes20: Number(inspectionEditDraft.boxes20) || 0,
        boxes0: Number(inspectionEditDraft.boxes0) || 0,
        notes: inspectionEditDraft.notes,
      });
      cancelInspectionEdit();
      setSaveToast('Inspection updated');
      setTimeout(() => setSaveToast(''), 2500);
      await loadData();
    } catch (err) {
      setInspectionEditDraft((d) => ({ ...d, saving: false, error: errorMessage(err, 'Update failed') }));
    }
  };

  const deleteInspectionDirect = async (insp) => {
    if (!(await confirmAction('Delete this inspection row?'))) return;
    try {
      await api.delete(`/ipm/bumble-bees/inspections/${insp.id}`);
      setSaveToast('Inspection deleted');
      setTimeout(() => setSaveToast(''), 2500);
      await loadData();
    } catch (err) {
      alert(errorMessage(err, 'Delete failed'));
    }
  };

  const handleBulkDeleteInspections = async () => {
    const ids = [...inspectionSelection.selectedIds];
    if (!ids.length) return;
    if (!(await confirmAction(`Delete ${ids.length} selected inspection(s)?`))) return;
    const deleted = await deleteIdsSequentially(ids, (id) => api.delete(`/ipm/bumble-bees/inspections/${id}`));
    inspectionSelection.clear();
    setSaveToast(`Deleted ${deleted} inspection(s)`);
    setTimeout(() => setSaveToast(''), 2500);
    await loadData();
  };

  const saveInspectionChangeProposal = () => {
    if (!inspectionEditDraft || inspectionEditPurpose !== 'change_request') return;
    const total = sumInspectionBuckets(inspectionEditDraft);
    if (total < 1) {
      setInspectionEditDraft((d) => ({ ...d, error: 'Total must be at least 1' }));
      return;
    }
    const proposed = buildInspectionPayloadFromDraft(inspectionEditDraft);
    if (inspectionPayloadsEqual(proposed, inspectionEditOriginal)) {
      setInspectionEditDraft((d) => ({ ...d, error: 'Change at least one value before saving' }));
      setInspectionProposalSaved(false);
      return;
    }
    setInspectionEditDraft((d) => ({ ...d, error: '' }));
    setInspectionProposalSaved(true);
    setSaveToast('Changes saved — submit for approval when ready');
    setTimeout(() => setSaveToast(''), 2500);
  };

  const openSubmitChangeRequestDialog = () => {
    if (!inspectionEditDraft || inspectionEditPurpose !== 'change_request' || !inspectionProposalSaved) return;
    const proposed = buildInspectionPayloadFromDraft(inspectionEditDraft);
    if (inspectionPayloadsEqual(proposed, inspectionEditOriginal)) {
      setInspectionEditDraft((d) => ({ ...d, error: 'Proposed values match the saved row' }));
      setInspectionProposalSaved(false);
      return;
    }
    const insp = inspections.find((i) => i.id === inspectionEditId);
    if (!insp) return;
    setInspChangeDialog({ open: true, action: 'update', insp });
    setInspChangeReason('');
  };

  const openInspChangeDialog = (insp, action, resubmitOf = null) => {
    setInspChangeDialog({ open: true, action, insp });
    setInspChangeReason('');
    if (action === 'delete') setInspResubmitOf(resubmitOf);
  };

  const closeInspChangeDialog = () => {
    setInspChangeDialog({ open: false, action: 'update', insp: null });
    setInspChangeReason('');
  };

  const submitInspChangeRequest = async () => {
    const { action, insp } = inspChangeDialog;
    if (!insp || !inspChangeReason.trim()) return;
    let proposedPayload = null;
    if (action === 'update') {
      if (!inspectionEditDraft || inspectionEditId !== insp.id || inspectionEditPurpose !== 'change_request') return;
      if (!inspectionProposalSaved) {
        alert('Save your changes in the table before submitting');
        return;
      }
      const total = sumInspectionBuckets(inspectionEditDraft);
      if (total < 1) {
        alert('Inspection total must be at least 1');
        return;
      }
      const deployTotal = inspectionEditDraft.deployTotal;
      if (deployTotal != null && total !== deployTotal) {
        const ok = (await confirmAction(
          `Proposed total (${total}) differs from last deployment (${deployTotal}). `
          + 'The pest agronomist will review this drift. Submit anyway?',
        ));
        if (!ok) return;
      }
      proposedPayload = buildInspectionPayloadFromDraft(inspectionEditDraft);
      if (inspectionPayloadsEqual(proposedPayload, inspectionEditOriginal)) {
        alert('Proposed values must differ from the current inspection');
        return;
      }
    }
    setInspChangeSubmitting(true);
    try {
      await api.post('/ipm/change-requests', {
        entityType: 'bumble_bee_box_inspection',
        entityId: insp.id,
        action,
        reason: inspChangeReason.trim(),
        proposedPayload,
        ...(inspResubmitOf ? { resubmitOf: inspResubmitOf } : {}),
      });
      closeInspChangeDialog();
      cancelInspectionEdit();
      setSaveToast('Sent for approval — the pest agronomist will review it');
      setTimeout(() => setSaveToast(''), 4000);
      refreshChangeRequestBadgeCount();
      await loadData();
    } catch (err) {
      alert(errorMessage(err, 'Request failed'));
    } finally {
      setInspChangeSubmitting(false);
    }
  };

  const saveOnHand = async () => {
    if (readOnly || !activeSiteId) return;
    setSavingInventory(true);
    try {
      const res = await api.put('/ipm/bumble-bees/inventory', {
        siteId: activeSiteId,
        quantityOnHand: Number(onHandInput) || 0,
        ...(inventoryResubmitOf ? { resubmitOf: inventoryResubmitOf } : {}),
      });
      afterWrite(res, 'Boxes on hand saved');
      await loadData();
    } catch (err) {
      alert(errorMessage(err, 'Failed to update inventory'));
    } finally {
      setSavingInventory(false);
    }
  };

  const updateOrderDraft = (key, patch) => {
    setOrderDraftRows((prev) => prev.map((r) => (r._key === key ? { ...r, ...patch, error: '' } : r)));
  };

  const addOrderDraftRow = () => {
    setOrderDraftRows((prev) => [...prev, emptyOrderDraftRow()]);
  };

  const removeOrderDraftRow = (key) => {
    setOrderDraftRows((prev) => prev.filter((r) => r._key !== key));
  };

  const updatePendingLocal = (id, patch) => {
    setPendingLocal((prev) => ({
      ...prev,
      [id]: { ...prev[id], ...patch, error: '' },
    }));
  };

  const saveOrderDraftRow = async (row) => {
    if (readOnly || !activeSiteId) return;
    const qty = Number(row.quantityExpected);
    if (!qty || qty < 1) {
      updateOrderDraft(row._key, { error: 'Enter boxes ordered' });
      return;
    }
    if (!row.expectedDeliveryDate) {
      updateOrderDraft(row._key, { error: 'Enter expected delivery' });
      return;
    }
    updateOrderDraft(row._key, { saving: true, error: '' });
    try {
      const res = await api.post('/ipm/bumble-bees/incoming-orders', {
        siteId: activeSiteId,
        quantityExpected: qty,
        orderDate: row.orderDate,
        expectedDeliveryDate: row.expectedDeliveryDate,
        notes: row.notes,
        ...(row.resubmitOf ? { resubmitOf: row.resubmitOf } : {}),
      });
      setOrderDraftRows((prev) => prev.filter((r) => r._key !== row._key));
      afterWrite(res, 'Order saved');
      await loadData();
    } catch (err) {
      updateOrderDraft(row._key, { saving: false, error: errorMessage(err, 'Save failed') });
    }
  };

  const receiveOrder = async (order) => {
    if (readOnly) return;
    const local = pendingLocal[order.id];
    if (!local) return;
    const qtyReceived = Number(local.quantityReceived);
    if (!local.receivedDate) {
      updatePendingLocal(order.id, { error: 'Enter date received' });
      return;
    }
    if (!qtyReceived || qtyReceived < 1) {
      updatePendingLocal(order.id, { error: 'Enter boxes received' });
      return;
    }
    updatePendingLocal(order.id, { saving: true, error: '' });
    try {
      // One call: corrections to the order (boxes ordered, dates) travel with the
      // receipt, so a scouter's receipt is one approval and a live one is one transaction.
      const origOrderDate = String(order.order_date || order.created_at || '').split('T')[0];
      const origExpected = String(order.expected_delivery_date || '').split('T')[0];
      const corrections = {};
      if (Number(local.quantityExpected) !== Number(order.quantity_expected)) {
        corrections.quantityExpected = Number(local.quantityExpected);
      }
      if (local.orderDate && local.orderDate !== origOrderDate) corrections.orderDate = local.orderDate;
      if (local.expectedDeliveryDate && local.expectedDeliveryDate !== origExpected) {
        corrections.expectedDeliveryDate = local.expectedDeliveryDate;
      }
      const res = await api.post(`/ipm/bumble-bees/incoming-orders/${order.id}/receive`, {
        receivedDate: local.receivedDate,
        quantityReceived: qtyReceived,
        ...corrections,
        ...(local.resubmitOf ? { resubmitOf: local.resubmitOf } : {}),
      });
      afterWrite(res, 'Delivery received');
      await loadData();
    } catch (err) {
      updatePendingLocal(order.id, { saving: false, error: errorMessage(err, 'Receive failed') });
    }
  };

  const cancelOrder = async (id, resubmitOf = null) => {
    if (readOnly) return;
    if (!(await confirmAction(canLiveEdit ? 'Cancel this order?' : 'Send a request to cancel this order?'))) return;
    try {
      const res = await api.put(`/ipm/bumble-bees/incoming-orders/${id}`, {
        status: 'cancelled',
        ...(resubmitOf ? { resubmitOf } : {}),
      });
      afterWrite(res, 'Order cancelled');
      await loadData();
    } catch (err) {
      alert(errorMessage(err, 'Failed to cancel order'));
    }
  };

  /** "Correct & resubmit": reopen a rejected proposal pre-filled with what was sent. */
  const resubmitProposal = (req) => {
    const p = req.proposedPayload || {};
    const key = `${req.entityType}:${req.action}`;
    if (key === `${ENTITY_BUMBLE_BEE_DEPLOYMENT}:create`) {
      const field = fields.find((f) => f.id === p.fieldId);
      setDraftRows((prev) => [...prev, {
        ...emptyDraftRow(),
        fieldId: field ? p.fieldId : '',
        datePlaced: String(p.datePlaced || '').split('T')[0] || emptyDraftRow().datePlaced,
        boxesBefore: String(p.boxesBefore ?? ''),
        boxesRemoved: String(p.boxesRemoved ?? 0),
        boxesAdded: String(p.boxesAdded ?? ''),
        notes: p.notes || '',
        resubmitOf: req.id,
      }]);
      setTab(1);
      return;
    }
    if (key === `${ENTITY_BUMBLE_BEE_INVENTORY}:set`) {
      setOnHandInput(String(p.quantityOnHand ?? ''));
      setInventoryResubmitOf(req.id);
      setTab(3);
      return;
    }
    if (key === `${ENTITY_BUMBLE_BEE_ORDER}:create`) {
      setOrderDraftRows((prev) => [...prev, {
        ...emptyOrderDraftRow(),
        quantityExpected: String(p.quantityExpected ?? ''),
        orderDate: String(p.orderDate || '').split('T')[0] || emptyOrderDraftRow().orderDate,
        expectedDeliveryDate: String(p.expectedDeliveryDate || '').split('T')[0],
        notes: p.notes || '',
        resubmitOf: req.id,
      }]);
      setTab(3);
      return;
    }
    if (req.entityType === ENTITY_BUMBLE_BEE_ORDER) {
      const order = incomingOrders.find((o) => o.id === req.entityId);
      if (!order || order.status !== 'pending') {
        notify.warning('This order has already been received or cancelled.');
        return;
      }
      setTab(3);
      if (req.action === 'update' && p.status === 'cancelled') {
        cancelOrder(order.id, req.id);
        return;
      }
      updatePendingLocal(order.id, {
        ...(p.quantityExpected != null ? { quantityExpected: String(p.quantityExpected) } : {}),
        ...(p.orderDate ? { orderDate: String(p.orderDate).split('T')[0] } : {}),
        ...(p.expectedDeliveryDate ? { expectedDeliveryDate: String(p.expectedDeliveryDate).split('T')[0] } : {}),
        ...(p.receivedDate ? { receivedDate: String(p.receivedDate).split('T')[0] } : {}),
        ...(p.quantityReceived != null ? { quantityReceived: String(p.quantityReceived) } : {}),
        resubmitOf: req.id,
      });
      return;
    }
    if (req.entityType === ENTITY_BUMBLE_BEE_BOX_INSPECTION) {
      const insp = inspections.find((i) => i.id === req.entityId);
      if (!insp) {
        notify.warning('This inspection no longer exists.');
        return;
      }
      setTab(2);
      if (req.action === 'delete') {
        openInspChangeDialog(insp, 'delete', req.id);
      } else {
        beginChangeRequestEdit(insp, p, req.id);
      }
      return;
    }
    notify.info('Make the change again from the table.');
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!activeSiteId) {
    return (
      <Box>
        <InfoNote mode="line" severity="info">Select a site to manage bumble bee deployments and inventory.</InfoNote>
      </Box>
    );
  }

  // One extra column each for the gutter that was not there before.
  const colCount = readOnly ? 9 : 10;
  const showInspActions = canCreateInspection || canLiveEdit;
  const inspColCount = showInspActions ? 12 : 11;
  // Only the pest agronomist deletes inspections directly (and in bulk).
  const deletableInspectionIds = canLiveEdit
    ? inspections.filter((insp) => !pendingByEntity[insp.id]).map((insp) => insp.id)
    : [];
  const orderColCount = readOnly ? 11 : 12;

  const sortedIncomingOrders = [...incomingOrders].sort((a, b) => {
    const hist = (o) => o.status === 'received' || o.status === 'cancelled';
    const aHist = hist(a);
    const bHist = hist(b);
    if (aHist !== bHist) return aHist ? -1 : 1;
    if (a.status === 'pending' && b.status === 'pending') {
      return new Date(a.expected_delivery_date) - new Date(b.expected_delivery_date);
    }
    const da = new Date(a.received_at || a.order_date || a.created_at);
    const db = new Date(b.received_at || b.order_date || b.created_at);
    return db - da;
  });

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, gap: 1, flexWrap: 'wrap' }}>
        <PageTitle>Bumble Bee Deployments</PageTitle>
        <ExportButton label="Export to Excel" onClick={handleExportExcel} disabled={exporting} loading={exporting} />
      </Box>

      {readOnly && <ReadOnlyBanner message="View only — bumble bee deployments cannot be modified." />}
      {canPropose && (
        <InfoNote severity="info" sx={{ mb: 2 }}>
          Your deployments, boxes on hand, orders and inspection edits are sent to the pest agronomist
          for approval and are not applied until approved. New inspections are saved directly.
        </InfoNote>
      )}

      <ProposalPanel
        pending={pendingProposals}
        rejected={rejectedProposals}
        canReview={canLiveEdit}
        onReview={() => navigate('/audit/change-requests')}
        onResubmit={resubmitProposal}
      />

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 1 }}>
        <Tab label="Summary" />
        <Tab label="Deployments" />
        <Tab label="Inspection" />
        <Tab label="Inventory" />
      </Tabs>

      <TabPanel value={tab} index={0}>
        <Grid container spacing={2} sx={{ mb: 2 }}>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="overline" color="text.secondary">Boxes on hand</Typography>
                <Typography variant="h4">{summary.onHand}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="overline" color="text.secondary">Projected total</Typography>
                <Typography variant="h4">{summary.projectedTotal}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="overline" color="text.secondary">Avg boxes removed / week</Typography>
                <Typography variant="h4">
                  {summary.avgBoxesRemovedPerWeek != null ? summary.avgBoxesRemovedPerWeek : '—'}
                </Typography>
                <Typography variant="caption" color="text.secondary">Last 28 days ÷ 4</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="overline" color="text.secondary">Last deploy</Typography>
                {summary.lastDeploy ? (
                  <>
                    <Typography variant="h4">{formatLastDeployDate(summary.lastDeploy.date)}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {summary.lastDeploy.fieldName}
                      {' · '}
                      +{summary.lastDeploy.boxesAdded} / −{summary.lastDeploy.boxesRemoved}
                    </Typography>
                  </>
                ) : (
                  <>
                    <Typography variant="h4">—</Typography>
                    <Typography variant="body2" color="text.secondary">No deployments yet</Typography>
                  </>
                )}
              </CardContent>
            </Card>
          </Grid>
        </Grid>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Projected includes pending deliveries. Removal average uses visits in the last 28 days.
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Button size="small" variant="outlined" onClick={() => setTab(1)}>View deployments</Button>
          <Button size="small" variant="outlined" onClick={() => setTab(3)}>View inventory</Button>
        </Box>
      </TabPanel>

      <TabPanel value={tab} index={1}>
        <InfoNote mode="line" severity="info" sx={{ mb: 2 }} icon={false}>
          <strong>On hand:</strong> {onHand} boxes
          {pendingIncoming.length > 0 && (
            <>
              {' · '}
              <strong>Incoming:</strong> {inventory?.pendingIncomingTotal} boxes
              {' '}(next: {new Date(pendingIncoming[0].expected_delivery_date).toLocaleDateString()})
            </>
          )}
          {' · '}
          <Button size="small" onClick={() => setTab(3)} sx={{ verticalAlign: 'baseline', p: 0, minWidth: 0 }}>
            Inventory tab
          </Button>
        </InfoNote>

        {saveToast && tab === 1 && (
          <Alert severity="success" sx={{ mb: 1 }} onClose={() => setSaveToast('')}>{saveToast}</Alert>
        )}

        <FitTableContainer component={Paper} variant="outlined" >
          <Table size="small" sx={[excelTableSx, freezeColumnsSx(VISIT_FROZEN_WIDTHS, GUTTER_WIDTH), rowStateSx, { minWidth: 960 }]}>
              <TableHead>
                <TableRow>
                  <GutterCell />
                  <TableCell className="col-frozen-0">Field</TableCell>
                  <TableCell className="col-frozen-1">Deployment date</TableCell>
                  <TableCell className="col-numeric">Before visit</TableCell>
                  <TableCell className="col-numeric">Removed</TableCell>
                  <TableCell className="col-numeric">Added</TableCell>
                  <TableCell className="col-numeric">Total on field</TableCell>
                  <TableCell className="col-numeric">Days since last</TableCell>
                  <TableCell sx={{ minWidth: 160 }}>Notes</TableCell>
                  {!readOnly && <TableCell>Actions</TableCell>}
                </TableRow>
              </TableHead>
              <TableBody>
                {deployments.map((dep, idx) => (
                  <TableRow key={dep.id} hover>
                    <GutterCell index={idx + 1} />
                    <TableCell {...CELL} className="col-frozen-0" title={dep.field_name || ''}>
                      {dep.field_name}
                    </TableCell>
                    <TableCell {...CELL} className="col-frozen-1" title={new Date(dep.date_placed).toLocaleDateString()}>
                      {new Date(dep.date_placed).toLocaleDateString()}
                    </TableCell>
                    <TableCell {...CELL} className="col-numeric">{dep.boxes_before ?? '—'}</TableCell>
                    <TableCell {...CELL} className="col-numeric">{dep.boxes_removed ?? 0}</TableCell>
                    <TableCell {...CELL} className="col-numeric">
                      {dep.boxes_added ?? dep.box_count ?? 0}
                    </TableCell>
                    <TableCell {...CELL} className="col-numeric">
                      {dep.box_count_total ?? dep.display_box_total ?? dep.box_count}
                    </TableCell>
                    <TableCell {...CELL} className="col-numeric">
                      {dep.days_since_last != null ? `${dep.days_since_last} d` : '—'}
                    </TableCell>
                    <TableCell {...CELL}>
                      {dep.notes || '—'}
                      {pendingByEntity[dep.id] && (
                        <Chip size="small" label="Edit pending approval" color="warning" variant="outlined" sx={{ ml: 0.5 }} />
                      )}
                    </TableCell>
                    {!readOnly && <TableCell {...CELL} />}
                  </TableRow>
                ))}

                {/* Scouter deployments waiting for approval: shown, not counted anywhere. */}
                {pendingDeploymentCreates.map((req, idx) => {
                  const p = req.proposedPayload || {};
                  const before = Number(p.boxesBefore) || 0;
                  const removed = Number(p.boxesRemoved) || 0;
                  const added = Number(p.boxesAdded) || 0;
                  return (
                    <TableRow key={req.id} className="row-pending">
                      <GutterCell index={deployments.length + idx + 1} />
                      <TableCell {...CELL} className="col-frozen-0" title={req.snapshotBefore?.field_name || ''}>
                        {req.snapshotBefore?.field_name || '—'}
                        <Chip size="small" label="Pending approval" color="warning" sx={{ ml: 0.5, mt: 0.5 }} />
                      </TableCell>
                      <TableCell {...CELL} className="col-frozen-1">{formatDateCell(p.datePlaced)}</TableCell>
                      <TableCell {...CELL} className="col-numeric">{before}</TableCell>
                      <TableCell {...CELL} className="col-numeric">{removed}</TableCell>
                      <TableCell {...CELL} className="col-numeric">{added}</TableCell>
                      <TableCell {...CELL} className="col-numeric">{before - removed + added}</TableCell>
                      <TableCell {...CELL} className="col-numeric">—</TableCell>
                      <TableCell {...CELL}>
                        {p.notes || '—'}
                        {req.requestedByName && (
                          <Typography variant="caption" color="text.secondary" display="block">
                            Sent by {req.requestedByName}
                          </Typography>
                        )}
                      </TableCell>
                      {!readOnly && <TableCell {...CELL} />}
                    </TableRow>
                  );
                })}

                {draftRows.map((row, idx) => {
                  const total = calcTotalOnField(row);
                  const days = calcDaysSinceLast(row.lastForField, row.datePlaced);
                  const addedNum = Number(row.boxesAdded) || 0;
                  return (
                    <TableRow key={row._key} className="row-draft">
                      <GutterCell index={deployments.length + pendingDeploymentCreates.length + idx + 1} />
                      <TableCell {...CELL} className="col-frozen-0">
                        <FormControl fullWidth size="small" variant="standard">
                          <Select
                            value={row.fieldId}
                            displayEmpty
                            onChange={(e) => {
                              const fieldId = e.target.value;
                              updateDraft(row._key, { fieldId, boxesBefore: '', lastForField: null });
                              prefetchLastForField(row._key, fieldId, '');
                            }}
                            sx={{ fontSize: '0.6875rem' }}
                          >
                            <MenuItem value=""><em>Field…</em></MenuItem>
                            {fields.map((f) => (
                              <MenuItem key={f.id} value={f.id}>{f.name}</MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </TableCell>
                      <TableCell {...CELL} className="col-frozen-1">
                        <SpreadsheetInput
                          type="date"
                          value={row.datePlaced}
                          onChange={(e) => updateDraft(row._key, { datePlaced: e.target.value })}
                        />
                      </TableCell>
                      <TableCell {...CELL} className="col-numeric">
                        <SpreadsheetInput
                          type="number"
                          value={row.boxesBefore}
                          onChange={(e) => updateDraft(row._key, { boxesBefore: e.target.value })}
                          inputProps={{ min: 0 }}
                        />
                      </TableCell>
                      <TableCell {...CELL} className="col-numeric">
                        <SpreadsheetInput
                          type="number"
                          value={row.boxesRemoved}
                          onChange={(e) => updateDraft(row._key, { boxesRemoved: e.target.value })}
                          inputProps={{ min: 0 }}
                        />
                      </TableCell>
                      <TableCell {...CELL} className="col-numeric">
                        <SpreadsheetInput
                          type="number"
                          value={row.boxesAdded}
                          onChange={(e) => updateDraft(row._key, { boxesAdded: e.target.value })}
                          inputProps={{ min: 0 }}
                          error={addedNum > onHand}
                        />
                      </TableCell>
                      <TableCell {...CELL} className="col-numeric">
                        <Typography variant="body2" fontWeight={600}>{total}</Typography>
                      </TableCell>
                      <TableCell {...CELL} className="col-numeric">
                        {days != null ? `${days} d` : '—'}
                      </TableCell>
                      <TableCell {...CELL}>
                        <SpreadsheetInput
                          value={row.notes}
                          onChange={(e) => updateDraft(row._key, { notes: e.target.value })}
                        />
                      </TableCell>
                      {!readOnly && (
                        <TableCell {...CELL} align="center">
                          <Tooltip title="Save row" describeChild>
                            <span>
                              <IconButton
                                size="small"
                                color="primary"
                                disabled={row.saving || !row.fieldId || addedNum > onHand || total < 0}
                                onClick={() => saveDraftRow(row)} aria-label="Save row">
                                {row.saving ? <CircularProgress size={18} /> : <Check fontSize="small" />}
                              </IconButton>
                            </span>
                          </Tooltip>
                          <Tooltip title="Remove row">
                            <IconButton size="small" onClick={() => removeDraftRow(row._key)}>
                              <Delete fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          {row.error && (
                            <Typography variant="caption" color="error" display="block">
                              {row.error}
                            </Typography>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}

                {deployments.length === 0 && pendingDeploymentCreates.length === 0 && draftRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={colCount} align="center" {...CELL}>
                      <Typography color="text.secondary" py={2}>
                        No visits yet — add a row below to log a deployment
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </FitTableContainer>

        {!readOnly && (
          <Box sx={{ mt: 1.5, display: 'flex', gap: 1, alignItems: 'center' }}>
            <Button size="small" variant="outlined" startIcon={<AddCircleOutline />} onClick={addDraftRow}>
              Add row
            </Button>
            <Typography variant="caption" color="text.secondary">
              New rows at the bottom — edit cells, then click ✓ to save each row
              {canPropose ? ' (sent for approval)' : ''}
            </Typography>
          </Box>
        )}
      </TabPanel>

      <TabPanel value={tab} index={2}>
        {saveToast && tab === 2 && (
          <Alert severity="success" sx={{ mb: 1 }} onClose={() => setSaveToast('')}>{saveToast}</Alert>
        )}
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Count each box in one strength column only. Total must match last deployment total on field.
        </Typography>
        {inspectionEditPurpose === 'change_request' && (
          <InfoNote severity="info" sx={{ mb: 2 }}>
            Edit the highlighted row, click <strong>Save changes</strong>, then <strong>Submit for approval</strong> and enter a reason.
          </InfoNote>
        )}
        {canLiveEdit && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <DeleteSelectedButton count={inspectionSelection.size} onClick={handleBulkDeleteInspections} />
          </Box>
        )}
        <FitTableContainer component={Paper} variant="outlined" >
          <Table size="small" sx={[excelTableSx, freezeColumnsSx(VISIT_FROZEN_WIDTHS, GUTTER_WIDTH), rowStateSx, { minWidth: 1100 }]}>
              <TableHead>
                <TableRow>
                  <GutterCell />
                  <TableCell className="col-frozen-0">Field</TableCell>
                  <TableCell className="col-frozen-1">Inspection date</TableCell>
                  <TableCell className="col-numeric">100%</TableCell>
                  <TableCell className="col-numeric">80%</TableCell>
                  <TableCell className="col-numeric">60%</TableCell>
                  <TableCell className="col-numeric">40%</TableCell>
                  <TableCell className="col-numeric">20%</TableCell>
                  <TableCell className="col-numeric">0%</TableCell>
                  <TableCell className="col-numeric">Total boxes</TableCell>
                  <TableCell sx={{ minWidth: 160 }}>Notes</TableCell>
                  {showInspActions && (
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        {canLiveEdit && (
                          <SelectAllCheckbox
                            plain
                            ids={deletableInspectionIds}
                            selectedIds={inspectionSelection.selectedIds}
                            onToggleAll={inspectionSelection.toggleAll}
                            label="Select all deletable inspections"
                          />
                        )}
                        Actions
                      </Box>
                    </TableCell>
                  )}
                </TableRow>
              </TableHead>
              <TableBody>
                {inspections.map((insp, idx) => {
                  const isOwner = canPropose && insp.created_by === currentUserId;
                  const pendingRequest = pendingByEntity[insp.id];
                  const hasPendingRequest = !!pendingRequest;
                  const deployTotal = insp.deploy_total != null ? Number(insp.deploy_total) : null;
                  const rowTotal = insp.total_boxes ?? sumInspectionFromDb(insp);
                  const deployMismatch = deployTotal != null && rowTotal !== deployTotal;
                  const isEditing = inspectionEditId === insp.id && inspectionEditDraft;
                  const bucketKeys = ['boxes100', 'boxes80', 'boxes60', 'boxes40', 'boxes20', 'boxes0'];
                  const rowNum = idx + 1;

                  if (isEditing) {
                    const total = sumInspectionBuckets(inspectionEditDraft);
                    const deployTotal = inspectionEditDraft.deployTotal;
                    const isLiveEdit = inspectionEditPurpose !== 'change_request';
                    return (
                      <TableRow key={insp.id} className="row-draft">
                        <GutterCell index={rowNum} />
                        <TableCell {...CELL} className="col-frozen-0" title={insp.field_name || ''}>
                          {insp.field_name}
                        </TableCell>
                        <TableCell {...CELL} className="col-frozen-1">
                          <SpreadsheetInput
                            type="date"
                            value={inspectionEditDraft.inspectionDate}
                            onChange={(e) => touchInspectionEditDraft({ inspectionDate: e.target.value })}
                          />
                        </TableCell>
                        {bucketKeys.map((k) => (
                          <TableCell key={k} {...CELL} className="col-numeric">
                            <SpreadsheetInput
                              type="number"
                              value={inspectionEditDraft[k]}
                              onChange={(e) => touchInspectionEditDraft({ [k]: e.target.value })}
                              inputProps={{ min: 0 }}
                            />
                          </TableCell>
                        ))}
                        <TableCell {...CELL} className="col-numeric">
                          <Typography variant="body2" fontWeight={600}>{total}</Typography>
                          {!isLiveEdit && total !== deployTotal && (
                            <Typography variant="caption" color="warning.main" display="block">
                              Differs from deploy ({deployTotal}) — agronomist review
                            </Typography>
                          )}
                          {isLiveEdit && total !== deployTotal && (
                            <Typography variant="caption" color="error" display="block">Need {deployTotal}</Typography>
                          )}
                        </TableCell>
                        <TableCell {...CELL}>
                          <SpreadsheetInput
                            value={inspectionEditDraft.notes}
                            onChange={(e) => touchInspectionEditDraft({ notes: e.target.value })}
                          />
                        </TableCell>
                        <TableCell {...CELL} align="center">
                          {isLiveEdit ? (
                            <>
                              <IconButton size="small" color="primary" disabled={inspectionEditDraft.saving || total !== deployTotal} onClick={saveInspectionEdit} aria-label="Save">
                                {inspectionEditDraft.saving ? <CircularProgress size={18} /> : <Check fontSize="small" />}
                              </IconButton>
                              <Button size="small" onClick={cancelInspectionEdit}>Cancel</Button>
                            </>
                          ) : (
                            <>
                              <Button size="small" variant="outlined" onClick={saveInspectionChangeProposal} disabled={total < 1}>
                                Save changes
                              </Button>
                              <Button
                                size="small"
                                variant="contained"
                                disabled={!inspectionProposalSaved || total < 1}
                                onClick={openSubmitChangeRequestDialog}
                              >
                                Submit for approval
                              </Button>
                              <Button size="small" onClick={cancelInspectionEdit}>Cancel</Button>
                            </>
                          )}
                          {inspectionEditDraft.error && (
                            <Typography variant="caption" color="error" display="block">{inspectionEditDraft.error}</Typography>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  }

                  return (
                    <TableRow key={insp.id} hover className={hasPendingRequest ? 'row-pending' : undefined}>
                      <GutterCell index={rowNum} />
                      <TableCell {...CELL} className="col-frozen-0" title={insp.field_name || ''}>
                        {insp.field_name}
                        {hasPendingRequest && (
                          <Chip
                            size="small"
                            label={pendingRequest.action === 'delete' ? 'Delete pending approval' : 'Edit pending approval'}
                            color="warning"
                            sx={{ ml: 0.5, mt: 0.5 }}
                          />
                        )}
                      </TableCell>
                      <TableCell {...CELL} className="col-frozen-1" title={formatDateCell(insp.inspection_date)}>
                        {formatDateCell(insp.inspection_date)}
                      </TableCell>
                      <TableCell {...CELL} className="col-numeric">{insp.boxes_100 ?? 0}</TableCell>
                      <TableCell {...CELL} className="col-numeric">{insp.boxes_80 ?? 0}</TableCell>
                      <TableCell {...CELL} className="col-numeric">{insp.boxes_60 ?? 0}</TableCell>
                      <TableCell {...CELL} className="col-numeric">{insp.boxes_40 ?? 0}</TableCell>
                      <TableCell {...CELL} className="col-numeric">{insp.boxes_20 ?? 0}</TableCell>
                      <TableCell {...CELL} className="col-numeric">{insp.boxes_0 ?? 0}</TableCell>
                      <TableCell {...CELL} className="col-numeric">
                        {rowTotal}
                        {deployMismatch && (
                          <Chip
                            size="small"
                            label={`≠ deploy ${deployTotal}`}
                            color="warning"
                            variant="outlined"
                            sx={{ ml: 0.5, display: 'block', mt: 0.3 }}
                          />
                        )}
                      </TableCell>
                      <TableCell {...CELL}>
                        {insp.notes || '—'}
                        {hasPendingRequest && proposalLines(pendingRequest).length > 0 && (
                          <Typography variant="caption" color="warning.dark" display="block">
                            Proposed: {proposalLines(pendingRequest).join('; ')}
                          </Typography>
                        )}
                      </TableCell>
                      {showInspActions && (
                        <TableCell {...CELL} align="center">
                          {deletableInspectionIds.includes(insp.id) && (
                            <RowCheckbox
                              id={insp.id}
                              selectedIds={inspectionSelection.selectedIds}
                              onToggle={inspectionSelection.toggle}
                              label={`Select inspection ${insp.id}`}
                            />
                          )}
                          {canLiveEdit && !hasPendingRequest && (
                            <>
                              <Button size="small" onClick={() => startInspectionEdit(insp, 'direct', deployTotal)} disabled={!!inspectionEditId}>Edit</Button>
                              <Button size="small" color="error" onClick={() => deleteInspectionDirect(insp)}>Delete</Button>
                            </>
                          )}
                          {isOwner && !hasPendingRequest && (
                            <>
                              <Button size="small" onClick={() => beginChangeRequestEdit(insp)} disabled={!!inspectionEditId}>Request edit</Button>
                              <Button size="small" color="inherit" onClick={() => openInspChangeDialog(insp, 'delete')}>Request delete</Button>
                            </>
                          )}
                          {hasPendingRequest && (
                            <Typography variant="caption" color="text.secondary">
                              {canLiveEdit ? 'Review on Change Requests' : 'Awaiting approval'}
                            </Typography>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}

                {canCreateInspection && inspectionDraftRows.map((row, idx) => {
                  const total = sumInspectionBuckets(row);
                  const deployTotal = row.deployTotal;
                  const totalMismatch = deployTotal != null && total !== deployTotal;
                  const bucketKeys = ['boxes100', 'boxes80', 'boxes60', 'boxes40', 'boxes20', 'boxes0'];
                  return (
                    <TableRow key={row._key} className="row-draft">
                      <GutterCell index={inspections.length + idx + 1} />
                      <TableCell {...CELL} className="col-frozen-0">
                        <FormControl fullWidth size="small" variant="standard">
                          <Select
                            value={row.fieldId}
                            displayEmpty
                            onChange={(e) => {
                              const fieldId = e.target.value;
                              updateInspectionDraft(row._key, { fieldId, deployTotal: null });
                              prefetchDeployTotalForInspection(row._key, fieldId);
                            }}
                            sx={{ fontSize: '0.6875rem' }}
                          >
                            <MenuItem value=""><em>Field…</em></MenuItem>
                            {fields.map((f) => (
                              <MenuItem key={f.id} value={f.id}>{f.name}</MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                        {deployTotal != null && (
                          <Typography variant="caption" color="text.secondary" display="block">
                            Last deploy total: {deployTotal}
                          </Typography>
                        )}
                        {row.fieldId && deployTotal == null && (
                          <Typography variant="caption" color="error" display="block">
                            No deployment on field
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell {...CELL} className="col-frozen-1">
                        <SpreadsheetInput
                          type="date"
                          value={row.inspectionDate}
                          onChange={(e) => updateInspectionDraft(row._key, { inspectionDate: e.target.value })}
                        />
                      </TableCell>
                      {bucketKeys.map((k) => (
                        <TableCell key={k} {...CELL} className="col-numeric">
                          <SpreadsheetInput
                            type="number"
                            value={row[k]}
                            onChange={(e) => updateInspectionDraft(row._key, { [k]: e.target.value })}
                            inputProps={{ min: 0 }}
                          />
                        </TableCell>
                      ))}
                      <TableCell {...CELL} className="col-numeric">
                        <Typography variant="body2" fontWeight={600}>{total}</Typography>
                        {totalMismatch && (
                          <Typography variant="caption" color="error" display="block">
                            Need {deployTotal}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell {...CELL}>
                        <SpreadsheetInput
                          value={row.notes}
                          onChange={(e) => updateInspectionDraft(row._key, { notes: e.target.value })}
                        />
                      </TableCell>
                      <TableCell {...CELL} align="center">
                        <Tooltip title="Save inspection" describeChild>
                          <span>
                            <IconButton
                              size="small"
                              color="primary"
                              disabled={
                                row.saving || !row.fieldId || deployTotal == null
                                || total !== deployTotal || total < 1
                              }
                              onClick={() => saveInspectionDraftRow(row)} aria-label="Save inspection">
                              {row.saving ? <CircularProgress size={18} /> : <Check fontSize="small" />}
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title="Remove row">
                          <IconButton size="small" onClick={() => removeInspectionDraftRow(row._key)}>
                            <Delete fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        {row.error && (
                          <Typography variant="caption" color="error" display="block">
                            {row.error}
                          </Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}

                {inspections.length === 0 && inspectionDraftRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={inspColCount} align="center" {...CELL}>
                      <Typography color="text.secondary" py={2}>
                        No inspections yet
                        {canCreateInspection ? ' — add a row below' : ''}
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </FitTableContainer>
        {canCreateInspection && (
          <Box sx={{ mt: 1.5, display: 'flex', gap: 1, alignItems: 'center' }}>
            <Button size="small" variant="outlined" startIcon={<AddCircleOutline />} onClick={addInspectionDraftRow}>
              Add row
            </Button>
            <Typography variant="caption" color="text.secondary">
              Scouters only — edit cells, then click ✓ to save each row (saved directly)
            </Typography>
          </Box>
        )}
      </TabPanel>

      <TabPanel value={tab} index={3}>
        <Grid container spacing={2} sx={{ mb: 3 }}>
          {[
            { label: 'Boxes on hand', value: onHand, color: 'var(--sheet-accent)', bg: 'var(--sheet-tint-green)' },
            { label: 'Upcoming (not received)', value: inventory?.pendingIncomingTotal ?? 0, color: 'var(--sheet-warn)', bg: 'var(--sheet-tint-peach)' },
            { label: 'Projected total', value: inventory?.projectedTotal ?? onHand, color: 'var(--sheet-info, #1d4670)', bg: 'var(--sheet-tint-blue)' },
          ].map((kpi) => (
            <Grid size={{ xs: 12, sm: 4 }} key={kpi.label}>
              <Box sx={{
                p: 1.5, borderRadius: 1, border: '1px solid var(--sheet-grid)', background: kpi.bg, textAlign: 'center',
              }}>
                <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--sheet-ink-2)', textTransform: 'none', letterSpacing: 0 }}>
                  {kpi.label}
                </Typography>
                <Typography sx={{ fontSize: '1.25rem', fontWeight: 800, color: kpi.color, mt: 0.3 }}>
                  {kpi.value}
                </Typography>
              </Box>
            </Grid>
          ))}
        </Grid>

        {saveToast && tab === 3 && (
          <Alert severity="success" sx={{ mb: 1 }} onClose={() => setSaveToast('')}>{saveToast}</Alert>
        )}

        {!readOnly && (
          <Paper sx={{ p: 2, mb: 2 }}>
            <Typography variant="subtitle2" gutterBottom>Set on-hand count</Typography>
            {pendingInventorySet && (
              <Alert severity="warning" sx={{ mb: 1.5 }}>
                A count of <strong>{pendingInventorySet.proposedPayload?.quantityOnHand}</strong> boxes
                {pendingInventorySet.requestedByName ? ` from ${pendingInventorySet.requestedByName}` : ''}
                {' '}is pending approval (on hand when sent: {pendingInventorySet.snapshotBefore?.quantity_on_hand ?? '—'}).
              </Alert>
            )}
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
              <TextField
                size="small"
                type="number"
                label="Boxes on hand"
                value={onHandInput}
                onChange={(e) => setOnHandInput(e.target.value)}
                inputProps={{ min: 0 }}
                sx={{ width: 160 }}
              />
              <Button
                variant="contained"
                onClick={saveOnHand}
                disabled={savingInventory || (canPropose && !!pendingInventorySet)}
              >
                {savingInventory ? <CircularProgress size={20} /> : (canPropose ? 'Send for approval' : 'Save')}
              </Button>
            </Box>
          </Paper>
        )}

        <Typography variant="h6" gutterBottom>Delivery log</Typography>
        <FitTableContainer component={Paper} variant="outlined" >
          <Table size="small" sx={[excelTableSx, rowStateSx, { minWidth: 1100 }]}>
              <TableHead>
                <TableRow>
                  <GutterCell />
                  <TableCell className="col-numeric">Boxes ordered</TableCell>
                  <TableCell>Order date</TableCell>
                  <TableCell>Expected delivery</TableCell>
                  <TableCell>Date received</TableCell>
                  <TableCell className="col-numeric">Boxes received</TableCell>
                  <TableCell className="col-numeric">On hand (before)</TableCell>
                  <TableCell className="col-numeric">On hand (after)</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell sx={{ minWidth: 160 }}>Notes</TableCell>
                  {!readOnly && <TableCell>Actions</TableCell>}
                </TableRow>
              </TableHead>
              <TableBody>
                {sortedIncomingOrders.map((o, idx) => {
                  const rowNum = idx + 1;
                  const orderRequest = pendingByEntity[o.id];
                  if (o.status === 'pending' && !readOnly && pendingLocal[o.id] && !orderRequest) {
                    const local = pendingLocal[o.id];
                    return (
                      <TableRow key={o.id} className="row-pending">
                        <GutterCell index={rowNum} />
                        <TableCell {...CELL} className="col-numeric">
                          <SpreadsheetInput
                            type="number"
                            value={local.quantityExpected}
                            onChange={(e) => {
                              const v = e.target.value;
                              updatePendingLocal(o.id, {
                                quantityExpected: v,
                                quantityReceived: local.quantityReceived === local.quantityExpected
                                  ? v
                                  : local.quantityReceived,
                              });
                            }}
                            inputProps={{ min: 1 }}
                          />
                        </TableCell>
                        <TableCell {...CELL}>
                          <SpreadsheetInput
                            type="date"
                            value={local.orderDate}
                            onChange={(e) => updatePendingLocal(o.id, { orderDate: e.target.value })}
                          />
                        </TableCell>
                        <TableCell {...CELL}>
                          <SpreadsheetInput
                            type="date"
                            value={local.expectedDeliveryDate}
                            onChange={(e) => updatePendingLocal(o.id, { expectedDeliveryDate: e.target.value })}
                          />
                        </TableCell>
                        <TableCell {...CELL}>
                          <SpreadsheetInput
                            type="date"
                            value={local.receivedDate}
                            onChange={(e) => updatePendingLocal(o.id, { receivedDate: e.target.value })}
                          />
                        </TableCell>
                        <TableCell {...CELL} className="col-numeric">
                          <SpreadsheetInput
                            type="number"
                            value={local.quantityReceived}
                            onChange={(e) => updatePendingLocal(o.id, { quantityReceived: e.target.value })}
                            inputProps={{ min: 1 }}
                          />
                        </TableCell>
                        <TableCell {...CELL} className="col-numeric">—</TableCell>
                        <TableCell {...CELL} className="col-numeric">—</TableCell>
                        <TableCell {...CELL}>
                          <Chip size="small" label="awaiting delivery" color="warning" variant="outlined" />
                        </TableCell>
                        <TableCell {...CELL}>{o.notes || '—'}</TableCell>
                        <TableCell {...CELL} align="center">
                          <Tooltip title="Receive delivery" describeChild>
                            <span>
                              <IconButton
                                size="small"
                                color="primary"
                                disabled={local.saving}
                                onClick={() => receiveOrder(o)} aria-label="Receive delivery">
                                {local.saving ? <CircularProgress size={18} /> : <Check fontSize="small" />}
                              </IconButton>
                            </span>
                          </Tooltip>
                          <Button size="small" color="inherit" onClick={() => cancelOrder(o.id, local.resubmitOf)}>
                            Cancel
                          </Button>
                          {local.error && (
                            <Typography variant="caption" color="error" display="block">
                              {local.error}
                            </Typography>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  }
                  return (
                    <TableRow key={o.id} hover className={orderRequest ? 'row-pending' : undefined}>
                      <GutterCell index={rowNum} />
                      <TableCell {...CELL} className="col-numeric">{o.quantity_expected ?? '—'}</TableCell>
                      <TableCell {...CELL}>{formatDateCell(o.order_date || o.created_at)}</TableCell>
                      <TableCell {...CELL}>{formatDateCell(o.expected_delivery_date)}</TableCell>
                      <TableCell {...CELL}>{formatDateCell(o.received_at)}</TableCell>
                      <TableCell {...CELL} className="col-numeric">
                        {o.quantity_received != null ? o.quantity_received : (o.status === 'received' ? o.quantity_expected : '—')}
                      </TableCell>
                      <TableCell {...CELL} className="col-numeric">
                        {o.quantity_on_hand_before != null ? o.quantity_on_hand_before : '—'}
                      </TableCell>
                      <TableCell {...CELL} className="col-numeric">
                        {o.quantity_on_hand_after != null ? o.quantity_on_hand_after : '—'}
                      </TableCell>
                      <TableCell {...CELL}>
                        <Chip size="small" label={o.status === 'pending' ? 'awaiting delivery' : o.status} />
                        {orderRequest && (
                          <Chip
                            size="small"
                            color="warning"
                            label={`${bumbleBeeProposalTitle(orderRequest)} — pending approval`}
                            sx={{ ml: 0.5, mt: 0.5 }}
                          />
                        )}
                      </TableCell>
                      <TableCell {...CELL}>
                        {o.notes || '—'}
                        {orderRequest && (
                          <Typography variant="caption" color="warning.dark" display="block">
                            {proposalLines(orderRequest).join('; ')}
                          </Typography>
                        )}
                      </TableCell>
                      {!readOnly && <TableCell {...CELL} />}
                    </TableRow>
                  );
                })}

                {/* Scouter orders waiting for approval: not counted in upcoming / projected. */}
                {pendingOrderCreates.map((req, idx) => {
                  const p = req.proposedPayload || {};
                  return (
                    <TableRow key={req.id} className="row-pending">
                      <GutterCell index={sortedIncomingOrders.length + idx + 1} />
                      <TableCell {...CELL} className="col-numeric">{p.quantityExpected ?? '—'}</TableCell>
                      <TableCell {...CELL}>{formatDateCell(p.orderDate)}</TableCell>
                      <TableCell {...CELL}>{formatDateCell(p.expectedDeliveryDate)}</TableCell>
                      <TableCell {...CELL}>—</TableCell>
                      <TableCell {...CELL} className="col-numeric">—</TableCell>
                      <TableCell {...CELL} className="col-numeric">—</TableCell>
                      <TableCell {...CELL} className="col-numeric">—</TableCell>
                      <TableCell {...CELL}>
                        <Chip size="small" label="New order — pending approval" color="warning" />
                      </TableCell>
                      <TableCell {...CELL}>
                        {p.notes || '—'}
                        {req.requestedByName && (
                          <Typography variant="caption" color="text.secondary" display="block">
                            Sent by {req.requestedByName}
                          </Typography>
                        )}
                      </TableCell>
                      {!readOnly && <TableCell {...CELL} />}
                    </TableRow>
                  );
                })}

                {orderDraftRows.map((row, idx) => (
                  <TableRow key={row._key} className="row-draft">
                    <GutterCell index={sortedIncomingOrders.length + pendingOrderCreates.length + idx + 1} />
                    <TableCell {...CELL} className="col-numeric">
                      <SpreadsheetInput
                        type="number"
                        value={row.quantityExpected}
                        onChange={(e) => updateOrderDraft(row._key, { quantityExpected: e.target.value })}
                        inputProps={{ min: 1 }}
                      />
                    </TableCell>
                    <TableCell {...CELL}>
                      <SpreadsheetInput
                        type="date"
                        value={row.orderDate}
                        onChange={(e) => updateOrderDraft(row._key, { orderDate: e.target.value })}
                      />
                    </TableCell>
                    <TableCell {...CELL}>
                      <SpreadsheetInput
                        type="date"
                        value={row.expectedDeliveryDate}
                        onChange={(e) => updateOrderDraft(row._key, { expectedDeliveryDate: e.target.value })}
                      />
                    </TableCell>
                    <TableCell {...CELL}>—</TableCell>
                    <TableCell {...CELL} className="col-numeric">—</TableCell>
                    <TableCell {...CELL} className="col-numeric">—</TableCell>
                    <TableCell {...CELL} className="col-numeric">—</TableCell>
                    <TableCell {...CELL}>
                      <Chip size="small" label="draft" variant="outlined" />
                    </TableCell>
                    <TableCell {...CELL}>
                      <SpreadsheetInput
                        value={row.notes}
                        onChange={(e) => updateOrderDraft(row._key, { notes: e.target.value })}
                      />
                    </TableCell>
                    {!readOnly && (
                      <TableCell {...CELL} align="center">
                        <Tooltip title="Save order" describeChild>
                          <span>
                            <IconButton
                              size="small"
                              color="primary"
                              disabled={row.saving}
                              onClick={() => saveOrderDraftRow(row)} aria-label="Save order">
                              {row.saving ? <CircularProgress size={18} /> : <Check fontSize="small" />}
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title="Remove row">
                          <IconButton size="small" onClick={() => removeOrderDraftRow(row._key)}>
                            <Delete fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        {row.error && (
                          <Typography variant="caption" color="error" display="block">
                            {row.error}
                          </Typography>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}

                {sortedIncomingOrders.length === 0 && pendingOrderCreates.length === 0 && orderDraftRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={orderColCount} align="center" {...CELL}>
                      <Typography color="text.secondary" py={2}>
                        No deliveries yet — add a row below to place an order
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </FitTableContainer>

        {!readOnly && (
          <Box sx={{ mt: 1.5, display: 'flex', gap: 1, alignItems: 'center' }}>
            <Button size="small" variant="outlined" startIcon={<AddCircleOutline />} onClick={addOrderDraftRow}>
              Add row
            </Button>
            <Typography variant="caption" color="text.secondary">
              New orders at the bottom — edit cells, then click ✓ to save each row
            </Typography>
          </Box>
        )}
      </TabPanel>

      <Dialog open={inspChangeDialog.open} onClose={closeInspChangeDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          Request inspection {inspChangeDialog.action === 'delete' ? 'deletion' : 'edit'}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {inspChangeDialog.action === 'update'
              ? 'Explain why the pest agronomist should approve your proposed changes.'
              : 'Explain why this inspection should be removed.'}
          </Typography>
          <TextField
            fullWidth
            multiline
            minRows={3}
            label="Reason"
            value={inspChangeReason}
            onChange={(e) => setInspChangeReason(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={closeInspChangeDialog}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!inspChangeReason.trim() || inspChangeSubmitting}
            onClick={submitInspChangeRequest}
          >
            {inspChangeSubmitting ? 'Submitting…' : 'Submit request'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
