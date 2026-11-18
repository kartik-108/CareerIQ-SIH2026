import { chunkText, cleanText } from '../src/rag/chunker.js';

describe('cleanText', () => {
  it('collapses excessive blank lines and trims', () => {
    const dirty = '  Hello \n\n\n\n World  \t\n';
    expect(cleanText(dirty)).toBe('Hello\n\n World');
  });
});

describe('chunkText', () => {
  it('produces at least one chunk for short text', () => {
    const chunks = chunkText('This is a short paragraph about career readiness.');
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(chunks[0]).toHaveProperty('content');
    expect(chunks[0]).toHaveProperty('token_count');
  });

  it('splits long text into multiple chunks respecting rough token size', () => {
    const longText = Array.from({ length: 50 }, (_, i) => `Paragraph number ${i} discussing skills and careers in depth. `.repeat(10)).join('\n\n');
    const chunks = chunkText(longText, { chunkSizeTokens: 200, overlapTokens: 20 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.token_count).toBeLessThanOrEqual(260); // some slack for overlap carry-over
    }
  });
});
