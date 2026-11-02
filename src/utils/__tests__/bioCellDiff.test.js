import {
  buildServerCellMap,
  cellKey,
  countedCellValue,
  diffBioCells,
  editableBase,
  normalizeCellValue,
  parseCellKey,
  pendingCellKeys,
} from '../bioCellDiff';

const P1 = '33333333-3333-4333-8333-333333333331';
const P2 = '33333333-3333-4333-8333-333333333332';

const server = buildServerCellMap([
  { product_column_id: P1, week_number: 1, per_m2: '2', units: '10' },
  {
    product_column_id: P1, week_number: 2, per_m2: '1', units: '5',
    pending_per_m2: '3', pending_units: '7', pending_at: '2026-09-01', pending_by_name: 'Sam',
  },
  { product_column_id: P2, week_number: 3, per_m2: null, units: null, pending_units: '4', pending_at: '2026-09-01' },
  { product_column_id: P2, week_number: 4, per_m2: '6', units: null, pending_clear: true, pending_at: '2026-09-01' },
]);

describe('bioCellDiff', () => {
  it('builds keys that survive uuid dashes', () => {
    expect(parseCellKey(cellKey(P1, 12))).toEqual({ productColumnId: P1, weekNumber: 12 });
  });

  it('normalizes blanks and zero to null', () => {
    expect(normalizeCellValue('')).toBeNull();
    expect(normalizeCellValue('0')).toBeNull();
    expect(normalizeCellValue('2.5')).toBe(2.5);
  });

  it('sends nothing when nothing changed', () => {
    expect(diffBioCells(server, {}, 'manager')).toEqual([]);
    expect(diffBioCells(server, { [cellKey(P1, 1)]: { units: '10' } }, 'manager')).toEqual([]);
  });

  it('sends only the changed cell, with both halves', () => {
    const diff = diffBioCells(server, {
      [cellKey(P1, 1)]: { units: '12' },
      [cellKey(P2, 9)]: { perM2: '', units: '' },
    }, 'manager');
    expect(diff).toEqual([{ productColumnId: P1, weekNumber: 1, perM2: 2, units: 12 }]);
  });

  it('manager clearing a cell sends nulls', () => {
    expect(diffBioCells(server, { [cellKey(P1, 1)]: { perM2: '', units: '0' } }, 'manager'))
      .toEqual([{ productColumnId: P1, weekNumber: 1, perM2: null, units: null }]);
  });

  it('proposer edits start from the pending value', () => {
    expect(editableBase(server[cellKey(P1, 2)], 'proposer')).toEqual({ perM2: 3, units: 7 });
    expect(editableBase(server[cellKey(P1, 2)], 'manager')).toEqual({ perM2: 1, units: 5 });
    expect(editableBase(server[cellKey(P2, 4)], 'proposer')).toEqual({ perM2: null, units: null });
    // Re-typing the pending value is not a change for the scouter.
    expect(diffBioCells(server, { [cellKey(P1, 2)]: { units: '7' } }, 'proposer')).toEqual([]);
    expect(diffBioCells(server, { [cellKey(P1, 2)]: { units: '8' } }, 'proposer'))
      .toEqual([{ productColumnId: P1, weekNumber: 2, perM2: 3, units: 8 }]);
  });

  it('counts approved values only, except the manager\'s own unsaved edits', () => {
    expect(countedCellValue(server[cellKey(P2, 3)], undefined, 'manager')).toEqual({ perM2: null, units: null });
    expect(countedCellValue(server[cellKey(P1, 2)], { units: '9' }, 'proposer')).toEqual({ perM2: 1, units: 5 });
    expect(countedCellValue(server[cellKey(P1, 2)], { units: '9' }, 'manager')).toEqual({ perM2: 1, units: 9 });
  });

  it('lists pending cells', () => {
    expect(pendingCellKeys(server).sort()).toEqual([cellKey(P1, 2), cellKey(P2, 3), cellKey(P2, 4)].sort());
  });
});
