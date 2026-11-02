/**
 * Centralized API configuration.
 * All API URLs should be imported from here instead of using inline fallbacks.
 */
export { getAuthHeaders } from '../utils/authStorage';

export const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3001/api/v1';
export const WS_URL = process.env.REACT_APP_WS_URL || 'http://localhost:3001';
