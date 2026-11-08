/**
 * Spectral indices and band combinations for Sentinel-2 L2A, computed by the
 * satellite service with our own scripts (EVALSCRIPT), so they work with any
 * configuration ID and the browser can only choose from this list.
 */

type Ramp = Array<[number, string]>;

export interface IndexDef {
  key: string;
  label: string;
  group: 'vegetation' | 'water' | 'soil' | 'visual';
  formula: string;
  description: string;
  bands: string[];
  /** JavaScript expression over sample `s` (index value); absent for band combinations. */
  expr?: string;
  ramp?: Ramp;
  /** Band combination [r, g, b] with a gain (visual layers). */
  rgb?: { bands: [string, string, string]; gain: number };
}

const VEG: Ramp = [[-0.2, '0xa50026'], [0, '0xd73027'], [0.1, '0xf46d43'], [0.2, '0xfdae61'], [0.3, '0xfee08b'], [0.4, '0xd9ef8b'], [0.5, '0xa6d96a'], [0.6, '0x66bd63'], [0.7, '0x1a9850'], [0.9, '0x006837']];
const WATER: Ramp = [[-0.8, '0x8c510a'], [-0.4, '0xd8b365'], [-0.1, '0xf6e8c3'], [0, '0xc7eae5'], [0.2, '0x5ab4ac'], [0.5, '0x01665e'], [0.8, '0x003c30']];
const MOIST: Ramp = [[-0.6, '0x8c2d04'], [-0.3, '0xcc4c02'], [-0.1, '0xfe9929'], [0, '0xfee391'], [0.1, '0xc7e9b4'], [0.2, '0x7fcdbb'], [0.4, '0x2c7fb8'], [0.6, '0x253494']];
const STRESS: Ramp = [[0.2, '0x253494'], [0.6, '0x41b6c4'], [1, '0xffffcc'], [1.4, '0xfd8d3c'], [2, '0xbd0026']];
const SOIL: Ramp = [[-0.6, '0x1a9850'], [-0.2, '0x91cf60'], [0, '0xfee08b'], [0.15, '0xfc8d59'], [0.3, '0xd73027'], [0.6, '0x7f0000']];

export const INDICES: IndexDef[] = [
  { key: 'TRUE_COLOR', label: 'True color', group: 'visual', formula: 'B04, B03, B02', description: 'Natural colours, as the eye sees them.', bands: ['B04', 'B03', 'B02'], rgb: { bands: ['B04', 'B03', 'B02'], gain: 2.5 } },
  { key: 'FALSE_COLOR', label: 'Color infrared (vegetation)', group: 'visual', formula: 'B08, B04, B03', description: 'Healthy vegetation in bright red.', bands: ['B08', 'B04', 'B03'], rgb: { bands: ['B08', 'B04', 'B03'], gain: 2.5 } },
  { key: 'SWIR', label: 'SWIR (soil & moisture)', group: 'visual', formula: 'B12, B8A, B04', description: 'Wet soil dark, dry soil and bare ground bright.', bands: ['B12', 'B8A', 'B04'], rgb: { bands: ['B12', 'B8A', 'B04'], gain: 2.5 } },
  { key: 'NDVI', label: 'NDVI', group: 'vegetation', formula: '(B08 − B04) / (B08 + B04)', description: 'Vegetation health and density.', bands: ['B04', 'B08'], expr: '(s.B08 - s.B04) / (s.B08 + s.B04)', ramp: VEG },
  { key: 'SAVI', label: 'SAVI', group: 'vegetation', formula: '1.5 × (B08 − B04) / (B08 + B04 + 0.5)', description: 'NDVI corrected for bright soil; better for young crops.', bands: ['B04', 'B08'], expr: '1.5 * (s.B08 - s.B04) / (s.B08 + s.B04 + 0.5)', ramp: VEG },
  { key: 'NDWI', label: 'NDWI', group: 'water', formula: '(B03 − B08) / (B03 + B08)', description: 'Open water and water bodies.', bands: ['B03', 'B08'], expr: '(s.B03 - s.B08) / (s.B03 + s.B08)', ramp: WATER },
  { key: 'NDMI', label: 'NDMI', group: 'water', formula: '(B08 − B11) / (B08 + B11)', description: 'Moisture in the crop canopy.', bands: ['B08', 'B11'], expr: '(s.B08 - s.B11) / (s.B08 + s.B11)', ramp: MOIST },
  { key: 'NDII', label: 'NDII', group: 'water', formula: '(B08 − B11) / (B08 + B11)', description: 'Infrared water-content index (same Sentinel-2 bands as NDMI).', bands: ['B08', 'B11'], expr: '(s.B08 - s.B11) / (s.B08 + s.B11)', ramp: MOIST },
  { key: 'MSI', label: 'Moisture stress (MSI)', group: 'water', formula: 'B11 / B08', description: 'Higher values mean drier, stressed plants.', bands: ['B08', 'B11'], expr: 's.B11 / s.B08', ramp: STRESS },
  { key: 'BSI', label: 'Bare soil (BSI)', group: 'soil', formula: '((B11 + B04) − (B08 + B02)) / ((B11 + B04) + (B08 + B02))', description: 'Bare and exposed soil.', bands: ['B02', 'B04', 'B08', 'B11'], expr: '((s.B11 + s.B04) - (s.B08 + s.B02)) / ((s.B11 + s.B04) + (s.B08 + s.B02))', ramp: SOIL },
];

export const INDEX_KEYS = new Set(INDICES.map((i) => i.key));
export const getIndex = (key: string) => INDICES.find((i) => i.key === key);

function inputs(def: IndexDef) {
  return JSON.stringify([...def.bands, 'dataMask']);
}

/** Coloured image (RGBA) for map tiles. */
export function vizScript(def: IndexDef): string {
  if (def.rgb) {
    const [r, g, b] = def.rgb.bands;
    return `//VERSION=3
function setup(){return{input:${inputs(def)},output:{bands:4}}}
function evaluatePixel(s){return [${def.rgb.gain}*s.${r}, ${def.rgb.gain}*s.${g}, ${def.rgb.gain}*s.${b}, s.dataMask];}`;
  }
  const ramp = (def.ramp || VEG).map(([v, c]) => `[${v},${c}]`).join(',');
  return `//VERSION=3
const viz = new ColorRampVisualizer([${ramp}]);
function setup(){return{input:${inputs(def)},output:{bands:4}}}
function evaluatePixel(s){const v=${def.expr}; if(!isFinite(v)) return [0,0,0,0]; const c=viz.process(v); return [c[0],c[1],c[2],s.dataMask];}`;
}

/** One float value per pixel, for statistics over an area. */
export function statsScript(def: IndexDef): string {
  const expr = def.expr || `(s.${def.bands[0]}+s.${def.bands[1]}+s.${def.bands[2]})/3`;
  return `//VERSION=3
function setup(){return{input:${inputs(def)},output:[{id:"default",bands:1,sampleType:"FLOAT32"},{id:"dataMask",bands:1}]}}
function evaluatePixel(s){const v=${expr}; return {default:[isFinite(v)?v:0], dataMask:[s.dataMask && isFinite(v) ? 1 : 0]};}`;
}

export const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');

/** Catalogue for the browser (no scripts). */
export function indexCatalog() {
  return INDICES.map(({ key, label, group, formula, description, ramp, rgb }) => ({
    key, label, group, formula, description,
    legend: ramp ? ramp.map(([value, color]) => ({ value, color: `#${color.slice(2)}` })) : null,
    visual: Boolean(rgb),
  }));
}
