const isLocalDevelopment = ['localhost', '127.0.0.1'].includes(window.location.hostname);

window.CAREERIQ_CONFIG = {
  API_BASE_URL: isLocalDevelopment
    ? 'http://localhost:5000/api'
    : 'https://careeriq-sih2026.onrender.com/api',
  AI_TIMEOUT_MS: 120000,
  DEV_MODE: isLocalDevelopment,
  SUPABASE_URL: 'https://seffbkraxzrlfpctlynz.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_wQICzgS42Je6XePI-7pV6A_eYSzVo-Z',
};
