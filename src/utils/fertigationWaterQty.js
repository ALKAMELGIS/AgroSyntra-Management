/**
 * Water qty per valve is entered on the spreadsheet but saved as
 * dailyWater = waterQty × frequency × valvesCount. Recover it for Excel.
 */
export function waterQtyPerValve(entry) {
  const daily = Number(entry.dailyWater);
  const freq = Number(entry.frequency);
  const valves = Number(entry.valvesCount);
  if (!(daily > 0) || !(freq > 0) || !(valves > 0)) return '';
  return Number((daily / (freq * valves)).toFixed(3));
}
