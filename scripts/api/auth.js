import { supabase } from './supabase.js';
import { clearSession, saveSession } from '../storage.js';
import { initiateGoogleOAuth } from './oauth.js';

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function signInWithGoogle(location = window.location) {
  return initiateGoogleOAuth(supabase, location);
}

export async function logout() {
  const { error } = await supabase.auth.signOut();
  clearSession();
  if (error) throw error;
}

export function subscribeToAuthChanges(onChange) {
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    if (session) saveSession(session);
    else clearSession();
    onChange?.(event, session);
  });
  return () => data.subscription.unsubscribe();
}
