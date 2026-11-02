import { ALL_SEGMENTS, parseSegmentTokens } from './plantingSegmentTokens';

export function toYmd(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  if (typeof value === 'string') {
    const sliced = value.slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(sliced) ? sliced : null;
  }
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const d = String(value.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function inSeasonWindow(
  date: string | Date | null | undefined,
  start: string,
  end: string,
): boolean {
  const d = toYmd(date);
  if (!d) return false;
  return d >= start && d <= end;
}

export type AvailabilityKind = 'never_planted' | 'uprooted' | 'partial';

export interface FieldAvailabilityInput {
  occupied: string[];
  universe: string[];
  plantedInWindow: boolean;
  uprootedInWindow: {
    at: string;
    reason: string | null;
    tokens: string[];
    cropName?: string | null;
    varietyName?: string | null;
  } | null;
}

export interface FieldAvailabilityRow {
  availability: 'Vacant' | 'Partial';
  kind: AvailabilityKind;
  occupiedTokens: string[];
  freeTokens: string[];
  plantedInWindow: boolean;
  lastCrop: string | null;
  uprootedAt: string | null;
  uprootReason: string | null;
}

export function classifyFieldAvailability(
  input: FieldAvailabilityInput,
): FieldAvailabilityRow | null {
  const occupied = (input.occupied || []).filter(Boolean);
  const occupiedAll = occupied.includes(ALL_SEGMENTS);
  const concreteOccupied = occupied.filter((token) => token !== ALL_SEGMENTS);
  const universe = (input.universe || []).filter((token) => token && token !== ALL_SEGMENTS);
  const occupiedSet = new Set(occupiedAll ? universe : concreteOccupied);

  if (occupiedAll) return null;
  if (universe.length > 0 && universe.every((token) => occupiedSet.has(token))) return null;
  if (universe.length === 0 && occupiedSet.size > 0) return null;

  const uprootedFree = (input.uprootedInWindow?.tokens || []).filter(
    (token) => token && token !== ALL_SEGMENTS && !occupiedSet.has(token),
  );
  const freeFromUniverse = universe.filter((token) => !occupiedSet.has(token));
  const freeTokens = [...new Set([...freeFromUniverse, ...uprootedFree])];

  const lastCrop = input.uprootedInWindow
    ? [input.uprootedInWindow.cropName, input.uprootedInWindow.varietyName].filter(Boolean).join(' · ') || null
    : null;

  if (occupiedSet.size === 0) {
    const kind: AvailabilityKind = input.uprootedInWindow ? 'uprooted' : 'never_planted';
    return {
      availability: 'Vacant',
      kind,
      occupiedTokens: [],
      freeTokens: [],
      plantedInWindow: Boolean(input.plantedInWindow),
      lastCrop,
      uprootedAt: input.uprootedInWindow?.at ?? null,
      uprootReason: input.uprootedInWindow?.reason ?? null,
    };
  }

  return {
    availability: 'Partial',
    kind: 'partial',
    occupiedTokens: [...occupiedSet],
    freeTokens,
    plantedInWindow: Boolean(input.plantedInWindow),
    lastCrop,
    uprootedAt: input.uprootedInWindow?.at ?? null,
    uprootReason: input.uprootedInWindow?.reason ?? null,
  };
}

export function occupancyTokensFromSegment(segment: string | null | undefined): string[] {
  return parseSegmentTokens(segment);
}
