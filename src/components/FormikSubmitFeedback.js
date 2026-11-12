import { useEffect, useRef } from 'react';
import { useFormikContext } from 'formik';
import { useNotification } from '../contexts/NotificationContext';

/** First error message in a (possibly nested) Formik errors object. */
export function firstError(errors) {
  if (!errors) return null;
  if (typeof errors === 'string') return errors;
  for (const v of Object.values(errors)) {
    const m = firstError(v);
    if (m) return m;
  }
  return null;
}

/**
 * Put inside a <Formik> form. When Save is pressed and validation fails, the
 * user is told why and taken to the first field to fix. Without it, a missing
 * field above the fold made Save look like it did nothing.
 */
export default function FormikSubmitFeedback() {
  const { submitCount, isValid, errors, isSubmitting } = useFormikContext();
  const notify = useNotification();
  const seen = useRef(0);

  useEffect(() => {
    if (submitCount === seen.current || isSubmitting) return;
    seen.current = submitCount;
    if (isValid) return;
    const msg = firstError(errors);
    if (msg) notify.warning(msg);
    requestAnimationFrame(() => {
      const el = document.querySelector('form [aria-invalid="true"]');
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        el.focus({ preventScroll: true });
      }
    });
  }, [submitCount, isValid, errors, isSubmitting, notify]);

  return null;
}
