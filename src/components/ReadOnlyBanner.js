import { Visibility } from '@mui/icons-material';
import InfoNote from './InfoNote';
import { useIsArabic } from '../i18n/shellLabels';

/** "View only" marker: a small eye icon; tap / click shows the explanation. */
export default function ReadOnlyBanner({ message }) {
  const isAr = useIsArabic();
  return (
    <InfoNote
      severity="info"
      label={isAr ? 'للعرض فقط' : 'View only'}
      icon={<Visibility fontSize="small" />}
      sx={{ mb: 2 }}
    >
      {message || 'View only — you cannot submit or modify records on this page.'}
    </InfoNote>
  );
}
