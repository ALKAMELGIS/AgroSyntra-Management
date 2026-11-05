import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
  Button,
  Chip,
  CircularProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Stack,
  Tabs,
  Tab,
} from '@mui/material';
import {
  CheckOutlined as ApproveIcon,
  CloseOutlined as RejectIcon,
  EditOutlined as EditIcon,
  DeleteOutlined as DeleteIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../contexts/NotificationContext';
import {
  canListChangeRequests,
  canReviewEntityChangeRequest,
  canViewIpmChangeRequestTab,
  canViewManpowerChangeRequestTab,
  canViewSeasonReopenChangeRequestTab,
  changeRequestActionLabel,
  changeRequestChangeLines,
  entityTypesForTab,
  ENTITY_BUMBLE_BEE_BOX_INSPECTION,
  ENTITY_MANPOWER_RECORD,
  ENTITY_PESTICIDE_APPLICATION,
  ENTITY_SEASON_REOPEN,
} from '../../utils/changeRequestAccess';
import {
  diffInspectionChangeRequest,
  formatInspectionRecordLabel,
  inspectionDeleteSummaryLines,
  sumInspectionBuckets,
} from '../../utils/bumbleBeeInspection';
import { refreshChangeRequestBadgeCount } from '../../hooks/useChangeRequestBadgeCount';
import InfoNote from '../../components/InfoNote';

const ENTITY_TYPE_LABELS = {
  [ENTITY_PESTICIDE_APPLICATION]: 'Pesticide application',
  [ENTITY_BUMBLE_BEE_BOX_INSPECTION]: 'Bumble bee inspection',
  [ENTITY_MANPOWER_RECORD]: 'Manpower record',
  [ENTITY_SEASON_REOPEN]: 'Season reopen',
  bio_field_setup: 'Biological control table',
  bumble_bee_deployment: 'Bumble bee deployment',
  bumble_bee_inventory: 'Bumble bee boxes on hand',
  bumble_bee_order: 'Bumble bee order',
};

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleString();
}

function formatDelta(delta) {
  if (delta == null) return '—';
  return delta > 0 ? `+${delta}` : String(delta);
}

function formatManpowerRecordLabel(snapshot) {
  if (!snapshot) return '—';
  const worker = snapshot.worker_name || snapshot.workerName || 'Worker';
  const date = String(snapshot.record_date || '').split('T')[0];
  const activity = snapshot.activity ? ` · ${snapshot.activity}` : '';
  return `${worker} · ${date}${activity}`;
}

function pesticideApplicationDate(snapshot) {
  return String(snapshot?.application_date || snapshot?.applicationDate || '').split('T')[0];
}

function formatPesticideRowLabel(snapshot) {
  if (!snapshot) return '—';
  const field = snapshot.field_name || snapshot.fieldName || '—';
  const crop = snapshot.crop_name || snapshot.field_crop_name || snapshot.cropName;
  const product = snapshot.product_name || snapshot.productName;
  const date = pesticideApplicationDate(snapshot);
  return [field, crop, product, date].filter(Boolean).join(' · ');
}

function pesticideBulkRecords(snapshot) {
  if (snapshot?.bulk && Array.isArray(snapshot.records)) return snapshot.records;
  return null;
}

function formatPesticideRecordLabel(snapshot) {
  const records = pesticideBulkRecords(snapshot);
  if (records) {
    const count = snapshot.count || records.length;
    return `Delete ${count} pesticide application${count === 1 ? '' : 's'}`;
  }
  return formatPesticideRowLabel(snapshot);
}

function PesticideListChanges({ req }) {
  const snapshot = req.snapshotBefore;
  const records = pesticideBulkRecords(snapshot);
  if (records?.length) {
    const preview = records.slice(0, 8).map(formatPesticideRowLabel);
    const extra = records.length > 8 ? ` +${records.length - 8} more` : '';
    return (
      <Typography variant="body2" sx={{ whiteSpace: 'normal' }}>
        {preview.join('; ')}{extra}
      </Typography>
    );
  }
  if (req.action === 'delete') {
    return (
      <Typography variant="body2">This application will be removed if approved.</Typography>
    );
  }
  return <Typography variant="body2">—</Typography>;
}

