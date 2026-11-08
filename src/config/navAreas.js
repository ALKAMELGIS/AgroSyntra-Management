/**
 * Grouped top-bar navigation (Option B).
 * General section is always pinned in the sidebar; other sections follow the active top tab.
 */

import { getTileMeta } from './hubTiles';
import {
  FIELD_STAFF_MANAGER_ROLES, INTEGRATION_ADMIN_ROLES, SYSTEM_ADMIN_ROLES, MANPOWER_COST_VIEW_ROLES,
} from '../utils/roleAccess';

export const drawerWidth = 260;

export const NAV_AREAS = [
  { id: 'operations', label: 'Operations' },
  { id: 'ipm', label: 'IPM' },
  { id: 'fieldMaps', label: 'Field & Maps' },
  { id: 'reports', label: 'Reports' },
  { id: 'workforce', label: 'Workforce' },
  { id: 'settings', label: 'Settings' },
];

export const DEFAULT_NAV_AREA = 'operations';

/** Always visible at the top of the sidebar regardless of active tab. */
export const GENERAL_SECTION = {
  label: 'GENERAL',
  items: [
    { text: 'Home', path: '/' },
    { text: 'Summary & Contents', path: '/summary' },
    { text: 'Daily Brief', path: '/daily-brief' },
    { text: 'Dashboard', path: '/dashboard' },
  ],
};

const DATA_ENTRY_SECTION = {
  label: 'DATA ENTRY',
  requiresRole: ['ceo', 'farm_manager', 'operation_manager', 'agronomist', 'worker'],
  items: [
    { text: 'Templates', path: '/templates' },
    { text: 'EC/PH Entry', path: '/ecph-entry' },
    { text: 'Fertigation Entry', path: '/fertigation/entry' },
    { text: 'Irrigation Entry', path: '/irrigation/entry' },
    { text: 'Harvest Entry', path: '/harvest/entry' },
    { text: 'Crop Rotation', path: '/admin/crop-history' },
    { text: 'Farm Areas & Crops', path: '/manage/farm-areas', requiresRole: ['agronomist', 'worker'] },
    { text: 'Field Types & Names', path: '/manage/field-types', requiresRole: ['worker'] },
    { text: 'Valves Config', path: '/manage/valves', requiresRole: ['worker'] },
    { text: 'Historical Import', path: '/admin/import', requiresRole: ['agronomist', 'worker'] },
    { text: 'Pump Room', path: '/pump-room' },
    { text: 'Recipes', path: '/manage/recipes', requiresRole: ['worker', 'agronomist'] },
    { text: 'Inventory', path: '/inventory', requiresRole: ['worker'] },
    { text: 'GPS Tracking', path: '/gps-tracking', requiresRole: ['worker'] },
    { text: 'Recovery', path: '/admin/recovery', requiresRole: ['worker', 'agronomist'] },
  ],
};

const DASHBOARDS_SECTION = {
  label: 'DASHBOARDS',
  items: [
    { text: 'Harvest', path: '/harvest/dashboard' },
    { text: 'Fertigation', path: '/fertigation/dashboard' },
    { text: 'Irrigation', path: '/irrigation/dashboard' },
    { text: 'Efficiency', path: '/efficiency-dashboard' },
    { text: 'Fert vs Harvest', path: '/fertigation-harvest' },
  ],
};

const REPORTS_SECTION = {
  label: 'REPORTS',
  items: [
    { text: 'EC/PH Reports', path: '/ecph/reports' },
    { text: 'Fertigation Reports', path: '/fertigation/reports' },
    { text: 'Harvest Reports', path: '/harvest/reports' },
    { text: 'Report Builder', path: '/report-builder' },
  ],
};

const FIELD_WEATHER_SECTION = {
  label: 'FIELD & WEATHER',
  items: [
    { text: 'Weather Entry', path: '/weather-log' },
    { text: 'Weather Map', path: '/weather-log/map' },
    { text: 'Remote Sensing', path: '/remote-sensing' },
    { text: 'GPS Tracking', path: '/gps-tracking' },
    { text: 'GIS Map', path: '/gis-map' },
  ],
};

