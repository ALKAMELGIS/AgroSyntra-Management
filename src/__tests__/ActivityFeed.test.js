import { render, screen, waitFor } from '@testing-library/react';
import ActivityFeed from '../components/ActivityFeed';

// Mock API request
jest.mock('../utils/api', () => ({
  apiRequest: jest.fn(),
}));

const { apiRequest } = require('../utils/api');

describe('ActivityFeed', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows skeleton while loading', () => {
    apiRequest.mockReturnValue(new Promise(() => {})); // Never resolves
    render(<ActivityFeed />);
    // Skeletons should render
    const skeletons = document.querySelectorAll('.MuiSkeleton-root');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders activity items after loading', async () => {
    apiRequest.mockResolvedValue([
      {
        id: '1',
        user_name: 'Ahmed',
        action: 'CREATE',
        entity_type: 'harvest',
        created_at: new Date().toISOString(),
      },
      {
        id: '2',
        user_name: 'Sara',
        action: 'UPDATE',
        entity_type: 'fertigation',
        created_at: new Date().toISOString(),
      },
    ]);

    render(<ActivityFeed />);

    await waitFor(() => {
      expect(screen.getByText(/Ahmed/)).toBeInTheDocument();
      expect(screen.getByText(/Sara/)).toBeInTheDocument();
    });
  });

  it('shows empty state when no activities', async () => {
    apiRequest.mockResolvedValue([]);
    render(<ActivityFeed />);

    await waitFor(() => {
      expect(screen.getByText(/no recent activity/i)).toBeInTheDocument();
    });
  });

  it('respects limit prop', async () => {
    apiRequest.mockResolvedValue([]);
    render(<ActivityFeed limit={5} />);

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalledWith('/activity?limit=5');
    });
  });

  it('handles API errors gracefully', async () => {
    apiRequest.mockRejectedValue(new Error('Network error'));
    render(<ActivityFeed />);

    await waitFor(() => {
      // Should not crash, should show empty or no activity message
      expect(screen.getByText(/no recent activity/i)).toBeInTheDocument();
    });
  });
});
