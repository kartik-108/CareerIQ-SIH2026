import { supabase } from '../../config/supabase.js';
import { env } from '../../config/env.js';
import { searchRelevantChunks } from './vectorSearch.js';

async function countRows(query) {
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

export async function getVectorStatus({ userId, query = '100 Machine Learning Interview Questions and Answers' } = {}) {
  const [totalDocuments, embeddedDocuments, totalChunks, embeddedChunks] = await Promise.all([
    countRows(supabase.from('knowledge_documents').select('id', { count: 'exact', head: true })),
    countRows(supabase.from('knowledge_documents').select('id', { count: 'exact', head: true }).eq('status', 'embedded')),
    countRows(supabase.from('knowledge_chunks').select('id', { count: 'exact', head: true })),
    countRows(supabase.from('knowledge_chunks').select('id', { count: 'exact', head: true }).not('embedding', 'is', null)),
  ]);

  const results = await searchRelevantChunks(query, userId, 3);
  return {
    totalDocuments,
    embeddedDocuments,
    totalChunks,
    embeddedChunks,
    vectorDimension: env.OLLAMA_EMBED_DIM,
    pgvectorEnabled: results.pgvectorEnabled ?? false,
    retrievalMode: results.retrievalMode || 'unavailable',
    sampleSimilaritySearch: {
      query,
      results: results.map(({ id, document_id, file_name, page_number, similarity }) => ({
        id,
        documentId: document_id,
        fileName: file_name,
        pageNumber: page_number,
        similarity,
      })),
    },
  };
}