const AUDIT_SECTION = {
  label: 'AUDIT',
  items: [
    { text: 'Batch Trace', path: '/audit/batch-trace' },
    { text: 'PHI Audit Log', path: '/audit/phi-audit-log' },
    { text: 'Change Requests', path: '/audit/change-requests', hiddenForRoles: ['operator'] },
  ],
};

const IPM_SECTION = {
  label: 'IPM CONTROL',
  items: [
    { text: 'Pesticide Applications', path: '/ipm/pesticide-applications' },
    { text: 'Biological Control', path: '/ipm/biological-control-record' },
    { text: 'Bumble Bees', path: '/ipm/bumble-bees' },
    { text: 'Product Catalog', path: '/ipm/product-catalog' },
    { text: 'Scouting Reports', path: '/ipm/scouting-reports' },
    { text: 'Pest Catalog', path: '/ipm/pest-catalog' },
    { text: 'Spray Calendar', path: '/ipm/spray-calendar' },
    { text: 'Field Staff', path: '/ipm/field-staff', requiresRole: FIELD_STAFF_MANAGER_ROLES },
  ],
};

const WORKFORCE_SECTION = {
  label: 'WORKFORCE',
  requiresRole: ['ceo', 'farm_manager', 'operation_manager', 'agronomist', 'worker', 'pest_agronomist', 'operator'],
  items: [
    { text: 'Tasks', path: '/tasks', hiddenForRoles: ['pest_agronomist', 'operator'] },
    { text: 'Shift Schedule', path: '/shift-schedule', hiddenForRoles: ['pest_agronomist', 'operator'] },
    { text: 'Manpower Record', path: '/manpower-record', hiddenForRoles: ['operator'] },
    { text: 'Manpower Cost', path: '/manpower-cost', requiresRole: MANPOWER_COST_VIEW_ROLES },
    { text: 'Daily Activity Sheet', path: '/manpower-activity-sheet', requiresRole: ['worker', 'operator'] },
    { text: 'Change Requests', path: '/audit/change-requests', requiresRole: ['operation_manager'] },
  ],
};

const MANAGEMENT_SECTION = {
  label: 'MANAGEMENT',
  requiresRole: ['ceo', 'farm_manager', 'operation_manager'],
  items: [
    { text: 'Zones & Sites', path: '/manage/countries' },
    { text: 'Farm Areas & Crops', path: '/manage/farm-areas' },
    { text: 'Field Types & Names', path: '/manage/field-types' },
    { text: 'Valves Config', path: '/manage/valves' },
    { text: 'Recipes', path: '/manage/recipes' },
    { text: 'Seasons', path: '/manage/seasons' },
    { text: 'Inventory', path: '/inventory' },
    { text: 'Yield Predictions', path: '/yield-predictions' },
    { text: 'Agronomic Reference', path: '/agronomic-reference' },
    { text: 'API Integrations', path: '/admin/api-integrations', requiresRole: INTEGRATION_ADMIN_ROLES },
    { text: 'John Deere', path: '/admin/integrations/john-deere', requiresRole: INTEGRATION_ADMIN_ROLES },
    { text: 'ArcGIS Link', path: '/admin/integrations/arcgis', requiresRole: INTEGRATION_ADMIN_ROLES },
  ],
};

const INTERNSHIP_SECTION = {
  label: 'INTERNSHIP',
  requiresRole: ['ceo', 'farm_manager', 'operation_manager', 'agronomist', 'intern_teacher', 'intern_student'],
  items: [
    { text: 'Training Modules', path: '/internship' },
    { text: 'My Grades', path: '/internship/grades' },
  ],
};

