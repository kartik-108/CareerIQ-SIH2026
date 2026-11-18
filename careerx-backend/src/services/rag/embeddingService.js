import crypto from "node:crypto";
import { embed } from "../ai/provider.js";
import { env } from '../../config/env.js';

const MAX_CACHE_ENTRIES = 1000;
const CACHE_TTL_MS = 30 * 60 * 1000;
const cache = new Map();

function hash(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

export async function embedText(text) {
  const normalized = String(text || "").trim();

  if (!normalized) throw new Error('Cannot generate an embedding for empty text.');

  const key = hash(normalized);

  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    cache.delete(key);
    cache.set(key, cached);
    return cached.value;
  }
  if (cached) cache.delete(key);

  let result;
  try {
    result = await embed(normalized, { feature: 'mentorEmbedding' });
  } catch (error) {
    throw new Error(`Embedding generation failed: ${error.message}`);
  }

  const embedding = result.data;

  if (!Array.isArray(embedding) || embedding.length !== env.OLLAMA_EMBED_DIM) {
    throw new Error(`Embedding provider returned ${embedding?.length || 0} dimensions; expected ${env.OLLAMA_EMBED_DIM}.`);
  }

  cache.set(key, { value: embedding, expiresAt: Date.now() + CACHE_TTL_MS });
  while (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value);

  return embedding;
}

export async function embedMany(texts = [], { concurrency = 4, onProgress, retries = 2 } = {}) {
  const results = new Array(texts.length);
  let nextIndex = 0;
  let completed = 0;
  async function worker() {
    while (nextIndex < texts.length) {
      const index = nextIndex++;
      let error;
      for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
          results[index] = await embedText(texts[index]);
          error = null;
          break;
        } catch (candidateError) {
          error = candidateError;
          if (attempt < retries) await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
        }
      }
      if (error) throw error;
      completed += 1;
      onProgress?.({ completed, total: texts.length, index });
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, texts.length) }, worker));
  return results;
}

export function clearEmbeddingCache() {
  cache.clear();
}