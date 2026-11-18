import { supabase } from '../config/supabase.js';
import { DatabaseError, NotFoundError } from '../utils/ApiError.js';

export async function createSession({ userId, interviewType, targetRole, companyName, topic, difficulty, numberOfQuestions }) {
  const { data, error } = await supabase
    .from('interview_sessions')
    .insert({
      user_id: userId,
      interview_type: interviewType,
      target_role: targetRole,
      company_name: companyName,
      topic: topic || targetRole,
      difficulty: difficulty || 'medium',
      number_of_questions: numberOfQuestions || 1,
    })
    .select('*')
    .single();
  if (error) throw new DatabaseError(error.message);
  return data;
}

export async function updateSessionMetadata(sessionId, metadata) {
  const { data, error } = await supabase
    .from('interview_sessions')
    .update(metadata)
    .eq('id', sessionId)
    .select('*')
    .single();
  if (error) throw new DatabaseError(error.message);
  return data;
}

export async function findActiveSession(userId) {
  const { data, error } = await supabase
    .from('interview_sessions')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'in_progress')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new DatabaseError(error.message);
  return data;
}

export async function listHistory(userId) {
  const { data, error } = await supabase
    .from('interview_sessions')
    .select('*, interview_reports(*)')
    .eq('user_id', userId)
    .order('started_at', { ascending: false })
    .limit(20);
  if (error) throw new DatabaseError(error.message);
  return data || [];
}

export async function findSession(sessionId, userId) {
  const { data, error } = await supabase
    .from('interview_sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new DatabaseError(error.message);
  if (!data) throw new NotFoundError('Interview session not found');
  return data;
}

export async function endSession(sessionId) {
  const { error } = await supabase
    .from('interview_sessions')
    .update({ status: 'completed', ended_at: new Date().toISOString() })
    .eq('id', sessionId);
  if (error) throw new DatabaseError(error.message);
}

export async function addQuestion({ sessionId, questionText, order, category, difficulty }) {
  const { data, error } = await supabase
    .from('interview_questions')
    .insert({ session_id: sessionId, question_text: questionText, question_order: order, category, difficulty })
    .select('*')
    .single();
  if (error) throw new DatabaseError(error.message);
  return data;
}

export async function listQuestions(sessionId) {
  const { data, error } = await supabase
    .from('interview_questions')
    .select('*')
    .eq('session_id', sessionId)
    .order('question_order', { ascending: true });
  if (error) throw new DatabaseError(error.message);
  return data;
}

export async function saveAnswer(answer) {
  const { data, error } = await supabase.from('interview_answers').upsert(answer, { onConflict: 'session_id,question_number' }).select('*').single();
  if (error) throw new DatabaseError(error.message);
  return data;
}

export async function listAnswers(sessionId) {
  const { data, error } = await supabase
    .from('interview_answers')
    .select('*, interview_questions(question_text, category, difficulty)')
    .eq('session_id', sessionId);
  if (error) throw new DatabaseError(error.message);
  return data;
}

export async function saveReport(report) {
  const sessionId = report.interview_session_id || report.session_id;
  const normalizedReport = {
    ...report,
    session_id: report.session_id || sessionId,
    interview_session_id: sessionId,
    score: report.score ?? report.overall_score ?? 0,
    summary: report.summary ?? {},
    strengths: report.strengths ?? [],
    improvements: report.improvements ?? report.weaknesses ?? [],
    speech_metrics: report.speech_metrics ?? report.speech ?? {},
    vision_metrics: report.vision_metrics ?? {},
    report: report.report ?? {},
  };
  const { data, error } = await supabase.from('interview_reports').upsert(normalizedReport, { onConflict: 'session_id' }).select('*').single();
  if (error) throw new DatabaseError(error.message);
  return data;
}

export async function findReport(sessionId, userId) {
  const { data, error } = await supabase.from('interview_reports').select('*').eq('session_id', sessionId).eq('user_id', userId).maybeSingle();
  if (error) throw new DatabaseError(error.message);
  if (!data) throw new NotFoundError('Interview report not found');
  return data;
}
