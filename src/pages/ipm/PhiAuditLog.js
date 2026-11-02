import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
  Paper,
  CircularProgress,
  TextField,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Chip,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Grid,
} from '@mui/material';
import { CheckCircle, Edit as EditIcon, Refresh as RefreshIcon } from '@mui/icons-material';
import api from '../../utils/api';
import { useActiveSite } from '../../contexts/ActiveSiteContext';
import { useNotification } from '../../contexts/NotificationContext';
import { useAuth } from '../../contexts/AuthContext';
import { refreshPhiAuditBadgeCount } from '../../hooks/usePhiAuditBadgeCount';
import { excelTableSx, freezeColumnsSx, GutterCell, GUTTER_WIDTH } from '../../components/table/ExcelTable';
import { formatClockTime } from '../../utils/sprayCalendarPhi';

function formatDate(dateStr) {
  if (!dateStr) return '';
  const iso = String(dateStr).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [year, month, day] = iso.split('-').map(Number);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${day}-${months[month - 1]}-${String(year).slice(-2)}`;
  }
  const d = new Date(dateStr);
  const day = d.getDate();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${day}-${months[d.getMonth()]}-${String(d.getFullYear()).slice(-2)}`;
}

function formatDateAndClock(dateStr, timeStr) {
  const datePart = formatDate(dateStr);
  const clock = formatClockTime(timeStr);
  return clock === '—' ? datePart : `${datePart} ${clock}`;
}

function formatFarmDateTime(value) {
  if (!value) return '';
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return formatDate(value);
  const datePart = instant.toLocaleDateString('en-GB', {
    timeZone: 'Asia/Dubai',
    day: 'numeric',
    month: 'short',
    year: '2-digit',
  });
  const timePart = instant.toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Dubai',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
  return `${datePart} ${timePart}`;
}

function severityColor(severity) {
  switch (severity) {
    case 'high': return { bg: '#ffebee', color: '#c62828' };
    case 'medium': return { bg: '#fff3e0', color: '#e65100' };
    case 'low': return { bg: '#fff8e1', color: '#f57f17' };
    default: return { bg: '#f5f5f5', color: '#616161' };
  }
}

function statusChip(status) {
  switch (status) {
    case 'acknowledged': return <Chip size="small" label="Acknowledged" color="info" variant="outlined" />;
    case 'justified': return <Chip size="small" label="Justified" color="success" variant="outlined" />;
    default: return <Chip size="small" label="Unreviewed" color="warning" variant="outlined" />;
  }
}

// Harvest date and Field stay pinned: this log is 13 columns, and once Qty and
// Product have scrolled away every conflict looks alike.
const AUDIT_FROZEN_WIDTHS = [170, 140];

// Days-violated tints have to outrank excelTableSx hover, or a high-severity
// cell greys the moment the mouse crosses the row.
const severityCellSx = {
  '&&& .MuiTableBody-root .MuiTableRow-root .cell-sev-high': {
    backgroundColor: '#ffebee', color: '#c62828', fontWeight: 700,
  },
  '&&& .MuiTableBody-root .MuiTableRow-root .cell-sev-medium': {
    backgroundColor: '#fff3e0', color: '#e65100', fontWeight: 700,
  },
  '&&& .MuiTableBody-root .MuiTableRow-root .cell-sev-low': {
    backgroundColor: '#fff8e1', color: '#f57f17', fontWeight: 700,
  },
};

