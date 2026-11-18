import { generateJSON } from './ai/provider.js';
import { buildInterviewStudioEvaluationPrompt, buildInterviewStudioQuestionPrompt, buildInterviewStudioReportPrompt } from '../prompts/interview.prompt.js';
import { logger } from '../config/logger.js';

const clamp = (value, fallback = 0) => Math.max(0, Math.min(100, Number.isFinite(Number(value)) ? Number(value) : fallback));
const QUESTION_BANK = {
  frontend: ['How would you improve the performance and accessibility of a React application?', 'How do you decide what belongs in component state versus server state?'],
  backend: ['How would you design a reliable REST API for a growing product?', 'How do you diagnose a slow database-backed endpoint?'],
  'full stack': ['Describe how you would trace a request from the browser through the API to the database.', 'How do you keep frontend and backend contracts reliable?'],
  'data science': ['How would you validate that a machine learning model generalizes beyond its training data?', 'Tell me about a data project where your analysis changed a decision.'],
  'ai/ml': ['How would you evaluate an AI feature before releasing it to users?', 'What steps would you take when a model performs well offline but poorly in production?'],
  java: ['How do you handle concurrency and resource management in a Java service?', 'How would you structure tests for a Java API?'],
  python: ['How would you make a Python service observable and production-ready?', 'How do you profile and improve a slow Python function?'],
  devops: ['How would you design a deployment pipeline with safe rollback?', 'How do you investigate a failing production deployment?'],
};

function localQuestion(input) {
  const role = String(input.targetRole || '').toLowerCase();
  const key = Object.keys(QUESTION_BANK).find((candidate) => role.includes(candidate)) || 'backend';
  const questions = QUESTION_BANK[key];
  return { question: questions[(Number(input.questionNumber || 1) - 1) % questions.length], spokenIntro: input.questionNumber === 1 ? `Hi${input.userName ? ` ${input.userName}` : ''}, thanks for joining. Shall we begin?` : 'Thanks, that is helpful context.', type: input.interviewType, category: input.interviewType, difficulty: input.difficulty || 'Easy', expectedTopics: ['reasoning', 'communication', 'impact'], followUpHint: 'Ask for a concrete example and measurable result.', provider: 'local', offline: true };
}

export async function generateInterviewQuestion(input) {
  const fallback = localQuestion(input);
  try {
    const aiRequest = generateJSON(buildInterviewStudioQuestionPrompt(input), { feature: 'interviewStudioQuestion', timeout: 15000 }).catch((error) => { logger.warn({ err: error.stack, role: input.targetRole }, '[Interview] AI question failed; using local question'); return { data: fallback }; });
    const result = await Promise.race([aiRequest, new Promise((resolve) => setTimeout(() => resolve({ data: fallback }), 1200))]);
    if (!result.data?.question) throw new Error('Question was empty');
    return { ...result.data, provider: result.provider || (result.data.provider || 'local'), spokenIntro: result.data.spokenIntro || result.data.spoken_intro || '', expectedTopics: result.data.expectedTopics || result.data.expected_topics || [], followUpHint: result.data.followUpHint || result.data.follow_up_hint || '' };
  } catch (error) {
    logger.warn({ err: error.stack, role: input.targetRole }, '[Interview] AI unavailable; using local question bank');
    return fallback;
  }
}

export async function evaluateInterviewAnswer(input) {
  const transcript = String(input.transcript || '').trim();
  const fillers = (transcript.toLowerCase().match(/\b(um|uh|like|basically|actually|literally)\b/g) || []).length;
  try {
    const result = await generateJSON(buildInterviewStudioEvaluationPrompt(input), { feature: 'interviewStudioAnswer', timeout: 15000 });
    const evaluation = result.data || {};
    return { score: clamp(evaluation.score), technical: clamp(evaluation.technical, evaluation.score), communication: clamp(evaluation.communication, evaluation.score), confidence: clamp(evaluation.confidence, input.speechMetrics?.confidence), strengths: evaluation.strengths || [], improvements: evaluation.improvements || [], followupQuestion: evaluation.followupQuestion || '', fillers };
  } catch {
    const words = transcript ? transcript.split(/\s+/).length : 0;
    const localScore = clamp(Math.round(Math.min(90, words * 2.5) - fillers * 4));
    return { score: localScore, technical: localScore, communication: clamp(input.speechMetrics?.clarityScore, localScore), confidence: clamp(input.visionMetrics?.confidence, localScore), strengths: words > 20 ? ['You gave a substantive response.'] : [], improvements: fillers ? [`Reduce filler words (${fillers} detected).`] : ['Add a concrete example and measurable outcome.'], followupQuestion: '', fillers, offline: true };
  }
}

export async function generateInterviewReport(input) {
  try {
    const result = await generateJSON(buildInterviewStudioReportPrompt(input), { feature: 'interviewStudioReport', timeout: 15000 });
    return normalizeReport(result.data, input);
  } catch {
    const answers = input.answers || [];
    const average = (key) => answers.length ? Math.round(answers.reduce((sum, answer) => sum + Number(answer[key] || 0), 0) / answers.length) : 0;
    const overall = average('score');
    return { overall_score: overall, confidence_score: average('confidence'), communication_score: average('communication'), technical_score: average('technical'), problem_solving_score: overall, eye_contact_score: Number(input.metrics?.eyeContact || input.metrics?.eye_contact || 0), posture_score: Number(input.metrics?.posture || 0), grammar_score: average('communication'), speech: input.metrics?.speech || {}, strengths: answers.flatMap((answer) => answer.strengths || []).slice(0, 5), weaknesses: answers.flatMap((answer) => answer.improvements || []).slice(0, 5), suggestions: ['Practice one answer aloud while keeping your pace steady.', 'Use a concise situation, action, result structure.'], improvement_roadmap: ['Review missed concepts.', 'Practice a timed answer.', 'Repeat with a harder role question.'], recommended_next_interview: overall >= 75 ? 'Hard' : 'Medium', readiness: overall >= 80 ? 'Interview ready' : 'Keep practicing', xp_earned: 50, badge: overall >= 90 ? 'Technical Standout' : 'Interview Practice Complete', offline: true };
  }
}

function normalizeReport(report = {}, input) {
  return { ...report, overall_score: clamp(report.overall_score), confidence_score: clamp(report.confidence_score), communication_score: clamp(report.communication_score), posture_score: clamp(report.posture_score, input.metrics?.posture), eye_contact_score: clamp(report.eye_contact_score, input.metrics?.eyeContact), technical_score: clamp(report.technical_score), speech: report.speech || input.metrics?.speech || {}, strengths: report.strengths || [], weaknesses: report.weaknesses || [], suggestions: report.suggestions || [], xp_earned: Number(report.xp_earned || 50), badge: report.badge || 'Interview Practice Complete' };
}
