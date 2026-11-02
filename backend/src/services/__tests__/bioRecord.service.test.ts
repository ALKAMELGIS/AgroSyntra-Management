jest.mock('../../db/client', () => ({
  dbPool: { query: jest.fn(), connect: jest.fn() },
}));

import {
  applyApprove,
  applyManagerWrite,
  applyProposal,
  applyReject,
  EMPTY_BIO_CELL,
  normalizeBioValue,
  toBioCellState,
  uniqueCells,
} from '../bioRecord.service';

const NOW = new Date('2026-09-29T08:00:00Z');
const approved = (perM2: number | null, units: number | null) => ({ ...EMPTY_BIO_CELL, per_m2: perM2, units });

describe('normalizeBioValue', () => {
  it('treats blank, zero and garbage as no value', () => {
    expect(normalizeBioValue(null)).toBeNull();
    expect(normalizeBioValue(undefined)).toBeNull();
    expect(normalizeBioValue('')).toBeNull();
    expect(normalizeBioValue(0)).toBeNull();
    expect(normalizeBioValue('abc')).toBeNull();
    expect(normalizeBioValue('2.5')).toBe(2.5);
  });

  it('reads NUMERIC strings from pg rows', () => {
    expect(toBioCellState({ per_m2: '4' as any, units: '10.5' as any }).units).toBe(10.5);
  });
});

describe('manager write', () => {
  it('writes approved values and clears pending and rejection', () => {
    const next = applyManagerWrite(
      { ...approved(1, 2), pending_per_m2: 5, pending_units: 6, pending_by: 's1', pending_at: NOW, rejected_reason: 'x' },
      { perM2: 3, units: 4 },
    );
    expect(next).toMatchObject({
      per_m2: 3, units: 4, pending_per_m2: null, pending_units: null, pending_at: null,
      pending_by: null, rejected_reason: null,
    });
  });

  it('removes the row when the manager clears a cell', () => {
    expect(applyManagerWrite(approved(1, 2), { perM2: null, units: 0 })).toBeNull();
    expect(applyManagerWrite(
      { ...approved(1, 2), pending_units: 9, pending_at: NOW, pending_by: 's1' },
      { perM2: null, units: null },
    )).toBeNull();
  });
});

describe('proposal (scouter / worker import)', () => {
  it('never touches the approved values', () => {
    const next = applyProposal(approved(1, 2), { perM2: 5, units: 6 }, 's1', NOW)!;
    expect(next).toMatchObject({
      per_m2: 1, units: 2, pending_per_m2: 5, pending_units: 6, pending_clear: false,
      pending_by: 's1', pending_at: NOW,
    });
  });

  it('creates a pending-only cell where nothing was approved', () => {
    const next = applyProposal(null, { perM2: null, units: 3 }, 's1', NOW)!;
    expect(next).toMatchObject({ per_m2: null, units: null, pending_units: 3, pending_at: NOW });
  });

  it('asks to clear an approved value with pending_clear', () => {
    const next = applyProposal(approved(1, 2), { perM2: null, units: null }, 's1', NOW)!;
    expect(next).toMatchObject({ per_m2: 1, units: 2, pending_clear: true, pending_at: NOW });
  });

  it('withdraws a pending-only proposal when cleared', () => {
    expect(applyProposal(
      { ...EMPTY_BIO_CELL, pending_units: 3, pending_at: NOW, pending_by: 's1' },
      { perM2: null, units: null }, 's1', NOW,
    )).toBeNull();
  });

  it('withdraws the proposal when it matches the approved value', () => {
    const next = applyProposal(
      { ...approved(1, 2), pending_units: 9, pending_at: NOW, pending_by: 's1' },
      { perM2: 1, units: 2 }, 's1', NOW,
    )!;
    expect(next).toMatchObject({ per_m2: 1, units: 2, pending_at: null, pending_units: null });
  });

  it('clears an earlier rejection note when re-entering', () => {
    const next = applyProposal(
      { ...approved(1, 2), rejected_reason: 'wrong', rejected_by: 'pa', rejected_at: NOW },
      { perM2: 1, units: 3 }, 's1', NOW,
    )!;
    expect(next.rejected_reason).toBeNull();
    expect(next.pending_units).toBe(3);
  });
});

describe('approve', () => {
  it('moves pending into approved', () => {
    const next = applyApprove({ ...approved(1, 2), pending_per_m2: 5, pending_units: 6, pending_at: NOW, pending_by: 's1' })!;
    expect(next).toMatchObject({ per_m2: 5, units: 6, pending_at: null, pending_by: null, pending_units: null });
  });

  it('pending_clear removes the approved value (row goes)', () => {
    expect(applyApprove({ ...approved(1, 2), pending_clear: true, pending_at: NOW, pending_by: 's1' })).toBeNull();
  });

  it('leaves a cell without pending as it was', () => {
    expect(applyApprove(approved(1, 2))).toMatchObject({ per_m2: 1, units: 2 });
  });
});

describe('reject', () => {
  it('drops pending, keeps approved, records reason and keeps who proposed it', () => {
    const next = applyReject(
      { ...approved(1, 2), pending_units: 9, pending_at: NOW, pending_by: 's1' },
      'Wrong week', 'pa-1', NOW,
    );
    expect(next).toMatchObject({
      per_m2: 1, units: 2, pending_units: null, pending_at: null, pending_clear: false,
      pending_by: 's1', rejected_reason: 'Wrong week', rejected_by: 'pa-1', rejected_at: NOW,
    });
  });

  it('keeps a pending-only cell as an empty row carrying the rejection note', () => {
    const next = applyReject(
      { ...EMPTY_BIO_CELL, pending_units: 9, pending_at: NOW, pending_by: 's1' },
      'No', 'pa-1', NOW,
    );
    expect(next).toMatchObject({ per_m2: null, units: null, rejected_reason: 'No' });
  });
});

describe('uniqueCells', () => {
  it('keeps the last value per cell', () => {
    const cells = uniqueCells([
      { productColumnId: 'a', weekNumber: 1, units: 1 },
      { productColumnId: 'a', weekNumber: 1, units: 2 },
      { productColumnId: 'a', weekNumber: 2, units: 3 },
    ]);
    expect(cells).toHaveLength(2);
    expect(cells[0].units).toBe(2);
  });
});
