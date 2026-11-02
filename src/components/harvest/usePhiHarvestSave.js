import { useState } from 'react';
import {
  Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, List, ListItem, ListItemText,
} from '@mui/material';
import { createHarvest, previewHarvestPhi } from '../../utils/backendApi';
import { formatClockTime } from '../../utils/sprayCalendarPhi';

function formatDateEnGb(value) {
  const iso = String(value || '').slice(0, 10);
  const [year, month, day] = iso.split('-');
  if (!year || !month || !day) return iso;
  return `${day}/${month}/${year}`;
}

function formatSprayWhen(hit) {
  const datePart = formatDateEnGb(hit.sprayDate);
  const clock = formatClockTime(hit.sprayTime);
  return clock === '—' ? datePart : `${datePart} ${clock}`;
}

function formatPhiWhen(hit) {
  const instant = new Date(hit.phiEndDate);
  if (Number.isNaN(instant.getTime())) return formatDateEnGb(hit.phiEndDate);
  const datePart = instant.toLocaleDateString('en-GB', {
    timeZone: 'Asia/Dubai',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const timePart = instant.toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Dubai',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
  return `${datePart} ${timePart}`;
}

export default function usePhiHarvestSave({ notify, onSaved }) {
  const [phiDialog, setPhiDialog] = useState({ open: false, hits: [], payload: null });
  const [saving, setSaving] = useState(false);

  const commit = async (payload) => {
    setSaving(true);
    try {
      await createHarvest(payload);
      notify.success('Saved');
      onSaved?.();
    } catch (err) {
      notify.error(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const save = async (payload) => {
    let hits = [];
    try {
      hits = await previewHarvestPhi(payload.fieldId, payload.date, payload.segmentId, payload.startTime) || [];
    } catch {
      hits = [];
    }
    if (hits.length > 0) {
      setPhiDialog({ open: true, hits, payload });
      return;
    }
    await commit(payload);
  };

  const saveAnyway = async () => {
    const payload = phiDialog.payload;
    setPhiDialog({ open: false, hits: [], payload: null });
    if (payload) await commit(payload);
  };

  const dialog = (
    <Dialog
      open={phiDialog.open}
      onClose={() => setPhiDialog({ open: false, hits: [], payload: null })}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>This field is still in PHI</DialogTitle>
      <DialogContent dividers>
        <Alert severity="warning" sx={{ mb: 2 }}>
          You can still save. This will show on PHI Audit for the auditor / operation manager.
        </Alert>
        <List dense>
          {phiDialog.hits.map((hit) => (
            <ListItem key={hit.applicationId} disableGutters>
              <ListItemText
                primary={`${hit.fieldName} — ${hit.productName}`}
                secondary={`Spray ${formatSprayWhen(hit)} · PHI ends ${formatPhiWhen(hit)}`}
              />
            </ListItem>
          ))}
        </List>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setPhiDialog({ open: false, hits: [], payload: null })}>
          Cancel
        </Button>
        <Button variant="contained" color="warning" onClick={saveAnyway} disabled={saving}>
          Save anyway
        </Button>
      </DialogActions>
    </Dialog>
  );

  return { save, dialog, saving };
}