function PesticideReviewDetails({ request }) {
  if (!request || request.entityType !== ENTITY_PESTICIDE_APPLICATION) return null;
  const snapshot = request.snapshotBefore;
  const records = pesticideBulkRecords(snapshot);
  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="subtitle2" gutterBottom>
        Record: {formatPesticideRecordLabel(snapshot)}
      </Typography>
      {request.action === 'delete' ? (
        <>
          <Typography variant="body2" color="text.secondary" sx={{ mb: records?.length ? 1 : 0 }}>
            {records?.length
              ? 'These applications will be removed if approved.'
              : 'This application will be removed if approved.'}
          </Typography>
          {records?.length ? (
            <Stack spacing={0.5}>
              {records.map((row, idx) => (
                <Typography key={row.id || idx} variant="body2">
                  {formatPesticideRowLabel(row)}
                </Typography>
              ))}
            </Stack>
          ) : null}
        </>
      ) : (
        <Typography variant="body2" color="text.secondary">
          Proposed field updates will be applied if accepted.
        </Typography>
      )}
    </Box>
  );
}

function viewPathForRequest(req) {
  const entityType = req?.entityType || 'pesticide_application';
  if (String(entityType).startsWith('bumble_bee')) return '/ipm/bumble-bees';
  if (entityType === ENTITY_MANPOWER_RECORD) return '/manpower-record';
  if (entityType === 'bio_field_setup') return '/ipm/biological-control-record';
  if (entityType === ENTITY_SEASON_REOPEN) return null;
  return '/ipm/pesticide-applications';
}

function viewLabelForRequest(req) {
  const entityType = req?.entityType || 'pesticide_application';
  if (entityType === ENTITY_BUMBLE_BEE_BOX_INSPECTION) return 'View inspections';
  if (String(entityType).startsWith('bumble_bee')) return 'View bumble bees';
  if (entityType === ENTITY_MANPOWER_RECORD) return 'View records';
  if (entityType === 'bio_field_setup') return 'View tables';
  if (entityType === ENTITY_SEASON_REOPEN) return null;
  return 'View apps';
}

function proposedInspectionTotal(proposedPayload) {
  if (!proposedPayload) return null;
  return sumInspectionBuckets(proposedPayload);
}

function DeployDriftBanner({ snapshot, proposedPayload }) {
  const deployTotal = snapshot?.deploy_total != null ? Number(snapshot.deploy_total) : null;
  const proposedTotal = proposedInspectionTotal(proposedPayload);
  if (deployTotal == null || proposedTotal == null || proposedTotal === deployTotal) return null;
  return (
    <Alert severity="warning" sx={{ mb: 2 }}>
      Proposed total ({proposedTotal}) differs from last deployment ({deployTotal}). Review the recount before approving.
    </Alert>
  );
}

function DeployDriftChip({ snapshot, proposedPayload }) {
  const deployTotal = snapshot?.deploy_total != null ? Number(snapshot.deploy_total) : null;
  const proposedTotal = proposedInspectionTotal(proposedPayload);
  if (deployTotal == null || proposedTotal == null || proposedTotal === deployTotal) return null;
  return (
    <Chip
      size="small"
      color="warning"
      variant="outlined"
      label={`Deploy ${deployTotal} → proposed ${proposedTotal}`}
      sx={{ mb: 0.5 }}
    />
  );
}

function InspectionChangeCompact({ changes }) {
  if (!changes?.length) {
    return (
      <Typography variant="body2" color="text.secondary">
        No field changes
      </Typography>
    );
  }

  return (
    <Stack spacing={0.75}>
      {changes.map((c) => (
        <Box
          key={c.key}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            flexWrap: 'wrap',
            py: 0.25,
            borderBottom: '1px solid',
            borderColor: 'divider',
            '&:last-child': { borderBottom: 'none' },
          }}
        >
          <Chip size="small" label={c.label} variant="outlined" sx={{ minWidth: 52, fontWeight: 600 }} />
          <Typography variant="body2" component="span" sx={{ whiteSpace: 'nowrap' }}>
            {c.before}
            {' → '}
            <Box component="span" sx={{ fontWeight: 700 }}>{c.after}</Box>
            {c.delta != null && (
              <Box
                component="span"
                sx={{
                  ml: 0.75,
                  fontWeight: 600,
                  color: c.delta > 0 ? 'success.main' : c.delta < 0 ? 'error.main' : 'text.secondary',
                }}
              >
                ({formatDelta(c.delta)})
              </Box>
            )}
          </Typography>
        </Box>
      ))}
    </Stack>
  );
}

