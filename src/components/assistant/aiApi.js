import { API_BASE, getAuthHeaders } from '../../config/api';

async function call(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    const err = new Error(json?.error?.message || `Request failed (${res.status})`);
    err.code = json?.error?.code;
    throw err;
  }
  return json.data;
}

export const aiStatus = () => call('/ai/status');
export const listConversations = () => call('/ai/conversations');
export const getMessages = (id) => call(`/ai/conversations/${id}/messages`);
export const deleteConversation = (id) => call(`/ai/conversations/${id}`, { method: 'DELETE' });
export const ask = (body) => call('/ai/ask', { method: 'POST', body });
