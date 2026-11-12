import { assignKeys, templateProblem } from './TemplateEditor';

jest.mock('../utils/api', () => ({ apiRequest: jest.fn() }));

test('Arabic labels and duplicates still get unique keys', () => {
  const keys = assignKeys([
    { _id: 'a', key: '', label: 'الكمية' },
    { _id: 'b', key: '', label: 'الكمية' },
    { _id: 'c', key: '', label: 'Total kg' },
    { _id: 'd', key: '', label: 'Total kg' },
    { _id: 'e', key: 'weekNumber', label: 'Week' },
  ], 'col');
  expect([...keys.values()]).toEqual(['col_1', 'col_2', 'total_kg', 'total_kg_2', 'weekNumber']);
});

test('save is blocked with a clear reason', () => {
  const base = { name: 'Daily log', category: 'operations' };
  expect(templateProblem({ ...base, name: ' ', columns: [{ label: 'a' }] })).toMatch(/name/);
  expect(templateProblem({ ...base, columns: [] })).toMatch(/at least one/);
  expect(templateProblem({ ...base, columns: [{ label: 'x' }, { label: '' }] })).toBe('Column 2 needs a label');
  expect(templateProblem({ ...base, columns: [{ label: 'Status', type: 'dropdown', options: ' , ' }] })).toMatch(/options/);
  expect(templateProblem({ ...base, columns: [{ label: 'Sum', type: 'calculated', formula: '' }] })).toMatch(/formula/);
  expect(templateProblem({ ...base, columns: [{ label: 'Status', type: 'dropdown', options: 'Open, Closed' }] })).toBeNull();
});

test('a key already saved is kept even when it is not ASCII', () => {
  const keys = assignKeys([
    { _id: 'a', key: '_', savedKey: true, label: 'الكمية' },
    { _id: 'b', key: '', label: 'الكمية' },
  ], 'col');
  expect([...keys.values()]).toEqual(['_', 'col_2']);
});
