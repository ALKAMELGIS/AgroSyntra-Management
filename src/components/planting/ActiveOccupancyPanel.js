import { useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Paper, Stack, Typography,
} from '@mui/material';
import UprootDialog from './UprootDialog';
import {
  draftOccupancyOverlaps,
  formatOverlapWarning,
  occupancyFieldLines,
} from '../../utils/plantingOccupancy';

export default function ActiveOccupancyPanel({
  occupancyByField,
  loading,
  fields,
  source,
  rows = [],
  onUprootSuccess,
}) {
  const [target, setTarget] = useState(null);
  const lines = occupancyFieldLines(occupancyByField, fields);
  const overlaps = draftOccupancyOverlaps(rows, occupancyByField);

  if (!loading && lines.length === 0 && overlaps.length === 0) return null;

  return (
    <>
      <Paper variant="outlined" sx={{ p: 1.5, mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: lines.length ? 1 : 0 }}>
          <Typography variant="subtitle2" fontWeight={700}>Active occupancy</Typography>
          {loading && <CircularProgress size={14} />}
        </Box>
        {lines.length === 0 && !loading ? (
          <Typography variant="body2" color="text.secondary">No crop currently occupying these fields.</Typography>
        ) : (
          <Stack spacing={0.75}>
            {lines.map((line) => (
              <Box
                key={line.fieldId}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  flexWrap: 'wrap',
                  py: 0.25,
                }}
              >
                <Typography variant="body2" sx={{ flex: 1, minWidth: 220 }}>
                  <strong>{line.fieldName}</strong>
                  {line.cropLabel ? ` · ${line.cropLabel}` : ''}
                  {line.segmentsLabel ? ` · ${line.segmentsLabel}` : ''}
                </Typography>
                <Button size="small" variant="outlined" onClick={() => setTarget(line)}>
                  Uproot
                </Button>
              </Box>
            ))}
          </Stack>
        )}
        {overlaps.map((hit) => (
          <Alert key={hit.key} severity="warning" sx={{ mt: 1 }}>
            {formatOverlapWarning(hit.conflicts, hit.cropLabel)}
          </Alert>
        ))}
      </Paper>

      <UprootDialog
        open={Boolean(target)}
        onClose={() => setTarget(null)}
        fieldId={target?.fieldId}
        fieldName={target?.fieldName}
        occupancy={target ? occupancyByField[target.fieldId] : null}
        source={source}
        onSuccess={onUprootSuccess}
      />
    </>
  );
}
