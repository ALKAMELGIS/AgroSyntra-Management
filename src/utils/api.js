import { API_BASE } from '../config/api';
import { enqueueMutation } from './offlineQueue';
import { getFriendlyError } from './errorMessages';
import {
  getAccessToken,
  getRefreshToken,
  saveTokens,
  redirectToLogin,
  getAuthHeaders,
} from './authStorage';

/**
 * Tag returned from a mutation that couldn't reach the network and
 * got queued for later retry. Callers can detect this via the
 * `queued` flag and show a distinct "saved offline" confirmation
 * instead of a full error banner.
 */
export class OfflineQueuedError extends Error {
  constructor(queueId) {
    super('Saved offline — will sync when you reconnect.');
    this.name = 'OfflineQueuedError';
    this.queued = true;
    this.queueId = queueId;
  }
}

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Attempt to enqueue a mutation for offline retry. Returns the
 * queue id if it was accepted, or null if the request isn't
 * queue-safe (e.g. FormData / file upload).
 */
async function tryQueueMutation(endpoint, options) {
  const method = String(options.method || 'GET').toUpperCase();
  if (!MUTATING_METHODS.has(method)) return null;
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  if (isFormData) return null;

  let bodyString = null;
  if (typeof options.body === 'string') {
    bodyString = options.body;
  } else if (options.body && typeof options.body === 'object') {
    try {
      bodyString = JSON.stringify(options.body);
    } catch {
      return null;
    }
  }
  try {
    const id = await enqueueMutation({
      endpoint,
      method,
      body: bodyString,
    });
    return id;
  } catch {
    return null;
  }
}

async function refreshAccessToken() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  try {
    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      return false;
    }

    saveTokens(data.data.accessToken, data.data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

function handleAuthFailure() {
  redirectToLogin();
}

function throwApiError(data, status) {
  const detailsMessage =
    data.error?.details?.message ||
    data.error?.details?.detail ||
    data.error?.details?.constraint;
  const rawMessage = detailsMessage
    ? `${data.error?.message || 'API request failed'}: ${detailsMessage}`
    : data.error?.message || 'API request failed';
  const error = new Error(getFriendlyError(rawMessage));
  error.status = status;
  error.code = data.error?.code;
  throw error;
}

export async function apiRequest(endpoint, options = {}, _retryState = { auth: true, rateLimit: 0 }) {
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const baseHeaders = isFormData ? {} : { 'Content-Type': 'application/json' };

  let response;
  try {
    response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        ...baseHeaders,
        ...getAuthHeaders(),
        ...(options.headers || {}),
      },
    });
  } catch (networkErr) {
    if (!_retryState.queued) {
      const queueId = await tryQueueMutation(endpoint, options);
      if (queueId) {
        throw new OfflineQueuedError(queueId);
      }
    }
    const err = new Error('Network unavailable. Check your connection and try again.');
    err.code = 'NETWORK';
    err.cause = networkErr;
    throw err;
  }

  if (response.status === 401 && _retryState.auth) {
    const hadSession = !!(getAccessToken() || getRefreshToken());
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return apiRequest(endpoint, options, { ..._retryState, auth: false });
    }
    if (hadSession) handleAuthFailure();
    throw new Error(getFriendlyError('Invalid or expired access token'));
  }

  if (response.status === 429 && _retryState.rateLimit < 2) {
    const retryAfter = response.headers.get('Retry-After');
    const waitMs = retryAfter ? Math.min(parseInt(retryAfter, 10) * 1000, 30000) : 5000;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    return apiRequest(endpoint, options, { ..._retryState, rateLimit: _retryState.rateLimit + 1 });
  }

  let data;
  try {
    data = await response.json();
  } catch {
    const error = new Error(`Server returned non-JSON response (${response.status})`);
    error.status = response.status;
    throw error;
  }

  if (!data.success) {
    throwApiError(data, response.status);
  }

  return data.data;
}

export async function apiRequestWithMeta(endpoint, options = {}, _retryState = { auth: true, rateLimit: 0 }) {
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const baseHeaders = isFormData ? {} : { 'Content-Type': 'application/json' };

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      ...baseHeaders,
      ...getAuthHeaders(),
      ...(options.headers || {}),
    },
  });

  if (response.status === 401 && _retryState.auth) {
    const hadSession = !!(getAccessToken() || getRefreshToken());
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return apiRequestWithMeta(endpoint, options, { ..._retryState, auth: false });
    }
    if (hadSession) handleAuthFailure();
    throw new Error(getFriendlyError('Invalid or expired access token'));
  }

  if (response.status === 429 && _retryState.rateLimit < 2) {
    const retryAfter = response.headers.get('Retry-After');
    const waitMs = retryAfter ? Math.min(parseInt(retryAfter, 10) * 1000, 30000) : 5000;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    return apiRequestWithMeta(endpoint, options, { ..._retryState, rateLimit: _retryState.rateLimit + 1 });
  }

  let data;
  try {
    data = await response.json();
  } catch {
    const error = new Error(`Server returned non-JSON response (${response.status})`);
    error.status = response.status;
    throw error;
  }

  if (!data.success) {
    throwApiError(data, response.status);
  }

  return { data: data.data, meta: data.meta };
}

/**
 * Axios-like convenience wrapper around apiRequest.
 * Used by IPM and Dashboard pages.
 */
const api = {
  async get(endpoint) {
    const result = await apiRequestWithMeta(endpoint, { method: 'GET' });
    return { data: { data: result.data, meta: result.meta } };
  },
  async post(endpoint, body) {
    const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
    const data = await apiRequest(endpoint, {
      method: 'POST',
      body: isForm ? body : JSON.stringify(body),
    });
    return { data: { data } };
  },
  async put(endpoint, body) {
    const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
    const data = await apiRequest(endpoint, {
      method: 'PUT',
      body: isForm ? body : JSON.stringify(body),
    });
    return { data: { data } };
  },
  async patch(endpoint, body) {
    const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
    const data = await apiRequest(endpoint, {
      method: 'PATCH',
      body: isForm ? body : JSON.stringify(body),
    });
    return { data: { data } };
  },
  async delete(endpoint) {
    const data = await apiRequest(endpoint, { method: 'DELETE' });
    return { data: { data } };
  },
};

export default api;
