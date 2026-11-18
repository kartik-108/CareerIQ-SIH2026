import { generateEmbeddingsBatch } from '../services/ai/provider.js';
import { supabase } from '../config/supabase.js';
import { logger } from '../config/logger.js';

// Embeds all not-yet-embedded chunks for a document and stores vectors on
// knowledge_chunks. Skips chunks that already have an embedding value
// (idempotent — safe to re-run knowledge:embed).
export async function embedDocumentChunks(documentId) {
  const { data: chunks, error: chunkErr } = await supabase
    .from('knowledge_chunks')
    .select('id, content, embedding')
    .eq('document_id', documentId)
    .order('chunk_index', { ascending: true });

  if (chunkErr) throw chunkErr;
  if (!chunks?.length) return { embedded: 0, skipped: 0 };

  const pending = chunks.filter((c) => !c.embedding);
  if (!pending.length) {
    logger.info({ documentId }, 'all chunks already embedded, skipping');
    return { embedded: 0, skipped: chunks.length };
  }

  const vectors = await generateEmbeddingsBatch(pending.map((c) => c.content));

  const updates = await Promise.all(pending.map((chunk, i) => supabase.from('knowledge_chunks').update({ embedding: vectors[i], updated_at: new Date().toISOString() }).eq('id', chunk.id).eq('document_id', documentId)));
  const insertErr = updates.find(({ error }) => error)?.error;
  if (insertErr) throw insertErr;

  await supabase.from('knowledge_documents').update({ status: 'embedded' }).eq('id', documentId);

  logger.info({ documentId, embedded: pending.length, skipped: chunks.length - pending.length }, 'chunks embedded');
  return { embedded: pending.length, skipped: chunks.length - pending.length };
}