const ADMIN_SECTION = {
  label: 'ADMIN',
  requiresRole: ['ceo', 'farm_manager', 'operation_manager'],
  items: [
    { text: 'User Management', path: '/admin/users' },
    { text: 'Audit Log', path: '/admin/audit' },
    { text: 'Recovery', path: '/admin/recovery', requiresRole: ['operation_manager'] },
    { text: 'Data Backup', path: '/admin/backup' },
    // Only the operation manager here (CEO and farm manager do not import); worker and agronomist use Data Entry.
    { text: 'Historical Import', path: '/admin/import', requiresRole: ['operation_manager'] },
    { text: 'System Health', path: '/admin/health' },
    { text: 'API Keys', path: '/admin/api-keys', requiresRole: INTEGRATION_ADMIN_ROLES },
    { text: 'Webhooks', path: '/admin/webhooks', requiresRole: INTEGRATION_ADMIN_ROLES },
    { text: 'Feature Flags', path: '/admin/feature-flags', requiresRole: SYSTEM_ADMIN_ROLES },
    { text: 'Organization', path: '/admin/organization' },
    { text: 'Platform Admin', path: '/admin/platform', requiresSuperAdmin: true },
    { text: 'Enrollment', path: '/admin/enrollment' },
  ],
};

/** Sections shown in the sidebar for each top tab (excluding General). */
export const AREA_SECTIONS = {
  operations: [DATA_ENTRY_SECTION, DASHBOARDS_SECTION],
  ipm: [IPM_SECTION, AUDIT_SECTION],
  fieldMaps: [FIELD_WEATHER_SECTION],
  reports: [REPORTS_SECTION],
  workforce: [WORKFORCE_SECTION],
  settings: [MANAGEMENT_SECTION, INTERNSHIP_SECTION, ADMIN_SECTION],
};

export function getHubPathForArea(areaId) {
  return `/hub/${areaId}`;
}

export function getAreaIdFromHubPath(pathname) {
  if (!pathname.startsWith('/hub/')) return null;
  const areaId = pathname.slice('/hub/'.length).split('/')[0];
  return NAV_AREAS.some((a) => a.id === areaId) ? areaId : null;
}

export function getAreaHubSections(user, areaId) {
  const sections = AREA_SECTIONS[areaId];
  if (!sections) return [];

  return sections
    .filter((section) => sectionAllowedForUser(section, user))
    .map((section) => filterSectionForUser(section, user))
    .filter(Boolean)
    .map((section) => ({
      title: section.label,
      tiles: section.items.map((item) => {
        const meta = getTileMeta(item.path);
        return {
          label: item.text,
          path: item.path,
          icon: meta.icon,
          color: meta.color,
          bg: meta.bg,
        };
      }),
    }))
    .filter((section) => section.tiles.length > 0);
}

const GENERAL_PATHS = new Set(['/', '/summary', '/daily-brief', '/dashboard', '/notifications']);

/** Longest-prefix wins; order matters for overlapping prefixes. */
const PATH_AREA_RULES = [
  { prefix: '/ipm/', area: 'ipm' },
  { prefix: '/audit/', area: 'ipm' },
  { prefix: '/ecph/reports', area: 'reports' },
  { prefix: '/fertigation/reports', area: 'reports' },
  { prefix: '/harvest/reports', area: 'reports' },
  { prefix: '/report-builder', area: 'reports' },
  { prefix: '/weather-log', area: 'fieldMaps' },
  { prefix: '/remote-sensing', area: 'fieldMaps' },
  { prefix: '/gps-tracking', area: 'fieldMaps' },
  { prefix: '/gis-map', area: 'fieldMaps' },
  { prefix: '/tasks', area: 'workforce' },
  { prefix: '/shift-schedule', area: 'workforce' },
  { prefix: '/manpower-activity-sheet', area: 'workforce' },
  { prefix: '/manpower-record', area: 'workforce' },
  { prefix: '/manpower-cost', area: 'workforce' },
  { prefix: '/manage/', area: 'settings' },
  { prefix: '/inventory', area: 'settings' },
  { prefix: '/yield-predictions', area: 'settings' },
  { prefix: '/agronomic-reference', area: 'settings' },
  { prefix: '/internship', area: 'settings' },
  { prefix: '/admin/crop-history', area: 'operations' },
  { prefix: '/admin/', area: 'settings' },
  { prefix: '/scan/', area: 'operations' },
  { prefix: '/templates', area: 'operations' },
  { prefix: '/ecph-entry', area: 'operations' },
  { prefix: '/fertigation/entry', area: 'operations' },
  { prefix: '/irrigation/entry', area: 'operations' },
  { prefix: '/harvest/entry', area: 'operations' },
  { prefix: '/pump-room', area: 'operations' },
  { prefix: '/harvest/dashboard', area: 'operations' },
  { prefix: '/fertigation/dashboard', area: 'operations' },
  { prefix: '/irrigation/dashboard', area: 'operations' },
  { prefix: '/efficiency-dashboard', area: 'operations' },
  { prefix: '/fertigation-harvest', area: 'operations' },
];

