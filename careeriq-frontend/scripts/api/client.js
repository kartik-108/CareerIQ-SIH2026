import { API_BASE_URL, AI_TIMEOUT_MS } from '../../config.js';
import { getItem, setItem, removeItem } from '../storage.js';
import { supabase } from './supabase.js';

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
  const token = getItem('auth_token');
  const headers = new Headers(options.headers || {});

  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  try {
    let response;
    let attempt = 0;
    const retries = Math.max(0, Number(options.retries ?? 1));
    do {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), options.timeout || 180000);
      try {
        response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers, credentials: 'include', signal: controller.signal });
      } catch (error) {
        if (attempt >= retries || error.name === 'AbortError') throw error;
        await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
      } finally {
        clearTimeout(timeout);
      }
      attempt += 1;
    } while (!response);

    if (response.status === 401 && getItem('refresh_token')) {
      try {
        const { data, error } = await supabase.auth.refreshSession({ refresh_token: getItem('refresh_token') });
        if (error || !data.session) throw error || new Error('Unable to refresh session');
        setItem('auth_token', data.session.access_token);
        setItem('refresh_token', data.session.refresh_token);
        headers.set('Authorization', `Bearer ${data.session.access_token}`);
        return parseResponse(await fetch(`${API_BASE_URL}${path}`, { ...options, headers, credentials: 'include' }));
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
  }
}
export async function streamSSE(path, { body, signal, onEvent, timeout = AI_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  let timedOut = false;
  let timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeout);
  const resetTimer = () => {
    clearTimeout(timer);
    timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeout);
  };
  let reader;
  const token = getItem('auth_token');
  const headers = { 'Content-Type': 'application/json', Accept: 'text/event-stream' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (signal) signal.addEventListener('abort', () => controller.abort(), { once: true });
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, { method: 'POST', headers, credentials: 'include', body: JSON.stringify(body || {}), signal: controller.signal });
    if (!response.ok) throw new ApiClientError(await response.text() || `Request failed (${response.status})`, response.status);
    if (!response.body) throw new ApiClientError('Streaming is unavailable in this browser.');
    reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { value, done } = await reader.read();
      resetTimer();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() || '';
      for (const event of events) {
        const type = event.match(/^event:\s*(.+)$/m)?.[1] || 'message';
        const data = event.match(/^data:\s?(.*)$/m)?.[1];
        if (!data || data === '[DONE]') {
          continue;
        }
        if (type === 'ping') continue;
        try {
          onEvent?.(type, JSON.parse(data));
        } catch {
          buffer = `${event}\n\n${buffer}`;
        }
      }
      if (done) break;
    }
    if (buffer.trim()) {
      const data = buffer.match(/^data:\s?(.*)$/m)?.[1];
      if (data && data !== '[DONE]' && !data.trim().startsWith(':')) onEvent?.('message', JSON.parse(data));
    }
  } catch (error) {
    if (error.name === 'AbortError') throw new ApiClientError(timedOut ? `AI generation timed out after ${Math.round(timeout / 1000)} seconds.` : 'Streaming stopped.', timedOut ? 408 : 499);
    if (error instanceof ApiClientError) throw error;
    throw new ApiClientError('Unable to reach CareerIQ. Check that the backend is running.');
  } finally {
    await reader?.cancel().catch(() => {});
    clearTimeout(timer);
  }
}

export const api = {
  request,
  get: (path, options = {}) => request(path, { ...options, method: 'GET' }),
  post: (path, body, options = {}) => request(path, { ...options, method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body) }),
  put: (path, body, options = {}) => request(path, { ...options, method: 'PUT', body: JSON.stringify(body) }),
  patch: (path, body, options = {}) => request(path, { ...options, method: 'PATCH', body: JSON.stringify(body) }),
  upload: (path, formData, options = {}) => request(path, { ...options, method: 'POST', body: formData }),
  streamSSE,
};
