const runtime = globalThis.CAREERIQ_CONFIG || {};
const environment = globalThis.process?.env || {};
const bundlerEnvironment = import.meta.env || {};
const asBoolean = (value) => value === true || value === 'true' || value === 1 || value === '1';

export const API_BASE_URL = (
	runtime.API_BASE_URL
	|| bundlerEnvironment.API_BASE_URL
	|| environment.API_BASE_URL
	|| environment.CAREERIQ_API_URL
	|| (['localhost', '127.0.0.1'].includes(globalThis.location?.hostname) ? 'http://localhost:5000/api' : '/api')
).replace(/\/$/, '');

export const AI_TIMEOUT_MS = Number(runtime.AI_TIMEOUT_MS || bundlerEnvironment.AI_TIMEOUT_MS || environment.AI_TIMEOUT_MS || 120000);
export const DEV_MODE = asBoolean(runtime.DEV_MODE ?? bundlerEnvironment.DEV_MODE ?? environment.DEV_MODE ?? false);

export const SUPABASE_URL = runtime.SUPABASE_URL
	|| bundlerEnvironment.SUPABASE_URL
	|| environment.SUPABASE_URL
	|| 'https://seffbkraxzrlfpctlynz.supabase.co';

export const SUPABASE_ANON_KEY = runtime.SUPABASE_ANON_KEY
	|| bundlerEnvironment.SUPABASE_ANON_KEY
	|| environment.SUPABASE_ANON_KEY
	|| 'sb_publishable_wQICzgS42Je6XePI-7pV6A_eYSzVo-Z';
