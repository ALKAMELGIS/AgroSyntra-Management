export const TOKEN_KEY = 'almaha_access_token';
export const REFRESH_KEY = 'almaha_refresh_token';
export const USER_KEY = 'almaha_user';
export const ACT_AS_ORG_KEY = 'almaha_act_as_org';

export const SESSION_EXPIRED_EVENT = 'auth:session-expired';

const PUBLIC_AUTH_PATHS = [
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/worker-login',
  '/auth/microsoft/callback',
  '/manpower-entry',
  '/team-leader/spray-calendar',
];

export function getAccessToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getRefreshToken() {
  return localStorage.getItem(REFRESH_KEY);
}

export function saveTokens(accessToken, refreshToken) {
  localStorage.setItem(TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_KEY, refreshToken);
}

export function saveSession(userData, accessToken, refreshToken) {
  localStorage.setItem(USER_KEY, JSON.stringify(userData));
  saveTokens(accessToken, refreshToken);
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(ACT_AS_ORG_KEY);
}

export function getActAsOrgId() {
  return localStorage.getItem(ACT_AS_ORG_KEY);
}

export function setActAsOrgId(orgId) {
  if (orgId) {
    localStorage.setItem(ACT_AS_ORG_KEY, orgId);
  } else {
    localStorage.removeItem(ACT_AS_ORG_KEY);
  }
}

export function dispatchSessionExpired() {
  window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
}

export function redirectToLogin() {
  clearSession();
  dispatchSessionExpired();
  const path = window.location.pathname || '';
  if (PUBLIC_AUTH_PATHS.some((p) => path.startsWith(p))) return;
  window.location.href = '/login';
}

export function getAuthHeaders() {
  const token = getAccessToken();
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const actAsOrgId = getActAsOrgId();
  if (actAsOrgId) {
    headers['X-Act-As-Organization'] = actAsOrgId;
  }
  return headers;
}

export function hasValidSession() {
  return !!(localStorage.getItem(USER_KEY) && getAccessToken());
}
