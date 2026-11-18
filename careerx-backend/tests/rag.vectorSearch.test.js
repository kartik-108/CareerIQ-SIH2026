import { jest } from '@jest/globals';

jest.unstable_mockModule('../src/services/ai/provider.js', () => ({
  generateEmbedding: jest.fn().mockResolvedValue({ data: [0.1, 0.2] }),
}));
jest.unstable_mockModule('../src/config/supabase.js', () => ({
  supabase: { rpc: jest.fn() },
}));

const { generateEmbedding } = await import('../src/services/ai/provider.js');
const { supabase } = await import('../src/config/supabase.js');
const { resetVectorStoreDetection, searchVectorKnowledge, vectorSearch } = await import('../src/rag/vectorSearch.js');

describe('vectorSearch compatibility', () => {
  beforeEach(() => jest.clearAllMocks());
  beforeEach(() => resetVectorStoreDetection());

  it('uses the canonical knowledge chunk RPC', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: [{ content: 'RAG chunk' }], error: null });

    const result = await searchVectorKnowledge('DSA');

    expect(result.store).toBe('knowledge_chunks');
    expect(result.data).toEqual([{ content: 'RAG chunk' }]);
    expect(generateEmbedding).toHaveBeenCalledTimes(1);
    expect(supabase.rpc).toHaveBeenCalledWith('match_knowledge_chunks', expect.any(Object));
  });

  it('falls back to canonical knowledge chunk lexical search', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: null, error: { message: 'canonical RPC unavailable' } });
    supabase.from = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue({ data: [{ id: 'chunk-1', document_id: 'doc-1', content: 'Python backend' }], error: null }),
      }),
    });

    const result = await searchVectorKnowledge('Python');
    expect(result.store).toBe('knowledge_chunks_keyword');
    expect(result.data[0].document_id).toBe('doc-1');
    expect(generateEmbedding).toHaveBeenCalledTimes(1);
    expect(supabase.rpc).toHaveBeenCalledWith('match_knowledge_chunks', expect.any(Object));
  });
});