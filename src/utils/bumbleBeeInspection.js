export const INSPECTION_EDIT_GRACE_MS = 3 * 60 * 1000;

export function sumInspectionBuckets(row) {
  const keys = ['boxes100', 'boxes80', 'boxes60', 'boxes40', 'boxes20', 'boxes0'];
  return keys.reduce((s, k) => s + (Number(row[k]) || 0), 0);
}

export function sumInspectionFromDb(row) {
  const keys = ['boxes_100', 'boxes_80', 'boxes_60', 'boxes_40', 'boxes_20', 'boxes_0'];
  return keys.reduce((s, k) => s + (Number(row[k]) || 0), 0);
}

export function deployTotalOnField(lastDeploy) {
  if (!lastDeploy) return null;
  const n = Number(lastDeploy.box_count_total ?? lastDeploy.box_count);
  return Number.isFinite(n) ? n : null;
}

export function inspectionGraceRemainingMs(createdAt) {
  if (!createdAt) return 0;
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return 0;
  return Math.max(0, INSPECTION_EDIT_GRACE_MS - (Date.now() - created));
}

export function buildInspectionPayloadFromDraft(draft) {
  return {
    inspectionDate: String(draft.inspectionDate || '').split('T')[0],
    boxes100: Number(draft.boxes100) || 0,
    boxes80: Number(draft.boxes80) || 0,
    boxes60: Number(draft.boxes60) || 0,
    boxes40: Number(draft.boxes40) || 0,
    boxes20: Number(draft.boxes20) || 0,
    boxes0: Number(draft.boxes0) || 0,
    notes: draft.notes ?? '',
  };
}

export function buildInspectionPayloadFromRow(insp) {
  return {
    inspectionDate: String(insp.inspection_date || '').split('T')[0],
    boxes100: Number(insp.boxes_100) || 0,
    boxes80: Number(insp.boxes_80) || 0,
    boxes60: Number(insp.boxes_60) || 0,
    boxes40: Number(insp.boxes_40) || 0,
    boxes20: Number(insp.boxes_20) || 0,
    boxes0: Number(insp.boxes_0) || 0,
    notes: insp.notes ?? '',
  };
}

export function inspectionPayloadsEqual(a, b) {
  if (!a || !b) return false;
  return a.inspectionDate === b.inspectionDate
    && a.boxes100 === b.boxes100
    && a.boxes80 === b.boxes80
    && a.boxes60 === b.boxes60
    && a.boxes40 === b.boxes40
    && a.boxes20 === b.boxes20
    && a.boxes0 === b.boxes0
    && String(a.notes || '') === String(b.notes || '');
}

const INSPECTION_DIFF_FIELDS = [
  { key: 'inspectionDate', label: 'Inspection date', type: 'date' },
  { key: 'boxes100', label: '100%', type: 'number' },
  { key: 'boxes80', label: '80%', type: 'number' },
  { key: 'boxes60', label: '60%', type: 'number' },
  { key: 'boxes40', label: '40%', type: 'number' },
  { key: 'boxes20', label: '20%', type: 'number' },
  { key: 'boxes0', label: '0%', type: 'number' },
  { key: 'notes', label: 'Notes', type: 'text' },
];

export function diffInspectionChangeRequest(snapshotBefore, proposedPayload) {
  if (!snapshotBefore || !proposedPayload) return [];
  const before = buildInspectionPayloadFromRow(snapshotBefore);
  const after = buildInspectionPayloadFromDraft(proposedPayload);

  return INSPECTION_DIFF_FIELDS.map(({ key, label, type }) => {
    const bVal = before[key];
    const aVal = after[key];
    if (type === 'text') {
      if (String(bVal || '') === String(aVal || '')) return null;
      return {
        key,
        label,
        before: bVal || '—',
        after: aVal || '—',
        delta: null,
      };
    }
    if (type === 'date') {
      if (bVal === aVal) return null;
      return { key, label, before: bVal, after: aVal, delta: null };
    }
    if (bVal === aVal) return null;
    return {
      key,
      label,
      before: bVal,
      after: aVal,
      delta: aVal - bVal,
    };
  }).filter(Boolean);
}

export function formatInspectionRecordLabel(snapshot) {
  if (!snapshot) return '—';
  const field = snapshot.field_name || snapshot.field_id || 'Unknown field';
  const date = String(snapshot.inspection_date || '').split('T')[0];
  return date ? `${field} · ${date}` : field;
}

export function summarizeInspectionDiff(changes) {
  if (!changes?.length) return 'No field changes';
  return changes.map((c) => {
    if (c.key === 'notes') return 'Notes changed';
    if (c.delta != null) {
      const sign = c.delta > 0 ? '+' : '';
      return `${c.label}: ${c.before} → ${c.after} (${sign}${c.delta})`;
    }
    return `${c.label}: ${c.before} → ${c.after}`;
  }).join('; ');
}

export function inspectionDeleteSummaryLines(snapshot) {
  if (!snapshot) return [];
  const payload = buildInspectionPayloadFromRow(snapshot);
  return [
    { label: 'Field', value: snapshot.field_name || snapshot.field_id || '—' },
    { label: 'Inspection date', value: payload.inspectionDate || '—' },
    { label: '100%', value: payload.boxes100 },
    { label: '80%', value: payload.boxes80 },
    { label: '60%', value: payload.boxes60 },
    { label: '40%', value: payload.boxes40 },
    { label: '20%', value: payload.boxes20 },
    { label: '0%', value: payload.boxes0 },
    { label: 'Notes', value: payload.notes || '—' },
  ];
}
