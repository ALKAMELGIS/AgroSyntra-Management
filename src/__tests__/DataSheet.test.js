import { render, screen, fireEvent, within } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { createAppTheme } from '../theme';
import DataSheet from '../components/table/DataSheet';
import installInvalidDateGuard from '../utils/invalidDateGuard';

const rows = [
  { id: 1, crop: 'Tomato', qty: 5, cost: 100 },
  { id: 2, crop: 'Cucumber', qty: 2, cost: 50 },
  { id: 3, crop: 'Pepper', qty: 8, cost: 25 },
];
const columns = [
  { key: 'crop', label: 'Crop', frozen: true, width: 120 },
  { key: 'qty', label: 'Qty', numeric: true, total: 'sum', group: 'Amounts' },
  { key: 'cost', label: 'Cost', numeric: true, total: 'sum', group: 'Amounts' },
];

const setup = (props = {}) => render(
  <ThemeProvider theme={createAppTheme('light', 'ltr')}>
    <DataSheet columns={columns} rows={rows} storageKey="test-sheet" {...props} />
  </ThemeProvider>,
);

const bodyCrops = () => [...document.querySelectorAll('tbody td[data-c="0"]')].map((td) => td.textContent);

beforeEach(() => window.localStorage.clear());

test('numbers rows, groups columns and totals numeric columns', () => {
  setup();
  expect(screen.getByText('Amounts')).toBeInTheDocument();
  expect(bodyCrops()).toEqual(['Tomato', 'Cucumber', 'Pepper']);
  const footer = document.querySelector('tfoot');
  expect(within(footer).getByText('15')).toBeInTheDocument();
  expect(within(footer).getByText('175')).toBeInTheDocument();
  expect(screen.getByText('3 records')).toBeInTheDocument();
});

test('header click sorts ascending, then descending, then back to the original order', () => {
  setup();
  const qty = screen.getByRole('button', { name: 'Qty' });
  fireEvent.click(qty);
  expect(bodyCrops()).toEqual(['Cucumber', 'Tomato', 'Pepper']);
  fireEvent.click(qty);
  expect(bodyCrops()).toEqual(['Pepper', 'Tomato', 'Cucumber']);
  fireEvent.click(qty);
  expect(bodyCrops()).toEqual(['Tomato', 'Cucumber', 'Pepper']);
});

test('AutoFilter on a column hides unticked values and can be cleared', () => {
  setup();
  fireEvent.click(screen.getByRole('button', { name: 'Filter Crop' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Cucumber' }));
  expect(bodyCrops()).toEqual(['Tomato', 'Pepper']);
  fireEvent.keyDown(document.activeElement, { key: 'Escape' });
  fireEvent.click(screen.getByRole('button', { name: /Clear column filters/ }));
  expect(bodyCrops()).toEqual(['Tomato', 'Cucumber', 'Pepper']);
});

test('selecting a range shows count, sum and average like the Excel status bar', () => {
  setup();
  fireEvent.mouseDown(document.querySelector('td[data-r="0"][data-c="1"]'), { button: 0 });
  fireEvent.mouseDown(document.querySelector('td[data-r="2"][data-c="1"]'), { button: 0, shiftKey: true });
  expect(screen.getByText('Sum').parentElement).toHaveTextContent('Sum: 15');
  expect(screen.getByText('Average').parentElement).toHaveTextContent('Average: 5');
});

test('hidden columns are remembered per sheet', () => {
  const first = setup();
  fireEvent.click(screen.getByRole('button', { name: /Columns/ }));
  fireEvent.click(screen.getByRole('menuitem', { name: /Cost/ }));
  expect(JSON.parse(window.localStorage.getItem('agrocloud_sheet_cols:test-sheet'))).toEqual(['cost']);
  first.unmount();
  setup();
  expect(screen.queryByRole('button', { name: 'Cost' })).not.toBeInTheDocument();
});

test('invalid dates render as an empty string, valid dates are unchanged', () => {
  installInvalidDateGuard();
  expect(new Date(undefined).toLocaleDateString()).toBe('');
  expect(new Date('nope').toLocaleString()).toBe('');
  expect(new Date('2026-10-20T00:00:00Z').toLocaleDateString('en-GB', { timeZone: 'UTC' })).toBe('20/10/2026');
});
