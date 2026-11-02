import { Typography } from '@mui/material';
import { isMandatoryValueEmpty, isMissingActivity } from '../../utils/manpowerOptionalFields';
import { mandatoryRequiredChip } from './ManpowerMandatoryValue';

/** Unit: optional unless activity is filled. */
export default function ManpowerUnitCell({ activity, unit }) {
  if (!isMissingActivity(activity) && isMandatoryValueEmpty(unit)) {
    return mandatoryRequiredChip();
  }
  if (isMandatoryValueEmpty(unit)) {
    return (
      <Typography variant="body2" sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>
        -
      </Typography>
    );
  }
  return (
    <Typography variant="body2" sx={{ fontSize: '0.8125rem' }}>
      {unit}
    </Typography>
  );
}
