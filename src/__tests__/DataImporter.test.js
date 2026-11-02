import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

jest.mock('../contexts/NotificationContext', () => ({
  useNotification: () => ({
    success: jest.fn(),
    error: jest.fn(),
    warning: jest.fn(),
  }),
}));

// DataImporter reads the signed-in user (weather import is limited to the
// data-entry worker and the operation manager).
let mockUser = { role: 'worker' };
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: mockUser }),
}));

import DataImporter from '../components/DataImporter';

describe('DataImporter', () => {
  const mockOnComplete = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = { role: 'worker' };
  });

  // DataImporter is a Dialog, so it renders nothing unless `open` is set.
  function renderImporter() {
    return render(
      <DataImporter
        open
        onClose={jest.fn()}
        entity="harvest"
        onComplete={mockOnComplete}
      />
    );
  }

  it('renders upload area', () => {
    renderImporter();
    expect(screen.getByText(/click to upload csv or excel file/i)).toBeInTheDocument();
  });

  it('accepts CSV files', () => {
    renderImporter();
    const input = document.querySelector('input[type="file"]');
    expect(input).toBeInTheDocument();
    expect(input.accept).toContain('.csv');
  });

  it('shows the supported file formats', () => {
    renderImporter();
    expect(screen.getByText(/supported formats: \.csv, \.xlsx, \.xls/i)).toBeInTheDocument();
  });

  it('hides the weather upload from roles that cannot write weather logs', () => {
    mockUser = { role: 'agronomist' };
    render(<DataImporter open onClose={jest.fn()} entity="weather" onComplete={mockOnComplete} />);
    expect(screen.queryByText(/click to upload csv or excel file/i)).not.toBeInTheDocument();
  });
});
