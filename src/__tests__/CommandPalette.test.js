import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

// Mock dependencies
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1', name: 'Test', role: 'ceo' },
  }),
}));

import CommandPalette from '../components/CommandPalette';

function renderWithRouter(ui) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('CommandPalette', () => {
  it('opens on Ctrl+K', async () => {
    renderWithRouter(<CommandPalette />);
    
    // Initially not visible
    expect(screen.queryByPlaceholderText(/search/i)).not.toBeInTheDocument();
    
    // Trigger Ctrl+K
    await userEvent.keyboard('{Control>}k{/Control}');
    
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
    });
  });

  it('closes on Escape', async () => {
    renderWithRouter(<CommandPalette />);
    
    // Open
    await userEvent.keyboard('{Control>}k{/Control}');
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
    });

    // Close
    await userEvent.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByPlaceholderText(/search/i)).not.toBeInTheDocument();
    });
  });

  it('shows navigation options', async () => {
    renderWithRouter(<CommandPalette />);
    
    await userEvent.keyboard('{Control>}k{/Control}');
    
    // Several commands contain "Dashboard", so match the label exactly.
    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
    });
  });

  it('filters results when typing', async () => {
    renderWithRouter(<CommandPalette />);
    
    await userEvent.keyboard('{Control>}k{/Control}');
    
    const input = await screen.findByPlaceholderText(/search/i);
    await userEvent.type(input, 'harvest');

    await waitFor(() => {
      expect(screen.getByText('Harvest Entry')).toBeInTheDocument();
    });
    // Unrelated commands are filtered out.
    expect(screen.queryByText('Valves Configuration')).not.toBeInTheDocument();
  });
});
