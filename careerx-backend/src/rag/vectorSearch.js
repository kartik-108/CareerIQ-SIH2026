import { supabase } from '../config/supabase.js';
import { generateEmbedding } from '../services/ai/provider.js';
import { logger } from '../config/logger.js';

const DEFAULT_TOP_K = 5;
const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'be', 'by', 'difference', 'explain', 'for', 'from',
  'how', 'in', 'is', 'it', 'of', 'on', 'or', 'that', 'the', 'this', 'to', 'was',
  'what', 'when', 'where', 'which', 'who', 'why', 'with', 'you',
]);
const SEARCH_TIMEOUT_MS = 3000;

function withTimeout(promise, timeoutMs, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), Math.max(1, timeoutMs));
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Semantic search uses the local embedding model and the canonical chunk RPC.

export function resetVectorStoreDetection() {}

async function searchRpc(query, { topK = DEFAULT_TOP_K, similarityThreshold = 0.72, userId = null } = {}) {
  const embedding = (await generateEmbedding(query, { feature: 'vectorSearch' })).data;
  const result = await supabase.rpc('match_knowledge_chunks', {
    query_embedding: embedding,
    match_count: topK,
    similarity_threshold: similarityThreshold,
    filter_user_id: userId || null,
  });
  if (result.error) throw result.error;
  return { store: 'knowledge_chunks', data: result.data || [] };
}

function extractKeywords(query) {
  return [...new Set(
    String(query || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
  )].filter((keyword) => keyword.length > 1 && !STOP_WORDS.has(keyword));
}

async function searchKeywordDocuments(query, { topK = DEFAULT_TOP_K, category = null, role = null, userId = null } = {}) {
  const keywords = extractKeywords(query);
  if (!keywords.length) return [];
  let queryBuilder = supabase
    .from('knowledge_chunks')
    .select('id,document_id,content,file_name,mime_type,page_number,chunk_index')
    .limit(2000);
  if (userId) queryBuilder = queryBuilder.or(`user_id.is.null,user_id.eq.${userId}`);
  const { data, error } = await queryBuilder;
  if (error) throw error;
  return (data || [])
    .map((row) => {
      const text = String(row.content || '').toLowerCase();
      const score = keywords.reduce((count, keyword) => count + (text.includes(keyword) ? 1 : 0), 0) / keywords.length;
      return { ...row, similarity: score };
    })
    .filter((row) => row.similarity > 0)
    .sort((left, right) => right.similarity - left.similarity)
    .slice(0, Math.min(topK, DEFAULT_TOP_K));
}

export async function searchVectorKnowledge(query, options = {}) {
  const startedAt = Date.now();
  try {
    const result = await withTimeout(searchRpc(query, options), SEARCH_TIMEOUT_MS, 'RAG vector search timed out');
    logger.info({ count: result.data.length, mode: 'vector' }, '[RAG] API vector search completed');
    return result;
  } catch (error) {
    logger.warn({ err: error.stack }, '[RAG] API vector search unavailable; using lexical fallback');
    if (typeof supabase.from !== 'function') throw error;
    return { store: 'knowledge_chunks_keyword', data: await withTimeout(searchKeywordDocuments(query, options), SEARCH_TIMEOUT_MS - (Date.now() - startedAt), 'RAG lexical search timed out') };
  }
}

export async function vectorSearch(query, {
  topK = DEFAULT_TOP_K,
  category = null,
  role = null,
  userId = null,
} = {}) {
  const { data } = await searchVectorKnowledge(query, { topK, category, role, userId });
  return data;
}
