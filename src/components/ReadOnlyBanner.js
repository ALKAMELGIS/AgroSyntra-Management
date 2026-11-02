import { Alert } from '@mui/material';
import { Visibility } from '@mui/icons-material';

export default function ReadOnlyBanner({ message }) {
  return (
    <Alert
      severity="info"
      icon={<Visibility fontSize="small" />}
      sx={{ mb: 2 }}
    >
      {message || 'View only — you cannot submit or modify records on this page.'}
    </Alert>
  );
}
