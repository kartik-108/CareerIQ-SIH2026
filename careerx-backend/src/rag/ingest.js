import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { supabase } from '../config/supabase.js';
import { chunkText, cleanText } from './chunker.js';
import { logger } from '../config/logger.js';

// Supported raw formats for the knowledge base. PDF text extraction reuses
// the same pdf-parse dependency as the resume module.
const SUPPORTED_EXTENSIONS = new Set(['.md', '.txt', '.json', '.pdf', '.docx']);

export async function extractTextFromFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const raw = fs.readFileSync(filePath);

  if (ext === '.pdf') {
    const pdfParse = (await import('pdf-parse')).default;
    const parsed = await pdfParse(raw);
    return parsed.text;
  }

  if (ext === '.docx') {
    const mammoth = await import('mammoth');
    const parsed = await mammoth.extractRawText({ buffer: raw });
    return parsed.value;
  }

  if (ext === '.json') {
    const json = JSON.parse(raw.toString('utf-8'));
    // Expect { title, content, metadata } shape; fall back to stringifying.
    return typeof json.content === 'string' ? json.content : JSON.stringify(json, null, 2);
  }

  // .md / .txt
  return raw.toString('utf-8');
}

function hashContent(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function listSupportedFiles(rootDir) {
  const files = [];
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listSupportedFiles(fullPath));
    } else if (SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      files.push(fullPath);
    }
  }

  return files.sort();
}

async function findExistingRagDocument(contentHash) {
  const { data, error } = await supabase
    .from('rag_documents')
    .select('id, metadata')
    .eq('metadata->>content_hash', contentHash)
    .limit(1);

  if (error) throw error;
  return data?.[0] || null;
}

function getIngestionUserId() {
  return process.env.RAG_USER_ID || process.env.KNOWLEDGE_BASE_USER_ID || null;
}

async function ingestRagFile(filePath, knowledgeBaseRoot, userId, summary) {
  const relativePath = path.relative(knowledgeBaseRoot, filePath);
  console.log(`Processing ${relativePath}`);
  logger.info({ file: relativePath }, 'RAG ingestion: processing file');

  const rawText = await extractTextFromFile(filePath);
  const content = cleanText(rawText);
  if (!content) {
    logger.warn({ file: relativePath }, 'RAG ingestion: file has no extractable text');
    return;
  }

  const contentHash = hashContent(content);
  const chunks = chunkText(content);
  const existing = await findExistingRagDocument(contentHash);
  if (existing) {
    summary.duplicatesSkipped += 1;
    chunks.forEach((chunk, index) => {
      logger.info({ file: relativePath, chunk: index + 1, totalChunks: chunks.length }, 'RAG ingestion: duplicate chunk skipped');
    });
    logger.info({ file: relativePath, chunks: chunks.length }, 'RAG ingestion: duplicate file skipped');
    console.log(`Duplicate skipped: ${relativePath}`);
    return;
  }

  const category = relativePath.split(path.sep)[0] || 'general';
  const embedding = Array.from(
    { length: Number(process.env.OLLAMA_EMBED_DIM || 768) },
    () => 0
  );
  const rows = chunks.map((chunk, index) => {
    logger.info({ file: relativePath, chunk: index + 1, totalChunks: chunks.length }, 'RAG ingestion: chunk prepared (embedding skipped)');
    return {
      user_id: userId,
      content: chunk.content,
      embedding,
      source_url: relativePath,
      chunk_index: chunk.chunk_index,
      metadata: {
        file_name: relativePath,
        chunk_index: chunk.chunk_index,
        content_hash: contentHash,
        category,
        source: 'knowledge-base',
        embedding_status: 'pending',
      },
    };
  });

  const { error } = await supabase.from('rag_documents').insert(rows);
  if (error) throw error;

  summary.filesIngested += 1;
  summary.chunksCreated += rows.length;
  logger.info({ file: relativePath, chunks: rows.length }, 'RAG ingestion: file inserted');
  console.log(`✓ ${rows.length} chunks inserted (embedding skipped)`);
}