export function getNavAreaForPath(pathname) {
  const hubArea = getAreaIdFromHubPath(pathname);
  if (hubArea) return hubArea;
  if (GENERAL_PATHS.has(pathname)) return null;
  for (const { prefix, area } of PATH_AREA_RULES) {
    if (pathname === prefix || pathname.startsWith(prefix)) return area;
  }
  return null;
}

function itemAllowedForUser(item, user) {
  if (item.requiresSuperAdmin && !user?.isSuperAdmin) return false;
  if (item.requiresRole && !item.requiresRole.includes(user?.role)) return false;
  if (item.hiddenForRoles && item.hiddenForRoles.includes(user?.role)) return false;
  return true;
}

function filterSectionForUser(section, user) {
  const items = section.items.filter((item) => itemAllowedForUser(item, user));
  if (items.length === 0) return null;
  return { ...section, items };
}

function sectionAllowedForUser(section, user) {
  if (!user?.role) return false;
  if (user.role === 'intern_student' || user.role === 'intern_teacher') {
    return section.label === 'INTERNSHIP';
  }
  if (user.role === 'operator') {
    // Operators also type the Daily Activity Sheet (the only WORKFORCE item they see).
    return section.label === 'IPM CONTROL' || section.label === 'AUDIT' || section.label === 'WORKFORCE';
  }
  if (user.role === 'scouter') {
    return section.label === 'IPM CONTROL' || section.label === 'AUDIT';
  }
  if (user.role === 'auditor') {
    return section.label === 'AUDIT';
  }
  if (section.requiresRole) {
    return section.requiresRole.includes(user.role);
  }
  return true;
}

export function getVisibleNavAreas(user) {
  if (!user?.role) return NAV_AREAS.map((a) => a.id);

  if (user.role === 'intern_student' || user.role === 'intern_teacher') {
    return ['settings'];
  }
  if (user.role === 'operator') {
    return ['ipm', 'workforce'];
  }
  if (user.role === 'scouter') {
    return ['ipm'];
  }
  if (user.role === 'pest_agronomist') {
    // Workforce shows only the Manpower Record (read-only) for the pest agronomist.
    return ['ipm', 'workforce'];
  }
  if (user.role === 'auditor') {
    return ['ipm'];
  }
  if (user.role === 'worker') {
    return ['operations', 'ipm', 'reports', 'workforce'];
  }
  if (user.role === 'operation_manager') {
    return NAV_AREAS.map((a) => a.id);
  }

  return NAV_AREAS.filter((area) => {
    const sections = AREA_SECTIONS[area.id] || [];
    return sections.some((section) => sectionAllowedForUser(section, user));
  }).map((a) => a.id);
}

export function getSidebarSections(user, activeNavArea) {
  const area = AREA_SECTIONS[activeNavArea] || AREA_SECTIONS[DEFAULT_NAV_AREA];
  const contextual = area
    .filter((section) => sectionAllowedForUser(section, user))
    .map((section) => filterSectionForUser(section, user))
    .filter(Boolean);
  return [GENERAL_SECTION, ...contextual];
}

export function resolveNavArea(pathname, user, currentNavArea) {
  const fromPath = getNavAreaForPath(pathname);
  const visible = getVisibleNavAreas(user);
  if (fromPath && visible.includes(fromPath)) return fromPath;
  if (currentNavArea && visible.includes(currentNavArea)) return currentNavArea;
  if (visible.includes(DEFAULT_NAV_AREA)) return DEFAULT_NAV_AREA;
  return visible[0] || DEFAULT_NAV_AREA;
}
