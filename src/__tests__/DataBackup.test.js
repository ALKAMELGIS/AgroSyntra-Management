import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// The page loads backup status and observability through the `api` wrapper on
// mount. That wrapper also goes through `fetch`, so leaving it unmocked lets
// those calls consume the fetch mocks meant for the download button.
jest.mock('../utils/api', () => ({
  __esModule: true,
  default: { get: jest.fn().mockResolvedValue({ data: {} }) },
}));

import DataBackup from '../pages/admin/DataBackup';

beforeAll(() => {
  global.fetch = jest.fn();
  global.URL.createObjectURL = jest.fn(() => 'blob:mock');
  global.URL.revokeObjectURL = jest.fn();
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('DataBackup', () => {
  it('renders the page title and download button', () => {
    render(<DataBackup />);
    expect(screen.getByText('Data Backup')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /download csv backup/i })).toBeInTheDocument();
  });

  it('shows included table chips', () => {
    render(<DataBackup />);
    expect(screen.getByText('Zones')).toBeInTheDocument();
    expect(screen.getByText('Harvests')).toBeInTheDocument();
    expect(screen.getByText('Workers')).toBeInTheDocument();
  });

  it('downloads backup on button click', async () => {
    const mockBlob = new Blob(['zip-data'], { type: 'application/zip' });
    global.fetch.mockResolvedValueOnce({
      ok: true,
      blob: () => Promise.resolve(mockBlob),
      headers: new Headers({ 'content-disposition': 'attachment; filename="backup.zip"' }),
    });

    render(<DataBackup />);
    fireEvent.click(screen.getByRole('button', { name: /download csv backup/i }));

    await waitFor(() => {
      expect(screen.getByText('Backup downloaded successfully')).toBeInTheDocument();
    });
  });

  it('shows error on failed backup', async () => {
    global.fetch.mockResolvedValueOnce({ ok: false, status: 500 });

    render(<DataBackup />);
    fireEvent.click(screen.getByRole('button', { name: /download csv backup/i }));

    await waitFor(() => {
      expect(screen.getByText(/Backup failed/i)).toBeInTheDocument();
    });
  });
});
