/**
 * Match scouting / PPP location codes (bay, valve) to planting_records.segment.
 */

export function normalizeBayChip(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const lower = s.toLowerCase().replace(/\s+/g, '');
  const m = lower.match(/^b(\d+)$/) || lower.match(/^bay[- ]*(\d+)$/) || lower.match(/^(\d+)$/);
  return m ? `B${m[1]}` : s.toUpperCase();
}

export function normalizeValveChip(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const lower = s.toLowerCase().replace(/\s+/g, '');
  const m = lower.match(/^v(\d+)$/) || lower.match(/^(\d+)$/) || lower.match(/^valve[- ]*(\d+)$/);
  return m ? `V${m[1]}` : s.toUpperCase();
}

export function normalizeBayChips(codes) {
  return (codes || []).map(normalizeBayChip).filter(Boolean);
}

export function normalizeValveChips(codes) {
  return (codes || []).map(normalizeValveChip).filter(Boolean);
}

/** Tokens like B1, V2 from one segment fragment. */
function tokensFromSegmentPart(part) {
  const tokens = new Set();
  const p = String(part || '').trim().toLowerCase().replace(/\s+/g, '');
  if (!p) return tokens;

  const bayM = p.match(/bay[- ]*(\d+)/) || p.match(/^b(\d+)$/);
  if (bayM) tokens.add(`B${bayM[1]}`);

  const valveM = p.match(/^v(\d+)$/);
  if (valveM) {
    tokens.add(`V${valveM[1]}`);
  } else if (/^\d+$/.test(p)) {
    tokens.add(`V${p}`);
  }

  return tokens;
}

function plantingRecordMatchesChip(record, normalizedChip, chipKind) {
  const seg = (record.segment || record.segmentId || '').toString();
  if (!seg || !normalizedChip) return false;

  const parts = seg.split(/[,&]+/).map((s) => s.trim()).filter(Boolean);
  for (const part of parts) {
    const tokens = tokensFromSegmentPart(part);
    if (tokens.has(normalizedChip)) return true;
  }

  const segCompact = seg.toLowerCase().replace(/\s+/g, '');
  const chipCompact = normalizedChip.toLowerCase();
  if (chipKind === 'bay' && segCompact.includes(chipCompact.replace(/^b/, 'bay'))) return true;
  if (chipKind === 'valve' && segCompact.includes(chipCompact)) return true;

  return false;
}

export function findPlantingRecordForChip(fieldId, chip, chipKind, plantingRecords) {
  if (!fieldId || !chip) return null;
  const normalized =
    chipKind === 'bay' ? normalizeBayChip(chip) : normalizeValveChip(chip);

  const fieldPr = (plantingRecords || []).filter(
    (r) => (r.field_id || r.fieldId) === fieldId,
  );

  return (
    fieldPr.find((r) => plantingRecordMatchesChip(r, normalized, chipKind)) || null
  );
}

function getAllLocationChips(bayCodes, valveCodes) {
  return [
    ...(bayCodes || []).map((code) => ({ kind: 'bay', code })),
    ...(valveCodes || []).map((code) => ({ kind: 'valve', code })),
  ];
}

function segmentLabel(kind, code) {
  return kind === 'bay' ? normalizeBayChip(code) : normalizeValveChip(code);
}

/**
 * Labeled variety string for every selected bay/valve (e.g. "B5: Roma; V1: Elpida F1").
 */
function resolveVarietiesForAllSegments(
  fieldId,
  bayCodes,
  valveCodes,
  plantingRecords,
  cropFromField,
  fieldVariety,
) {
  const chips = getAllLocationChips(bayCodes, valveCodes);
  if (chips.length === 0) return null;

  const labeledParts = [];
  const segmentLabels = [];
  const missingLabels = [];

  chips.forEach(({ kind, code }) => {
    const label = segmentLabel(kind, code);
    segmentLabels.push(label);
    const match = findPlantingRecordForChip(fieldId, code, kind, plantingRecords);
    const vName = match?.variety_name || match?.varietyName || '';
    if (vName) {
      labeledParts.push(`${label}: ${vName}`);
    } else {
      missingLabels.push(label);
    }
  });

  if (labeledParts.length > 0) {
    return {
      variety: labeledParts.join('; '),
      cropHelper: cropFromField ? 'From field' : '',
      varietyHelper: `From segments ${segmentLabels.join(', ')}`,
      varietyWarning:
        missingLabels.length > 0
          ? `No variety in Crop History for ${missingLabels.join(', ')}`
          : '',
    };
  }

  const unique = uniqueVarietiesForField(fieldId, plantingRecords);
  if (unique.length > 1) {
    return {
      variety: fieldVariety,
      cropHelper: cropFromField ? 'From field' : '',
      varietyHelper: fieldVariety
        ? 'No variety for selected segments — using field default'
        : 'No variety for selected segments — check Crop History',
      varietyWarning: 'Multiple varieties in field — verify segment',
    };
  }

  if (fieldVariety) {
    return {
      variety: fieldVariety,
      cropHelper: cropFromField ? 'From field' : '',
      varietyHelper: 'No variety for selected segments — using field default',
      varietyWarning: '',
    };
  }

  return {
    variety: '',
    cropHelper: cropFromField ? 'From field' : '',
    varietyHelper: 'No variety for selected segments — check Crop History',
    varietyWarning: '',
  };
}

