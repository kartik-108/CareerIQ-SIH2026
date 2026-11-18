import { createClient } from '@supabase/supabase-js';
import path from 'node:path';
import { env } from './env.js';

// Service-role client — full DB/storage access, used ONLY server-side.
// Never expose SUPABASE_SERVICE_ROLE_KEY to the client/frontend.
export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export const buckets = {
  resumes: env.SUPABASE_BUCKET_RESUMES,
  reports: env.SUPABASE_BUCKET_REPORTS,
  avatars: env.SUPABASE_BUCKET_AVATARS,
  exports: env.SUPABASE_BUCKET_EXPORTS,
};

/**
 * Upload a buffer to a Supabase Storage bucket under `${userId}/${filename}`.
 * Returns the storage path (not a public URL — buckets are private except avatars).
 */
export async function uploadToBucket(bucket, userId, filename, buffer, contentType) {
  const safeName = path.basename(String(filename || 'resume')).replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${userId}/${Date.now()}_${safeName}`;
  const { error } = await supabase.storage.from(bucket).upload(storagePath, buffer, {
    contentType,
    upsert: false,
  });
  if (error) throw error;
  return storagePath;
}

/** Generate a short-lived signed URL for a private object. */
export async function getSignedUrl(bucket, path, expiresInSeconds = 3600) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresInSeconds);
  if (error) throw error;
  return data.signedUrl;
}
