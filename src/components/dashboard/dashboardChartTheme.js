/** Farm-green primary series; other hues stay distinct for In vs Out, etc. */
export const FARM_GREEN = '#1f7a4d';
export const CHART_GRID = '#e3e7e2'; // App.css re-themes grid lines per mode
export const CHART_TICK = '#58625c'; // App.css re-themes tick text per mode
export const CHART_TOOLTIP = {
  borderRadius: 10,
  border: '1px solid var(--border-subtle, #e3e7e2)',
  background: 'var(--bg-surface, #ffffff)',
  color: 'var(--text-primary, #121714)',
  boxShadow: '0 12px 32px -12px rgba(16,24,20,0.22)',
  fontSize: 12,
  padding: '8px 12px',
};

/** Calm, earthy categorical palette — distinguishable, colour-blind aware order. */
export const CHART_COLORS = [
  FARM_GREEN,
  '#2f6aa8',
  '#d08a1e',
  '#b8523a',
  '#0f8f87',
  '#7a5ab8',
  '#86a83a',
  '#c25a86',
  '#4b8fc4',
  '#9c7a3c',
  '#5a6b62',
  '#3fae7a',
];
