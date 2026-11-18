import { jest } from '@jest/globals';

jest.unstable_mockModule('../src/repositories/vision.repository.js', () => ({
  createCameraSession: jest.fn().mockResolvedValue({ id: 'session-1' }),
  findCameraSession: jest.fn().mockResolvedValue({ id: 'session-1', target_role: 'Engineer' }),
  saveCameraFrame: jest.fn().mockResolvedValue({ id: 'frame-1' }),
  listCameraFrames: jest.fn().mockResolvedValue([
    { face_present: true, analytics: { eye_contact: 80, confidence: 70, yaw: 2, pitch: 1, roll: 0, emotion: 'focused' } },
    { face_present: true, analytics: { eye_contact: 60, confidence: 90, yaw: 4, pitch: 2, roll: 0, emotion: 'focused' } },
  ]),
  completeCameraSession: jest.fn().mockResolvedValue({ id: 'session-1', status: 'completed' }),
}));
jest.unstable_mockModule('../src/services/ai/provider.js', () => ({ generateJSON: jest.fn().mockResolvedValue({ data: { overall_score: 82, confidence_score: 80, strengths: ['Clear answers'], weaknesses: [], improvement_tips: [], behavioral_tips: [], technical_tips: [] } }) }));
jest.unstable_mockModule('../src/config/redis.js', () => ({ cacheGet: jest.fn().mockResolvedValue(null), cacheSet: jest.fn().mockResolvedValue(undefined) }));

const { end } = await import('../src/services/visionInterview.service.js');

describe('vision interview service', () => {
  it('aggregates frame analytics and generates feedback', async () => {
    const result = await end('user-1', { session_id: 'session-1', answers: [{ question: 'Q', answer: 'A' }] });
    expect(result.analytics.eye_contact_score).toBe(70);
    expect(result.analytics.confidence_score).toBe(80);
    expect(result.analytics.face_visibility).toBe(100);
    expect(result.feedback.overall_score).toBe(82);
  });
});