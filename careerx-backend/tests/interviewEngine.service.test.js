import { jest } from '@jest/globals';

jest.unstable_mockModule('../src/config/supabase.js', () => ({
  supabase: { rpc: jest.fn() },
}));
jest.unstable_mockModule('../src/config/redis.js', () => ({
  cacheGet: jest.fn().mockResolvedValue(null),
  cacheSet: jest.fn().mockResolvedValue(undefined),
}));
jest.unstable_mockModule('../src/services/ai/provider.js', () => ({
  generateEmbedding: jest.fn().mockResolvedValue({ data: [0.1, 0.2] }),
  generateJSON: jest.fn(),
}));

const { supabase } = await import('../src/config/supabase.js');
const { generateJSON } = await import('../src/services/ai/provider.js');
const {
  getAdaptiveDifficulty,
  searchInterviewKnowledge,
  generateHybridInterview,
} = await import('../src/services/interviewEngine.service.js');

describe('interviewEngine.service', () => {
  beforeEach(() => jest.clearAllMocks());

  it('maps previous performance to the requested difficulty bands', () => {
    expect(getAdaptiveDifficulty(90)).toBe('hard');
    expect(getAdaptiveDifficulty(60)).toBe('medium');
    expect(getAdaptiveDifficulty(59)).toBe('beginner');
    expect(getAdaptiveDifficulty(null)).toBe('medium');
  });

  it('uses RAG mode when the RPC returns a relevant chunk', async () => {
    supabase.rpc.mockResolvedValue({ data: [{ content: 'Binary search context', similarity: 0.91, metadata: {}, source_url: 'dsa.md' }], error: null });
    generateJSON.mockResolvedValue({ data: { questions: [{ question: 'What is binary search?', type: 'Theory', difficulty: 'medium' }] } });

    const result = await generateHybridInterview({ topic: 'DSA', role: 'Engineer' });

    expect(result.mode).toBe('rag');
    expect(result.sources[0].source).toBe('dsa.md');
    expect(generateJSON).toHaveBeenCalledWith(expect.stringContaining('Binary search context'), expect.objectContaining({ feature: 'hybridInterviewRAG' }));
  });

  it('uses local AI when retrieval has no relevant chunks', async () => {
    supabase.rpc.mockResolvedValue({ data: [], error: null });
    generateJSON.mockResolvedValue({ data: { questions: [{ question: 'Explain cloud computing.', type: 'Theory' }] } });

    const result = await generateHybridInterview({ topic: 'Cloud Computing', previousPerformance: 88 });

    expect(result.mode).toBe('local');
    expect(result.difficulty).toBe('hard');
    expect(generateJSON).toHaveBeenCalledWith(expect.stringContaining('Do not mention missing documents'), expect.objectContaining({ feature: 'hybridInterviewLocal' }));
  });
});