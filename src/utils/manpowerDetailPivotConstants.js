/** Mirror of backend pivot labels for Excel export (keep in sync with manpowerDetailPivot.ts). */

/** Fixed field crop columns on the detail summary sheet (always present). */
export const WORKERS_COUNT_FIELD_CROPS = [
  'Blackberry',
  'Chilli',
  'Eggplant',
  'Fig',
  'Melon (R&D)',
  'No Crop',
  'Snack Cucumber',
  'Tomato Cherry',
  'Tomato Plum',
  'Tomato Table',
  'Zucchini Green',
];

export const WORKERS_COUNT_BLANK_CROP = '(blank)';

/** Unified activity columns for Summary-style grid (screenshot order; labels vs backend keys). */
export const WORKERS_COUNT_SUMMARY_ACTIVITIES = [
  { label: 'Supervisor', key: 'Supervisor' },
  { label: 'Operator', key: 'Operator' },
  { label: 'Office', key: 'Office' },
  { label: 'Irrigation', key: 'Irrigation' },
  { label: 'IPM', key: 'IPM' },
  { label: 'Maintenance', key: 'Maintenance' },
  { label: 'Nursery', key: 'Nursary' },
  { label: 'Crate Washing', key: 'Crate Washing' },
  { label: 'Hook Making', key: 'Hook Making' },
  { label: 'Uprooting/Cleaning', key: 'Uprooting/Cleaning' },
  { label: 'Bed Making/Mulching', key: 'Bed Making/Mulching' },
  { label: 'Planting', key: 'Planting' },
  { label: 'Clipping', key: 'Clipping' },
  { label: 'Trellising', key: 'Trellising' },
  { label: 'Pruning', key: 'Pruning' },
  { label: 'Lowering', key: 'Lowering' },
  { label: 'Weeding', key: 'Weeding' },
  { label: 'Harvesting', key: 'Harvesting' },
];

/** Crop rows after General (zeros if no data in range). */
export const WORKERS_COUNT_SUMMARY_CROP_ORDER = [
  'Blackberry',
  'Broccoli',
  'Cauliflower',
  'Eggplant',
  'Melon (R&D)',
  'Fig',
  'Iceberg lettuce',
  'Red cabbage',
  'Snack Cucumber',
  'Tomato Beef',
  'Tomato Bunch',
  'Tomato Cherry',
  'Tomato Plum',
  'Tomato Table',
  'Sweetcorn',
  'White Cabbage',
  'Zucchini Green',
  'Zucchini Yellow',
  'No Crop',
  'Chilli',
];

export const WORKERS_COUNT_SUMMARY_METRICS = [
  { id: 'eag', title: 'EAG' },
  { id: 'casual', title: 'Casual' },
  { id: 'total', title: 'Total' },
];

export const FIELD_ACTIVITIES = [
  'Bed Making/Mulching',
  'Clipping',
  'Harvesting',
  'Hook Making',
  'Lowering',
  'Planting',
  'Pruning',
  'Trellising',
  'Uprooting/Cleaning',
  'Weeding',
];

export const GENERAL_ACTIVITIES = [
  'Crate Washing',
  'IPM',
  'Irrigation',
  'Maintenance',
  'Nursary',
  'Operator',
  'Supervisor',
  'Office',
];
