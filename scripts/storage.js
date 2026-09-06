// storage.js — thin localStorage wrapper so every module reads/writes
// through one place. Backend-ready: swapping to real auth/session storage
// later means editing this file only.

const PREFIX = 'careeriq:';

export function getItem(key, fallback = null) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function setItem(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // localStorage may be unavailable (private mode, quota) — fail silently,
    // the app should still function with in-memory defaults.
  }
}

export function removeItem(key) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    // Storage can be unavailable in private browsing contexts.
  }
}

// --- Auth/session helpers ---
export function isAuthenticated() {
  return Boolean(getItem('auth_token'));
}

export function saveSession(session) {
  if (session?.access_token) setItem('auth_token', session.access_token);
  if (session?.refresh_token) setItem('refresh_token', session.refresh_token);
  if (session?.user?.email) setItem('user_email', session.user.email);
}

export function clearSession() {
  removeItem('auth_token');
  removeItem('refresh_token');
  removeItem('user_email');
}

export const mockLogin = saveSession;
export const mockLogout = clearSession;
