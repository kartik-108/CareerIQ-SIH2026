import { estimateTokens } from '../utils/tokenizer.js';
import { env } from '../config/env.js';

// Splits cleaned document text into overlapping chunks sized in tokens.
// Splits on paragraph boundaries first, then falls back to sentence
// boundaries so we never cut mid-sentence when avoidable.
export function chunkText(text, {
  chunkSizeTokens = env.RAG_CHUNK_SIZE_TOKENS,
  overlapTokens = env.RAG_CHUNK_OVERLAP_TOKENS,
} = {}) {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks = [];
  let current = '';
  let currentTokens = 0;

  const pushChunk = () => {
    if (current.trim()) {
      chunks.push(current.trim());
    }
  };

  for (const para of paragraphs) {
    const paraTokens = estimateTokens(para);

    if (paraTokens > chunkSizeTokens) {
      // Paragraph itself is too big — split on sentences.
      const sentences = para.match(/[^.!?]+[.!?]+/g) || [para];
      for (const sentence of sentences) {
        const sTokens = estimateTokens(sentence);
        if (currentTokens + sTokens > chunkSizeTokens) {
          pushChunk();
          // carry overlap forward
          const overlapText = current.split(/\s+/).slice(-overlapTokens).join(' ');
          current = overlapText;
          currentTokens = estimateTokens(current);
        }
        current += ` ${sentence}`;
        currentTokens += sTokens;
      }
      continue;
    }

    if (currentTokens + paraTokens > chunkSizeTokens) {
      pushChunk();
      const overlapText = current.split(/\s+/).slice(-overlapTokens).join(' ');
      current = overlapText;
      currentTokens = estimateTokens(current);
    }

    current += `\n\n${para}`;
    currentTokens += paraTokens;
  }

  pushChunk();

  return chunks.map((content, index) => ({
    chunk_index: index,
    content,
    token_count: estimateTokens(content),
  }));
}

// Basic cleanup: normalize whitespace, strip control chars, collapse blank lines.
export function cleanText(raw) {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/[^\x09\x0A\x20-\x7E\u00A0-\uFFFF]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ +\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
