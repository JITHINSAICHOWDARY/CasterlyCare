import axios from 'axios';

import { apiErrorMessage, normalizeApiError } from './errors';

export const API_BASE = (
  import.meta.env.VITE_API_URL || 'http://localhost:5050'
).replace(/\/+$/, '');

export const API_TIMEOUT_MS = 15000;

export const TOKEN_KEY = 'lc_token';

export const USER_KEY = 'lc_user';

const api = axios.create({
  baseURL: `${API_BASE}/api`,
  timeout: API_TIMEOUT_MS,
  headers: {
    Accept: 'application/json',
  },
});

let redirectingForAuth = false;

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem(TOKEN_KEY);

    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(normalizeApiError(error)),
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const normalized = normalizeApiError(error);

    if (normalized.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);

      const onLogin = window.location.pathname === '/login';

      if (!onLogin && !redirectingForAuth) {
        redirectingForAuth = true;
        window.location.assign('/login?reason=session-expired');
      }
    }

    return Promise.reject(normalized);
  },
);

export function multipartConfig() {
  return {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  };
}

/*
 * Medical files (and any other content behind the secure
 * `/uploads/patient_files/:filename` route) require a Bearer token,
 * but a plain `<a href target="_blank">` is just a normal browser
 * navigation - it never carries the app's Authorization header, so
 * every click landed on "Missing or invalid authorization header."
 * regardless of whether the user was logged in.
 *
 * This fetches the file as an authenticated blob instead and opens
 * that in a new tab. The tab is opened synchronously (before the
 * `await`) so browsers don't treat the later `location` assignment
 * as a blocked popup.
 */
export async function openSecureFile(fileUrl, extraHeaders = {}) {
  const newTab = window.open('', '_blank');

  try {
    const token = localStorage.getItem(TOKEN_KEY);

    const fullUrl = /^https?:\/\//i.test(fileUrl)
      ? fileUrl
      : `${API_BASE}${fileUrl.startsWith('/') ? fileUrl : `/${fileUrl}`}`;

    const response = await axios.get(fullUrl, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...extraHeaders,
      },
      responseType: 'blob',
    });

    const blobUrl = window.URL.createObjectURL(response.data);

    if (newTab) {
      newTab.location.href = blobUrl;
    }

    window.setTimeout(() => window.URL.revokeObjectURL(blobUrl), 60000);
  } catch (error) {
    if (newTab) newTab.close();
    throw normalizeApiError(error);
  }
}

export { apiErrorMessage, normalizeApiError };

export default api;