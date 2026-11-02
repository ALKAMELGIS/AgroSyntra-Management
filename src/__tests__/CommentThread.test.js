import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CommentThread from '../components/CommentThread';

// Mock dependencies
jest.mock('../utils/api', () => ({
  apiRequest: jest.fn(),
}));

jest.mock('../contexts/NotificationContext', () => ({
  useNotification: () => ({
    success: jest.fn(),
    error: jest.fn(),
    warning: jest.fn(),
  }),
}));

jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1', name: 'Test User', email: 'test@test.com', role: 'farm_manager' },
  }),
}));

const { apiRequest } = require('../utils/api');

describe('CommentThread', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('loads and displays comments', async () => {
    apiRequest.mockResolvedValue([
      { id: 'c1', comment: 'Great harvest!', user_name: 'Ahmed', user_email: 'a@test.com', created_at: new Date().toISOString() },
      { id: 'c2', comment: 'Needs improvement', user_name: 'Sara', user_email: 's@test.com', created_at: new Date().toISOString() },
    ]);

    render(<CommentThread entityType="harvest" entityId="h1" />);

    await waitFor(() => {
      expect(screen.getByText('Great harvest!')).toBeInTheDocument();
      expect(screen.getByText('Needs improvement')).toBeInTheDocument();
    });
  });

  it('shows loading state', () => {
    apiRequest.mockReturnValue(new Promise(() => {}));
    render(<CommentThread entityType="harvest" entityId="h1" />);
    
    expect(document.querySelector('.MuiCircularProgress-root')).toBeInTheDocument();
  });

  it('does not load when entityId is missing', () => {
    render(<CommentThread entityType="harvest" entityId={null} />);
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('submits new comment', async () => {
    apiRequest
      .mockResolvedValueOnce([]) // initial load
      .mockResolvedValueOnce({ id: 'c3', comment: 'New note' }) // POST
      .mockResolvedValueOnce([{ id: 'c3', comment: 'New note', user_name: 'Test', created_at: new Date().toISOString() }]); // reload

    render(<CommentThread entityType="field" entityId="f1" />);

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalledWith('/comments/field/f1');
    });

    const input = await screen.findByPlaceholderText(/write a comment/i);
    await userEvent.type(input, 'New note');

    const sendButton = screen.getByLabelText(/send/i);
    await userEvent.click(sendButton);

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalledWith('/comments/field/f1', expect.objectContaining({
        method: 'POST',
      }));
    });
  });

  it('does not submit empty comment', async () => {
    apiRequest.mockResolvedValue([]);
    render(<CommentThread entityType="harvest" entityId="h1" />);

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalled();
    });

    // Send is disabled while the box is empty, so submitting is impossible.
    const sendButton = await screen.findByLabelText(/send/i);
    expect(sendButton).toBeDisabled();

    const postCalls = apiRequest.mock.calls.filter(
      (call) => call[1]?.method === 'POST'
    );
    expect(postCalls).toHaveLength(0);
  });
});
