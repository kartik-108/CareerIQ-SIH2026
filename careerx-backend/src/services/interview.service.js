import { generateJSON } from './ai/provider.js';
import {
  buildInterviewReportPrompt,
} from '../prompts/interview.prompt.js';
import * as interviewRepo from '../repositories/interview.repository.js';
import { NotFoundError } from '../utils/ApiError.js';
import {
  buildInterviewAnalytics,
  evaluateInterviewAnswer,
  generateHybridInterview,
  getAdaptiveDifficulty,
} from './interviewEngine.service.js';
import { supabase } from '../config/supabase.js';
import { awardXP, unlockBadge, recordActivityForStreak } from './achievement.service.js';
import { generateInterviewQuestion, evaluateInterviewAnswer as evaluateStudioAnswer, generateInterviewReport } from './interviewAi.service.js';
import { logger } from '../config/logger.js';

const TYPE_LIMITS = { Technical: 8, Behavioral: 6, HR: 5, Mixed: 10, Aptitude: 6, 'Company Specific': 6 };
const normalizeType = (value) => String(value || 'Technical').toLowerCase().replace(/\s+/g, '_');

async function getResumeText(userId) {
  const { data } = await supabase.from('resumes').select('extracted_text').eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle();
  return data?.extracted_text || '';
}

export async function getStatus(userId) { return { activeSession: await interviewRepo.findActiveSession(userId) }; }
export async function getHistory(userId) { return interviewRepo.listHistory(userId); }

export async function startStudioInterview(userId, { targetRole, interviewType, userName }) {
  if (!userId || !targetRole || !interviewType) throw new Error('Interview type and target role are required');
  const session = await interviewRepo.createSession({ userId, interviewType: normalizeType(interviewType), targetRole, topic: targetRole, numberOfQuestions: TYPE_LIMITS[interviewType] || 6 });
  const question = await createStudioQuestion(session, userId, 1, userName);
  logger.info({ sessionId: session.id, userId, provider: question.provider || 'unknown' }, '[Interview] session created and question generated');
  return { sessionId: session.id, session, question };
}

async function createStudioQuestion(session, userId, questionNumber, userName = '') {
  const previousAnswers = await interviewRepo.listAnswers(session.id);
  const result = await generateInterviewQuestion({ interviewType: session.interview_type, targetRole: session.target_role, resumeText: await getResumeText(userId), previousQA: previousAnswers.map((answer) => ({ question: answer.question, transcript: answer.transcript, score: answer.score || answer.answer_quality_score })), questionNumber, userName });
  const question = await interviewRepo.addQuestion({ sessionId: session.id, questionText: result.question, order: questionNumber, category: result.category || result.type || session.interview_type, difficulty: result.difficulty });
  return { ...question, provider: result.provider || 'unknown', spokenIntro: result.spokenIntro || '', expectedTopics: result.expectedTopics || [], followUpHint: result.followUpHint || '' };
}

export async function nextStudioQuestion(sessionId, userId) {
  const session = await interviewRepo.findSession(sessionId, userId);
  const questions = await interviewRepo.listQuestions(sessionId);
  const answers = await interviewRepo.listAnswers(sessionId);
  if (questions.length >= Number(session.number_of_questions || 6) || answers.length >= Number(session.number_of_questions || 6)) return null;
  return createStudioQuestion(session, userId, questions.length + 1);
}

export async function submitStudioAnswer(sessionId, userId, { questionNumber, transcript, visionMetrics = {}, speechMetrics = {} }) {
  await interviewRepo.findSession(sessionId, userId);
  const questions = await interviewRepo.listQuestions(sessionId);
  const question = questions.find((item) => item.question_order === Number(questionNumber)) || questions.at(-1);
  if (!question) throw new NotFoundError('Question not found in this session');
  const evaluation = await evaluateStudioAnswer({ question: { question: question.question_text, type: question.category }, transcript, resumeText: await getResumeText(userId), visionMetrics, speechMetrics });
  const answer = await interviewRepo.saveAnswer({ question_id: question.id, session_id: sessionId, question_number: question.question_order, question: question.question_text, transcript, ai_feedback: evaluation, score: evaluation.score, fillers: { count: evaluation.fillers }, speaking_speed: speechMetrics.wordsPerMinute || speechMetrics.speakingPace || null, eye_contact: visionMetrics.eyeContact || visionMetrics.eye_contact || null, posture: visionMetrics.posture || null, confidence: evaluation.confidence, filler_word_count: evaluation.fillers, confidence_score: evaluation.confidence, grammar_score: evaluation.communication, answer_quality_score: evaluation.score });
  return { answer, feedback: evaluation };
}

