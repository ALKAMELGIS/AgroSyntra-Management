import { getCropDripperCount, getCropDripTestCount } from './masterDataUtils';

export function cropNameOf(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'object') return value.name || value.cropName || null;
  return String(value);
}

export function hasNumeric(value) {
  if (value === '' || value == null) return false;
  return Number.isFinite(Number(value));
}

export function toFiniteNumber(value) {
  if (!hasNumeric(value)) return null;
  return Number(value);
}

export function displayEcphNumber(value) {
  return hasNumeric(value) ? value : '-';
}

function cropNameFromHistory(history) {
  if (!Array.isArray(history) || history.length === 0) return null;
  const open = history.find((row) => !row.endDate && !row.end_date);
  const row = open || history[history.length - 1];
  return cropNameOf(row?.crop || row?.cropName || row?.name);
}

function cropNameFromId(masterData, cropId) {
  if (!masterData?.crops || cropId == null || cropId === '') return null;
  const want = String(cropId);
  const crop = (masterData.crops || []).find((row) => {
    if (typeof row !== 'object' || row == null) return false;
    return String(row.id || '') === want;
  });
  return cropNameOf(crop);
}

export function resolveCropName(entry, fieldInfo, masterData) {
  const fromEntry = cropNameOf(entry?.cropName)
    || cropNameOf(entry?.crop)
    || cropNameFromId(masterData, entry?.cropId ?? entry?.crop_id);
  if (fromEntry) return fromEntry;

  return cropNameOf(fieldInfo?.currentCrop)
    || cropNameOf(fieldInfo?.current_crop)
    || cropNameOf(entry?.currentCrop)
    || cropNameOf(fieldInfo?.crop)
    || cropNameFromId(masterData, fieldInfo?.currentCropId ?? fieldInfo?.current_crop_id)
    || cropNameFromHistory(fieldInfo?.cropHistory)
    || null;
}

function findCropRecord(masterData, cropName) {
  if (!masterData?.crops || !cropName) return null;
  const want = String(cropName).trim().toLowerCase();
  return (masterData.crops || []).find((crop) => {
    const name = typeof crop === 'object' ? crop.name : crop;
    return String(name || '').trim().toLowerCase() === want;
  }) || null;
}

function dripTestCountForCrop(masterData, cropName) {
  const crop = findCropRecord(masterData, cropName);
  if (crop && typeof crop === 'object') {
    const n = toFiniteNumber(crop.drip_test_count ?? crop.dripTestCount);
    if (n != null && n > 0) return n;
  }
  const fromHelper = toFiniteNumber(getCropDripTestCount(masterData, cropName));
  return fromHelper != null && fromHelper > 0 ? fromHelper : null;
}

function dripperCountForCrop(masterData, cropName) {
  const crop = findCropRecord(masterData, cropName);
  if (crop && typeof crop === 'object') {
    const n = toFiniteNumber(crop.dripper_count ?? crop.dripperCount);
    if (n != null && n > 0) return n;
  }
  const fromHelper = toFiniteNumber(getCropDripperCount(masterData, cropName));
  return fromHelper != null && fromHelper > 0 ? fromHelper : null;
}

export function inferDripTestCountFromDripperCount(masterData, dripperCount) {
  const want = toFiniteNumber(dripperCount);
  if (!masterData?.crops || want == null || want <= 0) return null;
  const tests = [];
  masterData.crops.forEach((crop) => {
    if (typeof crop !== 'object') return;
    const drippers = toFiniteNumber(crop.dripper_count ?? crop.dripperCount);
    if (drippers !== want) return;
    const test = toFiniteNumber(crop.drip_test_count ?? crop.dripTestCount);
    if (test != null && test > 0 && !tests.includes(test)) tests.push(test);
  });
  return tests.length === 1 ? tests[0] : null;
}

export function resolveDripperCount(entry, fieldInfo, masterData) {
  const stored = toFiniteNumber(entry?.dripperCount);
  if (stored != null && stored > 0) return stored;
  const crop = resolveCropName(entry, fieldInfo, masterData);
  if (!masterData || !crop) return null;
  return dripperCountForCrop(masterData, crop);
}

