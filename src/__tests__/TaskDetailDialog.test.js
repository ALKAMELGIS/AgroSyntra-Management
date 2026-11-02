import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TaskDetailDialog from '../components/TaskDetailDialog';

jest.mock('../utils/api', () => ({
  apiRequest: jest.fn(),
}));

jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1', name: 'Test User', email: 'test@test.com', role: 'farm_manager' },
  }),
}));

jest.mock('../contexts/NotificationContext', () => ({
  useNotification: () => ({
    success: jest.fn(),
    error: jest.fn(),
  }),
}));

const { apiRequest } = require('../utils/api');

const mockTask = {
  id: 'task-1',
  title: 'Water Field A',
  description: 'Daily watering routine',
  status: 'pending',
  priority: 'high',
  due_date: '2025-12-31',
  assigned_to: 'user-2',
  assigned_to_name: 'Ahmed',
  checklist: [
    { text: 'Turn on pump', done: false },
    { text: 'Check pressure', done: true },
  ],
};

describe('TaskDetailDialog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    apiRequest.mockResolvedValue([]);
  });

  it('renders nothing when no task is provided', () => {
    const { container } = render(
      <TaskDetailDialog task={null} open={false} onClose={() => {}} />
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders task title and description when open', async () => {
    render(
      <TaskDetailDialog task={mockTask} open={true} onClose={() => {}} />
    );

    await waitFor(() => {
      expect(screen.getByText('Water Field A')).toBeInTheDocument();
      expect(screen.getByText('Daily watering routine')).toBeInTheDocument();
    });
  });

  it('shows task priority and status', async () => {
    render(
      <TaskDetailDialog task={mockTask} open={true} onClose={() => {}} />
    );

    await waitFor(() => {
      expect(screen.getByText(/high/i)).toBeInTheDocument();
      expect(screen.getByText(/pending/i)).toBeInTheDocument();
    });
  });

  it('renders checklist items', async () => {
    // The dialog loads its checklist from the API rather than the task prop.
    apiRequest.mockImplementation((url) => {
      if (url.endsWith('/checklist')) {
        return Promise.resolve([
          { id: 'i1', item: 'Turn on pump', is_completed: false },
          { id: 'i2', item: 'Check pressure', is_completed: true },
        ]);
      }
      return Promise.resolve([]);
    });

    render(
      <TaskDetailDialog task={mockTask} open={true} onClose={() => {}} />
    );

    await waitFor(() => {
      expect(screen.getByText('Turn on pump')).toBeInTheDocument();
      expect(screen.getByText('Check pressure')).toBeInTheDocument();
    });
  });

  it('calls onClose when close button is clicked', async () => {
    const onClose = jest.fn();
    render(
      <TaskDetailDialog task={mockTask} open={true} onClose={onClose} />
    );

    const closeButton = screen.getByLabelText(/close/i);
    await userEvent.click(closeButton);
    expect(onClose).toHaveBeenCalled();
  });
});
