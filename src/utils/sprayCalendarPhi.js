/** Shared spray calendar PHI day coloring (staff IPM + team leader views). */

export const SPRAY_CALENDAR_COLORS = {
  spray: '#2196f3',
  phiActive: '#f44336',
  phiEnding: '#ff9800',
  clear: '#e8f5e9',
};

export function formatCalendarDate(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** First day of the month before the calendar view (for API start_date). */
export function sprayCalendarApiStartDate(year, month) {
  if (month === 0) {
    return formatCalendarDate(year - 1, 11, 1);
  }
  return formatCalendarDate(year, month - 1, 1);
}

function toDateOnlyString(value) {
  if (!value) return null;
  const s = String(value);
  return s.includes('T') ? s.split('T')[0] : s.substring(0, 10);
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Format stored spray clock time as h:mm AM/PM. */
export function formatClockTime(value) {
  if (value == null || value === '') return '—';
  const match = String(value).trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return '—';
  const hour24 = Number(match[1]);
  if (!Number.isFinite(hour24) || hour24 > 23) return '—';
  const minutes = match[2];
  const ampm = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${minutes} ${ampm}`;
}

function formatPhiDate(value) {
  const iso = toDateOnlyString(value);
  if (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d, 12, 0, 0).toLocaleDateString();
  }
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleDateString();
}

function clockFromTimestamp(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return formatClockTime(`${d.getUTCHours()}:${pad2(d.getUTCMinutes())}`);
}

/** PHI end date plus spray-end clock (not UTC-shifted local hours). */
export function formatPhiEndDateTime(phiEndDate, applicationEndTime) {
  if (phiEndDate == null || phiEndDate === '') return '—';
  const datePart = formatPhiDate(phiEndDate);
  if (!datePart) return '—';
  let timePart = formatClockTime(applicationEndTime);
  if (timePart === '—') timePart = clockFromTimestamp(phiEndDate);
  if (timePart === '—') return datePart;
  return `${datePart} ${timePart}`;
}

/**
 * @returns {Array<[string, { name: string, days: Record<string, { type: string, apps: object[] }> }]>}
 */
export function buildSprayCalendarFieldRows({
  applications,
  fields,
  year,
  month,
  daysInMonth,
  filterField,
}) {
  const fieldMap = {};

  const relevantApps = (applications || []).filter(
    (a) => a.approval_status === 'approved' && (!filterField || a.field_id === filterField),
  );

  relevantApps.forEach((app) => {
    const fieldId = app.field_id;
    const fieldName = app.field_name || 'Unknown';
    if (!fieldMap[fieldId]) {
      fieldMap[fieldId] = { name: fieldName, days: {} };
    }

    const appDateStr = toDateOnlyString(app.application_date);
    if (!appDateStr) return;

    const phiEndStr = toDateOnlyString(app.phi_end_date);
    const appDate = new Date(`${appDateStr}T12:00:00`);
    const phiEnd = phiEndStr ? new Date(`${phiEndStr}T12:00:00`) : null;

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = formatCalendarDate(year, month, d);
      const currentDate = new Date(year, month, d, 12, 0, 0);

      if (!fieldMap[fieldId].days[dateStr]) {
        fieldMap[fieldId].days[dateStr] = { type: 'clear', apps: [] };
      }

      if (appDateStr === dateStr) {
        fieldMap[fieldId].days[dateStr] = {
          type: 'spray',
          apps: [...fieldMap[fieldId].days[dateStr].apps, app],
        };
      } else if (phiEnd && currentDate > appDate && currentDate <= phiEnd) {
        const daysToEnd = Math.ceil((phiEnd.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24));
        const currentType = fieldMap[fieldId].days[dateStr].type;
        if (daysToEnd <= 1 && currentType !== 'spray') {
          fieldMap[fieldId].days[dateStr] = {
            type: 'phiEnding',
            apps: [...fieldMap[fieldId].days[dateStr].apps, app],
          };
        } else if (currentType === 'clear') {
          fieldMap[fieldId].days[dateStr] = {
            type: 'phiActive',
            apps: [...fieldMap[fieldId].days[dateStr].apps, app],
          };
        }
      }
    }
  });

  if (filterField) {
    const field = (fields || []).find((f) => f.id === filterField);
    if (field && !fieldMap[filterField]) {
      fieldMap[filterField] = { name: field.name, days: {} };
    }
  }

  return Object.entries(fieldMap).sort(([, a], [, b]) => a.name.localeCompare(b.name));
}

export function dayTypeTooltip(dayInfo) {
  if (!dayInfo || dayInfo.type === 'clear') return 'Clear';
  const app = dayInfo.apps?.find((a) => a.phi_end_date);
  const phiEnd = formatPhiEndDateTime(app?.phi_end_date, app?.application_end_time);
  const phiSuffix = phiEnd !== '—' ? ` (ends ${phiEnd})` : '';
  if (dayInfo.type === 'spray') {
    return `Spray: ${dayInfo.apps.map((a) => a.product_name).filter(Boolean).join(', ') || 'Application'}`;
  }
  if (dayInfo.type === 'phiActive') return `PHI Active - No Harvest${phiSuffix}`;
  if (dayInfo.type === 'phiEnding') return `PHI Ending Soon${phiSuffix}`;
  return 'Clear';
}

export function bgcolorForDayType(type) {
  if (type === 'spray') return SPRAY_CALENDAR_COLORS.spray;
  if (type === 'phiActive') return SPRAY_CALENDAR_COLORS.phiActive;
  if (type === 'phiEnding') return SPRAY_CALENDAR_COLORS.phiEnding;
  return 'transparent';
}
