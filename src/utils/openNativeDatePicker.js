/**
 * Open the native calendar on a date input. Frozen spreadsheet cells clip the
 * calendar icon, so a click on the field would otherwise do nothing.
 */
export function openNativeDatePicker(event) {
  const root = event.currentTarget;
  const input = root?.tagName === 'INPUT'
    ? root
    : root?.querySelector?.('input[type="date"]');
  if (!input || typeof input.showPicker !== 'function') return;
  try {
    input.showPicker();
  } catch {
    // Some browsers reject showPicker when the control is not visible.
  }
}
