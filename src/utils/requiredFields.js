/**
 * Field-level feedback for required fields, shared by every form.
 *
 * Forms validate in their save handlers and report "Please fill in all required
 * fields" (or similar) as a toast. When such a message is shown, this marks the
 * open dialog (or the page) so every empty required field is outlined with a
 * "Required" note (see App.css), and moves keyboard focus to the first one.
 * The marking is scoped to that dialog / page, so it disappears with it.
 */
const MISSING_MESSAGE = /required|fill in|please (select|enter|assign|fill|choose)|select (a|an|at least)|is missing/i;
const FIELD = 'input[required], textarea[required]';

export function isMissingFieldsMessage(message) {
  return typeof message === 'string' && MISSING_MESSAGE.test(message);
}

/** Outline empty required fields in the active dialog (or page) and focus the first. */
export function markMissingRequired() {
  if (typeof document === 'undefined') return;
  const dialogs = document.querySelectorAll('.MuiDialog-root .MuiDialog-paper, .MuiDrawer-root .MuiDrawer-paper');
  const scope = dialogs[dialogs.length - 1] || document.querySelector('main');
  if (!scope) return;
  const empty = Array.from(scope.querySelectorAll(FIELD)).filter((el) => !el.disabled && !el.value);
  if (!empty.length) return;
  scope.setAttribute('data-check-required', '');
  const first = empty[0];
  // A Select keeps its value in a hidden input; focus its visible button instead.
  const target = first.classList.contains('MuiSelect-nativeInput')
    ? first.closest('.MuiInputBase-root')?.querySelector('[role="combobox"]')
    : first;
  if (target && typeof target.focus === 'function') {
    target.focus({ preventScroll: true });
    target.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  }
}

/** Page changes start clean. */
export function clearMissingRequired() {
  if (typeof document === 'undefined') return;
  document.querySelectorAll('[data-check-required]').forEach((el) => el.removeAttribute('data-check-required'));
}
