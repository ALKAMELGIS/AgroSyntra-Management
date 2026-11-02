import {
  MAX_PRODUCTS_PER_MIXTURE,
  SHEET_LOCKED_KEYS,
  WORK_ORDER_LOCKED_KEYS,
  alignMixtures,
  canAddMixture,
  duplicateMixtureGroup,
  mixtureMembers,
  groupSize,
  mixtureInsertIndex,
  orderMixtureGroups,
  rowLabels,
} from '../mixtureGroups';

const row = (id, extra = {}) => ({ id, groupId: null, isMixtureChild: false, ...extra });

describe('mixture groups', () => {
  it('allows up to 3 products per application', () => {
    expect(MAX_PRODUCTS_PER_MIXTURE).toBe(3);
    const two = [row('a', { groupId: 'g' }), row('b', { groupId: 'g', isMixtureChild: true })];
    expect(groupSize(two, 'g')).toBe(2);
    expect(canAddMixture(two, 0)).toBe(true);
    expect(canAddMixture(two, 1)).toBe(true);
    const three = [...two, row('c', { groupId: 'g', isMixtureChild: true })];
    expect(canAddMixture(three, 0)).toBe(false);
    expect(canAddMixture(three, 2)).toBe(false);
    expect(canAddMixture([row('solo')], 0)).toBe(true);
  });

  it('inserts a new mixture after the group\'s last mixture', () => {
    const rows = [
      row('a', { groupId: 'g' }), row('m1', { groupId: 'g', isMixtureChild: true }), row('b'),
    ];
    expect(mixtureInsertIndex(rows, 0)).toBe(2);
    expect(mixtureInsertIndex(rows, 1)).toBe(2);
    expect(mixtureInsertIndex(rows, 2)).toBe(3);
  });

  it('puts the main row first and mixtures in the order they were added, after a newest-first load', () => {
    const loaded = [
      row('m2', { groupId: 'g', isMixtureChild: true, _createdAt: '2026-10-16T08:00:03Z' }),
      row('m1', { groupId: 'g', isMixtureChild: true, _createdAt: '2026-10-16T08:00:02Z' }),
      row('other'),
      row('main', { groupId: 'g', _createdAt: '2026-10-16T08:00:01Z' }),
      row('solo2'),
    ];
    expect(orderMixtureGroups(loaded).map((r) => r.id)).toEqual(['main', 'm1', 'm2', 'other', 'solo2']);
  });

  it('numbers main rows 1, 2, 3 and labels mixtures without using a number', () => {
    const rows = [
      row('a', { groupId: 'g' }), row('m1', { groupId: 'g', isMixtureChild: true }),
      row('m2', { groupId: 'g', isMixtureChild: true }), row('b'), row('c'),
    ];
    expect(rowLabels(rows, (r) => r.isMixtureChild)).toEqual(['1', '+', '+', '2', '3']);
    expect(rowLabels(rows, (r) => r.isMixtureChild, 'Mix')).toEqual(['1', 'Mix', 'Mix', '2', '3']);
    expect(rowLabels([], () => false)).toEqual([]);
  });

  it('gives mixture rows the main row\'s locked values and reports which changed', () => {
    const rows = [
      row('a', { groupId: 'g', startTime: '07:00', machineryRef: 'T-1' }),
      row('m1', { groupId: 'g', isMixtureChild: true, startTime: '', machineryRef: '' }),
      row('m2', { groupId: 'g', isMixtureChild: true, startTime: '07:00', machineryRef: 'T-1' }),
      row('b', { startTime: '09:00' }),
    ];
    const { rows: out, changed } = alignMixtures(rows, ['startTime', 'machineryRef']);
    expect(changed).toEqual([1]);
    expect(out[1]).toMatchObject({ startTime: '07:00', machineryRef: 'T-1' });
    expect(out[2]).toBe(rows[2]);
    expect(out[3]).toBe(rows[3]);
    expect(WORK_ORDER_LOCKED_KEYS).toEqual(['startTime', 'endTime', 'machineryRef', 'completedByName']);
    expect(SHEET_LOCKED_KEYS).toEqual(['applicationStartTime', 'applicationEndTime', 'machineryUsed', 'operatorName']);
  });

  it('lists a main row\'s mixtures, and none for a mixture or a lone row', () => {
    const rows = [
      row('a', { groupId: 'g' }), row('m1', { groupId: 'g', isMixtureChild: true }),
      row('b'), row('m2', { groupId: 'g', isMixtureChild: true }),
    ];
    expect(mixtureMembers(rows, 0)).toEqual([1, 3]);
    expect(mixtureMembers(rows, 1)).toEqual([]);
    expect(mixtureMembers(rows, 2)).toEqual([]);
  });

  it('duplicates a main row with its mixtures as a new application after the original', () => {
    const rows = [
      row('a', { _id: 'a', _saved: true, groupId: 'g', productId: 'p1', _createdAt: 't1' }),
      row('m1', { _id: 'm1', _saved: true, groupId: 'g', isMixtureChild: true, productId: 'p2' }),
      row('m2', { _id: 'm2', _saved: true, groupId: 'g', isMixtureChild: true, productId: 'p3' }),
      row('b', { _id: 'b' }),
    ];
    let n = 0;
    const { rows: out, newIds } = duplicateMixtureGroup(rows, 0, { newGroupId: 'g2', makeId: () => `new${++n}` });
    expect(out.map((r) => r._id)).toEqual(['a', 'm1', 'm2', 'new1', 'new2', 'new3', 'b']);
    expect(newIds).toEqual(['new1', 'new2', 'new3']);
    const copies = out.slice(3, 6);
    expect(copies.map((r) => r.productId)).toEqual(['p1', 'p2', 'p3']);
    expect(copies.map((r) => r.isMixtureChild)).toEqual([false, true, true]);
    copies.forEach((c) => {
      expect(c).toMatchObject({ groupId: 'g2', _saved: false });
      expect(c.id).toBeUndefined();
      expect(c._createdAt).toBeUndefined();
    });
  });

  it('does not duplicate a group for a mixture row or a lone row', () => {
    const rows = [row('a', { groupId: 'g' }), row('m', { groupId: 'g', isMixtureChild: true }), row('b')];
    expect(duplicateMixtureGroup(rows, 1, { newGroupId: 'x', makeId: () => 'n' }).rows).toBe(rows);
    expect(duplicateMixtureGroup(rows, 2, { newGroupId: 'x', makeId: () => 'n' }).rows).toBe(rows);
  });

  it('leaves rows without groups as they are and keeps orphan mixtures', () => {
    const rows = [row('x'), row('orphan', { groupId: 'g', isMixtureChild: true }), row('y')];
    expect(orderMixtureGroups(rows).map((r) => r.id)).toEqual(['x', 'orphan', 'y']);
  });
});
