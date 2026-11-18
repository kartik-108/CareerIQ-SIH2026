import { ConflictError, UnauthorizedError } from '../utils/ApiError.js';
import * as userRepo from '../repositories/user.repository.js';
import { uploadToBucket, buckets, supabase } from '../config/supabase.js';

export async function register({ email, password, full_name }) {
  const existing = await userRepo.findUserByEmail(email);
  if (existing) throw new ConflictError('An account with this email already exists');

  const user = await userRepo.createUser({ email, password, fullName: full_name, role: 'student' });
  const profile = await userRepo.createProfile(user.id, { full_name });
  let session = null;
  try {
    const { data } = await supabase.auth.signInWithPassword({ email, password });
    session = data?.session || null;
  } catch {
    // The account and profile are already created; the client can sign in separately.
  }
  return {
    user: sanitizeUser(user),
    profile,
    access_token: session?.access_token || null,
    refresh_token: session?.refresh_token || null,
    expires_at: session?.expires_at || null,
  };
}

export async function login({ email, password }) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user || !data.session) throw new UnauthorizedError(error?.message || 'Invalid email or password');
  const profile = await userRepo.findProfileByUserId(data.user.id);
  return { user: sanitizeUser(data.user), profile, ...data.session };
}

export async function refresh(refreshToken) {
  const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data.user || !data.session) throw new UnauthorizedError(error?.message || 'Invalid or expired refresh token');
  return { user: sanitizeUser(data.user), ...data.session };
}

export async function getProfile(userId) {
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error || !data.user) throw new UnauthorizedError('Account not found');

  let profile = await userRepo.findProfileByUserId(userId);
  if (!profile) {
    profile = await userRepo.createProfile(userId, {
      full_name: data.user.user_metadata?.full_name || data.user.email,
    });
  }
  return { ...sanitizeUser(data.user), profile };
}

export async function updateProfile(userId, updates) {
  return userRepo.updateProfile(userId, updates); // now upsert-based, safe even with no prior row
}

export async function uploadAvatar(userId, file) {
  const path = await uploadToBucket(buckets.avatars, userId, file.originalname, file.buffer, file.mimetype);
  const { data } = supabase.storage.from(buckets.avatars).getPublicUrl(path);
  return userRepo.updateProfile(userId, { avatar_url: data.publicUrl }); // same upsert safety net
}

export async function deleteAccount(userId) {
  await userRepo.softDeleteUser(userId);
}

function sanitizeUser(user) {
  return {
    id: user.id,
    email: user.email,
    role: user.app_metadata?.role || 'student',
    user_metadata: user.user_metadata,
  };
}
