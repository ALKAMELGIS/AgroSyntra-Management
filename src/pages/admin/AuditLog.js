import { useState, useEffect, useCallback } from 'react';
import {
  Container,
  Paper,
  Typography,
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  MenuItem,
  Button,
  Alert,
  CircularProgress,
  TablePagination,
  Chip,
} from '@mui/material';
import { HistoryOutlined as HistoryIcon, RefreshOutlined as RefreshIcon } from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import { queryAuditLogs } from '../../utils/backendApi';
import { format } from 'date-fns';
import { useNotification } from '../../contexts/NotificationContext';
import PageTitle from '../../components/PageTitle';

const ENTITY_OPTIONS = [
  'harvest',
  'fertigation',
  'ecph_reading',
  'field',
  'user',
  'recipe',
  'schedule',
  'report',
  'assignment',
  'gis_layer',
  'site',
  'season',
  'zone',
];

const ACTION_OPTIONS = [
  'CREATE',
  'UPDATE',
  'DELETE',
  'LOGIN',
  'LOGOUT',
  'EXPORT',
  'IMPORT',
];

const MANAGER_ROLES = ['ceo', 'farm_manager', 'operation_manager'];

function AuditLog() {
  const notify = useNotification();
  const { user } = useAuth();
  const canView = user && MANAGER_ROLES.includes(user.role);
  const [result, setResult] = useState({ logs: [], pagination: { total: 0, limit: 50, offset: 0 } });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({
    entity: '',
    action: '',
    userId: '',
    startDate: '',
    endDate: '',
  });
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(50);

  const loadLogs = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    setError('');
    try {
      const params = {
        limit: rowsPerPage,
        offset: page * rowsPerPage,
      };
      if (filters.entity) params.entity = filters.entity;
      if (filters.action) params.action = filters.action;
      if (filters.userId) params.userId = filters.userId;
      if (filters.startDate) params.startDate = filters.startDate;
      if (filters.endDate) params.endDate = filters.endDate;

      const data = await queryAuditLogs(params);
      setResult({
        logs: data.logs || [],
        pagination: data.pagination || { total: 0, limit: rowsPerPage, offset: params.offset },
      });
    } catch (err) {
      setError(err.message || 'Failed to load audit logs');
      setResult({ logs: [], pagination: { total: 0, limit: rowsPerPage, offset: 0 } });
    } finally {
      setLoading(false);
    }
  }, [canView, page, rowsPerPage, filters.entity, filters.action, filters.userId, filters.startDate, filters.endDate]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const handleChangePage = (_, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (e) => {
    setRowsPerPage(parseInt(e.target.value, 10));
    setPage(0);
  };

  const handleFilterChange = (field, value) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
    setPage(0);
  };

  const handleApplyFilters = () => {
    setPage(0);
    loadLogs();
  };

  const handleResetFilters = () => {
    setFilters({
      entity: '',
      action: '',
      userId: '',
      startDate: '',
      endDate: '',
    });
    setPage(0);
  };

  const total = result.pagination?.total ?? 0;

  if (!canView) {
    return (
      <Container maxWidth="md">
        <Paper elevation={3} sx={{ p: 4, mt: 2, textAlign: 'center' }}>
          <Typography color="error">You don&apos;t have permission to view the audit log.</Typography>
        </Paper>
      </Container>
    );
  }

  return (
    <Container maxWidth="xl">
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <HistoryIcon color="primary" sx={{ fontSize: 32 }} />
          <PageTitle>
            Audit Log
          </PageTitle>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          View activity history. Only managers and above can access this page.
        </Typography>

        {error && (
          <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 3 }}>
          <TextField
            select
            size="small"
            label="Entity"
            value={filters.entity}
            onChange={(e) => handleFilterChange('entity', e.target.value)}
            sx={{ minWidth: 140 }}
          >
            <MenuItem value="">All</MenuItem>
            {ENTITY_OPTIONS.map((opt) => (
              <MenuItem key={opt} value={opt}>
                {opt}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            label="Action"
            value={filters.action}
            onChange={(e) => handleFilterChange('action', e.target.value)}
            sx={{ minWidth: 120 }}
          >
            <MenuItem value="">All</MenuItem>
            {ACTION_OPTIONS.map((opt) => (
              <MenuItem key={opt} value={opt}>
                {opt}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            size="small"
            label="User ID"
            value={filters.userId}
            onChange={(e) => handleFilterChange('userId', e.target.value)}
            placeholder="Filter by user"
            sx={{ minWidth: 180 }}
          />
          <TextField
            size="small"
            label="From date"
            type="date"
            value={filters.startDate}
            onChange={(e) => handleFilterChange('startDate', e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            size="small"
            label="To date"
            type="date"
            value={filters.endDate}
            onChange={(e) => handleFilterChange('endDate', e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <Button variant="contained" onClick={handleApplyFilters}>
            Apply
          </Button>
          <Button variant="outlined" onClick={handleResetFilters}>
            Reset
          </Button>
          <Button
            variant="outlined"
            startIcon={loading ? <CircularProgress size={18} /> : <RefreshIcon />}
            onClick={loadLogs}
            disabled={loading}
          >
            Refresh
          </Button>
        </Box>

        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: 'background.muted' }}>
                <TableCell>Time</TableCell>
                <TableCell>User</TableCell>
                <TableCell>Action</TableCell>
                <TableCell>Entity</TableCell>
                <TableCell>Entity ID</TableCell>
                <TableCell>Details</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && result.logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                    <CircularProgress />
                  </TableCell>
                </TableRow>
              ) : result.logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 4 }} color="text.secondary">
                    No audit entries found.
                  </TableCell>
                </TableRow>
              ) : (
                result.logs.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {row.createdAt
                        ? format(new Date(row.createdAt), 'yyyy-MM-dd HH:mm:ss')
                        : '-'}
                    </TableCell>
                    <TableCell>
                      {row.userName || row.userEmail || row.userId || '-'}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={row.action}
                        size="small"
                        color={
                          row.action === 'DELETE'
                            ? 'error'
                            : row.action === 'CREATE'
                            ? 'success'
                            : 'default'
                        }
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>{row.entity || '-'}</TableCell>
                    <TableCell sx={{ fontFamily: 'var(--font-mono, ui-monospace, monospace)', fontSize: '0.875rem' }}>
                      {row.entityId ? String(row.entityId).slice(0, 8) + '…' : '-'}
                    </TableCell>
                    <TableCell sx={{ maxWidth: 200 }}>
                      {row.changes && typeof row.changes === 'object'
                        ? JSON.stringify(row.changes).slice(0, 60) + (JSON.stringify(row.changes).length > 60 ? '…' : '')
                        : row.metadata
                        ? JSON.stringify(row.metadata).slice(0, 60) + '…'
                        : '-'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>

        <TablePagination
          component="div"
          count={total}
          page={page}
          onPageChange={handleChangePage}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={handleChangeRowsPerPage}
          rowsPerPageOptions={[25, 50, 100]}
          labelRowsPerPage="Rows per page:"
        />
      </Box>
    </Container>
  );
}

export default AuditLog;