export async function runKnowledgeBaseIngestion(knowledgeBaseRoot = path.resolve(process.cwd(), 'knowledge-base')) {
  const userId = getIngestionUserId();
  if (!userId) {
    throw new Error('RAG_USER_ID or KNOWLEDGE_BASE_USER_ID must be set to ingest into rag_documents');
  }
  if (!fs.existsSync(knowledgeBaseRoot)) {
    throw new Error(`Knowledge base folder does not exist: ${knowledgeBaseRoot}`);
  }

  const files = listSupportedFiles(knowledgeBaseRoot);
  const summary = {
    filesScanned: files.length,
    filesIngested: 0,
    chunksCreated: 0,
    duplicatesSkipped: 0,
    failures: [],
  };

  for (const filePath of files) {
    try {
      await ingestRagFile(filePath, knowledgeBaseRoot, userId, summary);
    } catch (error) {
      const file = path.relative(knowledgeBaseRoot, filePath);
      summary.failures.push({ file, error: error.message });
      logger.error({ file, err: error.message }, 'RAG ingestion: file failed');
    }
  }

  console.log('\nRAG INGESTION COMPLETE\n');
  console.log(`Files scanned: ${summary.filesScanned}`);
  console.log(`Files ingested: ${summary.filesIngested}`);
  console.log(`Chunks inserted: ${summary.chunksCreated}`);
  console.log(`Duplicates skipped: ${summary.duplicatesSkipped}`);
  console.log(`Failed: ${summary.failures.length}`);
  console.log('\nEmbedding mode: SKIPPED (SIH temporary mode)');

  if (summary.failures.length) {
    throw new Error(`RAG ingestion failed for ${summary.failures.length} file(s)`);
  }

  return summary;
}

/**
 * Ingest a single file into knowledge_documents + knowledge_chunks.
 * Idempotent: if content_hash already exists, skips re-ingestion.
 * Category is inferred from the immediate parent folder name under knowledge-base/.
 */
export async function ingestFile(filePath, knowledgeBaseRoot) {
  const ext = path.extname(filePath).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.has(ext)) {
    logger.warn({ filePath }, 'skipping unsupported file type');
    return null;
  }

  const rawText = await extractTextFromFile(filePath);
  const content = cleanText(rawText);
  const contentHash = hashContent(content);

  const { data: existingDoc } = await supabase
    .from('knowledge_documents')
    .select('id, status')
    .eq('content_hash', contentHash)
    .maybeSingle();

  if (existingDoc) {
    logger.info({ filePath, documentId: existingDoc.id }, 'document already ingested (hash match), skipping');
    return existingDoc.id;
  }

  const relativePath = path.relative(knowledgeBaseRoot, filePath);
  const category = relativePath.split(path.sep)[0] || 'general';
  const title = path.basename(filePath, ext).replace(/[-_]/g, ' ');

  const { data: doc, error: docErr } = await supabase
    .from('knowledge_documents')
    .insert({
      title,
      category,
      source: relativePath,
      file_path: filePath,
      content_hash: contentHash,
      status: 'pending',
      metadata: { extension: ext },
    })
    .select('id')
    .single();

  if (docErr) throw docErr;

  const chunks = chunkText(content);
  const rows = chunks.map((c) => ({
    document_id: doc.id,
    chunk_index: c.chunk_index,
    content: c.content,
    token_count: c.token_count,
    metadata: { title, category, source: relativePath },
  }));

  const { error: chunkErr } = await supabase.from('knowledge_chunks').insert(rows);
  if (chunkErr) throw chunkErr;

  await supabase.from('knowledge_documents').update({ status: 'chunked' }).eq('id', doc.id);

  logger.info({ filePath, documentId: doc.id, chunks: rows.length }, 'document ingested and chunked');
  return doc.id;
}

/** Recursively walk knowledge-base/ and ingest every supported file. */
export async function ingestDirectory(rootDir) {
  const results = { ingested: [], skipped: [], failed: [] };

  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) files.push(...walk(full));
      else files.push(full);
    }
    return files;
  }

  const allFiles = walk(rootDir);

  for (const file of allFiles) {
    try {
      const docId = await ingestFile(file, rootDir);
      if (docId) results.ingested.push({ file, docId });
      else results.skipped.push(file);
    } catch (err) {
      logger.error({ file, err: err.message }, 'ingestion failed');
      results.failed.push({ file, error: err.message });
    }
  }

  return results;
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  runKnowledgeBaseIngestion()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