export function resolveDripTestCount(entry, fieldInfo, masterData) {
  const stored = toFiniteNumber(entry?.dripTestCount ?? entry?.drip_test_count);
  if (stored != null && stored > 0) return stored;
  const crop = resolveCropName(entry, fieldInfo, masterData);
  if (masterData && crop) {
    const fromCrop = dripTestCountForCrop(masterData, crop);
    if (fromCrop != null) return fromCrop;
  }
  const drippers = resolveDripperCount(entry, fieldInfo, masterData);
  return inferDripTestCountFromDripperCount(masterData, drippers);
}

export function formatDrainPercent(value) {
  const n = toFiniteNumber(value);
  if (n == null) return '';
  const pct = n <= 1 ? n * 100 : n;
  const rounded = Number(pct.toFixed(2));
  return `${Number.isInteger(rounded) ? String(rounded) : String(rounded)}%`;
}

export function computeGrowBagDrip(dripVolume, dripTestCount) {
  const drip = toFiniteNumber(dripVolume);
  const count = toFiniteNumber(dripTestCount);
  if (drip == null || count == null || count <= 0) return null;
  return Number((drip * count).toFixed(3));
}

export function computePercentDrain(drainVolume, dripVolumeN) {
  const drain = toFiniteNumber(drainVolume);
  const nDrip = toFiniteNumber(dripVolumeN);
  if (drain == null || drain < 0 || nDrip == null || nDrip <= 0) return null;
  return Number(((drain / nDrip) * 100).toFixed(2));
}

export function growBagDripHeader(testCounts) {
  const unique = [];
  (testCounts || []).forEach((value) => {
    const n = toFiniteNumber(value);
    if (n != null && n > 0 && !unique.includes(n)) unique.push(n);
  });
  if (unique.length === 1) return `${unique[0]} Drip Volume (ml)`;
  return 'N Drip Volume (ml)';
}

export function computeWaterBasedOnDrip(dripVolume, dripperCount) {
  const drip = toFiniteNumber(dripVolume);
  const count = toFiniteNumber(dripperCount);
  if (drip == null || drip <= 0 || count == null || count <= 0) return null;
  return Number(((drip * count) / 1000000).toFixed(3));
}

export function resolveWaterBasedOnDrip(valve, entry, dripperCount) {
  const stored = toFiniteNumber(valve?.totalWaterBasedOnDrip);
  if (stored != null) return Number(stored.toFixed(3));
  return computeWaterBasedOnDrip(valve?.dripVolume, dripperCount);
}

function valveHasOwnWater(valve, dripperCount) {
  if (!valve) return false;
  if (hasNumeric(valve.totalWaterQty)) return true;
  const qty = toFiniteNumber(valve.qtyOfWater);
  const cycle = toFiniteNumber(valve.cycle);
  if (qty != null && qty > 0 && cycle != null && cycle > 0) return true;
  if (qty != null && qty > 0) return true;
  if (toFiniteNumber(valve.totalWaterBasedOnDrip) != null) return true;
  return computeWaterBasedOnDrip(valve.dripVolume, dripperCount) != null;
}

export function resolveValveWaterQty(valve, entry, {
  valveIndex = 0,
  valves = [],
  dripperCount,
} = {}) {
  if (valve) {
    if (hasNumeric(valve.totalWaterQty)) return valve.totalWaterQty;

    const qty = toFiniteNumber(valve.qtyOfWater);
    const cycle = toFiniteNumber(valve.cycle);
    if (qty != null && qty > 0 && cycle != null && cycle > 0) {
      return Number((qty * cycle).toFixed(3));
    }
    if (qty != null && qty > 0) return qty;

    const dripBased = resolveWaterBasedOnDrip(valve, entry, dripperCount);
    if (dripBased != null) return dripBased;
  }

  if (valveIndex !== 0) return null;

  const others = Array.isArray(valves) && valves.length > 0
    ? valves
    : (valve ? [valve] : []);
  const anyOwn = others.some((v) => valveHasOwnWater(v, dripperCount));
  if (anyOwn) return null;

  return hasNumeric(entry?.totalWaterQty) ? entry.totalWaterQty : null;
}
