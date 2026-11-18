import { jest } from '@jest/globals';

jest.unstable_mockModule('../src/config/redis.js', () => ({ cacheGet: jest.fn().mockResolvedValue(null), cacheSet: jest.fn().mockResolvedValue(undefined) }));
jest.unstable_mockModule('../src/services/ai/provider.js', () => ({ generateVisionJSON: jest.fn() }));
jest.unstable_mockModule('../src/utils/imagePreprocess.js', () => ({ preprocessResumeFile: jest.fn().mockResolvedValue({ parts: [] }) }));

const { generateVisionJSON } = await import('../src/services/ai/provider.js');
const { analyzeGrammarText, analyzeResumeGrammar } = await import('../src/services/grammar.service.js');

describe('resume grammar service', () => {
  it('returns a deterministic clean grammar result', () => {
    const text = 'Built reliable systems. Improved platform performance by 40 percent.';
    expect(analyzeGrammarText(text)).toEqual(analyzeGrammarText(text));
    expect(analyzeGrammarText(text).grammar_score).toBe(100);
  });

  it('lowers the score and reports spelling mistakes', () => {
    const result = analyzeGrammarText('I definately built teh platform.');
    expect(result.grammar_score).toBeLessThan(100);
    expect(result.spelling_errors).toEqual(expect.arrayContaining(['definately -> definitely', 'teh -> the']));
    expect(result.grammar_issues_count).toBeGreaterThan(0);
  });

  it('returns unavailable instead of throwing when local AI fails', async () => {
    generateVisionJSON.mockRejectedValueOnce(Object.assign(new Error('Quota exceeded'), { status: 429 }));
    const result = await analyzeResumeGrammar({ buffer: Buffer.from('not-an-image'), mimetype: 'image/png' }, 'quota-hash');
    expect(result.grammar_score).toBeNull();
    expect(result.grammar_status).toBe('Unavailable');
    expect(result.grammar_reason).toBe('Local AI request failed');
  });
});
