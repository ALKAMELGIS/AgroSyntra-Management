import { useState, useEffect } from 'react';
import {
  Container, Paper, Typography, Box, Button, TextField, Dialog, DialogTitle, DialogContent,
  DialogActions, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  IconButton, Chip, Checkbox, FormGroup, FormControlLabel, Collapse,
} from '@mui/material';
import { AddOutlined as AddIcon, DeleteOutlined as DeleteIcon,
  ExpandMoreOutlined as ExpandIcon, ExpandLessOutlined as CollapseIcon,
} from '@mui/icons-material';
import { apiRequest } from '../../utils/api';
import { useNotification } from '../../contexts/NotificationContext';
import { useConfirmDialog } from '../../components/ConfirmDialog';
import { format } from 'date-fns';
import PageTitle from '../../components/PageTitle';

const AVAILABLE_EVENTS = [
  'harvest.created', 'harvest.updated', 'harvest.deleted',
  'fertigation.created', 'fertigation.updated',
  'ecph.created', 'ecph.updated',
  'task.created', 'task.updated',
  'alert.triggered',
];

export default function Webhooks() {
  const [webhooks, setWebhooks] = useState([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [selectedEvents, setSelectedEvents] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [deliveries, setDeliveries] = useState([]);
  const notify = useNotification();
  const [confirm, confirmDialog] = useConfirmDialog();

  const loadWebhooks = () => {
    apiRequest('/webhooks').then((d) => setWebhooks(d || [])).catch(() => {});
  };
  useEffect(loadWebhooks, []);

  const handleCreate = async () => {
    if (!url.trim() || selectedEvents.length === 0) { notify.warning('URL and at least one event are required'); return; }
    try {
      await apiRequest('/webhooks', { method: 'POST', body: JSON.stringify({ url, events: selectedEvents }) });
      notify.success('Webhook created');
      setCreateOpen(false);
      setUrl('');
      setSelectedEvents([]);
      loadWebhooks();
    } catch (err) { notify.error(err.message); }
  };

  const handleDelete = async (id) => {
    if (await confirm('Delete this webhook?')) {
      try {
        await apiRequest(`/webhooks/${id}`, { method: 'DELETE' });
        notify.success('Webhook deleted');
        loadWebhooks();
      } catch (err) { notify.error(err.message); }
    }
  };

  const toggleExpand = async (id) => {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    try {
      const d = await apiRequest(`/webhooks/${id}/deliveries`);
      setDeliveries(d || []);
    } catch { setDeliveries([]); }
  };

  const toggleEvent = (event) => {
    setSelectedEvents((prev) => prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]);
  };

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 3, mb: 3 }}>
        <PageTitle>
          Webhooks
        </PageTitle>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>Add Webhook</Button>
      </Box>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>URL</TableCell>
              <TableCell>Events</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Created</TableCell>
              <TableCell align="center">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {webhooks.map((wh) => (
              <>
                <TableRow key={wh.id} hover onClick={() => toggleExpand(wh.id)} sx={{ cursor: 'pointer' }}>
                  <TableCell><Typography variant="body2" sx={{ fontFamily: 'var(--font-mono, ui-monospace, monospace)' }}>{wh.url}</Typography></TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                      {wh.events?.map((e) => <Chip key={e} label={e} size="small" variant="outlined" />)}
                    </Box>
                  </TableCell>
                  <TableCell><Chip label={wh.is_active ? 'Active' : 'Inactive'} color={wh.is_active ? 'success' : 'default'} size="small" /></TableCell>
                  <TableCell>{wh.created_at ? format(new Date(wh.created_at), 'MMM d, yyyy') : ''}</TableCell>
                  <TableCell align="center">
                    <IconButton size="small" onClick={(e) => { e.stopPropagation(); toggleExpand(wh.id); }} aria-label={expandedId === wh.id ? 'Hide deliveries' : 'Show deliveries'} aria-expanded={expandedId === wh.id}>
                      {expandedId === wh.id ? <CollapseIcon /> : <ExpandIcon />}
                    </IconButton>
                    <IconButton size="small" color="error" onClick={(e) => { e.stopPropagation(); handleDelete(wh.id); }} aria-label="Delete">
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
                <TableRow key={`${wh.id}-deliveries`}>
                  <TableCell colSpan={5} sx={{ p: 0, border: expandedId === wh.id ? undefined : 'none' }}>
                    <Collapse in={expandedId === wh.id}>
                      <Box sx={{ p: 2, bgcolor: 'background.muted' }}>
                        <Typography variant="subtitle2" sx={{ mb: 1 }}>Recent Deliveries</Typography>
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell>Event</TableCell>
                              <TableCell>Status</TableCell>
                              <TableCell>Time</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {deliveries.map((d) => (
                              <TableRow key={d.id}>
                                <TableCell>{d.event}</TableCell>
                                <TableCell>
                                  <Chip label={d.status_code || 'Error'} color={d.status_code >= 200 && d.status_code < 300 ? 'success' : 'error'} size="small" />
                                </TableCell>
                                <TableCell>{d.delivered_at ? format(new Date(d.delivered_at), 'MMM d, h:mm a') : ''}</TableCell>
                              </TableRow>
                            ))}
                            {deliveries.length === 0 && (
                              <TableRow><TableCell colSpan={3} align="center">No deliveries yet</TableCell></TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </Box>
                    </Collapse>
                  </TableCell>
                </TableRow>
              </>
            ))}
            {webhooks.length === 0 && (
              <TableRow><TableCell colSpan={5} align="center">No webhooks configured</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Webhook</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField fullWidth label="Webhook URL" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/webhook" />
            <Typography variant="subtitle2">Events:</Typography>
            <FormGroup>
              {AVAILABLE_EVENTS.map((event) => (
                <FormControlLabel key={event} control={<Checkbox checked={selectedEvents.includes(event)} onChange={() => toggleEvent(event)} size="small" />} label={event} />
              ))}
            </FormGroup>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate}>Create</Button>
        </DialogActions>
      </Dialog>
      {confirmDialog}
    </Container>
  );
}
