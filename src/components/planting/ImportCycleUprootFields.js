import { Box, Button, TextField, Typography } from '@mui/material';
import { isValidImportUprootDate } from '../../utils/importUprootDates';
import InfoNote from '../InfoNote';

export default function ImportCycleUprootFields({
  slots = [],
  dates = {},
  onDateChange,
  extras = [],
  onAddExtra,
  onExtraChange,
  onRemoveExtra,
}) {
  if (!slots.length && !extras.length) return null;

  return (
    <Box sx={{ mb: 2 }}>
      {slots.length > 0 && (
        <InfoNote severity="info" sx={{ mb: 1.5 }}>
          These cycles plant the same land again. Enter an uproot date on or after the
          previous plant and before the next. Harvests, sprays and manpower stay on the
          finished cycle.
        </InfoNote>
      )}
      {slots.map((slot) => {
        const value = dates[slot.id] || '';
        const invalid = Boolean(value) && !isValidImportUprootDate(value, slot.afterDate, slot.beforeDate);
        return (
          <Box key={slot.id} sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 1.5, flexWrap: 'wrap' }}>
            <Typography variant="body2" sx={{ minWidth: 280 }}>
              <strong>{slot.fieldName || 'Field'}</strong>
              {': '}
              {slot.afterDate} ({(slot.previousLabels || []).join(', ') || 'entire field'})
              {' → '}
              {slot.beforeDate} ({(slot.nextLabels || []).join(', ') || 'entire field'})
            </Typography>
            <TextField
              size="small"
              type="date"
              label="Uproot date"
              value={value}
              onChange={(e) => onDateChange(slot.id, e.target.value)}
              error={invalid}
              helperText={invalid ? `Use ${slot.afterDate} through the day before ${slot.beforeDate}` : ' '}
              InputLabelProps={{ shrink: true }}
            />
          </Box>
        );
      })}
      {extras.map((extra) => (
        <Box key={extra.id} sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 1, flexWrap: 'wrap' }}>
          <Typography variant="body2" sx={{ minWidth: 160 }}>
            Extra uproot ({extra.fieldName || 'field'})
          </Typography>
          <TextField
            size="small"
            type="date"
            label="Uproot date"
            value={extra.uprootDate || ''}
            onChange={(e) => onExtraChange(extra.id, { uprootDate: e.target.value })}
            InputLabelProps={{ shrink: true }}
          />
          <Button size="small" onClick={() => onRemoveExtra(extra.id)}>Remove</Button>
        </Box>
      ))}
      <Button size="small" onClick={onAddExtra}>Add uproot date</Button>
    </Box>
  );
}
