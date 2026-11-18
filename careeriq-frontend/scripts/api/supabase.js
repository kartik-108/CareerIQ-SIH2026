import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../../config.js';

// Only the public Supabase URL and anonymous key belong in the browser.
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Supabase Auth is not configured. Set public SUPABASE_URL and SUPABASE_ANON_KEY in the frontend .env or runtime config.');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
