#!/usr/bin/env node
// Usage: npm run knowledge:stats
// Prints counts of documents/chunks/embeddings grouped by category and status.
import 'dotenv/config';
import { supabase } from '../config/supabase.js';

const { data: docs } = await supabase.from('knowledge_documents').select('category, status');
const { count: chunkCount } = await supabase.from('knowledge_chunks').select('*', { count: 'exact', head: true });
const { count: embeddingCount } = await supabase.from('knowledge_embeddings').select('*', { count: 'exact', head: true });

const byCategory = {};
const byStatus = {};
for (const d of docs || []) {
  byCategory[d.category] = (byCategory[d.category] || 0) + 1;
  byStatus[d.status] = (byStatus[d.status] || 0) + 1;
}

console.log('=== Knowledge Base Stats ===');
console.log(`Total documents: ${docs?.length || 0}`);
console.log(`Total chunks:     ${chunkCount ?? 'n/a'}`);
console.log(`Total embeddings: ${embeddingCount ?? 'n/a'}`);
console.log('\nBy category:');
console.table(byCategory);
console.log('\nBy status:');
console.table(byStatus);
