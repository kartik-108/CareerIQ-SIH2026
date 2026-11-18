import { supabase } from './supabase.js';
import { clearSession, saveSession } from '../storage.js';

function pageName() {
  return location.pathname.split('/').pop() || 'index.html';
}

function loginPath() {
  return location.pathname.includes('/pages/') ? 'login.html' : 'pages/login.html';
}

function dashboardPath() {
  return location.pathname.includes('/pages/') ? 'dashboard.html' : 'pages/dashboard.html';
}

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    if (error.status === 401) return null;
    throw error;
  }
  return data.user;
}

export async function signIn(email, password) {
  const result = await supabase.auth.signInWithPassword({ email, password });
  if (result.error) throw result.error;
  saveSession(result.data.session);
  return result.data;
}

export async function signUp(email, password, fullName) {
  const result = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  });
  if (result.error) throw result.error;
  if (result.data.session) saveSession(result.data.session);
  return result.data;
}

export async function signInWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${location.origin}${location.pathname}` },
  });
  if (error) throw error;
  return data;
}

export async function logout() {
  window.dispatchEvent(new CustomEvent('auth:logout'));
  const { error } = await supabase.auth.signOut();
  clearSession();
  if (error) throw error;
}

export async function requireAuth() {
  const session = await getSession();
  if (!session) {
    clearSession();
    if (!pageName().includes('login')) location.href = loginPath();
    return null;
  }
  saveSession(session);
  return session;
}

export async function redirectAuthenticatedUser() {
  const session = await getSession();
  if (session && pageName() === 'login.html') location.href = dashboardPath();
  return session;
}

export function subscribeToAuthChanges(onChange) {
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    if (session) saveSession(session);
    else clearSession();
    onChange?.(event, session);
  });
  return () => data.subscription.unsubscribe();
}

export function authErrorMessage(error, fallback) {
  const message = String(error?.message || '').toLowerCase();
  if (message.includes('invalid login credentials')) return 'Invalid email or password.';
  if (message.includes('email not confirmed')) return 'Please confirm your email before logging in.';
  if (message.includes('already registered') || message.includes('already exists')) return 'An account with this email already exists.';
  if (message.includes('password') && (message.includes('weak') || message.includes('short') || message.includes('at least') || message.includes('characters'))) return 'Use a stronger password with at least 8 characters.';
  if (message.includes('fetch') || message.includes('network') || message.includes('timeout')) return 'Supabase is unavailable right now. Check your connection and try again.';
  return error?.message || fallback;
}
