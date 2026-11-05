import { Visibility } from '@mui/icons-material';
import InfoNote from './InfoNote';

export default function ReadOnlyBanner({ message }) {
  return (
    <InfoNote
      severity="info"
      icon={<Visibility fontSize="small" />}
      sx={{ mb: 2 }}
    >
      {message || 'View only — you cannot submit or modify records on this page.'}
    </InfoNote>
  );
}
