import { supabase } from '../../config/supabase.js';
import { embedText } from './embeddingService.js';
import { logger } from '../../config/logger.js';
import { env } from '../../config/env.js';

const DEFAULT_TOP_K = env.RAG_TOP_K;
const DEFAULT_THRESHOLD = env.RAG_SIMILARITY_THRESHOLD;
const STOP_WORDS = new Set(['a', 'an', 'and', 'are', 'be', 'by', 'for', 'from', 'how', 'in', 'is', 'it', 'of', 'on', 'or', 'that', 'the', 'this', 'to', 'was', 'what', 'when', 'where', 'which', 'who', 'why', 'with', 'you']);
const SEARCH_TIMEOUT_MS = 3000;

function withTimeout(promise, timeoutMs, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function normalizeChunk(row, similarity = 0) {
  return {
    id: row.id,
    document_id: row.document_id,
    file_name: row.file_name,
    page_number: row.page_number,
    content: row.content || '',
    metadata: row.metadata || {},
    chunk_index: row.chunk_index ?? 0,
    similarity: Number(similarity ?? row.similarity ?? row.score) || 0,
  };
}

function keywords(query) {
  return [...new Set(String(query || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/))]
    .filter((word) => word.length > 1 && !STOP_WORDS.has(word));
}

async function searchRpc(embedding, topK, threshold, userId) {
  const rpcPayload = {
    query_embedding: embedding,
    match_count: topK,
    similarity_threshold: threshold,
    filter_user_id: userId || null,
  };
  const { data, error } = await supabase.rpc('match_knowledge_chunks', rpcPayload);
  if (error) {
    error.rpcPayload = rpcPayload;
    throw error;
  }
  return {
    rpcPayload,
    rows: (data || []).map((row) => normalizeChunk(row, row.similarity ?? row.score)),
  };
}

async function countEmbeddedChunks(userId) {
  let query = supabase.from('knowledge_chunks')
    .select('id', { count: 'exact', head: true })
    .not('embedding', 'is', null);
  if (userId) query = query.or(`user_id.is.null,user_id.eq.${userId}`);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

async function searchLexically(query, topK, userId) {
  const builder = supabase.from('knowledge_chunks').select('id,document_id,content,file_name,mime_type,page_number,chunk_index').limit(2000);
  const { data, error } = userId ? await builder.or(`user_id.is.null,user_id.eq.${userId}`) : await builder;
  if (error) throw error;
  const terms = keywords(query);
  if (!terms.length) return [];
  return (data || []).map((row) => {
    const content = String(row.content || '').toLowerCase();
    const hits = terms.reduce((count, term) => count + (content.includes(term) ? 1 : 0), 0);
    return normalizeChunk(row, hits / terms.length);
  }).filter((row) => row.similarity > 0).sort((left, right) => right.similarity - left.similarity).slice(0, topK);
}

export function resetVectorStoreDetection() {}

export async function searchRelevantChunks(query, userId, k = DEFAULT_TOP_K) {
  const topK = Math.max(1, Number(k) || DEFAULT_TOP_K);
  const startedAt = Date.now();
  let pgvectorEnabled = false;
  logger.info({ queryLength: String(query || '').length, userId, topK }, '[RAG] vector search started');
  try {
    const embedding = await withTimeout(embedText(query), SEARCH_TIMEOUT_MS, 'RAG vector search timed out');
    logger.info({ ms: Date.now() - startedAt, dimensions: embedding.length }, '[RAG] embedding generated');
    const initial = await withTimeout(searchRpc(embedding, topK, DEFAULT_THRESHOLD, userId), SEARCH_TIMEOUT_MS, 'RAG vector lookup timed out');
    pgvectorEnabled = true;
    const results = initial.rows;
    if (results.length) {
      results.retrievalMode = 'vector';
      results.pgvectorEnabled = pgvectorEnabled;
      logger.info({ ms: Date.now() - startedAt, dimensions: embedding.length, count: results.length, matches: results.map(({ document_id, file_name, similarity }) => ({ document_id, file_name, similarity })), mode: 'vector' }, '[RAG] vector search completed');
      logger.info({ ms: Date.now() - startedAt, mode: 'vector' }, '[RAG] retrieval mode');
      return results;
    }
    const filters = { userId: userId || null, documentId: null, includesSharedDocuments: true };
    let candidateCount = null;
    try {
      candidateCount = await countEmbeddedChunks(userId);
    } catch (error) {
      logger.warn({ err: error.message }, '[RAG] Could not count embedded chunks for empty-result diagnostics');
    }
    logger.warn({
      ms: Date.now() - startedAt,
      reason: 'empty vector result at configured similarity threshold',
      dimensions: embedding.length,
      documentsReturned: 0,
      rpcName: 'match_knowledge_chunks',
      rpcPayload: initial.rpcPayload,
      filters,
      embeddedChunksMatchingFilters: candidateCount,
      rls: { filteredRows: false, reason: 'The configured Supabase client uses the service-role key, which bypasses RLS.' },
    }, '[RAG] Vector search returned 0 docs; diagnosing filters and retrying semantic search.');

    const relaxed = await withTimeout(searchRpc(embedding, topK, 0, userId), SEARCH_TIMEOUT_MS, 'RAG relaxed vector lookup timed out');
    if (relaxed.rows.length) {
      relaxed.rows.retrievalMode = 'vector';
      relaxed.rows.pgvectorEnabled = pgvectorEnabled;
      logger.info({
        ms: Date.now() - startedAt,
        dimensions: embedding.length,
        count: relaxed.rows.length,
        matches: relaxed.rows.map(({ document_id, file_name, similarity }) => ({ document_id, file_name, similarity })),
        configuredThreshold: DEFAULT_THRESHOLD,
        relaxedThreshold: 0,
        mode: 'vector',
      }, '[RAG] semantic retry returned documents');
      return relaxed.rows;
    }
  } catch (error) {
    logger.warn({ ms: Date.now() - startedAt, reason: error.message, rpcName: error.rpcPayload ? 'match_knowledge_chunks' : undefined, rpcPayload: error.rpcPayload, err: error.stack }, '[RAG] lexical fallback triggered');
  }
  try {
    const results = await withTimeout(searchLexically(query, topK, userId), Math.max(1, SEARCH_TIMEOUT_MS - (Date.now() - startedAt)), 'RAG lexical search timed out');
    results.retrievalMode = 'lexical';
    results.pgvectorEnabled = pgvectorEnabled;
    logger.info({ ms: Date.now() - startedAt, count: results.length, mode: 'lexical' }, '[RAG] lexical search completed');
    logger.info({ ms: Date.now() - startedAt, mode: 'lexical' }, '[RAG] retrieval mode');
    return results;
  } catch (error) {
    logger.warn({ ms: Date.now() - startedAt, err: error.stack }, '[RAG] lexical search unavailable');
    return [];
  }
}

export async function vectorSearch(query, options = {}) {
  return searchRelevantChunks(query, options.userId, options.topK || DEFAULT_TOP_K);
}
