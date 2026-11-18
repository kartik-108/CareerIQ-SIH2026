// Runtime configuration for the browser client.
const runtime = globalThis.CAREERIQ_CONFIG || {};
const environment = globalThis.process?.env || {};

export const API_BASE_URL = (
  runtime.API_BASE_URL
  || environment.CAREERIQ_API_URL
  || '/api'
).replace(/\/$/, '');

export const SUPABASE_URL = runtime.SUPABASE_URL
  || environment.SUPABASE_URL
  || 'https://seffbkraxzrlfpctlynz.supabase.co';

export const SUPABASE_ANON_KEY = runtime.SUPABASE_ANON_KEY
  || environment.SUPABASE_ANON_KEY
  || 'sb_publishable_wQICzgS42Je6XePI-7pV6A_eYSzVo-Z';
