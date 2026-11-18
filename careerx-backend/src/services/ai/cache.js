import crypto from 'node:crypto';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 1000;
const entries = new Map();

// identity: caller-supplied content/scope identity (e.g. image content hash, user scope).
// Two requests with the same prompt but different identities never share a cache entry.
function keyFor(provider, prompt, model, type, identity = '') {
  const hash = crypto.createHash('sha256').update(JSON.stringify({ provider, prompt, model, type, identity })).digest('hex');
  return `${provider}:${model}:${type}:${hash}`;
}

export function getCached(provider, prompt, model, type, identity = '') {
  const key = keyFor(provider, prompt, model, type, identity);
  const entry = entries.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    entries.delete(key);
    return null;
  }
  entries.delete(key);
  entries.set(key, entry);
  return { ...entry.value, cached: true };
}

export function setCached(provider, prompt, model, type, value, identity = '') {
  entries.set(keyFor(provider, prompt, model, type, identity), { value, expiresAt: Date.now() + CACHE_TTL_MS });
  while (entries.size > MAX_CACHE_ENTRIES) entries.delete(entries.keys().next().value);
  return value;
}

export function clearCache() {
  entries.clear();
}