export async function endStudioInterview(sessionId, userId) {
  const session = await interviewRepo.findSession(sessionId, userId);
  const answers = await interviewRepo.listAnswers(sessionId);
  const metrics = answers.reduce((accumulator, answer) => ({ eyeContact: accumulator.eyeContact + Number(answer.eye_contact || 0), posture: accumulator.posture + Number(answer.posture || 0) }), { eyeContact: 0, posture: 0 });
  if (answers.length) { metrics.eyeContact = Math.round(metrics.eyeContact / answers.length); metrics.posture = Math.round(metrics.posture / answers.length); }
  const report = await generateInterviewReport({ targetRole: session.target_role, interviewType: session.interview_type, answers: answers.map((answer) => answer.ai_feedback || answer), metrics });
  await interviewRepo.updateSessionMetadata(sessionId, { duration: Math.max(0, Math.round((Date.now() - new Date(session.started_at).getTime()) / 1000)), overall_score: report.overall_score, confidence_score: report.confidence_score, communication_score: report.communication_score, posture_score: report.posture_score, eye_contact_score: report.eye_contact_score, technical_score: report.technical_score });
  const savedReport = await interviewRepo.saveReport({ session_id: sessionId, user_id: userId, overall_score: report.overall_score, communication_score: report.communication_score, confidence_score: report.confidence_score, technical_score: report.technical_score, strengths: report.strengths, weaknesses: report.weaknesses, feedback: (report.suggestions || []).join(' '), report });
  await interviewRepo.endSession(sessionId);
  await awardXP(userId, Number(report.xp_earned || 50));
  await unlockBadge(userId, 'first_interview');
  await recordActivityForStreak(userId);
  const { data: latestDna } = await supabase.from('career_dna').select('id').eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (latestDna?.id) await supabase.from('career_dna').update({ communication: report.communication_score, leadership: report.confidence_score, growth_opportunities: report.suggestions || [] }).eq('id', latestDna.id);
  return { ...report, sessionId, reportId: savedReport.id };
}

export async function getInterviewReport(sessionId, userId) { return interviewRepo.findReport(sessionId, userId); }

export async function startInterview(userId, { interview_type, target_role, company_name, difficulty, number_of_questions }) {
  const session = await interviewRepo.createSession({
    userId,
    interviewType: interview_type,
    targetRole: target_role,
    companyName: company_name,
    topic: target_role,
    difficulty,
    numberOfQuestions: number_of_questions,
  });

  const firstQuestion = await nextQuestion(session.id, userId);
  return { session, first_question: firstQuestion };
}

export async function nextQuestion(sessionId, userId) {
  const session = await interviewRepo.findSession(sessionId, userId);
  const existingQuestions = await interviewRepo.listQuestions(sessionId);
  const existingAnswers = await interviewRepo.listAnswers(sessionId);

  const previousQA = existingQuestions.map((q) => {
    const answer = existingAnswers.find((a) => a.question_id === q.id);
    return {
      question: q.question_text,
      category: q.category,
      difficulty: q.difficulty,
      answer_quality_score: answer?.answer_quality_score ?? null,
    };
  });

  const previousPerformance = previousQA.at(-1)?.answer_quality_score;
  const hybrid = await generateHybridInterview({
    topic: session.topic || session.target_role,
    difficulty: getAdaptiveDifficulty(previousPerformance),
    company: session.company_name,
    role: session.target_role,
    previousPerformance,
    numberOfQuestions: 1,
  });
  const result = hybrid.questions[0];
  if (!result) throw new Error('Interview AI did not return a question');
  await interviewRepo.updateSessionMetadata(sessionId, { mode: hybrid.mode, difficulty: hybrid.difficulty });

  return interviewRepo.addQuestion({
    sessionId,
    questionText: result.question,
    order: existingQuestions.length + 1,
    category: result.type || result.category,
    difficulty: result.difficulty,
  });
}

export async function submitAnswer(sessionId, userId, { question_id, transcript, time_taken_seconds }) {
  const session = await interviewRepo.findSession(sessionId, userId);
  const questions = await interviewRepo.listQuestions(sessionId);
  const question = questions.find((q) => q.id === question_id);
  if (!question) throw new NotFoundError('Question not found in this session');

  const scoring = await evaluateInterviewAnswer({ question: question.question_text, answer: transcript });

  const answer = await interviewRepo.saveAnswer({
    question_id,
    session_id: sessionId,
    transcript,
    filler_word_count: scoring.filler_word_count,
    confidence_score: scoring.confidence_score,
    grammar_score: scoring.grammar_score,
    answer_quality_score: scoring.answer_quality_score,
    time_taken_seconds: time_taken_seconds || null,
  });

  return { answer, feedback: scoring.feedback, session_status: session.status };
}

export async function endInterviewAndGenerateReport(sessionId, userId) {
  const session = await interviewRepo.findSession(sessionId, userId);
  const questions = await interviewRepo.listQuestions(sessionId);
  const answers = await interviewRepo.listAnswers(sessionId);
  const analytics = buildInterviewAnalytics(answers.map((answer) => ({
    score: Number(answer.answer_quality_score || 0) / 10,
    answer_quality_score: answer.answer_quality_score,
    confidence_score: answer.confidence_score,
    grammar_score: answer.grammar_score,
    technical_score: answer.answer_quality_score,
  })));
  await interviewRepo.updateSessionMetadata(sessionId, { analytics });

  const qaPairs = questions.map((q) => {
    const a = answers.find((ans) => ans.question_id === q.id);
    return {
      question: q.question_text,
      category: q.category,
      difficulty: q.difficulty,
      transcript: a?.transcript ?? null,
      scores: a
        ? {
            confidence: a.confidence_score,
            grammar: a.grammar_score,
            quality: a.answer_quality_score,
          }
        : null,
    };
  });

  const prompt = buildInterviewReportPrompt({
    interviewType: session.interview_type,
    targetRole: session.target_role,
    qaPairs,
  });
  const result = (await generateJSON(prompt)).data;

  await interviewRepo.endSession(sessionId);

  return interviewRepo.saveReport({
    session_id: sessionId,
    user_id: userId,
    overall_score: result.overall_score,
    communication_score: result.communication_score,
    confidence_score: result.confidence_score,
    technical_score: result.technical_score,
    strengths: result.strengths,
    weaknesses: result.weaknesses,
    feedback: result.feedback,
    raw_ai_response: result,
  });
}
