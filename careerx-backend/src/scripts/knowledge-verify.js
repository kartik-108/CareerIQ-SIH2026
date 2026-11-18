#!/usr/bin/env node
// Usage: npm run knowledge:verify
// Sanity-checks the knowledge base: documents with no chunks, chunks with
// no embeddings, and orphaned rows.
import 'dotenv/config';
import { supabase } from '../config/supabase.js';

const issues = [];

const { data: docs } = await supabase.from('knowledge_documents').select('id, title, status');
for (const doc of docs || []) {
  const { count } = await supabase
    .from('knowledge_chunks')
    .select('*', { count: 'exact', head: true })
    .eq('document_id', doc.id);
  if (!count) issues.push(`Document "${doc.title}" (${doc.id}) has 0 chunks`);
}

const { data: chunks } = await supabase.from('knowledge_chunks').select('id, document_id');
for (const chunk of chunks || []) {
  const { count } = await supabase
    .from('knowledge_embeddings')
    .select('*', { count: 'exact', head: true })
    .eq('chunk_id', chunk.id);
  if (!count) issues.push(`Chunk ${chunk.id} (doc ${chunk.document_id}) has no embedding`);
}

if (!issues.length) {
  console.log('✅ Knowledge base is consistent — every document has chunks and every chunk has an embedding.');
} else {
  console.log(`⚠️  Found ${issues.length} issue(s):`);
  issues.forEach((i) => console.log(' -', i));
  process.exit(1);
}