function InspectionListChanges({ req }) {
  if (req.action === 'delete') {
    const label = formatInspectionRecordLabel(req.snapshotBefore);
    return (
      <Chip
        size="small"
        color="error"
        variant="outlined"
        label={label !== '—' ? `Delete: ${label}` : 'Delete inspection'}
      />
    );
  }
  if (req.action === 'update' && req.snapshotBefore && req.proposedPayload) {
    return (
      <Box>
        <DeployDriftChip snapshot={req.snapshotBefore} proposedPayload={req.proposedPayload} />
        <InspectionChangeCompact
          changes={diffInspectionChangeRequest(req.snapshotBefore, req.proposedPayload)}
        />
      </Box>
    );
  }
  return '—';
}

function ManpowerListChanges({ req }) {
  if (req.action === 'delete') {
    const label = formatManpowerRecordLabel(req.snapshotBefore);
    return (
      <Chip
        size="small"
        color="error"
        variant="outlined"
        label={label !== '—' ? `Delete: ${label}` : 'Delete record'}
      />
    );
  }
  if (req.action === 'update') {
    return (
      <Chip size="small" color="primary" variant="outlined" label="Field updates proposed" />
    );
  }
  return '—';
}

function InspectionChangeDiffTable({ changes }) {
  if (!changes?.length) {
    return (
      <Typography variant="body2" color="text.secondary">
        No field changes detected.
      </Typography>
    );
  }

  return (
    <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
      <Table size="small">
        <TableHead>
          <TableRow sx={{ bgcolor: 'background.muted' }}>
            <TableCell>Field</TableCell>
            <TableCell align="right">Before</TableCell>
            <TableCell align="right">After</TableCell>
            <TableCell align="right">Change</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {changes.map((c) => (
            <TableRow key={c.key}>
              <TableCell>{c.label}</TableCell>
              <TableCell align="right">{c.before}</TableCell>
              <TableCell align="right" sx={{ fontWeight: 600 }}>{c.after}</TableCell>
              <TableCell align="right" sx={{ color: c.delta > 0 ? 'success.main' : c.delta < 0 ? 'error.main' : 'text.secondary' }}>
                {formatDelta(c.delta)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function InspectionDeleteSummary({ snapshot }) {
  const lines = inspectionDeleteSummaryLines(snapshot);
  return (
    <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
      <Table size="small">
        <TableBody>
          {lines.map((line) => (
            <TableRow key={line.label}>
              <TableCell sx={{ fontWeight: 600, width: '40%' }}>{line.label}</TableCell>
              <TableCell>{line.value}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function InspectionReviewDetails({ request }) {
  if (!request || request.entityType !== ENTITY_BUMBLE_BEE_BOX_INSPECTION) return null;

  const snapshot = request.snapshotBefore;
  const recordLabel = formatInspectionRecordLabel(snapshot);

  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="subtitle2" gutterBottom>
        Record: {recordLabel}
      </Typography>
      {request.action === 'delete' ? (
        <>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            This inspection will be removed if approved.
          </Typography>
          <InspectionDeleteSummary snapshot={snapshot} />
        </>
      ) : (
        <>
          <DeployDriftBanner snapshot={snapshot} proposedPayload={request.proposedPayload} />
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Proposed changes:
          </Typography>
          <InspectionChangeDiffTable
            changes={diffInspectionChangeRequest(snapshot, request.proposedPayload)}
          />
        </>
      )}
    </Box>
  );
}

function ManpowerReviewDetails({ request }) {
  if (!request || request.entityType !== ENTITY_MANPOWER_RECORD) return null;

  const snapshot = request.snapshotBefore;
  const recordLabel = formatManpowerRecordLabel(snapshot);

  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="subtitle2" gutterBottom>
        Record: {recordLabel}
      </Typography>
      {request.action === 'delete' ? (
        <Typography variant="body2" color="text.secondary">
          This manpower record will be removed if approved.
        </Typography>
      ) : (
        <Typography variant="body2" color="text.secondary">
          Proposed field updates will be applied to this approved record if accepted.
        </Typography>
      )}
    </Box>
  );
}

const STATUS_COLORS = {
  pending: 'warning',
  approved: 'success',
  rejected: 'error',
};

function defaultTabForUser(user) {
  if (canViewIpmChangeRequestTab(user)) return 'ipm';
  if (canViewManpowerChangeRequestTab(user)) return 'manpower';
  if (canViewSeasonReopenChangeRequestTab(user)) return 'seasons';
  return 'ipm';
}

export default function ChangeRequests() {
  const { user } = useAuth();
  const notify = useNotification();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(() => defaultTabForUser(user));
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [reviewDialog, setReviewDialog] = useState({ open: false, request: null, decision: null });
  const [reviewComment, setReviewComment] = useState('');
  const [reviewing, setReviewing] = useState(false);

  const allowed = canListChangeRequests(user);
  const showIpmTab = canViewIpmChangeRequestTab(user);
  const showManpowerTab = canViewManpowerChangeRequestTab(user);
  const showSeasonsTab = canViewSeasonReopenChangeRequestTab(user);
  const visibleTabCount = [showIpmTab, showManpowerTab, showSeasonsTab].filter(Boolean).length;
  const tabEntityTypes = useMemo(() => entityTypesForTab(activeTab), [activeTab]);
  const isSeasonsTab = activeTab === 'seasons';

  const loadRequests = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (isSeasonsTab) {
        const qs = params.toString();
        const res = await api.get(`/seasons/reopen-requests${qs ? `?${qs}` : ''}`);
        setRequests(res.data.data || []);
      } else {
        const entityType = tabEntityTypes.length === 1 ? tabEntityTypes[0] : null;
        if (entityType) params.set('entity_type', entityType);
        const qs = params.toString();
        const res = await api.get(`/ipm/change-requests${qs ? `?${qs}` : ''}`);
        const rows = res.data.data || [];
        if (tabEntityTypes.length > 1) {
          setRequests(rows.filter((row) => tabEntityTypes.includes(row.entityType)));
        } else {
          setRequests(rows);
        }
      }
    } catch (err) {
      notify.error(err.message || 'Failed to load change requests');
    } finally {
      setLoading(false);
    }
  }, [allowed, statusFilter, tabEntityTypes, isSeasonsTab, notify]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  useEffect(() => {
    if (activeTab === 'ipm' && !showIpmTab) {
      if (showManpowerTab) setActiveTab('manpower');
      else if (showSeasonsTab) setActiveTab('seasons');
    } else if (activeTab === 'manpower' && !showManpowerTab) {
      if (showIpmTab) setActiveTab('ipm');
      else if (showSeasonsTab) setActiveTab('seasons');
    } else if (activeTab === 'seasons' && !showSeasonsTab) {
      if (showIpmTab) setActiveTab('ipm');
      else if (showManpowerTab) setActiveTab('manpower');
    }
  }, [activeTab, showIpmTab, showManpowerTab, showSeasonsTab]);

  const openReview = (request, decision) => {
    setReviewDialog({ open: true, request, decision });
    setReviewComment('');
  };

  const closeReview = () => {
    setReviewDialog({ open: false, request: null, decision: null });
    setReviewComment('');
  };

  const submitReview = async () => {
    const { request, decision } = reviewDialog;
    if (!request || !decision) return;
    setReviewing(true);
    try {
      const path = request.entityType === ENTITY_SEASON_REOPEN
        ? `/seasons/reopen-requests/${request.id}/${decision}`
        : `/ipm/change-requests/${request.id}/${decision}`;
      await api.post(path, {
        reviewerComment: reviewComment.trim() || undefined,
      });
      notify.success(request.entityType === ENTITY_SEASON_REOPEN
        ? `Season reopen ${decision}`
        : `Change request ${decision}`);
      closeReview();
      await loadRequests();
      refreshChangeRequestBadgeCount();
    } catch (err) {
      notify.error(err.message || 'Failed to review request');
    } finally {
      setReviewing(false);
    }
  };

  if (!allowed) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="warning">You do not have permission to view change requests.</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Typography variant="h5" gutterBottom>
        Change Requests
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Review edit and delete requests for IPM records and approved manpower activity records,
        and auditor reopen requests for closed seasons.
      </Typography>

      {visibleTabCount > 1 && (
        <Tabs
          value={activeTab}
          onChange={(_e, value) => setActiveTab(value)}
          sx={{ mb: 2 }}
        >
          {showIpmTab ? <Tab value="ipm" label="IPM" /> : null}
          {showManpowerTab ? <Tab value="manpower" label="Manpower" /> : null}
          {showSeasonsTab ? <Tab value="seasons" label="Seasons" /> : null}
        </Tabs>
      )}

      <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
        <TextField
          select
          size="small"
          label="Status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="">All</MenuItem>
          <MenuItem value="pending">Pending</MenuItem>
          <MenuItem value="approved">Approved</MenuItem>
          <MenuItem value="rejected">Rejected</MenuItem>
        </TextField>
        <Button variant="outlined" onClick={loadRequests} disabled={loading}>
          Refresh
        </Button>
      </Stack>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : requests.length === 0 ? (
        <InfoNote severity="info">No change requests found.</InfoNote>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: 'background.muted' }}>
                <TableCell>Submitted</TableCell>
                {isSeasonsTab ? (
                  <>
                    <TableCell>Season</TableCell>
                    <TableCell>Site</TableCell>
                  </>
                ) : (
                  <>
                    <TableCell>Type</TableCell>
                    <TableCell>Record</TableCell>
                    <TableCell>Action</TableCell>
                    <TableCell>Changes</TableCell>
                  </>
                )}
                <TableCell>Requested By</TableCell>
                <TableCell>Reason</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Reviewed</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {requests.map((req) => {
                const entityType = req.entityType || (isSeasonsTab ? ENTITY_SEASON_REOPEN : 'pesticide_application');
                const isInspection = entityType === ENTITY_BUMBLE_BEE_BOX_INSPECTION;
                const isManpower = entityType === ENTITY_MANPOWER_RECORD;
                const isPesticide = entityType === ENTITY_PESTICIDE_APPLICATION;
                const canReview = canReviewEntityChangeRequest(user, entityType);
                const viewPath = viewPathForRequest(req);

                return (
                  <TableRow key={req.id} hover>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDate(req.createdAt)}</TableCell>
                    {isSeasonsTab ? (
                      <>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{req.seasonName || '—'}</TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{req.siteName || '—'}</TableCell>
                      </>
                    ) : (
                      <>
                        <TableCell>
                          <Typography variant="body2">{ENTITY_TYPE_LABELS[entityType] || entityType}</Typography>
                        </TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          {isInspection && formatInspectionRecordLabel(req.snapshotBefore)}
                          {isManpower && formatManpowerRecordLabel(req.snapshotBefore)}
                          {isPesticide && formatPesticideRecordLabel(req.snapshotBefore)}
                          {!isInspection && !isManpower && !isPesticide && (req.snapshotBefore?.label || '—')}
                        </TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            icon={req.action === 'delete' ? <DeleteIcon /> : <EditIcon />}
                            label={changeRequestActionLabel(req.action)}
                            color={req.action === 'delete' ? 'error' : 'primary'}
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell sx={{ minWidth: 220, maxWidth: 320, whiteSpace: 'normal', verticalAlign: 'top' }}>
                          {isInspection && <InspectionListChanges req={req} />}
                          {isManpower && <ManpowerListChanges req={req} />}
                          {isPesticide && <PesticideListChanges req={req} />}
                          {!isInspection && !isManpower && !isPesticide && (changeRequestChangeLines(req).join(' · ') || '—')}
                        </TableCell>
                      </>
                    )}
                    <TableCell>
                      <Typography variant="body2">{req.requestedByName || '—'}</Typography>
                      <Typography variant="caption" color="text.secondary">{req.requestedByEmail}</Typography>
                    </TableCell>
                    <TableCell sx={{ maxWidth: 220 }}>
                      <Typography variant="body2" noWrap title={req.reason}>{req.reason}</Typography>
                    </TableCell>
                    <TableCell>
                      <Chip size="small" label={req.status} color={STATUS_COLORS[req.status] || 'default'} />
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {req.reviewedAt ? (
                        <>
                          <Typography variant="body2">{req.reviewedByName || '—'}</Typography>
                          <Typography variant="caption" color="text.secondary">{formatDate(req.reviewedAt)}</Typography>
                        </>
                      ) : '—'}
                    </TableCell>
                    <TableCell align="right">
                      {req.status === 'pending' && canReview ? (
                        <Stack direction="row" spacing={1} justifyContent="flex-end">
                          <Button
                            size="small"
                            variant="contained"
                            color="success"
                            startIcon={<ApproveIcon />}
                            onClick={() => openReview(req, 'approve')}
                          >
                            Approve
                          </Button>
                          <Button
                            size="small"
                            variant="outlined"
                            color="error"
                            startIcon={<RejectIcon />}
                            onClick={() => openReview(req, 'reject')}
                          >
                            Reject
                          </Button>
                        </Stack>
                      ) : req.status !== 'pending' && viewPath ? (
                        <Button size="small" onClick={() => navigate(viewPath)}>
                          {viewLabelForRequest(req)}
                        </Button>
                      ) : '—'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog open={reviewDialog.open} onClose={closeReview} maxWidth="md" fullWidth>
        <DialogTitle>
          {reviewDialog.request?.entityType === ENTITY_SEASON_REOPEN
            ? (reviewDialog.decision === 'approve' ? 'Approve season reopen' : 'Reject season reopen')
            : (reviewDialog.decision === 'approve' ? 'Approve Change Request' : 'Reject Change Request')}
        </DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" sx={{ mb: 1 }}>
            <strong>Type:</strong> {ENTITY_TYPE_LABELS[reviewDialog.request?.entityType] || reviewDialog.request?.entityType}
          </Typography>
          {reviewDialog.request?.entityType === ENTITY_SEASON_REOPEN ? (
            <>
              <Typography variant="body2" sx={{ mb: 1 }}>
                <strong>Season:</strong> {reviewDialog.request?.seasonName || '—'}
              </Typography>
              <Typography variant="body2" sx={{ mb: 2 }}>
                <strong>Site:</strong> {reviewDialog.request?.siteName || '—'}
              </Typography>
            </>
          ) : (
            <Typography variant="body2" sx={{ mb: 2 }}>
              <strong>Action:</strong> {reviewDialog.request?.action}
            </Typography>
          )}
          <Typography variant="body2" sx={{ mb: 2 }}>
            <strong>Reason:</strong> {reviewDialog.request?.reason}
          </Typography>
          {reviewDialog.request?.entityType === ENTITY_SEASON_REOPEN && reviewDialog.decision === 'approve' ? (
            <Alert severity="warning" sx={{ mb: 2 }}>
              This restores only plantings uprooted as &quot;Season closed&quot; when the year was Ended.
              Historical years stay closed and just unlock for data entry. Reopen of an Ended year is blocked
              if another year is already Open — end that year first.
            </Alert>
          ) : null}
          <InspectionReviewDetails request={reviewDialog.request} />
          <ManpowerReviewDetails request={reviewDialog.request} />
          <PesticideReviewDetails request={reviewDialog.request} />
          {changeRequestChangeLines(reviewDialog.request).map((line) => (
            <Typography key={line} variant="body2" sx={{ mb: 1 }}>{line}</Typography>
          ))}
          <TextField
            fullWidth
            multiline
            minRows={3}
            label="Reviewer comment (optional)"
            value={reviewComment}
            onChange={(e) => setReviewComment(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={closeReview} disabled={reviewing}>Cancel</Button>
          <Button
            variant="contained"
            color={reviewDialog.decision === 'approve' ? 'success' : 'error'}
            onClick={submitReview}
            disabled={reviewing}
          >
            {reviewing ? 'Submitting…' : reviewDialog.decision === 'approve' ? 'Approve' : 'Reject'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
