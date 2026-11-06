import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Switch, Chip, Button, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, IconButton, Tooltip,
} from '@mui/material';
import { AddOutlined as Add, DeleteOutlined as Delete } from '@mui/icons-material';
import { apiRequest } from '../../utils/api';
import { useNotification } from '../../contexts/NotificationContext';
import { TableSkeleton } from '../../components/LoadingSkeleton';
import PageTitle from '../../components/PageTitle';

export default function FeatureFlags() {
  const notify = useNotification();
  const [flags, setFlags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ key: '', description: '' });

  const load = useCallback(async () => {
    try {
      const data = await apiRequest('/feature-flags');
      setFlags(data || []);
    } catch (err) { notify.error(err.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleToggle = async (flag) => {
    try {
      await apiRequest(`/feature-flags/${flag.id}`, {
        method: 'PUT',
        body: JSON.stringify({ enabled: !flag.enabled }),
      });
      setFlags((prev) => prev.map((f) => f.id === flag.id ? { ...f, enabled: !f.enabled } : f));
    } catch (err) { notify.error(err.message); }
  };

  const handleAdd = async () => {
    try {
      await apiRequest('/feature-flags', {
        method: 'POST',
        body: JSON.stringify({ key: form.key, description: form.description, enabled: false }),
      });
      setAddOpen(false);
      setForm({ key: '', description: '' });
      load();
      notify.success('Flag created');
    } catch (err) { notify.error(err.message); }
  };

  const handleDelete = async (id) => {
    try {
      await apiRequest(`/feature-flags/${id}`, { method: 'DELETE' });
      setFlags((prev) => prev.filter((f) => f.id !== id));
      notify.success('Flag deleted');
    } catch (err) { notify.error(err.message); }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <PageTitle>Feature Flags</PageTitle>
        <Button variant="contained" startIcon={<Add />} onClick={() => setAddOpen(true)}>
          Add Flag
        </Button>
      </Box>

      {loading ? <TableSkeleton rows={4} columns={4} /> : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Key</TableCell>
                <TableCell>Description</TableCell>
                <TableCell>Roles</TableCell>
                <TableCell align="center">Enabled</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {flags.map((flag) => (
                <TableRow key={flag.id}>
                  <TableCell><code>{flag.key}</code></TableCell>
                  <TableCell>{flag.description}</TableCell>
                  <TableCell>
                    {flag.roles?.length > 0
                      ? flag.roles.map((r) => <Chip key={r} label={r} size="small" sx={{ mr: 0.5 }} />)
                      : <Chip label="All" size="small" variant="outlined" />}
                  </TableCell>
                  <TableCell align="center">
                    <Switch checked={flag.enabled} onChange={() => handleToggle(flag)} />
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title="Delete">
                      <IconButton size="small" onClick={() => handleDelete(flag.id)}>
                        <Delete fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Feature Flag</DialogTitle>
        <DialogContent>
          <TextField fullWidth label="Key (lowercase, underscores)" value={form.key}
            onChange={(e) => setForm({ ...form, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })}
            sx={{ mt: 2, mb: 2 }} placeholder="e.g. new_dashboard" />
          <TextField fullWidth label="Description" value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleAdd} disabled={!form.key}>Create</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