function uniqueVarietiesForField(fieldId, plantingRecords) {
  const names = new Set(
    (plantingRecords || [])
      .filter((r) => (r.field_id || r.fieldId) === fieldId)
      .map((r) => r.variety_name || r.varietyName)
      .filter(Boolean),
  );
  return [...names];
}

/**
 * Resolve variety for scouting location chips.
 * @returns {{ variety: string, cropHelper?: string, varietyHelper?: string, varietyWarning?: string }}
 */
export function resolveVarietyForLocation({
  fieldId,
  bayCodes,
  valveCodes,
  plantingRecords,
  field,
}) {
  const cropFromField = field?.current_crop || field?.crop_name || '';
  const fieldVariety = field?.varietyName || field?.variety || '';

  if (!fieldId) {
    return { variety: '', cropHelper: '', varietyHelper: '', varietyWarning: '' };
  }

  const hasLocation =
    (bayCodes?.length || 0) + (valveCodes?.length || 0) > 0;
  if (hasLocation) {
    const multi = resolveVarietiesForAllSegments(
      fieldId,
      bayCodes,
      valveCodes,
      plantingRecords,
      cropFromField,
      fieldVariety,
    );
    if (multi) return multi;
  }

  const unique = uniqueVarietiesForField(fieldId, plantingRecords);
  if (unique.length === 1) {
    return {
      variety: unique[0],
      cropHelper: cropFromField ? 'From field' : '',
      varietyHelper: 'From planting records (single variety)',
      varietyWarning: '',
    };
  }

  if (fieldVariety) {
    return {
      variety: fieldVariety,
      cropHelper: cropFromField ? 'From field' : '',
      varietyHelper: 'From field (add bay or valve to refine)',
      varietyWarning: unique.length > 1 ? 'Multiple varieties in field — add segment' : '',
    };
  }

  return {
    variety: '',
    cropHelper: cropFromField ? 'From field' : 'No crop on this field — set in Crop Rotation',
    varietyHelper: '',
    varietyWarning: '',
  };
}

export function cropNameFromField(field) {
  if (!field) return '';
  return field.current_crop || field.crop_name || '';
}

function sortLocationLabels(a, b) {
  const na = parseInt(String(a).replace(/\D/g, ''), 10) || 0;
  const nb = parseInt(String(b).replace(/\D/g, ''), 10) || 0;
  return na - nb || String(a).localeCompare(String(b));
}

/**
 * Parse PPP SegmentSelector value ("V1, B2") into bay/valve chip lists.
 */
export function parseSegmentIdToLocation(segmentId) {
  const bayCodes = [];
  const valveCodes = [];
  if (!segmentId || segmentId === 'ALL') {
    return { bayCodes, valveCodes };
  }

  String(segmentId)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((part) => {
      if (/^b\d/i.test(part) || /bay/i.test(part)) {
        bayCodes.push(normalizeBayChip(part));
      } else if (/^v\d/i.test(part) || /^\d+$/.test(part)) {
        valveCodes.push(normalizeValveChip(part));
      } else if (/^s$/i.test(part) || /spot/i.test(part)) {
        valveCodes.push('S');
      } else {
        const v = normalizeValveChip(part);
        const b = normalizeBayChip(part);
        if (v && /^V/.test(v)) valveCodes.push(v);
        else if (b && /^B/.test(b)) bayCodes.push(b);
      }
    });

  return { bayCodes, valveCodes };
}

/** Variety resolution for a single PPP segment string. */
export function resolveVarietyFromSegmentId(
  fieldId,
  segmentId,
  plantingRecords,
  field,
) {
  const { bayCodes, valveCodes } = parseSegmentIdToLocation(segmentId);
  return resolveVarietyForLocation({
    fieldId,
    bayCodes,
    valveCodes,
    plantingRecords,
    field,
  });
}

export function getLocationOptionsForField(
  fieldId,
  plantingRecords,
  { savedBays = [], savedValves = [], valveCountFallback = 4 } = {},
) {
  const baySet = new Set(
    (savedBays || []).map(normalizeBayChip).filter(Boolean),
  );
  const valveSet = new Set(
    (savedValves || []).map(normalizeValveChip).filter(Boolean),
  );

  const fieldRecords = (plantingRecords || []).filter(
    (r) =>
      (r.field_id || r.fieldId) === fieldId &&
      (r.segment || r.segmentId),
  );

  fieldRecords.forEach((r) => {
    const seg = (r.segment || r.segmentId || '').toString();
    const parts = seg.split(/[,&]+/).map((s) => s.trim()).filter(Boolean);
    parts.forEach((part) => {
      tokensFromSegmentPart(part).forEach((token) => {
        if (token.startsWith('B')) baySet.add(token);
        if (token.startsWith('V')) valveSet.add(token);
      });
    });
  });

  if (valveSet.size === 0) {
    const n = Math.min(Math.max(Number(valveCountFallback) || 4, 1), 24);
    for (let i = 1; i <= n; i += 1) valveSet.add(`V${i}`);
  }

  return {
    bays: [...baySet].sort(sortLocationLabels),
    valves: [...valveSet].sort(sortLocationLabels),
    hasPlantingSegments: fieldRecords.length > 0,
  };
}
