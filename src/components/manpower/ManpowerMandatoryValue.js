import { Chip, Typography } from '@mui/material';
import { ErrorOutlineOutlined as ErrorIcon } from '@mui/icons-material';
import { isMandatoryValueEmpty } from '../../utils/manpowerOptionalFields';

export function mandatoryRequiredChip() {
  return (
    <Chip
      size="small"
      icon={<ErrorIcon sx={{ fontSize: '16px !important' }} />}
      label="Required"
      sx={{
        bgcolor: 'var(--sheet-tint-red)',
        color: 'var(--sheet-danger)',
        fontWeight: 600,
        fontSize: '0.6875rem',
        height: 24,
        border: '1px solid currentColor',
        '& .MuiChip-icon': { color: 'inherit' },
      }}
    />
  );
}

/** Admin grid: red Required chip when a mandatory cell is empty. */
export default function ManpowerMandatoryValue({ value, format }) {
  if (!isMandatoryValueEmpty(value)) {
    const text = format ? format(value) : String(value).trim();
    return (
      <Typography variant="body2" sx={{ fontSize: '0.8125rem' }}>
        {text}
      </Typography>
    );
  }
  return mandatoryRequiredChip();
}
