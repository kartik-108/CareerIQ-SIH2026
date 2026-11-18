#!/usr/bin/env node
// Usage: npm run knowledge:import
// Walks knowledge-base/ and ingests every supported file into
// knowledge_documents + knowledge_chunks (chunking only — no embeddings yet).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import { ingestDirectory } from '../rag/ingest.js';
import { logger } from '../config/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KB_ROOT = path.join(__dirname, '../../knowledge-base');

const results = await ingestDirectory(KB_ROOT);
logger.info(
  { ingested: results.ingested.length, skipped: results.skipped.length, failed: results.failed.length },
  'knowledge:import complete'
);
if (results.failed.length) {
  console.table(results.failed);
  process.exit(1);
}
