export const PEST_IMPORT_KEYWORD_MAP = [
  { key: 'cropName', keywords: ['crop'] },
  { key: 'percentSeen', keywords: ['%seen & variety', '%seen', '% seen', 'percent seen'] },
  { key: 'variety', keywords: ['variety'] },
  { key: 'fieldId', keywords: ['field id', 'field'] },
  { key: 'segmentId', keywords: ['segment', 'bay', 'section'] },
  { key: 'applicationDate', keywords: ['application date', 'ppp application', 'ppp applicatin'] },
  { key: 'justification', keywords: ['justification'] },
  { key: 'scoutingDate', keywords: ['scouting'] },
  { key: 'applicationStartTime', keywords: ['start time'] },
  { key: 'applicationEndTime', keywords: ['end time'] },
  { key: 'productName', keywords: ['name of ppp', 'product name', 'ppp name'] },
  { key: 'activeIngredient', keywords: ['active ingredient', 'ingredient'] },
  { key: 'dosage', keywords: ['dose'] },
  { key: 'unitPrice', keywords: ['unit price', 'price per unit', 'price/unit'] },
  { key: 'uom', keywords: ['uom', 'unit of measure', 'units', 'dosage unit'] },
  { key: 'totalQuantityApplied', keywords: ['qty applied', 'quantity applied', 'qty'] },
  { key: 'cost', keywords: ['cost'] },
  { key: 'totalWaterQty', keywords: ['water qty', 'water quatity', 'water quantity', 'total water'] },
  { key: 'machineryUsed', keywords: ['machinery', 'equipment'] },
  { key: 'phiDays', keywords: ['pre-harvest', 'phi'] },
  { key: 'clearToHarvestDate', keywords: ['clear to harvest', 'harvest date'] },
  { key: 'weatherConditions', keywords: ['weather'] },
  { key: 'operatorName', keywords: ['operator', 'applicator'] },
  { key: 'verifiedBy', keywords: ['authorized', 'verified'] },
];

export function normalizeHeader(h) {
  return (h || '').toString().trim().toLowerCase().replace(/\s+/g, ' ');
}

export function guessFieldKey(headerText) {
  const norm = normalizeHeader(headerText);
  if (!norm) return '';
  for (const { key, keywords } of PEST_IMPORT_KEYWORD_MAP) {
    if (keywords.some((kw) => norm.includes(kw))) return key;
  }
  return '';
}
