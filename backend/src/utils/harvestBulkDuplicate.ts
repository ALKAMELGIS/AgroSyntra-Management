/**
 * Bulk harvest skip: same field + date + variety is a duplicate only when
 * shift matches, or when both shifts are blank and start time matches.
 */

export function harvestBulkShiftKey(shiftNumber?: string | null): string {
  return String(shiftNumber ?? '').trim().toLowerCase();
}

export function harvestBulkTimeKey(startTime?: string | null): string {
  const text = String(startTime ?? '').trim();
  if (!text) return '';
  const match = text.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return text;
  return `${String(parseInt(match[1], 10)).padStart(2, '0')}:${match[2]}`;
}

export function isSameHarvestBulkDuplicate(
  existing: { shiftNumber?: string | null; startTime?: string | null },
  incoming: { shiftNumber?: string | null; startTime?: string | null },
): boolean {
  const existingShift = harvestBulkShiftKey(existing.shiftNumber);
  const incomingShift = harvestBulkShiftKey(incoming.shiftNumber);
  if (existingShift || incomingShift) return existingShift === incomingShift;
  return harvestBulkTimeKey(existing.startTime) === harvestBulkTimeKey(incoming.startTime);
}
