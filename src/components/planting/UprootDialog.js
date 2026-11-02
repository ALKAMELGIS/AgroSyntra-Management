import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, TextField, Typography,
} from '@mui/material';
import SegmentSelector from '../SegmentSelector';
import { apiRequest } from '../../utils/api';
import { useNotification } from '../../contexts/NotificationContext';
import {
  formatUprootNotFoundWarning,
  formatUprootSummary,
  occupancyTokensForPicker,
  postUproot,
  segmentsPayloadFromSelector,
  todayYmd,
} from '../../utils/plantingOccupancy';

export default function UprootDialog({
  open,
  onClose,
  fieldId,
  fieldName,
  occupancy,
  source,
  onSuccess,
}) {
  const notify = useNotification();
  const [uprootDate, setUprootDate] = useState(todayYmd());
  const [reason, setReason] = useState('');
  const [segments, setSegments] = useState('ALL');
  const [submitting, setSubmitting] = useState(false);

  const allowedTokens = useMemo(() => occupancyTokensForPicker(occupancy), [occupancy]);
  const hasOccupancy = (occupancy?.rows?.length || 0) > 0 || (occupancy?.occupied?.length || 0) > 0;

  useEffect(() => {
    if (!open) return;
    setUprootDate(todayYmd());
    setReason('');
    setSegments('ALL');
  }, [open, fieldId]);

  const handleSubmit = async () => {
    const payload = segmentsPayloadFromSelector(segments);
    if (!payload) {
      notify.error('Select segments to uproot');
      return;
    }
    if (!uprootDate) {
      notify.error('Choose an uproot date');
      return;
    }
    setSubmitting(true);
    try {
      const summary = await postUproot(apiRequest, source, {
        fieldId,
        segments: payload,
        uprootDate,
        reason: reason.trim() || null,
      });
      notify.success(formatUprootSummary(summary));
      const missing = formatUprootNotFoundWarning(summary);
      if (missing) notify.warning(missing);
      onSuccess?.(summary);
      onClose?.();
    } catch (err) {
      notify.error(err.message || 'Uproot failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Uproot {fieldName || 'field'}</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Frees the selected segments for the next cycle. Harvest, sprays and manpower stay on the finished cycle.
        </Typography>
        {!hasOccupancy && (
          <Alert severity="info" sx={{ mb: 2 }}>Nothing is currently growing on this field.</Alert>
        )}
        <TextField
          size="small"
          type="date"
          label="Uproot date"
          value={uprootDate}
          onChange={(e) => setUprootDate(e.target.value)}
          InputLabelProps={{ shrink: true }}
          fullWidth
          sx={{ mb: 2 }}
        />
        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" color="text.secondary" fontWeight={600}>Segments</Typography>
          <Box sx={{ mt: 0.5, border: '1px solid', borderColor: 'divider', borderRadius: 1, px: 0.5, py: 0.25 }}>
            <SegmentSelector
              value={segments}
              onChange={setSegments}
              fieldId={fieldId}
              allowedTokens={allowedTokens}
              compact
            />
          </Box>
        </Box>
        <TextField
          size="small"
          label="Reason (optional)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. cycle 1 finished"
          fullWidth
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={submitting || !hasOccupancy || !segments}
        >
          {submitting ? <CircularProgress size={16} color="inherit" /> : 'Uproot'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
