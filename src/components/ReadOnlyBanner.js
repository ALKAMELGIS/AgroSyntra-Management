import { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Visibility } from '@mui/icons-material';
import InfoNote from './InfoNote';
import { useIsArabic } from '../i18n/shellLabels';

/**
 * "View only" marker: a small eye chip; tap / click shows the explanation.
 * It sits at the end of the breadcrumb line (PageContextBar's #page-flags-slot)
 * so it doesn't take a row of its own; without that slot it renders in place.
 */
export default function ReadOnlyBanner({ message }) {
  const isAr = useIsArabic();
  const [slot, setSlot] = useState(null);
  useLayoutEffect(() => {
    setSlot(document.getElementById('page-flags-slot'));
  }, []);
  const note = (
    <InfoNote
      severity="info"
      label={isAr ? 'للعرض فقط' : 'View only'}
      icon={<Visibility fontSize="small" />}
      showLabel
      sx={slot ? { mb: 0 } : { mb: 2 }}
    >
      {message || 'View only — you cannot submit or modify records on this page.'}
    </InfoNote>
  );
  return slot ? createPortal(note, slot) : note;
}
