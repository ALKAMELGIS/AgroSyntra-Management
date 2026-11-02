/**
 * Tests for the apiRequest utility function.
 */

// Mock fetch globally
global.fetch = jest.fn();

// Prevent redirect during auth failure tests
delete window.location;
window.location = { href: '', pathname: '/' };

beforeEach(() => {
  jest.clearAllMocks();
  jest.resetModules();
  localStorage.setItem('almaha_access_token', 'test-token-123');
  localStorage.setItem('almaha_refresh_token', 'test-refresh-token');
  window.location.href = '';
});

afterEach(() => {
  localStorage.clear();
});

function mockSuccess(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve({ success: true, data }),
  };
}

describe('apiRequest utility', () => {
  it('sends GET request with auth header', async () => {
    global.fetch.mockResolvedValue(mockSuccess([{ id: 1 }]));

    const { apiRequest } = require('../utils/api');
    const result = await apiRequest('/tasks');

    expect(result).toEqual([{ id: 1 }]);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/tasks'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token-123',
        }),
      })
    );
  });

  it('sends POST request with body', async () => {
    global.fetch.mockResolvedValue(mockSuccess({ id: 'new-1' }));

    const { apiRequest } = require('../utils/api');
    await apiRequest('/tasks', {
      method: 'POST',
      body: JSON.stringify({ title: 'New task' }),
    });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/tasks'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ title: 'New task' }),
      })
    );
  });

  it('throws on non-success response', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ success: false, error: { message: 'Not found' } }),
    });

    const { apiRequest } = require('../utils/api');
    await expect(apiRequest('/nonexistent')).rejects.toThrow('Not found');
  });

  it('includes Content-Type header for JSON', async () => {
    global.fetch.mockResolvedValue(mockSuccess([]));

    const { apiRequest } = require('../utils/api');
    await apiRequest('/data', {
      method: 'POST',
      body: JSON.stringify({ key: 'value' }),
    });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      })
    );
  });

  it('redirects to login when refresh fails on 401', async () => {
    global.fetch
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({
          success: false,
          error: { message: 'Invalid or expired access token' },
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({
          success: false,
          error: { message: 'Invalid or expired refresh token' },
        }),
      });

    const { apiRequest } = require('../utils/api');
    await expect(apiRequest('/tasks')).rejects.toThrow('Your session has expired');

    expect(window.location.href).toBe('/login');
    expect(localStorage.getItem('almaha_access_token')).toBeNull();
    expect(localStorage.getItem('almaha_user')).toBeNull();
  });

  it('does not redirect on 401 when no session tokens exist', async () => {
    localStorage.clear();
    window.location.href = '';

    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: () => Promise.resolve({
        success: false,
        error: { message: 'Authorization header missing or invalid' },
      }),
    });

    const { apiRequest } = require('../utils/api');
    await expect(apiRequest('/organization')).rejects.toThrow('Your session has expired');

    expect(window.location.href).toBe('');
  });
});
