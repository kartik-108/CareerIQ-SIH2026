import { supabase } from '../config/supabase.js';
import { DatabaseError, NotFoundError } from '../utils/ApiError.js';

export async function saveAnalysis({ userId, resumeId, resumeUrl, storagePath, fileName, mimeType, size, resumeHash, analysisJson, atsScore, grammarScore, confidenceScore, eyeContactScore, emotionSummary, processingTime, cacheHit }) {
  const payload = { user_id: userId, resume_id: resumeId, resume_url: resumeUrl, storage_path: storagePath, file_name: fileName, mime_type: mimeType, size, resume_hash: resumeHash, analysis_json: analysisJson, ats_score: atsScore, grammar_score: grammarScore, confidence_score: confidenceScore, eye_contact_score: eyeContactScore, emotion_summary: emotionSummary || {}, processing_time: processingTime, cache_hit: Boolean(cacheHit) };
  let { data, error } = await supabase.from('vision_analyses').insert(payload).select('*').single();
  if (isMissingResumeIdColumn(error)) {
    ({ data, error } = await supabase.from('vision_analyses').insert(withoutResumeId(payload)).select('*').single());
  }
  if (error) throw new DatabaseError(error.message);
  return data;
}

export async function getHistory(userId) {
  const { data, error } = await supabase.from('vision_analyses').select('*').eq('user_id', userId).order('created_at', { ascending: false });
  if (error && isMissingVisionAnalysesTable(error) && process.env.NODE_ENV === 'development') return [];
  if (error) throw new DatabaseError(error.message);
  return data;
}

function isMissingVisionAnalysesTable(error) {
  return error.code === 'PGRST205' || error.message?.includes("Could not find the table 'public.vision_analyses'");
}

export async function findAnalysisByHash(userId, resumeHash) {
  let query = supabase.from('vision_analyses').select('*').eq('resume_hash', resumeHash).order('created_at', { ascending: false }).limit(1);
  if (userId) query = query.eq('user_id', userId);
  const { data, error } = await query.maybeSingle();
  if (error) throw new DatabaseError(error.message);
  return data;
}

export async function getAnalysisById(userId, id) {
  const { data, error } = await supabase.from('vision_analyses').select('*').eq('id', id).eq('user_id', userId).maybeSingle();
  if (error) throw new DatabaseError(error.message);
  if (!data) throw new NotFoundError('Vision analysis not found');
  return data;
}

export async function deleteAnalysis(userId, id) {
  let { data: analysis, error: lookupError } = await supabase.from('vision_analyses').select('id,resume_id,storage_path').eq('id', id).eq('user_id', userId).maybeSingle();
  if (isMissingResumeIdColumn(lookupError)) {
    ({ data: analysis, error: lookupError } = await supabase.from('vision_analyses').select('id,storage_path').eq('id', id).eq('user_id', userId).maybeSingle());
  }
  if (lookupError) throw new DatabaseError(lookupError.message);
  if (!analysis) throw new NotFoundError('Vision analysis not found');
  let { data, error } = await supabase.from('vision_analyses').delete().eq('id', id).eq('user_id', userId).select('id,resume_id,storage_path').maybeSingle();
  if (isMissingResumeIdColumn(error)) {
    ({ data, error } = await supabase.from('vision_analyses').delete().eq('id', id).eq('user_id', userId).select('id,storage_path').maybeSingle());
  }
  if (error) throw new DatabaseError(error.message);
  if (!data) throw new NotFoundError('Vision analysis not found');
  if (analysis.resume_id) {
    const { error: resumeError } = await supabase.from('resumes').delete().eq('id', analysis.resume_id).eq('user_id', userId);
    if (resumeError) throw new DatabaseError(resumeError.message);
  } else if (analysis.storage_path) {
    const { error: resumeError } = await supabase.from('resumes').delete().eq('user_id', userId).eq('file_url', analysis.storage_path);
    if (resumeError) throw new DatabaseError(resumeError.message);
  }
  return analysis;
}

function withoutResumeId(payload) {
  const { resume_id: ignored, ...legacyPayload } = payload;
  return legacyPayload;
}

function isMissingResumeIdColumn(error) {
  return Boolean(error && (
    error.code === 'PGRST204'
    || error.code === '42703'
    || /resume_id.*does not exist|column .*resume_id/i.test(error.message || '')
  ));
}

export async function updateAnalysisScore(userId, id, analysisJson, atsScore, grammarScore) {
  const { data, error } = await supabase.from('vision_analyses').update({ analysis_json: analysisJson, ats_score: atsScore, grammar_score: grammarScore }).eq('id', id).eq('user_id', userId).select('*').single();
  if (error) throw new DatabaseError(error.message);
  return data;
}

export async function updateAnalysisReport(userId, id, { pdfUrl, processingTime }) {
  const { data, error } = await supabase.from('vision_analyses').update({ pdf_url: pdfUrl, processing_time: processingTime }).eq('id', id).eq('user_id', userId).select('*').single();
  if (error) throw new DatabaseError(error.message);
  return data;
}

export async function createCameraSession({ userId, interviewSessionId, targetRole }) {
  const { data, error } = await supabase.from('vision_interview_sessions').insert({ user_id: userId, interview_session_id: interviewSessionId || null, target_role: targetRole || null }).select('*').single();
  if (error) throw new DatabaseError(error.message);
  return data;
}

export async function findCameraSession(userId, id) {
  const { data, error } = await supabase.from('vision_interview_sessions').select('*').eq('id', id).eq('user_id', userId).maybeSingle();
  if (error) throw new DatabaseError(error.message);
  if (!data) throw new NotFoundError('Camera interview session not found');
  return data;
}

export async function saveCameraFrame({ userId, sessionId, frame }) {
  const { data, error } = await supabase.from('vision_interview_frames').insert({ user_id: userId, session_id: sessionId, timestamp_ms: frame.timestamp || Date.now(), face_present: frame.face_present, face_count: frame.face_count, landmarks: frame.landmarks, analytics: frame.analytics }).select('*').single();
  if (error) throw new DatabaseError(error.message);
  return data;
}

export async function completeCameraSession(userId, id, report) {
  const { data, error } = await supabase.from('vision_interview_sessions').update({ status: 'completed', ended_at: new Date().toISOString(), analytics: report.analytics, feedback: report.feedback }).eq('id', id).eq('user_id', userId).select('*').single();
  if (error) throw new DatabaseError(error.message);
  return data;
}

export async function listCameraFrames(userId, sessionId) {
  const { data, error } = await supabase.from('vision_interview_frames').select('*').eq('user_id', userId).eq('session_id', sessionId).order('timestamp_ms', { ascending: true });
  if (error) throw new DatabaseError(error.message);
  return data;
}
