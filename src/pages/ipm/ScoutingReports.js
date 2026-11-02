import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box, Typography, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Button, Chip, IconButton, Alert, CircularProgress, Card, CardContent, Grid, Tooltip,
  MenuItem, TextField, Collapse, Dialog, DialogTitle, DialogContent, DialogActions,
  TablePagination, Select, InputLabel, FormControl, Stack, Tabs, Tab,
} from '@mui/material';
import {
  ExpandMoreOutlined as ExpandMore, ExpandLessOutlined as ExpandLess, CheckCircleOutlined as CheckCircle, Visibility, BugReportOutlined as BugReport, FilterListOutlined as FilterList,
  PhotoOutlined as PhotoIcon, LocationOnOutlined as LocationOn, RefreshOutlined as Refresh, AddOutlined as Add, EditOutlined as Edit, DeleteOutlined as Delete, PrintOutlined as Print, UndoOutlined as Undo,
} from '@mui/icons-material';
import api from '../../utils/api';
import { API_BASE } from '../../config/api';
import { useAuth } from '../../contexts/AuthContext';
import { useActiveSite } from '../../contexts/ActiveSiteContext';
import ScoutingReportForm from './ScoutingReportForm';
import ScoutingSummaryPanel from './ScoutingSummaryPanel';
import useAppLayout from '../../hooks/useAppLayout';
import useReadOnlyMode from '../../hooks/useReadOnlyMode';
import ReadOnlyBanner from '../../components/ReadOnlyBanner';
import { PAGE_KEYS } from '../../utils/roleAccess';
import { canReviewScouting, SCOUTING_OWNER_EDITABLE_STATUSES } from '../../utils/ipmAccess';
import useSeasonListDates from '../../hooks/useSeasonListDates';
import { DeleteSelectedButton, RowCheckbox, RowSelectCell, SelectAllHeadCell, deleteIdsSequentially } from '../../components/table/BulkSelect';
import { useRowSelection } from '../../hooks/useRowSelection';

const SEVERITY_COLORS = {
  none: 'default',
  low: 'success',
  medium: 'warning',
  high: 'error',
  critical: 'error',
};

const STATUS_COLORS = {
  submitted: 'warning',
  reviewed: 'info',
  resolved: 'success',
  returned: 'error',
};

const STATUS_LABELS = {
  submitted: 'Submitted',
  reviewed: 'Reviewed',
  resolved: 'Resolved',
  returned: 'Returned',
};

const statusLabel = (status) => STATUS_LABELS[status] || status;

// Roles that may edit or delete any report (review actions are separate: canReviewScouting).
// Mirrors backend ipmAccess.ts: CEO, farm manager and operation manager only watch.
const MANAGE_ROLES = ['agronomist', 'pest_agronomist'];

