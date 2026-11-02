import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FertigationImporter from '../components/FertigationImporter';

jest.mock('xlsx', () => {
  const HEADER = ['Week No', 'Date', 'Field ID', 'Number of Valves', 'Flow Rate (m3/hr)', 'Water Qty (M3/Valve)', 'Frequency', 'Daily Total (m3)', 'Recipe'];
  const rows = [
    HEADER,
    [12, '2026-03-01', 'NH-21', 4, 10, 3, 1, 12, 'Approved Mix'],
    [12, '2026-03-01', 'NH-22', 4, 10, 3, 1, 12, 'Draft Mix'],
    [12, '2026-03-02', 'NH-22', 4, 10, 3, 1, 12, 'Unknown Mix'],
  ];
  return {
    read: () => ({ SheetNames: ['NH'], Sheets: { NH: {} } }),
    utils: { sheet_to_json: () => rows },
  };
});

const mockBulk = jest.fn(() => Promise.resolve({ inserted: 1, updated: 0, skipped: 0, errors: [] }));

jest.mock('../utils/backendApi', () => ({
  __esModule: true,
  bulkCreateFertigation: (...args) => mockBulk(...args),
  listRecipesAll: () => Promise.resolve([
    { id: 'r-ok', name: 'Approved Mix', status: 'approved', fertilizers: [] },
    { id: 'r-draft', name: 'Draft Mix', status: 'draft', fertilizers: [] },
  ]),
}));

describe('FertigationImporter recipe approval', () => {
  const fields = [
    { id: 'f21', name: 'NH-21' },
    { id: 'f22', name: 'NH-22' },
  ];

  it('blocks rows whose recipe is a draft or unknown and imports only approved ones', async () => {
    const { container } = render(<FertigationImporter open onClose={jest.fn()} fields={fields} />);
    // The upload input is hidden behind a drop zone, so reach it directly.
    // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
    const input = (container.ownerDocument || document).querySelector('input[type="file"]');
    await userEvent.upload(input, new File(['x'], 'f.xlsx'));

    const validate = await screen.findByRole('button', { name: /Validate 3 rows/i });
    await userEvent.click(validate);

    expect(await screen.findByText(/3 rows parsed/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Recipe 'Draft Mix' isn't approved yet — ask the operations manager to add\/approve it/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Recipe 'Unknown Mix' isn't approved yet/).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /^Approve/i })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Import 1 rows/i }));
    await waitFor(() => expect(mockBulk).toHaveBeenCalledTimes(1));
    const payload = mockBulk.mock.calls[0][0];
    expect(payload).toHaveLength(1);
    expect(payload[0]).toMatchObject({ fieldId: 'f21', recipeId: 'r-ok' });
  });
});
