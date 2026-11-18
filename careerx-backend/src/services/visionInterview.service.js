import crypto from 'node:crypto';
import { cacheGet, cacheSet } from '../config/redis.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { generateJSON } from './ai/provider.js';
import * as visionRepo from '../repositories/vision.repository.js';

function aggregateFrames(frames) {
  const values = frames.map((frame) => frame.analytics || {});
  const average = (key) => { const list = values.map((item) => Number(item[key])).filter(Number.isFinite); return list.length ? Math.round(list.reduce((sum, value) => sum + value, 0) / list.length) : 0; };
  const emotionSummary = values.map((item) => item.emotion).filter(Boolean).reduce((result, emotion) => { result[emotion] = (result[emotion] || 0) + 1; return result; }, {});
  return { eye_contact_score: average('eye_contact'), confidence_score: average('confidence'), posture_score: average('posture') || Math.max(0, Math.min(100, 100 - Math.round((Math.abs(average('yaw')) + Math.abs(average('pitch')) + Math.abs(average('roll'))) / 3))), face_visibility: frames.length ? Math.round(frames.filter((frame) => frame.face_present).length * 100 / frames.length) : 0, blink_rate: average('blink_rate'), looking_away_duration: Math.max(...values.map((item) => Number(item.looking_away_duration) || 0), 0), emotion_summary: emotionSummary, frame_count: frames.length };
}

export async function start(userId, options) { const session = await visionRepo.createCameraSession({ userId, ...options }); logger.info({ userId, sessionId: session.id }, 'face mesh initialized'); return session; }
export async function saveFrame(userId, frame) { await visionRepo.findCameraSession(userId, frame.session_id); return visionRepo.saveCameraFrame({ userId, sessionId: frame.session_id, frame }); }
export async function end(userId, { session_id, answers }) {
  const session = await visionRepo.findCameraSession(userId, session_id); const frames = await visionRepo.listCameraFrames(userId, session_id); const analytics = aggregateFrames(frames);
  const cacheKey = `vision_interview_feedback:${crypto.createHash('sha1').update(JSON.stringify({ answers, analytics, role: session.target_role })).digest('hex')}`; let feedback = await cacheGet(cacheKey);
  if (!feedback) { feedback = (await generateJSON(`Evaluate this interview using the answer transcripts and camera analytics. Return JSON with overall_score, technical_score, communication_score, confidence_score, eye_contact_score, posture_score, strengths, weaknesses, improvement_tips, behavioral_tips, technical_tips.\nRole: ${session.target_role || 'technology role'}\nAnswers: ${JSON.stringify(answers)}\nCamera analytics: ${JSON.stringify(analytics)}`, { feature: 'visionInterviewFeedback' })).data; await cacheSet(cacheKey, feedback, env.CACHE_TTL_RESUME_ANALYSIS); }
  const report = { analytics, feedback }; await visionRepo.completeCameraSession(userId, session_id, report); logger.info({ userId, sessionId: session_id, frameCount: frames.length }, 'interview ended'); return { session_id, ...report };
}