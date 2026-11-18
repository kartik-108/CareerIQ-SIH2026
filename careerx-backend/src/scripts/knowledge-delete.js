#!/usr/bin/env node
// Usage: npm run knowledge:delete -- <document_id>
// Deletes a document and its chunks/embeddings (cascade via FK).
import 'dotenv/config';
import { supabase } from '../config/supabase.js';
import { logger } from '../config/logger.js';

const documentId = process.argv[2];
if (!documentId) {
  console.error('Usage: npm run knowledge:delete -- <document_id>');
  process.exit(1);
}

const { error } = await supabase.from('knowledge_documents').delete().eq('id', documentId);
if (error) {
  logger.error({ err: error.message }, 'delete failed');
  process.exit(1);
}
logger.info({ documentId }, 'document deleted (chunks + embeddings cascaded)');
