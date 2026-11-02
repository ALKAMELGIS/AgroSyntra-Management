import { renderHook, act } from '@testing-library/react';
import { io } from 'socket.io-client';

// Mock socket.io-client
const mockSocket = {
  on: jest.fn(),
  off: jest.fn(),
  emit: jest.fn(),
  disconnect: jest.fn(),
};

jest.mock('socket.io-client', () => ({
  io: jest.fn(),
}));

import useSocket from '../hooks/useSocket';

describe('useSocket', () => {
  beforeEach(() => {
    // react-scripts turns on resetMocks, which strips the implementation from
    // every mock before each test. Without this the hook receives undefined
    // where it expects a socket.
    io.mockReturnValue(mockSocket);
    localStorage.setItem('almaha_access_token', 'test-token');
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('connects when token is present', () => {
    renderHook(() => useSocket());

    expect(io).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        auth: { token: 'test-token' },
        transports: ['websocket', 'polling'],
      })
    );
  });

  it('does not connect without token', () => {
    localStorage.clear();

    renderHook(() => useSocket());
    expect(io).not.toHaveBeenCalled();
  });

  it('returns subscribe function', () => {
    const { result } = renderHook(() => useSocket());
    expect(typeof result.current.subscribe).toBe('function');
  });

  it('subscribe emits to socket', () => {
    const { result } = renderHook(() => useSocket());
    
    act(() => {
      result.current.subscribe('dashboard');
    });

    expect(mockSocket.emit).toHaveBeenCalledWith('subscribe', 'dashboard');
  });

  it('unsubscribe emits to socket', () => {
    const { result } = renderHook(() => useSocket());
    
    act(() => {
      result.current.unsubscribe('dashboard');
    });

    expect(mockSocket.emit).toHaveBeenCalledWith('unsubscribe', 'dashboard');
  });

  it('on registers event handler', () => {
    const { result } = renderHook(() => useSocket());
    const handler = jest.fn();
    
    act(() => {
      result.current.on('data:change', handler);
    });

    expect(mockSocket.on).toHaveBeenCalledWith('data:change', handler);
  });

  it('off removes event handler', () => {
    const { result } = renderHook(() => useSocket());
    const handler = jest.fn();
    
    act(() => {
      result.current.off('data:change', handler);
    });

    expect(mockSocket.off).toHaveBeenCalledWith('data:change', handler);
  });

  it('emit sends data through socket', () => {
    const { result } = renderHook(() => useSocket());
    
    act(() => {
      result.current.emit('message', { text: 'hello' });
    });

    expect(mockSocket.emit).toHaveBeenCalledWith('message', { text: 'hello' });
  });

  it('disconnects on unmount', () => {
    const { unmount } = renderHook(() => useSocket());
    unmount();
    expect(mockSocket.disconnect).toHaveBeenCalled();
  });

  it('initializes with isConnected false', () => {
    const { result } = renderHook(() => useSocket());
    expect(result.current.isConnected).toBe(false);
  });
});
