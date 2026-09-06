import { API_BASE_URL } from '../../config.js';
import { getItem, setItem, removeItem } from '../storage.js';

export class ApiClientError extends Error {
  constructor(message, status = 0, details = null) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.details = details;
  }
}

async function parseResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) {
    throw new ApiClientError(payload?.message || `Request failed (${response.status})`, response.status, payload?.details);
  }
  return payload?.data ?? payload;
}

async function request(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeout || 30000);
  const token = getItem('auth_token');
  const headers = new Headers(options.headers || {});

  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
      credentials: 'include',
      signal: controller.signal,
    });

    if (response.status === 401 && getItem('refresh_token')) {
      try {
        const refreshed = await fetch(`${API_BASE_URL}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ refresh_token: getItem('refresh_token') }),
        });
        const refreshPayload = await parseResponse(refreshed);
        setItem('auth_token', refreshPayload.access_token);
        if (refreshPayload.refresh_token) setItem('refresh_token', refreshPayload.refresh_token);
        headers.set('Authorization', `Bearer ${refreshPayload.access_token}`);
        return parseResponse(await fetch(`${API_BASE_URL}${path}`, { ...options, headers, credentials: 'include', signal: controller.signal }));
      } catch {
        removeItem('auth_token');
        removeItem('refresh_token');
        removeItem('user_email');
        window.dispatchEvent(new CustomEvent('auth:expired'));
      }
    }

    if (response.status === 401) {
      removeItem('auth_token');
      removeItem('refresh_token');
      removeItem('user_email');
      window.dispatchEvent(new CustomEvent('auth:expired'));
    }

    return await parseResponse(response);
  } catch (error) {
    if (error.name === 'AbortError') throw new ApiClientError('The request timed out. Please try again.');
    if (error instanceof ApiClientError) throw error;
    throw new ApiClientError('Unable to reach CareerIQ. Check that the backend is running.');
  } finally {
    clearTimeout(timeout);
  }
}

export const api = {
  request,
  get: (path, options = {}) => request(path, { ...options, method: 'GET' }),
  post: (path, body, options = {}) => request(path, { ...options, method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body) }),
  put: (path, body, options = {}) => request(path, { ...options, method: 'PUT', body: JSON.stringify(body) }),
  patch: (path, body, options = {}) => request(path, { ...options, method: 'PATCH', body: JSON.stringify(body) }),
  upload: (path, formData, options = {}) => request(path, { ...options, method: 'POST', body: formData }),
};
