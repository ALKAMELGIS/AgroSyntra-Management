import i18n from '../i18n';
import { format as fnsFormat } from 'date-fns';
import { ar } from 'date-fns/locale';

/**
 * Locale-aware date formatting.
 * Uses Arabic locale when the app language is Arabic.
 */
export function formatDate(date, pattern = 'yyyy-MM-dd') {
  if (!date) return '-';
  const d = typeof date === 'string' ? new Date(date) : date;
  const locale = i18n.language === 'ar' ? { locale: ar } : undefined;
  return fnsFormat(d, pattern, locale);
}

/**
 * Locale-aware number formatting.
 * Uses Arabic-Hindu numerals when the app language is Arabic.
 */
export function formatNumber(value, options = {}) {
  if (value == null || isNaN(value)) return '-';
  const locale = i18n.language === 'ar' ? 'ar-SA' : 'en-US';
  return new Intl.NumberFormat(locale, options).format(value);
}

/**
 * Format a number as kg with locale awareness.
 */
export function formatKg(value) {
  return `${formatNumber(value)} kg`;
}

/**
 * Format a number as a percentage.
 */
export function formatPercent(value, decimals = 1) {
  return formatNumber(value, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }) + '%';
}

/**
 * Get current direction ('ltr' | 'rtl').
 */
export function getDirection() {
  return i18n.language === 'ar' ? 'rtl' : 'ltr';
}
