import {
  addOperatorMixture,
  addOperatorRow,
  alignOperatorRows,
  operatorRowProblems,
  operatorRowsPayload,
  removeOperatorRow,
  updateOperatorRow,
} from '../workOrderOperatorRows';

const issued = (id, extra = {}) => ({
  key: id, id, orig: { id }, addedByOperator: false,
  fieldId: 'field-1', segment: 'V1', productId: 'prod-1', rate: '1ml', dateOfApplication: '2026-10-14',
  groupId: null, isMixtureChild: false, ...extra,
});

describe('work order operator rows', () => {
  it('adds an application row marked as added, dated like the first row', () => {
    const rows = addOperatorRow([issued('a')], { key: 'k1', fallbackDate: '2026-10-01' });
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ key: 'k1', addedByOperator: true, fieldId: '', productId: '', dateOfApplication: '2026-10-14' });
    expect(rows[1].id).toBeUndefined();
    expect(addOperatorRow([], { key: 'k2', fallbackDate: '2026-10-01' })[0].dateOfApplication).toBe('2026-10-01');
  });

  it('adds a mixture under a row, copying field, segment and date, and groups the row', () => {
    const rows = addOperatorMixture([issued('a'), issued('b')], 0, { key: 'm1', newGroupId: 'g1' });
    expect(rows.map((r) => r.key)).toEqual(['a', 'm1', 'b']);
    expect(rows[0].groupId).toBe('g1');
    expect(rows[1]).toMatchObject({
      isMixtureChild: true, groupId: 'g1', fieldId: 'field-1', segment: 'V1', dateOfApplication: '2026-10-14', addedByOperator: true,
    });
  });

  it('puts a second mixture after the first and reuses the group', () => {
    let rows = addOperatorMixture([issued('a', { groupId: 'g0' }), issued('b')], 0, { key: 'm1', newGroupId: 'unused' });
    rows = addOperatorMixture(rows, 0, { key: 'm2', newGroupId: 'unused' });
    expect(rows.map((r) => r.key)).toEqual(['a', 'm1', 'm2', 'b']);
    expect(rows.filter((r) => r.groupId === 'g0')).toHaveLength(3);
  });

  it('adds another mixture from a mixture row, into the same application', () => {
    const rows = [issued('a', { groupId: 'g' }), issued('m', { groupId: 'g', isMixtureChild: true }), issued('b')];
    const next = addOperatorMixture(rows, 1, { key: 'x', newGroupId: 'unused' });
    expect(next.map((r) => r.key)).toEqual(['a', 'm', 'x', 'b']);
    expect(next[2]).toMatchObject({ groupId: 'g', isMixtureChild: true });
  });

  it('stops at 3 products per application', () => {
    let rows = addOperatorMixture([issued('a')], 0, { key: 'm1', newGroupId: 'g' });
    rows = addOperatorMixture(rows, 0, { key: 'm2', newGroupId: 'g' });
    expect(rows).toHaveLength(3);
    expect(addOperatorMixture(rows, 0, { key: 'm3', newGroupId: 'g' })).toBe(rows);
    expect(addOperatorMixture(rows, 2, { key: 'm3', newGroupId: 'g' })).toBe(rows);
  });

  it('removes only added rows, with the mixtures added under them', () => {
    let rows = addOperatorRow([issued('a')], { key: 'n1' });
    rows = addOperatorMixture(rows, 1, { key: 'n1-mix', newGroupId: 'g' });
    expect(removeOperatorRow(rows, 0)).toBe(rows); // issued row stays
    expect(removeOperatorRow(rows, 1).map((r) => r.key)).toEqual(['a']);
  });

  it('removing an added mixture keeps the issued row it was mixed with', () => {
    const rows = addOperatorMixture([issued('a')], 0, { key: 'm1', newGroupId: 'g' });
    expect(removeOperatorRow(rows, 1).map((r) => r.key)).toEqual(['a']);
  });

  it('added mixtures follow their row\'s field, segment and date, but not the pesticide', () => {
    let rows = addOperatorRow([issued('a')], { key: 'n1' });
    rows = addOperatorMixture(rows, 1, { key: 'mix', newGroupId: 'g' });
    rows = updateOperatorRow(rows, 1, 'fieldId', 'field-2');
    rows = updateOperatorRow(rows, 1, 'productId', 'prod-9');
    expect(rows[2]).toMatchObject({ fieldId: 'field-2', productId: '' });
  });

  it('names the rows that still need a field or pesticide, as the operator sees them', () => {
    let rows = [issued('a'), issued('b', { productId: '' })];
    rows = addOperatorMixture(rows, 0, { key: 'mix', newGroupId: 'g' }); // a, mix (no pesticide), b
    rows = addOperatorRow(rows, { key: 'new' }); // added row: no field, no pesticide
    expect(operatorRowProblems(rows).map((p) => p.message)).toEqual([
      'Mixture under row 1: choose a pesticide',
      'Row 2: choose a pesticide',
      'Row 3: choose a field',
      'Row 3: choose a pesticide',
    ]);
  });

  it('is happy when every row has a pesticide and added rows have a field', () => {
    let rows = addOperatorRow([issued('a', { fieldId: '' })], { key: 'new' });
    rows = updateOperatorRow(rows, 1, 'fieldId', 'field-2');
    rows = updateOperatorRow(rows, 1, 'productId', 'prod-2');
    // An issued row's field is locked, so it is not checked.
    expect(operatorRowProblems(rows)).toEqual([]);
  });

  it('a new mixture takes the main row\'s times, machinery and completed by', () => {
    const main = issued('a', { startTime: '07:00', endTime: '08:30', machineryRef: 'T-1', completedByName: 'Ravi' });
    const rows = addOperatorMixture([main], 0, { key: 'm1', newGroupId: 'g' });
    expect(rows[1]).toMatchObject({ startTime: '07:00', endTime: '08:30', machineryRef: 'T-1', completedByName: 'Ravi' });
  });

  it('every mixture (issued or added) follows those values, and cannot change them itself', () => {
    let rows = [
      issued('a', { groupId: 'g', startTime: '07:00' }),
      issued('m-issued', { groupId: 'g', isMixtureChild: true, startTime: '07:00' }),
    ];
    rows = addOperatorMixture(rows, 0, { key: 'm-added', newGroupId: 'unused' });
    rows = updateOperatorRow(rows, 0, 'startTime', '06:15');
    rows = updateOperatorRow(rows, 0, 'completedByName', 'Sami');
    expect(rows.map((r) => r.startTime)).toEqual(['06:15', '06:15', '06:15']);
    expect(rows.map((r) => r.completedByName)).toEqual(['Sami', 'Sami', 'Sami']);
    expect(updateOperatorRow(rows, 1, 'machineryRef', 'T-9')).toBe(rows);
    // Other values stay per row.
    expect(updateOperatorRow(rows, 1, 'totalProductQty', '50')[1].totalProductQty).toBe('50');
  });

  it('aligns saved mixtures that differ from their main row when the order is opened', () => {
    const rows = alignOperatorRows([
      issued('a', { groupId: 'g', machineryRef: 'T-1' }),
      issued('m', { groupId: 'g', isMixtureChild: true, machineryRef: 'old' }),
    ]);
    expect(rows[1].machineryRef).toBe('T-1');
  });

  it('builds the payload: existing rows keep their id, new rows have none', () => {
    const rows = addOperatorRow([issued('a')], { key: 'n1' });
    const payload = operatorRowsPayload(rows);
    expect(payload[0].id).toBe('a');
    expect(payload[1].id).toBeUndefined();
    expect(payload[0]).not.toHaveProperty('orig');
    expect(payload[1]).not.toHaveProperty('key');
  });
});
