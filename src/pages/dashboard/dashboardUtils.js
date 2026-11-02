/**
 * Shared constants and helpers for the Dashboard.
 */

// Agricultural color palette used across dashboard cards and charts
export const colors = {
  primary: '#1f7a4d',
  secondary: '#2f6aa8',
  success: '#3a9a68',
  warning: '#c4761a',
  error: '#c23b2b',
  info: '#3b82f6',
  earth: '#8d6e63',
  harvest: '#c4761a',
};

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Normalise API/Date values to YYYY-MM-DD without timezone shifts. */
export function toIsoDate(value) {
  if (value == null || value === '') return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getUTCFullYear()}-${pad2(value.getUTCMonth() + 1)}-${pad2(value.getUTCDate())}`;
  }
  const s = String(value).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  if (s.includes('/')) {
    const parts = s.split('/');
    const monthMap = {
      Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
      Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
    };
    if (parts.length === 3 && monthMap[parts[1]] && parts[2]) {
      const year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
      return `${year}-${monthMap[parts[1]]}-${parts[0].padStart(2, '0')}`;
    }
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
  }
  return '';
}

/** Format a date to "dd/Mon/yy" (e.g. "21/Jan/26"). */
export function formatDate(dateStr) {
  if (dateStr == null || dateStr === '') return '';
  if (typeof dateStr === 'string' && /^\d{2}\/[A-Za-z]{3}\/\d{2}$/.test(dateStr)) return dateStr;
  const iso = toIsoDate(dateStr);
  if (!iso) return '';
  const [year, month, day] = iso.split('-');
  const mon = MONTHS_SHORT[Number(month) - 1];
  if (!mon) return iso;
  return `${day}/${mon}/${year.slice(2)}`;
}

/** Normalise any date string to "YYYY-MM-DD" for comparison. */
export function getDateString(dateStr) {
  return toIsoDate(dateStr);
}

/** Return an array of the last N day labels in "dd/Mon/yy" format. */
export function getLastNDays(n) {
  const days = [];
  for (let i = n - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const day = String(date.getDate()).padStart(2, '0');
    const month = date.toLocaleDateString('en-GB', { month: 'short' });
    const year = String(date.getFullYear()).slice(-2);
    days.push(`${day}/${month}/${year}`);
  }
  return days;
}

/** Format a period string (YYYY-MM) to "Mon YYYY" for chart axes. */
export function formatMonth(period) {
  const d = new Date(period);
  return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

/** Safe number coercion — returns 0 for null/undefined/NaN. */
export function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}
