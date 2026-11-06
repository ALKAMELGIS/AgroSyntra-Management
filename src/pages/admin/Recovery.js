import { useState, useEffect, useCallback } from 'react';
import {
  Container, Paper, Typography, Box, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Button, CircularProgress, Chip,
} from '@mui/material';
import { RestoreOutlined as RestoreIcon, RefreshOutlined as RefreshIcon } from '@mui/icons-material';
import { format } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../contexts/NotificationContext';
import { apiRequest } from '../../utils/api';
import { useTranslation } from 'react-i18next';
import { canRestoreDeletedSheets } from '../../utils/roleAccess';
import PageTitle from '../../components/PageTitle';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatMonthYear(monthYear) {
  if (!monthYear) return '—';
  const d = new Date(monthYear + '-01');
  return `${MONTH_NAMES[d.getMonth()]}-${String(d.getFullYear()).slice(2)}`;
}

function recordTypeLabel(type) {
  if (type === 'water') return 'Water Usage';
  if (type === 'electricity') return 'Electricity Usage';
  if (type === 'fogger') return 'Fogger Usage';
  return type;
}

export default function Recovery() {
  const notify = useNotification();
  const { user } = useAuth();
  const { t } = useTranslation();
  // Worker, agronomist and operation manager restore deleted sheets; CEO / farm manager do not.
  const canManage = canRestoreDeletedSheets(user);
  const [sheets, setSheets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [restoringId, setRestoringId] = useState(null);

  const loadSheets = useCallback(async () => {
    if (!canManage) return;
    setLoading(true);
    try {
      const res = await apiRequest('/pump-room/deleted-sheets');
      setSheets(res || []);
    } catch {
      notify.error('Failed to load deleted sheets');
    } finally {
      setLoading(false);
    }
  }, [canManage, notify]);

  useEffect(() => { loadSheets(); }, [loadSheets]);

  const handleRestore = async (id) => {
    setRestoringId(id);
    try {
      await apiRequest(`/pump-room/deleted-sheets/${id}/restore`, { method: 'POST' });
      notify.success('Sheet restored');
      loadSheets();
    } catch {
      notify.error('Failed to restore sheet');
    } finally {
      setRestoringId(null);
    }
  };

  if (!canManage) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Typography color="text.secondary">{t('adminAccess.recoveryNoPermission')}</Typography>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <PageTitle>Recovery</PageTitle>
          <Typography variant="body2" color="text.secondary">
            Restore deleted Pump Room sheets. More modules will appear here over time.
          </Typography>
        </Box>
        <Button startIcon={<RefreshIcon />} onClick={loadSheets} disabled={loading}>
          Refresh
        </Button>
      </Box>

      <Paper>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Module</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Month</TableCell>
                <TableCell>Site</TableCell>
                <TableCell align="right">Records</TableCell>
                <TableCell>Deleted</TableCell>
                <TableCell>Deleted By</TableCell>
                <TableCell align="right">Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                    <CircularProgress size={24} />
                  </TableCell>
                </TableRow>
              ) : sheets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    No deleted sheets to recover.
                  </TableCell>
                </TableRow>
              ) : (
                sheets.map((sheet) => (
                  <TableRow key={sheet.id} hover>
                    <TableCell>
                      <Chip label="Pump Room" size="small" variant="outlined" />
                    </TableCell>
                    <TableCell>{recordTypeLabel(sheet.record_type)}</TableCell>
                    <TableCell>{formatMonthYear(sheet.month_year)}</TableCell>
                    <TableCell>{sheet.site_name || 'All sites'}</TableCell>
                    <TableCell align="right">{sheet.record_count ?? 0}</TableCell>
                    <TableCell>
                      {sheet.deleted_at ? format(new Date(sheet.deleted_at), 'MMM d, yyyy h:mm a') : '—'}
                    </TableCell>
                    <TableCell>{sheet.deleted_by_name || '—'}</TableCell>
                    <TableCell align="right">
                      <Button
                        size="small"
                        variant="contained"
                        startIcon={<RestoreIcon />}
                        disabled={restoringId === sheet.id}
                        onClick={() => handleRestore(sheet.id)}
                        sx={{ bgcolor: '#2d4a34', '&:hover': { bgcolor: '#1f3424' } }}
                      >
                        Restore
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Container>
  );
}
