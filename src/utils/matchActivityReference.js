import { normalizeSummaryActivity } from './manpowerWorkersCountSummaryGrid';

function blankKey(value) {
  return String(value || '').trim().toLowerCase();
}

export function parseReferenceTarget(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n;
}

/**
 * Most specific Reference row for an activity: variety, then crop, then activity-only.
 * Returns the row even when target is blank so the activity sheet can unlock Target.
 */
export function matchActivityReference(refs, activity, crop, variety) {
  const act = normalizeSummaryActivity(activity);
  if (!act || act === '(blank)') return null;
  const sameAct = (refs || []).filter((r) => normalizeSummaryActivity(r.activity) === act);
  if (sameAct.length === 0) return null;

  const exact = sameAct.find((r) => blankKey(r.crop) === blankKey(crop) && blankKey(r.variety) === blankKey(variety));
  if (exact) return exact;

  const cropOnly = sameAct.find((r) => blankKey(r.crop) === blankKey(crop) && !blankKey(r.variety));
  if (cropOnly) return cropOnly;

  return sameAct.find((r) => !blankKey(r.crop) && !blankKey(r.variety)) || null;
}

export function applyReferenceToBlock(block, refs, crop, defaultUnit) {
  const ref = matchActivityReference(refs, block.activity, crop, block.variety);
  const targetNum = parseReferenceTarget(ref?.target);
  const wasLocked = Boolean(block.targetLocked);
  const next = { ...block };

  if (ref?.unit) next.unit = ref.unit;
  else if (block.activity) next.unit = defaultUnit || '';
  else next.unit = '';

  if (targetNum != null) {
    next.target = String(targetNum);
    next.targetLocked = true;
  } else {
    if (wasLocked) next.target = '';
    next.targetLocked = false;
  }
  return next;
}
