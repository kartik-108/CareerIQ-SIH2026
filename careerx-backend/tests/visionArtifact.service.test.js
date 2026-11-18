import { jest } from '@jest/globals';

jest.unstable_mockModule('../src/repositories/visionArtifact.repository.js', () => ({
  findByHash: jest.fn().mockResolvedValue(null),
  saveArtifact: jest.fn().mockResolvedValue({ id: 'artifact-1', created_at: '2026-09-07T00:00:00.000Z', file_name: 'proof.png' }),
}));
jest.unstable_mockModule('../src/config/supabase.js', () => ({
  buckets: { resumes: 'resumes', reports: 'reports' },
  uploadToBucket: jest.fn().mockResolvedValue('user-1/proof.png'),
  getSignedUrl: jest.fn().mockResolvedValue('https://example.test/report.pdf'),
}));
jest.unstable_mockModule('../src/services/ai/provider.js', () => ({
  generateVisionJSON: jest.fn().mockResolvedValue({ data: { certificate_name: 'Cloud Associate', skills: ['Azure'], relevance_score: 91 } }),
}));
jest.unstable_mockModule('../src/utils/imagePreprocess.js', () => ({
  preprocessResumeFile: jest.fn().mockResolvedValue({ parts: [{ inlineData: { data: 'encoded', mimeType: 'image/jpeg' } }] }),
}));

const { analyze } = await import('../src/services/visionArtifact.service.js');
const { saveArtifact } = await import('../src/repositories/visionArtifact.repository.js');

describe('vision artifact service', () => {
  it('analyzes and persists a certificate artifact', async () => {
    const result = await analyze('user-1', 'certificate', { buffer: Buffer.from('certificate'), originalname: 'proof.png', mimetype: 'image/png', size: 11 });
    expect(result.certificate_name).toBe('Cloud Associate');
    expect(result.id).toBe('artifact-1');
    expect(saveArtifact).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-1', type: 'certificate', score: 91 }));
  });
});
