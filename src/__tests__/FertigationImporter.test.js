import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

jest.mock('xlsx', () => {
  const HEADER = ['Week No', 'Date', 'Field ID', 'Number of Valves', 'Flow Rate (m3/hr)', 'Water Qty (M3/Valve)', 'Frequency', 'Daily Total (m3)'];
  const sheets = {
    'Input file': { id: 'input' },
    'NH-21': { id: 'nh21' },
    'NH-22': { id: 'nh22' },
  };
  const rows = {
    input: [HEADER, [12, '2026-03-01', 'NH-21', 4, 10, 3, 1, 12], [12, '2026-03-01', 'NH-22', 4, 10, 3, 1, 12]],
    nh21: [HEADER, [12, '2026-03-01', 'NH-21', 4, 10, 3, 1, 12], ['', '', 'NH-21', 4, 10, 3, 1, 12]],
    nh22: [HEADER, ['', '', 'NH-22', 4, 10, 3, 1, 12]],
  };
  return {
    read: () => ({
      SheetNames: ['Input file', 'NH-21', 'NH-22'],
      Sheets: sheets,
    }),
    utils: {
      sheet_to_json: (sheet) => rows[sheet.id] || [],
    },
  };
});

jest.mock('../utils/api', () => ({
  __esModule: true,
  apiRequest: jest.fn(() => Promise.resolve([])),
  apiRequestWithMeta: jest.fn(() => Promise.resolve({ data: [], meta: { totalPages: 1 } })),
}));

import FertigationImporter from '../components/FertigationImporter';

async function uploadFile() {
  const input = document.querySelector('input[type="file"]');
  const file = new File(['dummy'], 'fertigation.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  await userEvent.upload(input, file);
}

describe('FertigationImporter sheet picker', () => {
  const fields = [
    { id: 'f21', name: 'NH-21' },
    { id: 'f22', name: 'NH-22' },
  ];

  function renderImporter() {
    return render(
      <FertigationImporter open onClose={jest.fn()} fields={fields} />
    );
  }

  it('lists Input file unchecked and field tabs checked', async () => {
    renderImporter();
    await uploadFile();

    await waitFor(() => {
      expect(screen.getByLabelText('Select sheet Input file')).toBeInTheDocument();
    });

    expect(screen.getByLabelText('Select sheet Input file')).not.toBeChecked();
    expect(screen.getByLabelText('Select sheet NH-21')).toBeChecked();
    expect(screen.getByLabelText('Select sheet NH-22')).toBeChecked();
  });

  it('imports only the ticked field tab', async () => {
    renderImporter();
    await uploadFile();

    await waitFor(() => screen.getByLabelText('Select sheet NH-21'));
    await userEvent.click(screen.getByLabelText('Select sheet NH-22'));
    await userEvent.click(screen.getByRole('button', { name: /Continue — 2 rows/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Validate 2 rows/i })).toBeInTheDocument();
    });
    expect(screen.getByText(/from NH-21/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Validate 2 rows/i }));

    await waitFor(() => {
      expect(screen.getByText(/2 rows parsed/i)).toBeInTheDocument();
    });
    const table = screen.getAllByRole('table').at(-1);
    expect(within(table).getAllByText('NH-21').length).toBeGreaterThan(0);
    expect(within(table).queryByText('NH-22')).not.toBeInTheDocument();
  });
});
