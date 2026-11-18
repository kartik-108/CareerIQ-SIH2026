import { jest } from '@jest/globals';

jest.unstable_mockModule('../src/rag/vectorSearch.js', () => ({
  vectorSearch: jest.fn().mockResolvedValue([
    {
      content: 'Vector databases compare embeddings.',
      metadata: { category: 'AI/ML' },
      similarity: 0.92,
      source: 'ai-ml/embeddings.md',
    },
  ]),
}));
jest.unstable_mockModule('../src/services/ai/provider.js', () => ({
  generateJSON: jest.fn().mockResolvedValue({
    data: {
      answer: 'Embeddings represent semantic meaning.',
      sources_used: [1],
      confidence: 'high',
      related_topics: ['vector search'],
    },
  }),
}));
jest.unstable_mockModule('../src/config/redis.js', () => ({
  cacheGet: jest.fn().mockResolvedValue(null),
  cacheSet: jest.fn().mockResolvedValue(undefined),
}));

const { answerWithRAG } = await import('../src/rag/ragPipeline.js');

describe('rag pipeline', () => {
  it('returns a grounded answer with source citations', async () => {
    const result = await answerWithRAG('What are embeddings?');

    expect(result.answer).toBe('Embeddings represent semantic meaning.');
    expect(result.sources).toEqual([
      { title: undefined, category: 'AI/ML', source: 'ai-ml/embeddings.md', similarity: 0.92 },
    ]);
    expect(result.confidence).toBe('high');
  });
});