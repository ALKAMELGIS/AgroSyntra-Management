import { render, screen } from '@testing-library/react';
import ErrorBoundary from '../components/ErrorBoundary';

// A component that throws an error
function BrokenComponent() {
  throw new Error('Test error');
}

// A normal component
function GoodComponent() {
  return <div>Working fine</div>;
}

describe('ErrorBoundary', () => {
  // Suppress React error boundary console errors during tests
  const originalError = console.error;
  beforeAll(() => {
    console.error = jest.fn();
  });
  afterAll(() => {
    console.error = originalError;
  });

  it('renders children when no error', () => {
    render(
      <ErrorBoundary>
        <GoodComponent />
      </ErrorBoundary>
    );
    expect(screen.getByText('Working fine')).toBeInTheDocument();
  });

  it('renders fallback UI when child throws', () => {
    render(
      <ErrorBoundary>
        <BrokenComponent />
      </ErrorBoundary>
    );
    // Should show error message
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
  });

  it('shows retry button in error state', () => {
    render(
      <ErrorBoundary>
        <BrokenComponent />
      </ErrorBoundary>
    );
    // The fallback renders both "Try Again" and "Reload Page", so query the
    // retry button specifically rather than matching either one.
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reload page/i })).toBeInTheDocument();
  });
});
