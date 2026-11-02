import { API_BASE } from '../config/api';
import { getAuthHeaders } from './authStorage';
import { apiRequest } from './api';

/** Organization logo upload: CEO and farm manager only (mirrors the API guard). */
export const LOGO_UPLOAD_ROLES = ['ceo', 'farm_manager'];

export function canUploadOrgLogo(role) {
  return LOGO_UPLOAD_ROLES.includes(role);
}

export async function uploadOrganizationLogo(file) {
  const fd = new FormData();
  fd.append('file', file);
  return apiRequest('/organization/logo', { method: 'POST', body: fd });
}

export async function fetchOrganizationLogoBlob() {
  const res = await fetch(`${API_BASE}/organization/logo?t=${Date.now()}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) return null;
  const blob = await res.blob();
  if (!blob.size) return null;
  const type = blob.type || '';
  if (type && !type.startsWith('image/')) return null;
  return blob;
}

export async function fetchOrganizationLogoDataUrl() {
  const blob = await fetchOrganizationLogoBlob();
  if (!blob) return null;
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}
