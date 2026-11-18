import { vectorSearch } from './vectorSearch.js';
import { generateJSON } from '../services/ai/provider.js';
import { buildRAGAnswerPrompt } from '../prompts/rag.prompt.js';
import { cacheGet, cacheSet } from '../config/redis.js';
import { env } from '../config/env.js';
import crypto from 'node:crypto';
import { logger } from '../config/logger.js';

// Full user-question -> grounded-answer pipeline:
// question -> embedding -> vector search -> context compression -> local AI -> answer + sources.
export async function answerWithRAG(question, { category = null, role = null, userId = null } = {}) {
  const cacheKey = `rag:${crypto.createHash('sha1').update(JSON.stringify({ question, category, role, userId })).digest('hex')}`;

  const cached = await cacheGet(cacheKey);
  if (cached) return { ...cached, cached: true };

  let chunks = [];
  try {
    chunks = await vectorSearch(question, { category, role, userId });
  } catch (error) {
    logger.warn({ err: error.stack }, '[RAG] retrieval timed out; returning no-context fallback');
  }

  if (!chunks.length) {
    const fallback = {
      answer:
        "I don't have enough information in the knowledge base to answer that confidently yet. Try rephrasing, or this topic may need to be added to the knowledge base.",
      sources: [],
      confidence: 'low',
      related_topics: [],
    };
    await cacheSet(cacheKey, fallback, env.CACHE_TTL_RAG_ANSWER);
    return fallback;
  }

  // Context compression: cap total chunks sent to the model to control cost/latency.
  const contextChunks = chunks.slice(0, env.RAG_TOP_K);

  const prompt = buildRAGAnswerPrompt({ question, contextChunks });
  let result;
  try {
    result = (await generateJSON(prompt, { timeout: 15000, feature: 'ragAnswer' })).data;
  } catch (error) {
    logger.warn({ err: error.stack, chunkCount: contextChunks.length }, '[RAG] AI answer unavailable; returning deterministic chunk answer');
    const first = contextChunks[0];
    const fallback = { answer: first?.content || 'The knowledge base returned context, but the AI answer service is unavailable. Please review the cited source.', sources_used: [1], confidence: 'low', related_topics: [] };
    result = fallback;
  }

  const sources = (result.sources_used || [])
    .map((i) => contextChunks[i - 1])
    .filter(Boolean)
    .map((c) => ({
      title: c.title,
      category: c.category || c.metadata?.category,
      source: c.source,
      similarity: c.similarity,
    }));

  const response = {
    answer: result.answer,
    sources,
    confidence: result.confidence || 'medium',
    related_topics: result.related_topics || [],
  };

  await cacheSet(cacheKey, response, env.CACHE_TTL_RAG_ANSWER);
  return response;
}
