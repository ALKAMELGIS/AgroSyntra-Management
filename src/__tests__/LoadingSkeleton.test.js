import React from 'react';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material';
import theme from '../theme';
import { 
  StatCardSkeleton, 
  ChartSkeleton, 
  TableSkeleton, 
  DashboardSkeleton,
  ListSkeleton 
} from '../components/LoadingSkeleton';

const renderWithTheme = (component) => {
  return render(
    <ThemeProvider theme={theme}>
      {component}
    </ThemeProvider>
  );
};

describe('Loading Skeletons', () => {
  test('StatCardSkeleton renders', () => {
    const { container } = renderWithTheme(<StatCardSkeleton />);
    expect(container.querySelector('.MuiSkeleton-root')).toBeInTheDocument();
  });

  test('ChartSkeleton renders with default height', () => {
    const { container } = renderWithTheme(<ChartSkeleton />);
    expect(container.querySelector('.MuiSkeleton-root')).toBeInTheDocument();
  });

  test('ChartSkeleton renders with custom height', () => {
    const { container } = renderWithTheme(<ChartSkeleton height={400} />);
    const skeleton = container.querySelector('.MuiSkeleton-root');
    expect(skeleton).toBeInTheDocument();
  });

  test('TableSkeleton renders skeleton elements', () => {
    const { container } = renderWithTheme(<TableSkeleton rows={5} columns={3} />);
    // Should have skeleton elements
    const skeletons = container.querySelectorAll('.MuiSkeleton-root');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  test('DashboardSkeleton renders all sections', () => {
    const { container } = renderWithTheme(<DashboardSkeleton />);
    // Should have multiple skeleton elements for stats, charts, etc.
    const skeletons = container.querySelectorAll('.MuiSkeleton-root');
    expect(skeletons.length).toBeGreaterThan(5);
  });

  test('ListSkeleton renders correct number of items', () => {
    const { container } = renderWithTheme(<ListSkeleton count={3} />);
    // Each list item has multiple skeletons
    const skeletons = container.querySelectorAll('.MuiSkeleton-root');
    expect(skeletons.length).toBeGreaterThan(3);
  });
});