export default function PhiAuditLog() {
  const { activeSiteId } = useActiveSite();
  const { user } = useAuth();
  const { showSuccess, showError } = useNotification();
  const navigate = useNavigate();

  const isAuditor = user?.role === 'auditor';
  // Only the auditor confirms / dismisses PHI conflicts; everyone else is read-only.
  const canReview = isAuditor;

  const [data, setData] = useState([]);
  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(true);

  const [filterField, setFilterField] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterSeverity, setFilterSeverity] = useState('all');
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));

  const [ackDialog, setAckDialog] = useState({ open: false, row: null });
  const [ackStatus, setAckStatus] = useState('acknowledged');
  const [ackNotes, setAckNotes] = useState('');
  const [ackLoading, setAckLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const siteParam = activeSiteId ? `&siteId=${activeSiteId}` : '';
      const fieldParam = filterField ? `&fieldId=${filterField}` : '';
      const [conflictsRes, fieldsRes] = await Promise.all([
        api.get(`/phi-audit-log?dateFrom=${dateFrom}&dateTo=${dateTo}${siteParam}${fieldParam}&status=${filterStatus}&severity=${filterSeverity}`),
        api.get(`/fields?limit=10000${activeSiteId ? `&site_id=${activeSiteId}` : ''}`),
      ]);
      setData(conflictsRes.data?.data || []);
      setFields(fieldsRes.data?.data || []);
    } catch (err) {
      showError('Failed to load PHI audit log');
    } finally {
      setLoading(false);
    }
  }, [activeSiteId, filterField, filterStatus, filterSeverity, dateFrom, dateTo, showError]);

  useEffect(() => { loadData(); }, [loadData]);

  const openAckDialog = (row) => {
    setAckDialog({ open: true, row });
    setAckStatus(row.status === 'unreviewed' ? 'acknowledged' : row.status);
    setAckNotes(row.notes || '');
  };

  const handleAcknowledge = async () => {
    if (!ackDialog.row) return;
    setAckLoading(true);
    try {
      await api.put(`/phi-audit-log/${ackDialog.row.id}/acknowledge`, {
        status: ackStatus,
        notes: ackNotes,
      });
      showSuccess(ackStatus === 'justified' ? 'Conflict dismissed' : 'Violation confirmed');
      setAckDialog({ open: false, row: null });
      loadData();
      refreshPhiAuditBadgeCount();
    } catch (err) {
      showError('Failed to update conflict');
    } finally {
      setAckLoading(false);
    }
  };

  const filteredData = useMemo(() => data, [data]);

  return (
    <Box sx={{ p: { xs: 1, md: 3 } }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2} flexWrap="wrap" gap={1}>
        <Box>
          <Typography variant="h5" fontWeight={700}>PHI Audit Log</Typography>
          <Typography variant="body2" color="text.secondary">
            Harvests that occurred while a spray PHI was still active on the same segment / field
          </Typography>
        </Box>
        <Tooltip title="Refresh">
          <IconButton onClick={loadData}><RefreshIcon /></IconButton>
        </Tooltip>
      </Box>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 2 }} variant="outlined">
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={6} sm={3} md={2}>
            <TextField
              label="From"
              type="date"
              size="small"
              fullWidth
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
          <Grid item xs={6} sm={3} md={2}>
            <TextField
              label="To"
              type="date"
              size="small"
              fullWidth
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
          <Grid item xs={6} sm={3} md={2}>
            <FormControl size="small" fullWidth>
              <InputLabel>Field</InputLabel>
              <Select value={filterField} onChange={(e) => setFilterField(e.target.value)} label="Field">
                <MenuItem value="">All Fields</MenuItem>
                {fields.map((f) => (
                  <MenuItem key={f.id} value={f.id}>{f.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={6} sm={3} md={2}>
            <FormControl size="small" fullWidth>
              <InputLabel>Status</InputLabel>
              <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} label="Status">
                <MenuItem value="all">All</MenuItem>
                <MenuItem value="unreviewed">Unreviewed</MenuItem>
                <MenuItem value="acknowledged">Acknowledged</MenuItem>
                <MenuItem value="justified">Justified</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={6} sm={3} md={2}>
            <FormControl size="small" fullWidth>
              <InputLabel>Severity</InputLabel>
              <Select value={filterSeverity} onChange={(e) => setFilterSeverity(e.target.value)} label="Severity">
                <MenuItem value="all">All</MenuItem>
                <MenuItem value="high">High</MenuItem>
                <MenuItem value="medium">Medium</MenuItem>
                <MenuItem value="low">Low</MenuItem>
              </Select>
            </FormControl>
          </Grid>
        </Grid>
      </Paper>

      {loading ? (
        <Box display="flex" justifyContent="center" py={6}><CircularProgress /></Box>
      ) : filteredData.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">No PHI conflicts found for the selected filters.</Typography>
        </Paper>
      ) : (
        <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 'calc(100vh - 320px)' }}>
          <Table size="small" sx={[excelTableSx, freezeColumnsSx(AUDIT_FROZEN_WIDTHS, GUTTER_WIDTH), severityCellSx, { minWidth: 1100 }]}>
            <TableHead>
              <TableRow>
                <GutterCell />
                <TableCell className="col-frozen-0">Harvest</TableCell>
                <TableCell className="col-frozen-1">Field</TableCell>
                <TableCell>Segment</TableCell>
                <TableCell>Variety</TableCell>
                <TableCell className="col-numeric">Qty (kg)</TableCell>
                <TableCell>Product (Spray)</TableCell>
                <TableCell>Spray</TableCell>
                <TableCell>PHI End</TableCell>
                <TableCell className="col-numeric">Days Violated</TableCell>
                <TableCell>Severity</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredData.map((row, idx) => {
                const sev = severityColor(row.severity);
                return (
                  <TableRow key={row.id} hover>
                    <GutterCell index={idx + 1} />
                    <TableCell className="col-frozen-0" title={formatDateAndClock(row.harvestDate, row.harvestStartTime)}>
                      <Box component="span"
                        onClick={() => navigate(`/harvest/entry?fieldId=${row.fieldId}`)}
                        sx={{ color: 'primary.main', cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
                      >{formatDateAndClock(row.harvestDate, row.harvestStartTime)}</Box>
                    </TableCell>
                    <TableCell className="col-frozen-1" title={row.fieldName || ''}>{row.fieldName}</TableCell>
                    <TableCell>{row.segmentId || '—'}</TableCell>
                    <TableCell>{row.variety || '—'}</TableCell>
                    <TableCell className="col-numeric">{row.harvestQty?.toFixed(1)}</TableCell>
                    <TableCell>{row.productName}</TableCell>
                    <TableCell>
                      <Box component="span"
                        onClick={() => navigate(`/ipm/pesticide-applications?applicationId=${row.applicationId}`)}
                        sx={{ color: 'primary.main', cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
                      >{formatDateAndClock(row.sprayDate, row.sprayStartTime)}</Box>
                    </TableCell>
                    <TableCell>{formatFarmDateTime(row.phiEndDate)}</TableCell>
                    <TableCell className={`col-numeric cell-sev-${row.severity}`}>
                      {row.daysViolated}
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={row.severity.charAt(0).toUpperCase() + row.severity.slice(1)}
                        sx={{ backgroundColor: sev.bg, color: sev.color, fontWeight: 600, fontSize: 11 }}
                      />
                    </TableCell>
                    <TableCell>{statusChip(row.status)}</TableCell>
                    <TableCell align="center">
                      {canReview && (
                        <Tooltip title={row.status === 'unreviewed' ? 'Review conflict' : 'Edit review'}>
                          <IconButton size="small" onClick={() => openAckDialog(row)}>
                            {row.status === 'unreviewed' ? <CheckCircle fontSize="small" /> : <EditIcon fontSize="small" />}
                          </IconButton>
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Box mt={1}>
        <Typography variant="caption" color="text.secondary">
          Showing {filteredData.length} conflict{filteredData.length !== 1 ? 's' : ''}
        </Typography>
      </Box>

      {/* Acknowledge / Justify Dialog */}
      <Dialog open={ackDialog.open} onClose={() => setAckDialog({ open: false, row: null })} maxWidth="sm" fullWidth>
        <DialogTitle>Review PHI Conflict</DialogTitle>
        <DialogContent>
          {ackDialog.row && (
            <Box sx={{ mb: 2, mt: 1 }}>
              <Typography variant="body2" gutterBottom>
                <strong>Harvest:</strong> {formatDateAndClock(ackDialog.row.harvestDate, ackDialog.row.harvestStartTime)} — {ackDialog.row.fieldName} {ackDialog.row.segmentId ? `(${ackDialog.row.segmentId})` : ''}
              </Typography>
              <Typography variant="body2" gutterBottom>
                <strong>Spray:</strong> {ackDialog.row.productName} applied {formatDateAndClock(ackDialog.row.sprayDate, ackDialog.row.sprayStartTime)}, PHI ends {formatFarmDateTime(ackDialog.row.phiEndDate)}
              </Typography>
              <Typography variant="body2" gutterBottom>
                <strong>Days violated:</strong> {ackDialog.row.daysViolated}
              </Typography>
            </Box>
          )}
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>Decision</InputLabel>
            <Select value={ackStatus} onChange={(e) => setAckStatus(e.target.value)} label="Decision">
              <MenuItem value="acknowledged">Confirm violation</MenuItem>
              <MenuItem value="justified">Dismiss (false alarm)</MenuItem>
            </Select>
          </FormControl>
          {isAuditor && ackStatus === 'acknowledged' && (
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
              Confirming will notify the farm manager.
            </Typography>
          )}
          <TextField
            label="Notes / Justification"
            multiline
            rows={3}
            fullWidth
            value={ackNotes}
            onChange={(e) => setAckNotes(e.target.value)}
            placeholder="e.g. Different valve — spray was on V1, harvest on V2"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAckDialog({ open: false, row: null })}>Cancel</Button>
          <Button variant="contained" onClick={handleAcknowledge} disabled={ackLoading}>
            {ackLoading ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
