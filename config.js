// Runtime configuration for the browser client.
const runtime = globalThis.CAREERIQ_CONFIG || {};
const environment = globalThis.process?.env || {};

export const API_BASE_URL = (
  runtime.API_BASE_URL
  || environment.CAREERIQ_API_URL
  || (['localhost', '127.0.0.1'].includes(globalThis.location?.hostname)
    ? 'http://localhost:5000/api'
    : 'https://careeriq-sih2026.onrender.com/api')
).replace(/\/$/, '');

export const SUPABASE_URL = runtime.SUPABASE_URL
  || environment.SUPABASE_URL
  || 'https://seffbkraxzrlfpctlynz.supabase.co';

export const SUPABASE_ANON_KEY = runtime.SUPABASE_ANON_KEY
  || environment.SUPABASE_ANON_KEY
  || 'sb_publishable_wQICzgS42Je6XePI-7pV6A_eYSzVo-Z';
