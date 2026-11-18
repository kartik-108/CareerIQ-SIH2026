#!/usr/bin/env node
// Usage: npm run knowledge:embed
// Embeds all chunked-but-not-yet-embedded documents. Idempotent.
import 'dotenv/config';
import { supabase } from '../config/supabase.js';
import { embedDocumentChunks } from '../rag/embedder.js';
import { logger } from '../config/logger.js';

const { data: docs, error } = await supabase
  .from('knowledge_documents')
  .select('id, title')
  .in('status', ['chunked', 'pending']);

if (error) {
  logger.error({ err: error.message }, 'failed to list documents');
  process.exit(1);
}

let totalEmbedded = 0;
for (const doc of docs || []) {
  try {
    const { embedded } = await embedDocumentChunks(doc.id);
    totalEmbedded += embedded;
  } catch (err) {
    logger.error({ docId: doc.id, title: doc.title, err: err.message }, 'embedding failed for document');
  }
}

logger.info({ documents: docs?.length || 0, totalEmbedded }, 'knowledge:embed complete');
