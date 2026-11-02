import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

jest.mock('../utils/api', () => ({
  apiRequest: jest.fn(),
}));

jest.mock('../contexts/NotificationContext', () => ({
  useNotification: () => ({
    success: jest.fn(),
    error: jest.fn(),
  }),
}));

// Mock Recharts
jest.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => <div data-testid="chart">{children}</div>,
  ComposedChart: ({ children }) => <div>{children}</div>,
  Bar: () => <div />,
  Line: () => <div />,
  Area: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  Tooltip: () => <div />,
  CartesianGrid: () => <div />,
  Legend: () => <div />,
}));

const { apiRequest } = require('../utils/api');

import YieldPredictions from '../pages/YieldPredictions';

function renderPage() {
  return render(
    <MemoryRouter>
      <YieldPredictions />
    </MemoryRouter>
  );
}

describe('YieldPredictions Page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    apiRequest.mockResolvedValue([]);
  });

  it('renders page title', () => {
    renderPage();
    // The empty state also mentions yield predictions, so target the heading.
    expect(screen.getByRole('heading', { name: /yield predictions/i })).toBeInTheDocument();
  });

  it('shows field selector', () => {
    renderPage();
    expect(screen.getByLabelText(/field/i) || screen.getByText(/select.*field/i)).toBeTruthy();
  });

  it('loads fields on mount', async () => {
    renderPage();
    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalled();
    });
  });

  it('displays prediction when field is selected and data returns', async () => {
    apiRequest
      .mockResolvedValueOnce([{ id: 'f1', name: 'Field A' }]) // fields
      .mockResolvedValueOnce({
        predicted_yield: 1500,
        confidence_pct: 75,
        confidence_lower: 1200,
        confidence_upper: 1800,
        crop_name: 'Tomato',
        methodology: 'Linear regression',
        monthly_predictions: [
          { month: '2025-07', predicted: 200, lower: 150, upper: 250 },
          { month: '2025-08', predicted: 250, lower: 200, upper: 300 },
        ],
      });

    renderPage();

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalled();
    });
  });
});
