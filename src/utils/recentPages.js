/**
 * Per-browser "recently opened" list for the Home screen.
 * Pure convenience: storage can be unavailable (private mode), so every access is guarded.
 */
const KEY = 'almaha_recent_pages';
const MAX = 6;
export const RECENT_PAGES_EVENT = 'almaha:recent-pages';

export function readRecentPages() {
  try {
    const raw = window.localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((x) => x && typeof x.path === 'string') : [];
  } catch {
    return [];
  }
}

export function recordRecentPage(entry) {
  if (!entry?.path || entry.path === '/') return;
  try {
    const next = [
      { path: entry.path, title: entry.title, at: Date.now() },
      ...readRecentPages().filter((x) => x.path !== entry.path),
    ].slice(0, MAX);
    window.localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(RECENT_PAGES_EVENT));
  } catch {
    /* storage unavailable — ignore */
  }
}
