/**
 * Scouting observation table rows: segment (sampling unit) + count basis (sampling method).
 */

export const COUNT_BASIS_OPTIONS = ['leaf', 'fruit', 'plant'];

export const SCOUTING_SAMPLE_COUNT = 10;
export const SCOUTING_SAMPLE_INDICES = Array.from({ length: SCOUTING_SAMPLE_COUNT }, (_, i) => i + 1);

let rowIdCounter = 0;

export function newObsRowId() {
  rowIdCounter += 1;
  return `obs-${Date.now()}-${rowIdCounter}`;
}

export function toSampleNum(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function sumSampleCounts(row) {
  return SCOUTING_SAMPLE_INDICES.reduce(
    (sum, n) => sum + (toSampleNum(row[`count${n}`]) ?? 0),
    0,
  );
}

export function avgSampleCounts(row) {
  return sumSampleCounts(row) / SCOUTING_SAMPLE_COUNT;
}

export function hasAnySampleInput(row) {
  return SCOUTING_SAMPLE_INDICES.some(
    (n) => row[`count${n}`] !== '' && row[`count${n}`] != null,
  );
}

function emptySampleCounts() {
  const counts = {};
  SCOUTING_SAMPLE_INDICES.forEach((n) => {
    counts[`count${n}`] = '';
  });
  return counts;
}

function sampleCountFromObservation(o, n) {
  return o[`count_${n}`] ?? o[`count${n}`] ?? '';
}

export function defaultSamplingMethod(abbr) {
  return abbr === 'MA' ? 'leaf' : 'plant';
}

function normalizeCountBasis(method) {
  if (!method) return '';
  const m = String(method).toLowerCase().trim();
  if (m.includes('leaf')) return 'leaf';
  if (m.includes('fruit')) return 'fruit';
  if (m.includes('plant')) return 'plant';
  if (COUNT_BASIS_OPTIONS.includes(m)) return m;
  return '';
}

export function createObsRow({ abbr, label, category, pestDiseaseId = null, pestName, isBase = true }) {
  return {
    rowId: newObsRowId(),
    abbr,
    label,
    category,
    isBase: Boolean(isBase),
    pestDiseaseId,
    pestName: pestName || label,
    samplingUnit: '',
    samplingMethod: defaultSamplingMethod(abbr),
    ...emptySampleCounts(),
    percent: '',
  };
}

export function cloneObsRow(row) {
  return {
    ...createObsRow({
      abbr: row.abbr,
      label: row.label,
      category: row.category,
      pestDiseaseId: row.pestDiseaseId,
      pestName: row.pestName,
      isBase: false,
    }),
    samplingMethod: row.samplingMethod || defaultSamplingMethod(row.abbr),
  };
}

function observationToRowFields(o, template) {
  const abbrMatch = /\(([A-Z]+)\)/.exec(o.pest_name || o.pestName || '');
  const abbr = abbrMatch?.[1] || template?.abbr || '';
  const legacyUnit = (o.sampling_unit || o.samplingUnit || '').toLowerCase();
  const legacyIsBasis = COUNT_BASIS_OPTIONS.some((b) => legacyUnit.includes(b))
    || legacyUnit.includes('leaf / fruit');

  let samplingUnit = o.sampling_unit || o.samplingUnit || '';
  let samplingMethod = normalizeCountBasis(o.sampling_method || o.samplingMethod) || defaultSamplingMethod(abbr);

  if (legacyIsBasis && !normalizeCountBasis(o.sampling_method || o.samplingMethod)) {
    samplingMethod = normalizeCountBasis(o.sampling_unit || o.samplingUnit) || samplingMethod;
    samplingUnit = '';
  }

  const counts = {};
  SCOUTING_SAMPLE_INDICES.forEach((n) => {
    counts[`count${n}`] = sampleCountFromObservation(o, n);
  });

  return {
    rowId: newObsRowId(),
    abbr,
    label: template?.label || o.pest_name || o.pestName || '',
    category: o.category || template?.category,
    isBase: false,
    pestDiseaseId: o.pest_disease_id || o.pestDiseaseId || template?.pestDiseaseId || null,
    pestName: o.pest_name || o.pestName || template?.pestName || template?.label,
    samplingUnit,
    samplingMethod,
    ...counts,
    percent: o.percent ?? '',
  };
}

/**
 * Build table rows from paper templates + saved observations (supports duplicates per pest).
 */
export function buildObservationRows(templates, savedObservations, category) {
  const saved = (savedObservations || []).filter((o) => o.category === category);
  const savedByAbbr = new Map();

  saved.forEach((o) => {
    const abbrMatch = /\(([A-Z]+)\)/.exec(o.pest_name || o.pestName || '');
    const key = abbrMatch?.[1] || o.pest_name || o.pestName || '';
    if (!savedByAbbr.has(key)) savedByAbbr.set(key, []);
    savedByAbbr.get(key).push(o);
  });

  const rows = [];

  templates.forEach((t) => {
    const list = savedByAbbr.get(t.abbr) || [];
    if (list.length === 0) {
      rows.push(
        createObsRow({
          abbr: t.abbr,
          label: t.label,
          category,
          isBase: true,
        }),
      );
    } else {
      list.forEach((o, i) => {
        rows.push({
          ...observationToRowFields(o, t),
          isBase: i === 0,
        });
      });
      savedByAbbr.delete(t.abbr);
    }
  });

  savedByAbbr.forEach((list, key) => {
    list.forEach((o, i) => {
      rows.push({
        ...observationToRowFields(o, { abbr: key, label: o.pest_name || o.pestName, category }),
        isBase: i === 0,
      });
    });
  });

  return rows;
}

export const INSECT_ROW_TEMPLATES = [
  { abbr: 'MA', label: 'Mite adult (MA)' },
  { abbr: 'ML', label: 'Mite larva (ML)' },
  { abbr: 'ME', label: 'Mite egg (ME)' },
  { abbr: 'WA', label: 'Whitefly adult (WA)' },
  { abbr: 'WE', label: 'Whitefly egg (WE)' },
  { abbr: 'TA', label: 'Tuta absoluta (TA)' },
  { abbr: 'A', label: 'Aphids (A)' },
  { abbr: 'T', label: 'Thrips (T)' },
  { abbr: 'L', label: 'Leaf miner (L)' },
  { abbr: 'W', label: 'Worm (W)' },
];

export const DISEASE_ROW_TEMPLATES = [
  { abbr: 'EB', label: 'Early blight (EB)' },
  { abbr: 'LB', label: 'Late blight (LB)' },
  { abbr: 'BL', label: 'Bacterial blight (BL)' },
  { abbr: 'B', label: 'Botrytis (B)' },
  { abbr: 'DW', label: 'Downy mildew (DW)' },
  { abbr: 'An', label: 'Anthracnose (An)' },
  { abbr: 'P', label: 'Phytium (P)' },
  { abbr: 'F', label: 'Fusarium (F)' },
];

export function initialInsectRows() {
  return INSECT_ROW_TEMPLATES.map((t) =>
    createObsRow({ abbr: t.abbr, label: t.label, category: 'insect', isBase: true }),
  );
}

export function initialDiseaseRows() {
  return DISEASE_ROW_TEMPLATES.map((t) =>
    createObsRow({ abbr: t.abbr, label: t.label, category: 'disease', isBase: true }),
  );
}
