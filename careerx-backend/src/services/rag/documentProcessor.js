import path from 'node:path';
import crypto from 'node:crypto';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { supabase } from '../../config/supabase.js';
import { uploadToBucket, buckets } from '../../config/supabase.js';
import { cleanText } from '../../rag/chunker.js';
import { embedMany } from './embeddingService.js';

function extension(file) {
  return path.extname(file.originalname || '').toLowerCase();
}

export async function extractText(file) {
  const ext = extension(file);
  if (ext === '.pdf' || file.mimetype === 'application/pdf') return (await pdfParse(file.buffer)).text;
  if (ext === '.docx' || file.mimetype.includes('wordprocessingml')) return (await mammoth.extractRawText({ buffer: file.buffer })).value;
  if (['.txt', '.md', '.markdown'].includes(ext) || file.mimetype.startsWith('text/')) return file.buffer.toString('utf8');
  throw new Error('Unsupported document type. Upload PDF, DOCX, TXT, or Markdown.');
}

export async function processDocument({ file, userId, title = file.originalname }) {
  const text = cleanText(await extractText(file));
  if (!text) throw new Error('The uploaded document did not contain readable text.');
  const storagePath = await uploadToBucket(buckets.resumes, userId, file.originalname, file.buffer, file.mimetype);
  const documentId = crypto.randomUUID();
  try {
    const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 2000, chunkOverlap: 400, separators: ['\n\n', '\n', '. ', ' ', ''] });
    const chunks = await splitter.splitText(text);
    const embeddings = await embedMany(chunks);
    const type = extension(file).slice(1) || file.mimetype;
    const metadata = { title, type, file_name: file.originalname, storage_path: storagePath, document_id: documentId };
    const contentHash = crypto.createHash('sha256').update(file.buffer).digest('hex');
    const { error: documentError } = await supabase.from('knowledge_documents').insert({
      id: documentId,
      title,
      category: 'career-document',
      source: file.originalname,
      file_path: storagePath,
      content_hash: contentHash,
      status: 'embedded',
      metadata,
    });
    if (documentError) throw documentError;
    const chunkRows = chunks.map((chunk, index) => ({ user_id: userId, document_id: documentId, chunk_index: index, content: chunk, embedding: embeddings[index], file_name: file.originalname, mime_type: file.mimetype, page_number: null }));
    const { error: chunkError } = await supabase.from('knowledge_chunks').insert(chunkRows);
    if (chunkError) throw chunkError;
    return { id: documentId, title, type, storage_path: storagePath, chunks: chunks.length, characters: text.length };
  } catch (error) {
    await supabase.from('knowledge_chunks').delete().eq('document_id', documentId).eq('user_id', userId);
    await supabase.from('knowledge_documents').delete().eq('id', documentId);
    await supabase.storage.from(buckets.resumes).remove([storagePath]);
    throw error;
  }
}
