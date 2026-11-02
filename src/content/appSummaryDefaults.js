/** Fallback when API unavailable — keep in sync with backend/src/data/appSummaryDefaults.ts */

/** Accounts that can edit Summary & Contents (inline + save). */
export const SUMMARY_EDITOR_EMAILS = ['abdullah@elite.com', 'abdullah@ellite.com'];

export function canEditSummaryEmail(email) {
  return SUMMARY_EDITOR_EMAILS.includes((email || '').trim().toLowerCase());
}

export const APP_SUMMARY_DEFAULTS = {
  introText:
    'This is a prototype to show what we need from a software company. The field team keeps Excel until the real system is built. This page explains what we gain when forms become one connected system.',
  closingText:
    'Next step: Agree this scope with managers; give this prototype to the development company as the functional blueprint (not copy-paste code).',
  summaryRows: [
    { area: 'Daily control', today: 'PHI and alerts checked manually across files', withApp: 'Daily Brief — fields blocked for harvest, key alerts in one morning view' },
    { area: 'Fields & map', today: 'Field names differ between sheets; easy wrong-field entry', withApp: 'One field list (NH 06, bays/valves) used by scouting, spray, EC/pH, harvest' },
    { area: 'Scouting (IPM)', today: 'Paper / Excel scouting sheets per site', withApp: 'Digital scouting by segment (bay/valve), crop/variety from crop history, photos, review' },
    { area: 'Spray & PHI', today: 'Manual PHI math on PPP spreadsheets', withApp: 'Spray records with product PHI → clear-to-harvest date; product catalog linked' },
    { area: 'EC / pH', today: 'Separate Excel logs per site/valve', withApp: 'Structured readings per valve/field, reports and out-of-range visibility' },
    { area: 'Fertigation', today: 'Fertigation files not linked to harvest', withApp: 'Entry + dashboard — water/nutrition history for analysis and audits' },
    { area: 'Harvest', today: 'Harvest tallies; PHI checked separately', withApp: 'Harvest records aligned with PHI rules; dashboards without manual pivot tables' },
    { area: 'Reports', today: 'Managers wait for emailed Excel summaries', withApp: 'Dashboards & report builder — trends by field, date, operation' },
    { area: 'Workforce', today: 'Tasks/shifts on paper or separate files', withApp: 'Tasks & shifts — who did what, linked to operational accountability' },
    { area: 'Governance', today: 'No central audit of who changed a sheet', withApp: 'Users, roles, audit log, multi-site — ready for certifications and vendor handoff' },
  ],
  contentsGroups: [
    {
      group: 'General',
      items: [
        { module: 'Daily Brief', description: 'Morning PHI blocks, harvest/pest alerts', replaces: 'Manual PHI checks', path: '/daily-brief' },
        { module: 'Analytics Dashboard', description: 'KPIs and trends across operations', replaces: 'Consolidated Excel reports', path: '/dashboard' },
        { module: 'GIS Map', description: 'Field layers and farm geography', replaces: 'Separate maps / lists', path: '/gis-map' },
        { module: 'Notifications', description: 'System alerts and messages', replaces: 'Email / verbal alerts', path: '/notifications' },
      ],
    },
    {
      group: 'Data entry',
      items: [
        { module: 'EC/pH Entry', description: 'Daily valve readings and drain calculations', replaces: 'EC/pH log sheet', path: '/ecph-entry' },
        { module: 'Fertigation Entry', description: 'Water and fertilizer applications', replaces: 'Fertigation Excel', path: '/fertigation/entry' },
        { module: 'Harvest Entry', description: 'Daily production by field and variety', replaces: 'Harvest tally sheet', path: '/harvest/entry' },
        { module: 'Crop Rotation', description: 'Planting history and segments (bay/valve)', replaces: 'Crop plan spreadsheets', path: '/admin/crop-history' },
        { module: 'Pump Room', description: 'Pump electricity and water usage', replaces: 'Pump room log', path: '/pump-room' },
        { module: 'Templates', description: 'Custom data-entry form templates', replaces: 'Ad-hoc Excel forms', path: '/templates' },
      ],
    },
    {
      group: 'IPM / crop protection',
      items: [
        { module: 'Scouting Reports', description: 'Pest/disease counts by segment, photos, review', replaces: 'RC-105 / scouting sheet', path: '/ipm/scouting-reports' },
        { module: 'Pesticide Applications', description: 'PPP spray records with PHI dates', replaces: 'PPP spreadsheet', path: '/ipm/pesticide-applications' },
        { module: 'Spray Calendar', description: 'Planned and applied sprays', replaces: 'Spray schedule Excel', path: '/ipm/spray-calendar' },
        { module: 'Product Catalog', description: 'Chemicals, PHI, active ingredients', replaces: 'Product list files', path: '/ipm/product-catalog' },
        { module: 'Pest Catalog', description: 'Standard pest and disease names', replaces: 'Reference sheets', path: '/ipm/pest-catalog' },
        { module: 'Biological Control', description: 'Biocontrol release records', replaces: 'Bio control log', path: '/ipm/biological-control-record' },
        { module: 'Bumble Bees', description: 'Pollination program tracking', replaces: 'Bee program sheet', path: '/ipm/bumble-bees' },
      ],
    },
    {
      group: 'Dashboards & reports',
      items: [
        { module: 'Harvest Dashboard', description: 'Production charts and filters', replaces: 'Harvest pivot tables', path: '/harvest/dashboard' },
        { module: 'Fertigation Dashboard', description: 'Water and nutrition analytics', replaces: 'Fertigation summaries', path: '/fertigation/dashboard' },
        { module: 'Efficiency Dashboard', description: 'Water-use efficiency metrics', replaces: 'Manual WUE calc', path: '/efficiency-dashboard' },
        { module: 'EC/pH Reports', description: 'Reading history and export', replaces: 'EC/pH Excel archive', path: '/ecph/reports' },
        { module: 'Report Builder', description: 'Custom exports and reports', replaces: 'Hand-built reports', path: '/report-builder' },
      ],
    },
    {
      group: 'Field & weather',
      items: [
        { module: 'Weather Entry', description: 'Daily weather and soil conditions', replaces: 'Weather log sheet', path: '/weather-log' },
        { module: 'Weather Map', description: 'Spatial weather / NDVI view', replaces: 'External maps', path: '/weather-log/map' },
        { module: 'Remote Sensing', description: 'Satellite vegetation indices', replaces: 'Separate GIS tools', path: '/remote-sensing' },
        { module: 'GPS Tracking', description: 'Equipment / team GPS', replaces: 'Manual location notes', path: '/gps-tracking' },
      ],
    },
    {
      group: 'Workforce',
      items: [
        { module: 'Tasks', description: 'Work assignments and status', replaces: 'Task lists on paper', path: '/tasks' },
        { module: 'Shift Schedule', description: 'Team shifts and coverage', replaces: 'Shift Excel', path: '/shift-schedule' },
        { module: 'Manpower Record', description: 'Labor hours and headcount', replaces: 'Manpower sheet', path: '/manpower-record' },
      ],
    },
    {
      group: 'Management',
      items: [
        { module: 'Zones & Sites', description: 'Countries, sites, farm hierarchy', replaces: 'Site list files', path: '/manage/countries' },
        { module: 'Field Types & Names', description: 'Fields, crops, valves master data', replaces: 'Field master Excel', path: '/manage/field-types' },
        { module: 'Seasons', description: 'Create past farm years for historical import', replaces: 'Season folders', path: '/manage/seasons' },
        { module: 'Agronomic Reference', description: 'EC/pH and crop thresholds', replaces: 'Reference documents', path: '/agronomic-reference' },
        { module: 'User Management', description: 'Roles and access', replaces: 'Informal access', path: '/admin/users' },
        { module: 'Audit Log', description: 'Who changed what and when', replaces: 'No audit trail', path: '/admin/audit' },
        { module: 'Historical Import', description: 'Import legacy Excel data', replaces: 'Manual re-entry', path: '/admin/import' },
      ],
    },
  ],
};