export default function ScoutingReports() {
  const { user } = useAuth();
  const readOnly = useReadOnlyMode(PAGE_KEYS.SCOUTING);
  const { activeSiteId } = useActiveSite();
  const { isMobile } = useAppLayout();
  const [searchParams, setSearchParams] = useSearchParams();
  const pageTab = searchParams.get('tab') === 'summary' ? 'summary' : 'reports';
  const [reports, setReports] = useState([]);
  const [fields, setFields] = useState([]);
  const [plantingRecords, setPlantingRecords] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedRow, setExpandedRow] = useState(null);
  const [photoDialog, setPhotoDialog] = useState({ open: false, src: '', caption: '' });
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [totalCount, setTotalCount] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  // When set, the form opens in edit mode pre-filled with this report.
  const [editingReport, setEditingReport] = useState(null);
  // When set, show the delete-confirmation dialog for this report id.
  const [deletingId, setDeletingId] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [detailsById, setDetailsById] = useState({});
  const selection = useRowSelection();

  // Filters
  const [filterField, setFilterField] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSeverity, setFilterSeverity] = useState('');
  const {
    startDate: filterStartDate,
    endDate: filterEndDate,
    setStartDate: setFilterStartDate,
    setEndDate: setFilterEndDate,
    seasonStart,
    seasonEnd,
    isReady: seasonDatesReady,
  } = useSeasonListDates();
  const [showFilters, setShowFilters] = useState(false);

  // Only the pest agronomist (or IPM admin) reviews: Reviewed / Resolved / Send back.
  const canReview = canReviewScouting(user);
  const canManage = MANAGE_ROLES.includes(user?.role);
  // Send-back dialog: { id, reason } while open.
  const [sendBack, setSendBack] = useState(null);
  const [sendingBack, setSendingBack] = useState(false);

  const handlePageTabChange = (_, value) => {
    if (value === 'summary') {
      setSearchParams({ tab: 'summary' });
      return;
    }
    setSearchParams({});
  };

  useEffect(() => {
    if (pageTab === 'summary' || !seasonDatesReady) return;
    loadData();
  }, [page, rowsPerPage, filterField, filterStatus, filterStartDate, filterEndDate, activeSiteId, pageTab, seasonDatesReady]);

  const loadData = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set('page', String(page + 1));
      params.set('limit', String(rowsPerPage));
      if (filterField) params.set('field_id', filterField);
      if (filterStatus) params.set('status', filterStatus);
      if (filterStartDate) params.set('start_date', filterStartDate);
      if (filterEndDate) params.set('end_date', filterEndDate);
      if (activeSiteId) params.set('site_id', activeSiteId);

      const plantingParams = activeSiteId ? `?site_id=${activeSiteId}` : '';
      const [reportsRes, fieldsRes, statsRes, plantingRes] = await Promise.all([
        api.get(`/scouting/reports?${params.toString()}`),
        api.get(`/fields?limit=500${activeSiteId ? `&site_id=${activeSiteId}` : ''}`),
        api.get(`/scouting/stats${activeSiteId ? `?site_id=${activeSiteId}` : ''}`),
        api.get(`/planting-records${plantingParams}`).catch(() => ({ data: { data: [] } })),
      ]);
      setReports(reportsRes.data.data || []);
      setTotalCount(reportsRes.data.meta?.total || 0);
      setFields(fieldsRes.data.data || []);
      setPlantingRecords(plantingRes.data?.data || plantingRes.data || []);
      setStats(statsRes.data.data || null);
    } catch (err) {
      console.error('Failed to load scouting data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (id, newStatus) => {
    try {
      await api.patch(`/scouting/reports/${id}/status`, { status: newStatus });
      setDetailsById((prev) => {
        const { [id]: _stale, ...rest } = prev;
        void _stale;
        return rest;
      });
      loadData();
    } catch (err) {
      alert(err.response?.data?.error?.message || err.message || 'Failed to update status');
    }
  };

  const handleSendBack = async () => {
    const reason = sendBack?.reason?.trim();
    if (!sendBack || !reason) return;
    setSendingBack(true);
    try {
      await api.patch(`/scouting/reports/${sendBack.id}/status`, { status: 'returned', reason });
      setDetailsById((prev) => {
        const { [sendBack.id]: _stale, ...rest } = prev;
        void _stale;
        return rest;
      });
      setSendBack(null);
      loadData();
    } catch (err) {
      alert(err.response?.data?.error?.message || err.message || 'Failed to send the report back');
    } finally {
      setSendingBack(false);
    }
  };

  const canSendBack = (report) => canReview && ['submitted', 'reviewed'].includes(report?.status);

  /**
   * The pest agronomist and agronomists can edit/delete anyone's report;
   * the scouter can edit their own only while it is submitted or sent back.
   * Backend enforces the same rule, so the UI is just an ergonomic filter —
   * requests from the wrong user still 403.
   */
  const canEdit = (report) => {
    if (canManage) return true;
    return user?.role === 'scouter'
      && report?.scout_user_id === user?.id
      && SCOUTING_OWNER_EDITABLE_STATUSES.includes(report?.status || 'submitted');
  };
  const canDelete = () => canManage;
  // Reviewers (pest agronomist / IPM admin) need the column for Reviewed / Resolved / Send back.
  const showActions = canManage || canReview || reports.some((r) => canEdit(r));
  const tableColSpan = 9 + (showActions ? 1 : 0) + (canManage && !readOnly ? 1 : 0);

  const handleEdit = async (report) => {
    try {
      // Re-fetch the detail so the edit form has the full child rows,
      // not just the summarized list-view version.
      const res = await api.get(`/scouting/reports/${report.id}`);
      setEditingReport(res.data.data);
      setFormOpen(true);
    } catch (err) {
      alert(err.response?.data?.error?.message || err.message || 'Failed to load report for editing');
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    setDeleting(true);
    try {
      await api.delete(`/scouting/reports/${deletingId}`);
      setDeletingId(null);
      setExpandedRow(null);
      setDetailsById((prev) => {
        const { [deletingId]: _gone, ...rest } = prev;
        void _gone;
        return rest;
      });
      loadData();
    } catch (err) {
      alert(err.response?.data?.error?.message || err.message || 'Failed to delete report');
    } finally {
      setDeleting(false);
    }
  };

  const handleBulkDelete = async () => {
    const ids = [...selection.selectedIds];
    if (!ids.length) return;
    if (!window.confirm(`Delete ${ids.length} selected scouting report(s)? This cannot be undone.`)) return;
    const deleted = await deleteIdsSequentially(ids, (id) => api.delete(`/scouting/reports/${id}`));
    selection.clear();
    setExpandedRow(null);
    loadData();
    if (deleted) alert(`Deleted ${deleted} report(s)`);
  };

  const toggleRow = async (id) => {
    if (expandedRow === id) {
      setExpandedRow(null);
      return;
    }
    setExpandedRow(id);
    if (!detailsById[id]) {
      try {
        // Fetch the report detail and any attached photos in parallel so
        // expansion feels instant even when the report has lots of photos.
        const [detailRes, photosRes] = await Promise.all([
          api.get(`/scouting/reports/${id}`),
          api.get(`/uploads/scouting_report/${id}`).catch(() => ({ data: { data: [] } })),
        ]);

        const detail = detailRes.data.data;
        const rawAttachments = photosRes.data?.data || photosRes.data || [];
        // The existing photo gallery expects objects with { id, filePath, caption }
        // whereas the generic attachments table returns { id, url, storage_key, … }.
        // For the Postgres-backed blob adapter we rebuild the URL from our
        // own API_BASE + access token so <img> tags authenticate correctly,
        // regardless of whatever PUBLIC_URL the server was configured with.
        const token = localStorage.getItem('almaha_access_token') || '';
        const buildPhotoUrl = (a) => {
          const key = a.storageKey || a.storage_key || '';
          if (key.startsWith('db:')) {
            const id2 = key.slice(3);
            const suffix = token ? `?t=${encodeURIComponent(token)}` : '';
            return `${API_BASE}/files/${id2}${suffix}`;
          }
          return a.url;
        };
        const photos = (Array.isArray(rawAttachments) ? rawAttachments : [])
          .filter((a) => (a.mimeType || a.mime_type || '').startsWith('image/'))
          .map((a) => ({
            id: a.id,
            filePath: buildPhotoUrl(a),
            caption: a.originalName || a.original_name || '',
          }));

        setDetailsById((prev) => ({ ...prev, [id]: { ...detail, photos } }));
      } catch (err) {
        console.error('Failed to load report detail:', err);
      }
    }
  };

  if (pageTab === 'reports' && loading && reports.length === 0) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{
        display: 'flex',
        flexDirection: { xs: 'column', sm: 'row' },
        justifyContent: 'space-between',
        alignItems: { xs: 'stretch', sm: 'center' },
        gap: 1.5,
        mb: 3,
      }}>
        <Typography variant="h4">Scouting Reports</Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          {pageTab === 'reports' && !readOnly && (
          <Button startIcon={<Add />} onClick={() => { setEditingReport(null); setFormOpen(true); }} variant="contained" size="small">
            New Report
          </Button>
          )}
          {pageTab === 'reports' && (
          <>
          {canManage && !readOnly && (
            <DeleteSelectedButton count={selection.size} onClick={handleBulkDelete} />
          )}
          <Button startIcon={<FilterList />} onClick={() => setShowFilters(!showFilters)} variant="outlined" size="small">
            Filters
          </Button>
          <Button startIcon={<Refresh />} onClick={loadData} variant="outlined" size="small">
            Refresh
          </Button>
          </>
          )}
        </Box>
      </Box>

      <Tabs value={pageTab} onChange={handlePageTabChange} sx={{ mb: 2 }}>
        <Tab label="Reports" value="reports" />
        <Tab label="Summary" value="summary" />
      </Tabs>

      {readOnly && <ReadOnlyBanner message="View only — you cannot create or edit scouting reports." />}

      {pageTab === 'summary' ? (
        <ScoutingSummaryPanel
          activeSiteId={activeSiteId}
          onOpenReport={(reportId) => {
            window.open(`/ipm/scouting-reports/${reportId}/print`, '_blank', 'noopener');
          }}
        />
      ) : (
      <>

      {/* Stats Cards */}
      {stats && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid size={{ xs: 6, md: 2 }}>
            <Card>
              <CardContent sx={{ textAlign: 'center', py: 1.5 }}>
                <Typography variant="h5" color="primary" >{stats.total_reports || 0}</Typography>
                <Typography variant="caption" color="text.secondary">Total (30d)</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 6, md: 2 }}>
            <Card>
              <CardContent sx={{ textAlign: 'center', py: 1.5 }}>
                <Typography variant="h5" color="warning.main" >{stats.pending_reports || 0}</Typography>
                <Typography variant="caption" color="text.secondary">Pending</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 6, md: 2 }}>
            <Card>
              <CardContent sx={{ textAlign: 'center', py: 1.5 }}>
                <Typography variant="h5" color="success.main" >{stats.resolved_reports || 0}</Typography>
                <Typography variant="caption" color="text.secondary">Resolved</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 6, md: 2 }}>
            <Card>
              <CardContent sx={{ textAlign: 'center', py: 1.5 }}>
                <Typography variant="h5">{Number(stats.avg_infestation || 0).toFixed(1)}%</Typography>
                <Typography variant="caption" color="text.secondary">Avg Infestation</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 6, md: 2 }}>
            <Card>
              <CardContent sx={{ textAlign: 'center', py: 1.5 }}>
                <Typography variant="h5" color="error" >{Number(stats.max_infestation || 0).toFixed(0)}%</Typography>
                <Typography variant="caption" color="text.secondary">Max Infestation</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 6, md: 2 }}>
            <Card>
              <CardContent sx={{ textAlign: 'center', py: 1.5 }}>
                <Typography variant="h5">{stats.fields_affected || 0}</Typography>
                <Typography variant="caption" color="text.secondary">Fields Affected</Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Filters */}
      <Collapse in={showFilters}>
        <Paper sx={{ p: 2, mb: 2 }}>
          <Grid container spacing={2} alignItems="center">
            <Grid size={{ xs: 12, md: 2.4 }}>
              <FormControl fullWidth size="small">
                <InputLabel id="scoutingreports-field-label-1">Field</InputLabel>
                <Select labelId="scoutingreports-field-label-1" value={filterField} label="Field" onChange={(e) => { setFilterField(e.target.value); setPage(0); }}>
                  <MenuItem value="">All Fields</MenuItem>
                  {fields.map((f) => <MenuItem key={f.id} value={f.id}>{f.name}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, md: 2.4 }}>
              <FormControl fullWidth size="small">
                <InputLabel id="scoutingreports-status-label-2">Status</InputLabel>
                <Select labelId="scoutingreports-status-label-2" value={filterStatus} label="Status" onChange={(e) => { setFilterStatus(e.target.value); setPage(0); }}>
                  <MenuItem value="">All Status</MenuItem>
                  <MenuItem value="submitted">Submitted</MenuItem>
                  <MenuItem value="reviewed">Reviewed</MenuItem>
                  <MenuItem value="resolved">Resolved</MenuItem>
                  <MenuItem value="returned">Returned</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, md: 2.4 }}>
              <TextField fullWidth size="small" label="From Date" type="date" InputLabelProps={{ shrink: true }}
                value={filterStartDate} onChange={(e) => { setFilterStartDate(e.target.value); setPage(0); }}
                inputProps={{ min: seasonStart || undefined, max: seasonEnd || undefined }} />
            </Grid>
            <Grid size={{ xs: 12, md: 2.4 }}>
              <TextField fullWidth size="small" label="To Date" type="date" InputLabelProps={{ shrink: true }}
                value={filterEndDate} onChange={(e) => { setFilterEndDate(e.target.value); setPage(0); }}
                inputProps={{ min: seasonStart || undefined, max: seasonEnd || undefined }} />
            </Grid>
            <Grid size={{ xs: 12, md: 2.4 }}>
              <Button variant="text" size="small" onClick={() => { setFilterField(''); setFilterStatus(''); setFilterSeverity(''); setFilterStartDate(seasonStart); setFilterEndDate(seasonEnd); setPage(0); }}>
                Clear Filters
              </Button>
            </Grid>
          </Grid>
        </Paper>
      </Collapse>

      {/* Reports — cards on phone, table on tablet+ */}
      {isMobile ? (
        <Stack spacing={1.5}>
          {reports.length === 0 ? (
            <Typography color="text.secondary" align="center" py={4}>No scouting reports found</Typography>
          ) : (
            reports.map((report) => {
              const isExpanded = expandedRow === report.id;
              const photoCount = report.photos?.length || 0;
              const pestName = report.pest_disease_name || report.custom_pest_name || 'Unknown';
              const pct = report.infestation_pct != null ? Number(report.infestation_pct) : null;
              return (
                <Card key={report.id} variant="outlined">
                  <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                    {canManage && !readOnly && (
                      <Box sx={{ mb: 0.5 }} onClick={(e) => e.stopPropagation()}>
                        <RowCheckbox
                          id={report.id}
                          selectedIds={selection.selectedIds}
                          onToggle={selection.toggle}
                          label={`Select report ${report.id}`}
                        />
                      </Box>
                    )}
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, mb: 1 }}>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <BugReport fontSize="small" color={report.pest_disease_category === 'disease' ? 'error' : 'warning'} />
                          <Typography fontWeight={700} noWrap>{pestName}</Typography>
                        </Box>
                        <Typography variant="body2" color="text.secondary">
                          {report.field_name || '—'} · {new Date(report.report_date).toLocaleDateString()}
                        </Typography>
                      </Box>
                      <Chip label={statusLabel(report.status)} size="small" color={STATUS_COLORS[report.status] || 'default'} />
                    </Box>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1 }}>
                      {pct !== null && (
                        <Chip size="small" variant="outlined" label={`${pct.toFixed(1)}% infestation`} />
                      )}
                      {report.severity && (
                        <Chip size="small" label={report.severity} color={SEVERITY_COLORS[report.severity] || 'default'} />
                      )}
                      {photoCount > 0 && (
                        <Chip icon={<PhotoIcon />} size="small" variant="outlined" label={photoCount} />
                      )}
                    </Box>
                    <Typography variant="caption" color="text.secondary" display="block">
                      Scout: {report.scout_name || '—'}
                    </Typography>
                    {canEdit(report) && (
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1.5 }}>
                        {canReview && report.status === 'submitted' && (
                          <Button size="small" variant="outlined" startIcon={<Visibility />} onClick={() => handleStatusChange(report.id, 'reviewed')}>
                            Review
                          </Button>
                        )}
                        {canReview && (report.status === 'submitted' || report.status === 'reviewed') && (
                          <Button size="small" variant="outlined" color="success" startIcon={<CheckCircle />} onClick={() => handleStatusChange(report.id, 'resolved')}>
                            Resolve
                          </Button>
                        )}
                        {canSendBack(report) && (
                          <Button size="small" variant="outlined" color="error" startIcon={<Undo />} onClick={() => setSendBack({ id: report.id, reason: '' })}>
                            Send back
                          </Button>
                        )}
                        {canEdit(report) && (
                          <IconButton size="small" onClick={() => handleEdit(report)} aria-label="Edit"><Edit fontSize="small" /></IconButton>
                        )}
                        {canDelete(report) && (
                          <IconButton size="small" color="error" onClick={() => setDeletingId(report.id)} aria-label="Delete"><Delete fontSize="small" /></IconButton>
                        )}
                      </Box>
                    )}
                    <Button size="small" onClick={() => toggleRow(report.id)} sx={{ mt: 1 }}>
                      {isExpanded ? 'Hide details' : 'Show details'}
                    </Button>
                    <Collapse in={isExpanded}>
                      <Box sx={{ mt: 1.5, p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
                        <ReportDetail report={report} detail={detailsById[report.id]} onOpenPhoto={setPhotoDialog} />
                      </Box>
                    </Collapse>
                  </CardContent>
                </Card>
              );
            })
          )}
          <TablePagination component="div" count={totalCount} page={page} onPageChange={(_, p) => setPage(p)}
            rowsPerPage={rowsPerPage} onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
            rowsPerPageOptions={[10, 20, 50]} />
        </Stack>
      ) : (
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: 'action.hover' }}>
              {canManage && !readOnly && (
                <SelectAllHeadCell
                  ids={reports.map((r) => r.id)}
                  selectedIds={selection.selectedIds}
                  onToggleAll={selection.toggleAll}
                  label="Select all scouting reports"
                  plain
                />
              )}
              <TableCell width={40} />
              <TableCell>Date</TableCell>
              <TableCell>Field</TableCell>
              <TableCell>Pest / Disease</TableCell>
              <TableCell align="center">Infestation %</TableCell>
              <TableCell align="center">Severity</TableCell>
              <TableCell align="center">Status</TableCell>
              <TableCell>Scout</TableCell>
              <TableCell align="center">Photos</TableCell>
              {showActions && <TableCell align="center">Actions</TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {reports.length === 0 ? (
              <TableRow>
                <TableCell colSpan={tableColSpan} align="center" sx={{ py: 4 }}>
                  <Typography color="text.secondary">No scouting reports found</Typography>
                </TableCell>
              </TableRow>
            ) : (
              reports.map((report) => {
                const isExpanded = expandedRow === report.id;
                const photoCount = report.photos?.length || 0;
                const pestName = report.pest_disease_name || report.custom_pest_name || 'Unknown';
                const pct = report.infestation_pct != null ? Number(report.infestation_pct) : null;

                return (
                  <Box component="tbody" key={report.id}>
                    <TableRow hover sx={{ cursor: 'pointer' }} onClick={() => toggleRow(report.id)}>
                      {canManage && !readOnly && (
                        <RowSelectCell
                          id={report.id}
                          selectedIds={selection.selectedIds}
                          onToggle={selection.toggle}
                          label={`Select report ${report.id}`}
                        />
                      )}
                      <TableCell>
                        <IconButton size="small">{isExpanded ? <ExpandLess /> : <ExpandMore />}</IconButton>
                      </TableCell>
                      <TableCell>{new Date(report.report_date).toLocaleDateString()}</TableCell>
                      <TableCell>{report.field_name || '—'}</TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <BugReport fontSize="small" color={report.pest_disease_category === 'disease' ? 'error' : 'warning'} />
                          {pestName}
                        </Box>
                      </TableCell>
                      <TableCell align="center">
                        {pct !== null ? (
                          <Typography sx={{ fontWeight: 600, color: pct >= 50 ? 'error.main' : pct >= 20 ? 'warning.main' : 'success.main' }}>
                            {pct.toFixed(1)}%
                          </Typography>
                        ) : '—'}
                      </TableCell>
                      <TableCell align="center">
                        {report.severity ? (
                          <Chip label={report.severity} size="small"
                            color={SEVERITY_COLORS[report.severity] || 'default'}
                            variant={report.severity === 'critical' ? 'filled' : 'outlined'} />
                        ) : '—'}
                      </TableCell>
                      <TableCell align="center">
                        <Chip label={statusLabel(report.status)} size="small" color={STATUS_COLORS[report.status] || 'default'} />
                      </TableCell>
                      <TableCell>{report.scout_name || '—'}</TableCell>
                      <TableCell align="center">
                        {photoCount > 0 ? (
                          <Chip icon={<PhotoIcon />} label={photoCount} size="small" variant="outlined" />
                        ) : '—'}
                      </TableCell>
                      {showActions && (
                        <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                          {canReview && report.status === 'submitted' && (
                            <Tooltip title="Mark Reviewed">
                              <IconButton size="small" color="info" onClick={() => handleStatusChange(report.id, 'reviewed')}>
                                <Visibility fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                          {canReview && (report.status === 'submitted' || report.status === 'reviewed') && (
                            <Tooltip title="Mark Resolved">
                              <IconButton size="small" color="success" onClick={() => handleStatusChange(report.id, 'resolved')}>
                                <CheckCircle fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                          {canSendBack(report) && (
                            <Tooltip title="Send back to scouter">
                              <IconButton size="small" color="error" onClick={() => setSendBack({ id: report.id, reason: '' })}>
                                <Undo fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                          {canEdit(report) && (
                            <Tooltip title="Edit report">
                              <IconButton size="small" onClick={() => handleEdit(report)}>
                                <Edit fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                          {canDelete(report) && (
                            <Tooltip title="Delete report">
                              <IconButton
                                size="small"
                                color="error"
                                onClick={() => setDeletingId(report.id)}
                              >
                                <Delete fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                        </TableCell>
                      )}
                    </TableRow>

                    {/* Expanded Detail Row */}
                    {isExpanded && (
                      <TableRow>
                        <TableCell colSpan={tableColSpan} sx={{ py: 0 }}>
                          <Collapse in={isExpanded}>
                            <Box sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 1, my: 1 }}>
                              <ReportDetail
                                report={report}
                                detail={detailsById[report.id]}
                                onOpenPhoto={setPhotoDialog}
                              />
                            </Box>
                          </Collapse>
                        </TableCell>
                      </TableRow>
                    )}
                  </Box>
                );
              })
            )}
          </TableBody>
        </Table>
        <TablePagination component="div" count={totalCount} page={page} onPageChange={(_, p) => setPage(p)}
          rowsPerPage={rowsPerPage} onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
          rowsPerPageOptions={[10, 20, 50]} />
      </TableContainer>
      )}

      </>
      )}

      {/* Photo Lightbox */}
      <Dialog open={photoDialog.open} onClose={() => setPhotoDialog({ open: false, src: '', caption: '' })} maxWidth="md" fullWidth>
        <DialogTitle>{photoDialog.caption || 'Scouting Photo'}</DialogTitle>
        <DialogContent>
          {photoDialog.src && (
            <img src={photoDialog.src} alt={photoDialog.caption || 'Photo'}
              style={{ width: '100%', height: 'auto', maxHeight: '70vh', objectFit: 'contain' }} />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPhotoDialog({ open: false, src: '', caption: '' })}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* New / Edit Scouting Report Form */}
      <ScoutingReportForm
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditingReport(null); }}
        fields={fields}
        plantingRecords={plantingRecords}
        editReport={editingReport}
        readOnly={readOnly}
        onSaved={() => {
          setEditingReport(null);
          setDetailsById({});
          loadData();
        }}
      />

      {/* Send back to the scouter */}
      <Dialog open={Boolean(sendBack)} onClose={() => !sendingBack && setSendBack(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Send report back to the scouter</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            The scouter will be notified and can fix and resubmit the report.
          </Typography>
          <TextField
            autoFocus
            fullWidth
            multiline
            minRows={3}
            required
            label="What needs fixing?"
            value={sendBack?.reason || ''}
            onChange={(e) => setSendBack((prev) => (prev ? { ...prev, reason: e.target.value } : prev))}
            inputProps={{ maxLength: 2000 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSendBack(null)} disabled={sendingBack}>Cancel</Button>
          <Button
            onClick={handleSendBack}
            color="error"
            variant="contained"
            disabled={sendingBack || !sendBack?.reason?.trim()}
          >
            {sendingBack ? 'Sending…' : 'Send back'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={Boolean(deletingId)} onClose={() => !deleting && setDeletingId(null)}>
        <DialogTitle>Delete this scouting report?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            This permanently removes the report and all its observations,
            trap-card counts, growth-stage measurements, and photos.
            This action is logged in the audit trail and cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeletingId(null)} disabled={deleting}>Cancel</Button>
          <Button
            onClick={handleDelete}
            color="error"
            variant="contained"
            disabled={deleting}
          >
            {deleting ? 'Deleting…' : 'Delete report'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

// ─── Expanded-row detail view ────────────────────────────────────

const DAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function ReportDetail({ report, detail, onOpenPhoto }) {
  const d = detail || report; // fall back to list-row data until detail arrives

  const header = [
    ['Crop', d.crop_name],
    ['Variety', d.variety],
    ['Area / Variety', d.area_variety],
    ['Density / area', d.density_per_area],
    ['Crop height', d.crop_height != null ? `${d.crop_height} cm` : null],
    ['Soil', d.soil_condition],
    ['Weather', d.weather],
    ['Wind', d.wind],
  ].filter(([, v]) => v !== null && v !== undefined && v !== '');

  const location = [
    d.bed_code && `bed ${d.bed_code}`,
    d.column_code && `col ${d.column_code}`,
    d.bay_code && `bay ${d.bay_code}`,
    d.valve_code && `valve ${d.valve_code}`,
    d.side && (d.side === 'fan' ? 'fan side' : 'wet-pad side'),
  ].filter(Boolean).join(' · ');

  const observations = d.observations || [];
  const insectObs = observations.filter((o) => o.category === 'insect');
  const diseaseObs = observations.filter((o) => o.category === 'disease');
  const growth = d.growth_stage;
  const trapCards = d.trap_cards || [];

  return (
    <Grid container spacing={2}>
      {/* Quick actions — available to anyone who can see the report */}
      <Grid size={12}>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, flexWrap: 'wrap' }}>
          <Button
            size="small"
            variant="outlined"
            startIcon={<Print fontSize="small" />}
            onClick={() => {
              // New tab so the existing session stays put and the
              // browser's print dialog can't steal focus from the list.
              window.open(`/ipm/scouting-reports/${report.id}/print`, '_blank', 'noopener');
            }}
          >
            Print / Save PDF
          </Button>
        </Box>
      </Grid>

      {/* Header summary */}
      {header.length > 0 && (
        <Grid size={12}>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            {header.map(([k, v]) => (
              <Box key={k}>
                <Typography variant="caption" color="text.secondary">{k}</Typography>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>{String(v)}</Typography>
              </Box>
            ))}
          </Box>
        </Grid>
      )}
      {location && (
        <Grid size={{ xs: 12, md: 6 }}>
          <Typography variant="caption" color="text.secondary">Location</Typography>
          <Typography variant="body2">{location}</Typography>
        </Grid>
      )}
      {(d.gps_lat && d.gps_lng) && (
        <Grid size={{ xs: 12, md: 6 }}>
          <Typography variant="caption" color="text.secondary">
            <LocationOn fontSize="small" sx={{ verticalAlign: 'middle', mr: 0.5 }} />
            GPS
          </Typography>
          <Typography variant="body2">{d.gps_lat}, {d.gps_lng}</Typography>
        </Grid>
      )}

      {/* Observations */}
      {insectObs.length > 0 && (
        <Grid size={12}>
          <Typography variant="subtitle2" sx={{ mt: 1, mb: 0.5, fontWeight: 700 }}>Insect counts</Typography>
          <ObservationsTable rows={insectObs} showPercent={false} />
        </Grid>
      )}
      {diseaseObs.length > 0 && (
        <Grid size={12}>
          <Typography variant="subtitle2" sx={{ mt: 1, mb: 0.5, fontWeight: 700 }}>Disease counts</Typography>
          <ObservationsTable rows={diseaseObs} showPercent={true} />
        </Grid>
      )}

      {/* Growth stage */}
      {growth && Object.values(growth).some((v) => v !== null && v !== undefined) && (
        <Grid size={12}>
          <Typography variant="subtitle2" sx={{ mt: 1, mb: 0.5, fontWeight: 700 }}>Growth stage</Typography>
          <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
            {[
              ['Trusses', growth.numberOfTrusses],
              ['Stems', growth.numberOfStems],
              ['Stem thickness', growth.stemThickness],
              ['Avg fruit wt', growth.avgFruitWeight != null ? `${growth.avgFruitWeight} g` : null],
              ['Fruits / plant', growth.fruitsPerPlant],
            ].filter(([, v]) => v !== null && v !== undefined).map(([k, v]) => (
              <Box key={k}>
                <Typography variant="caption" color="text.secondary">{k}</Typography>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>{String(v)}</Typography>
              </Box>
            ))}
          </Box>
        </Grid>
      )}

      {/* Trap cards */}
      {trapCards.length > 0 && (
        <Grid size={12}>
          <Typography variant="subtitle2" sx={{ mt: 1, mb: 0.5, fontWeight: 700 }}>Insect trap cards</Typography>
          <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'action.selected' }}>
                  <TableCell>Card</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Location</TableCell>
                  {DAY_LABELS.map((d) => <TableCell key={d} align="center">{d}</TableCell>)}
                  <TableCell align="center">Total</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {trapCards.map((c) => (
                  <TableRow key={c.id || c.cardNumber}>
                    <TableCell>{c.cardNumber}</TableCell>
                    <TableCell>{c.insectType || '—'}</TableCell>
                    <TableCell>{c.trapLocation || '—'}</TableCell>
                    {DAY_KEYS.map((k) => (
                      <TableCell key={k} align="center">{c[k] ?? '—'}</TableCell>
                    ))}
                    <TableCell align="center" sx={{ fontWeight: 600 }}>{c.total ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>
        </Grid>
      )}

      {/* Comments / notes */}
      {(d.comments || d.notes) && (
        <Grid size={12}>
          <Typography variant="subtitle2" color="text.secondary">Comments</Typography>
          <Typography variant="body2">{d.comments || d.notes}</Typography>
        </Grid>
      )}

      {/* Sent back — reason from the pest agronomist */}
      {d.review_notes && (
        <Grid size={12}>
          <Alert severity={d.status === 'returned' ? 'warning' : 'info'}>
            {d.status === 'returned' ? 'Sent back' : 'Previously sent back'}
            {d.returned_at && ` on ${new Date(d.returned_at).toLocaleDateString()}`}: {d.review_notes}
          </Alert>
        </Grid>
      )}

      {/* Reviewer */}
      {d.reviewed_by && (
        <Grid size={{ xs: 12, md: 6 }}>
          <Typography variant="caption" color="text.secondary">Reviewed by</Typography>
          <Typography variant="body2">
            {d.reviewer_name || d.reviewed_by}
            {d.reviewed_at && ` on ${new Date(d.reviewed_at).toLocaleDateString()}`}
          </Typography>
        </Grid>
      )}

      {/* Photos */}
      {d.photos && d.photos.length > 0 && (
        <Grid size={12}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>Photos</Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {d.photos.map((photo) => (
              <Box key={photo.id}
                sx={{
                  width: 100, height: 100, borderRadius: 1, overflow: 'hidden',
                  cursor: 'pointer', border: '1px solid', borderColor: 'divider',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'grey.100',
                }}
                onClick={() => onOpenPhoto({ open: true, src: photo.filePath, caption: photo.caption || '' })}
              >
                {photo.filePath ? (
                  <img src={photo.filePath} alt={photo.caption || 'Scouting photo'}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                ) : (
                  <PhotoIcon color="disabled" />
                )}
              </Box>
            ))}
          </Box>
        </Grid>
      )}
    </Grid>
  );
}

function ObservationsTable({ rows, showPercent }) {
  return (
    <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
      <Table size="small">
        <TableHead>
          <TableRow sx={{ bgcolor: 'action.selected' }}>
            <TableCell>Name</TableCell>
            <TableCell>Unit</TableCell>
            <TableCell>Method</TableCell>
            {[1, 2, 3, 4, 5].map((n) => <TableCell key={n} align="center">P{n}</TableCell>)}
            <TableCell align="center">Total</TableCell>
            <TableCell align="center">Avg</TableCell>
            {showPercent && <TableCell align="center">%</TableCell>}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id || r.pestName}>
              <TableCell>{r.pestName}</TableCell>
              <TableCell>{r.samplingUnit || '—'}</TableCell>
              <TableCell>{r.samplingMethod || '—'}</TableCell>
              {[1, 2, 3, 4, 5].map((n) => (
                <TableCell key={n} align="center">{r[`count${n}`] ?? '—'}</TableCell>
              ))}
              <TableCell align="center" sx={{ fontWeight: 600 }}>{r.total ?? '—'}</TableCell>
              <TableCell align="center" sx={{ fontWeight: 600 }}>
                {r.average != null ? Number(r.average).toFixed(2) : '—'}
              </TableCell>
              {showPercent && (
                <TableCell align="center">
                  {r.percent != null ? `${Number(r.percent).toFixed(1)}%` : '—'}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Paper>
  );
}
