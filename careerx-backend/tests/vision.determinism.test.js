import { jest } from '@jest/globals';

const storedAnalyses = [];
let resumeSequence = 0;
let analysisSequence = 0;
const analyzeResumeVision = jest.fn();
const getResumeContentHash = jest.fn(async (file) => `hash-${file.buffer.toString('utf8')}`);
const saveAnalysis = jest.fn(async (input) => {
  const saved = { id: `analysis-${++analysisSequence}`, resume_id: input.resumeId, created_at: new Date().toISOString(), ats_score: input.atsScore, ...input };
  storedAnalyses.unshift(saved);
  return saved;
});

jest.unstable_mockModule('../src/config/supabase.js', () => ({
  buckets: { resumes: 'resumes' },
  uploadToBucket: jest.fn(async (_bucket, userId, filename) => `${userId}/${Date.now()}_${filename}`),
  supabase: { storage: { from: jest.fn(() => ({ remove: jest.fn().mockResolvedValue({ error: null }) })) } },
}));
jest.unstable_mockModule('../src/repositories/resume.repository.js', () => ({
  createResume: jest.fn(async ({ userId }) => ({ id: `resume-${++resumeSequence}`, user_id: userId })),
  updateResumeText: jest.fn(),
}));
jest.unstable_mockModule('../src/repositories/vision.repository.js', () => ({
  getHistory: jest.fn(async (userId) => storedAnalyses.filter((item) => item.userId === userId)),
  saveAnalysis,
  deleteAnalysis: jest.fn(async (_userId, id) => {
    const index = storedAnalyses.findIndex((item) => item.id === id);
    const [deleted] = storedAnalyses.splice(index, 1);
    return { id, resume_id: deleted?.resume_id, storage_path: deleted?.storagePath };
  }),
}));
jest.unstable_mockModule('../src/services/resumeVision.service.js', () => ({
  analyzeResumeVision,
  getResumeContentHash,
  RESUME_PARSER_VERSION: 'resume-studio-test',
}));
jest.unstable_mockModule('../src/services/visionReport.service.js', () => ({ generateResumePdfReport: jest.fn() }));
jest.unstable_mockModule('../src/services/grammar.service.js', () => ({ analyzeResumeGrammar: jest.fn().mockResolvedValue({ grammar_score: null, grammar_status: 'Unavailable' }) }));
jest.unstable_mockModule('../src/config/redis.js', () => ({ cacheGet: jest.fn(), cacheSet: jest.fn(), cacheDel: jest.fn() }));

const { analyze } = await import('../src/services/vision.service.js');

describe('vision resume isolation', () => {
  const file = (content) => ({ buffer: Buffer.from(content), originalname: 'resume.pdf', mimetype: 'application/pdf', size: content.length });

  beforeEach(() => {
    storedAnalyses.length = 0;
    analyzeResumeVision.mockReset();
    analyzeResumeVision.mockImplementation(async (file) => ({
      raw_text: file.buffer.toString('utf8'),
      extraction: { skills: ['javascript'] },
      ats_score: { overall_score: 74, categories: { skills: 100 }, weights: { skills: 1 } },
      strength_analyzer: { confidence_score: 80 },
    }));
  });

  it('creates an isolated resume and analysis for every upload', async () => {
    const first = await analyze('user-1', file('resume A'));
    const second = await analyze('user-1', file('resume B'));

    expect(first.resumeId).not.toBe(second.resumeId);
    expect(first.id).not.toBe(second.id);
    expect(first.raw_text).toBe('resume A');
    expect(second.raw_text).toBe('resume B');
    expect(analyzeResumeVision).toHaveBeenCalledTimes(2);
    expect(storedAnalyses).toHaveLength(1);
    expect(storedAnalyses[0].id).toBe(second.id);
  });

  it('does not reuse an analysis across users for identical content', async () => {
    const first = await analyze('user-1', file('same resume'));
    const second = await analyze('user-2', file('same resume'));

    expect(first.resumeId).not.toBe(second.resumeId);
    expect(first.id).not.toBe(second.id);
    expect(analyzeResumeVision).toHaveBeenCalledTimes(2);
  });
});
