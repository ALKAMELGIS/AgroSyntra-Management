import { NAV_AREAS, GENERAL_SECTION, AREA_SECTIONS, getNavAreaForPath } from './navAreas';

/** Turn SHOUTED config labels ("IPM CONTROL") into calm title case, keeping acronyms. */
const ACRONYMS = new Set(['IPM', 'PHI', 'GIS', 'GPS', 'EC', 'PH', 'API', 'KPI', 'PPP', 'AI']);
export function calmLabel(label) {
  if (!label || label !== label.toUpperCase()) return label;
  return label
    .split(/(\s+|\/|&)/)
    .map((w) => (ACRONYMS.has(w) || !/[A-Z]/.test(w) ? w : w.charAt(0) + w.slice(1).toLowerCase()))
    .join('');
}

const ALL_ENTRIES = (() => {
  const out = GENERAL_SECTION.items.map((item) => ({ ...item, section: GENERAL_SECTION.label, areaId: null }));
  Object.entries(AREA_SECTIONS).forEach(([areaId, sections]) => {
    sections.forEach((section) => {
      section.items.forEach((item) => out.push({ ...item, section: section.label, areaId }));
    });
  });
  return out;
})();

/**
 * Where a route sits in the navigation: area, section and page label.
 * Longest matching nav path wins, so `/weather-log/map` resolves to "Weather Map".
 * Returns null for routes that are not in the navigation.
 */
// Routes reached from the top bar rather than the sidebar.
const EXTRA_PAGES = [
  { path: '/notifications', text: 'Notifications', section: 'General', areaId: null },
];

export function findPageMeta(pathname) {
  if (!pathname) return null;
  const extra = EXTRA_PAGES.find((e) => pathname === e.path || pathname.startsWith(`${e.path}/`));
  if (extra) {
    return { title: extra.text, path: extra.path, exact: extra.path === pathname, section: extra.section, areaId: null, areaLabel: null };
  }
  let best = null;
  ALL_ENTRIES.forEach((entry) => {
    const p = entry.path;
    const matches = p === '/' ? pathname === '/' : (pathname === p || pathname.startsWith(`${p}/`));
    if (matches && (!best || p.length > best.path.length)) best = entry;
  });
  if (!best) return null;
  const areaId = best.areaId || getNavAreaForPath(pathname);
  const area = NAV_AREAS.find((a) => a.id === areaId) || null;
  return {
    title: best.text,
    path: best.path,
    exact: best.path === pathname,
    section: calmLabel(best.section),
    areaId: area?.id || null,
    areaLabel: area?.label || null,
  };
}
