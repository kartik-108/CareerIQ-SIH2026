import { supabase } from '../config/supabase.js';
import { DatabaseError } from '../utils/ApiError.js';

// Repository pattern: controllers/services never talk to Supabase directly
// for core entities — they go through a repository. Keeps query logic in
// one place and makes swapping the data layer later a contained change.

export async function findUserByEmail(email) {
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new DatabaseError(error.message);
  return data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase()) || null;
}

export async function findUserById(id) {
  const { data, error } = await supabase.auth.admin.getUserById(id);
  if (error) throw new DatabaseError(error.message);
  return data.user;
}

export async function createUser({ email, password, fullName, role = 'student' }) {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
    app_metadata: { role: 'student' },
  });
  if (error) throw new DatabaseError(error.message);
  return data.user;
}

export async function softDeleteUser(id) {
  const { error } = await supabase.auth.admin.deleteUser(id);
  if (error) throw new DatabaseError(error.message);
}

export async function createProfile(userId, fields = {}) {
  const { data, error } = await supabase
    .from('profiles')
    .insert({ user_id: userId, ...fields })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function findProfileByUserId(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateProfile(userId, updates) {
  const { data, error } = await supabase
    .from('profiles')
    .upsert({ user_id: userId, ...updates }, { onConflict: 'user_id' })
    .select()
    .single();
  if (error) throw error;
  return data;
}
