import { Box, Chip, Typography } from '@mui/material';
import { WarningAmberOutlined as WarningIcon } from '@mui/icons-material';
import {
  isMissingActivity,
  isMissingTarget,
  isMissingActual,
  isMissingHours,
  formatOptionalHours,
} from '../../utils/manpowerOptionalFields';

function missingChip() {
  return (
    <Chip
      size="small"
      icon={<WarningIcon sx={{ fontSize: '16px !important' }} />}
      label="Missing"
      sx={{
        bgcolor: 'var(--sheet-tint-peach)',
        color: 'var(--sheet-warn, #8a5a00)',
        fontWeight: 600,
        fontSize: '0.6875rem',
        height: 24,
        border: '1px solid #ffb74d',
        '& .MuiChip-icon': { color: 'inherit' },
      }}
    />
  );
}

/**
 * @param {'activity'|'target'|'actual'|'hours'} field
 * @param {*} value — raw cell value (activity/target/actual) or record object for hours
 */
export default function ManpowerOptionalValue({ field, value, record }) {
  let missing = false;
  let display = null;

  if (field === 'activity') {
    missing = isMissingActivity(value);
    display = missing ? null : String(value).trim();
  } else if (field === 'target') {
    missing = isMissingTarget(value);
    display = missing ? null : value;
  } else if (field === 'actual') {
    missing = isMissingActual(value);
    display = missing ? null : value;
  } else if (field === 'hours') {
    const rec = record || value;
    missing = isMissingHours(rec);
    const hrs = formatOptionalHours(rec);
    display = hrs != null ? hrs.toFixed(1) : null;
  }

  if (missing) return missingChip();

  if (field === 'hours') {
    return (
      <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.8125rem' }}>
        {display}
      </Typography>
    );
  }

  return (
    <Typography variant="body2" sx={{ fontSize: '0.8125rem', whiteSpace: field === 'activity' ? 'nowrap' : undefined }}>
      {display}
    </Typography>
  );
}

export function ManpowerOptionalHoursChip({ startTime, endTime, workHours }) {
  const record = { startTime, endTime, workHours };
  if (isMissingHours(record)) {
    return (
      <Box sx={{ display: 'inline-flex' }}>
        {missingChip()}
      </Box>
    );
  }
  const hrs = formatOptionalHours(record);
  return (
    <Chip label={`${hrs.toFixed(1)} hrs`} size="small" variant="outlined" />
  );
}
