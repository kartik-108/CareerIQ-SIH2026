import { jest } from '@jest/globals';

const embedding = Array(768).fill(0.1);
const supabase = {
  rpc: jest.fn(),
  from: jest.fn(),
};

jest.unstable_mockModule('../src/services/rag/embeddingService.js', () => ({
  embedText: jest.fn().mockResolvedValue(embedding),
}));
jest.unstable_mockModule('../src/config/supabase.js', () => ({ supabase }));

const { searchRelevantChunks } = await import('../src/services/rag/vectorSearch.js');
const { env } = await import('../src/config/env.js');

describe('mentor vector search', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const query = {
      not: jest.fn(() => query),
      or: jest.fn(() => query),
      then: (resolve) => resolve({ count: 2, error: null }),
    };
    supabase.from.mockReturnValue({ select: jest.fn(() => query) });
  });

  it('retries an empty thresholded RPC without dropping semantic or user filters', async () => {
    supabase.rpc
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({
        data: [{ id: 'chunk-1', document_id: 'doc-1', file_name: '100-Machine-Learning-Interview-Questions-and-Answers-1.pdf', content: 'Machine learning interview questions', score: 0.42 }],
        error: null,
      });

    const results = await searchRelevantChunks('Explain machine learning.', 'user-123', 5);

    expect(supabase.rpc).toHaveBeenCalledTimes(2);
    expect(supabase.rpc).toHaveBeenNthCalledWith(1, 'match_knowledge_chunks', expect.objectContaining({
      query_embedding: embedding,
      match_count: 5,
      similarity_threshold: env.RAG_SIMILARITY_THRESHOLD,
      filter_user_id: 'user-123',
    }));
    expect(supabase.rpc).toHaveBeenNthCalledWith(2, 'match_knowledge_chunks', expect.objectContaining({
      query_embedding: embedding,
      match_count: 5,
      similarity_threshold: 0,
      filter_user_id: 'user-123',
    }));
    expect(results[0]).toMatchObject({ document_id: 'doc-1', similarity: 0.42 });
    expect(results.retrievalMode).toBe('vector');
    expect(results.pgvectorEnabled).toBe(true);
  });
});