import { AppError } from './errors';

/**
 * A tank-mix application (rows sharing a group_id) holds at most this many products:
 * the main product and two mixtures. Mirrors src/utils/mixtureGroups.js.
 */
export const MAX_PRODUCTS_PER_MIXTURE = 3;

export function mixtureTooLarge(): AppError {
  return new AppError(
    `A mixture can have at most ${MAX_PRODUCTS_PER_MIXTURE} products`,
    'VALIDATION_ERROR',
    400,
  );
}

/** Work order values a mixture shares with its main row (same tank pass). */
export const WORK_ORDER_SHARED_KEYS = ['startTime', 'endTime', 'machineryRef', 'completedByName'] as const;

/**
 * Copies the main row's start / end time, machinery and completed by onto its mixture rows.
 * `groupOf` gives a row's group (defaults to `groupId`). Rows without a main row are left alone.
 */
export function alignMixtureItems<T extends Record<string, any>>(
  items: T[],
  groupOf: (item: T) => string | null | undefined = (item) => item.groupId,
): T[] {
  const mains = new Map<string, T>();
  for (const item of items) {
    const group = groupOf(item);
    if (group && !item.isMixtureChild && !mains.has(group)) mains.set(group, item);
  }
  return items.map((item) => {
    const group = groupOf(item);
    const main = item.isMixtureChild && group ? mains.get(group) : undefined;
    if (!main) return item;
    const copy: Record<string, any> = { ...item };
    for (const key of WORK_ORDER_SHARED_KEYS) copy[key] = main[key] ?? null;
    return copy as T;
  });
}

/** Throws when any group in the list has more than MAX_PRODUCTS_PER_MIXTURE rows. */
export function assertMixtureSizes(groupIds: Array<string | null | undefined>): void {
  const counts = new Map<string, number>();
  for (const id of groupIds) {
    if (!id) continue;
    const n = (counts.get(id) || 0) + 1;
    if (n > MAX_PRODUCTS_PER_MIXTURE) throw mixtureTooLarge();
    counts.set(id, n);
  }
}
