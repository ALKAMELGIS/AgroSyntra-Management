import { render, screen, act, waitFor } from '@testing-library/react';
import OfflineBanner from '../components/OfflineBanner';

describe('OfflineBanner', () => {
  const originalOnline = navigator.onLine;

  afterEach(() => {
    Object.defineProperty(navigator, 'onLine', { value: originalOnline, writable: true });
  });

  it('shows warning when offline', () => {
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true });
    render(<OfflineBanner />);
    expect(screen.getByText(/you are offline/i)).toBeInTheDocument();
  });

  it('hides when online', () => {
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true });
    render(<OfflineBanner />);
    expect(screen.queryByText(/you are offline/i)).not.toBeInTheDocument();
  });

  it('responds to online/offline events', async () => {
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true });
    render(<OfflineBanner />);
    expect(screen.queryByText(/you are offline/i)).not.toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByText(/you are offline/i)).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    // The Snackbar keeps the banner mounted until its exit transition finishes.
    await waitFor(() => {
      expect(screen.queryByText(/you are offline/i)).not.toBeInTheDocument();
    });
  });
});
