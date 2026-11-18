#!/usr/bin/env node
// Usage: npm run knowledge:reindex
// Drops and recomputes embeddings for ALL documents (e.g. after changing embedding model).
import 'dotenv/config';
import { supabase } from '../config/supabase.js';
import { embedDocumentChunks } from '../rag/embedder.js';
import { logger } from '../config/logger.js';

const { data: docs, error } = await supabase.from('knowledge_documents').select('id, title');
if (error) {
  logger.error({ err: error.message }, 'failed to list documents');
  process.exit(1);
}

for (const doc of docs || []) {
  const { error: delErr } = await supabase.from('knowledge_embeddings').delete().eq('document_id', doc.id);
  if (delErr) {
    logger.error({ docId: doc.id, err: delErr.message }, 'failed to clear old embeddings');
    continue;
  }
  const { embedded } = await embedDocumentChunks(doc.id);
  logger.info({ docId: doc.id, title: doc.title, embedded }, 'reindexed document');
}

logger.info('knowledge:reindex complete');
