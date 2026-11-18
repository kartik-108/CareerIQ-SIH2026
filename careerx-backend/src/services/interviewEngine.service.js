import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { cacheGet, cacheSet } from '../config/redis.js';
import { generateJSON } from './ai/provider.js';
import { vectorSearch } from '../rag/vectorSearch.js';

const SUPPORTED_COMPANIES = new Set([
  'google', 'microsoft', 'amazon', 'meta', 'apple', 'adobe', 'tcs', 'infosys', 'accenture', 'generic',
]);

function cacheKey(topic, topK, similarityThreshold) {
  return `interview:knowledge:${crypto.createHash('sha1').update(JSON.stringify({ topic, topK, similarityThreshold })).digest('hex')}`;
}

export function getAdaptiveDifficulty(previousPerformance) {
  if (previousPerformance === null || previousPerformance === undefined || previousPerformance === '') return 'medium';
  const score = Number(previousPerformance);
  if (!Number.isFinite(score)) return 'medium';
  if (score >= 85) return 'hard';
  if (score >= 60) return 'medium';
  return 'beginner';
}

function normalizeCompany(company) {
  const value = String(company || 'generic').trim();
  return SUPPORTED_COMPANIES.has(value.toLowerCase()) ? value : 'Generic';
}

function normalizeQuestions(result) {
  const questions = Array.isArray(result?.questions) ? result.questions : result?.question ? [result] : [];
  return questions.map((question) => ({
    question: question.question || question.question_text || '',
    category: question.category || question.type || 'technical',
    type: question.type || question.category || 'Theory',
    difficulty: question.difficulty || 'medium',
    reasoning: question.reasoning || null,
  })).filter((question) => question.question);
}

export async function searchInterviewKnowledge(topic, {
  topK = env.RAG_TOP_K,
  similarityThreshold = env.RAG_SIMILARITY_THRESHOLD,
} = {}) {
  const normalizedTopic = String(topic || '').trim();
  if (!normalizedTopic) return { found: false, chunks: [], sources: [] };

  const key = cacheKey(normalizedTopic, topK, similarityThreshold);
  const cached = await cacheGet(key);
  if (cached) return cached;

  try {
    const chunks = (await vectorSearch(normalizedTopic, {
      topK,
      similarityThreshold,
    })).map((chunk) => ({
      content: chunk.content,
      similarity: Number(chunk.similarity),
      metadata: chunk.metadata || {},
      source: chunk.source_url || chunk.source || chunk.metadata?.source || null,
    }));
    const result = {
      found: chunks.length > 0,
      similarity: chunks[0]?.similarity ?? 0,
      chunks,
      sources: chunks.map(({ source, similarity }) => ({ source, similarity })),
    };
    await cacheSet(key, result, env.CACHE_TTL_RAG_ANSWER);
    return result;
  } catch (error) {
    logger.warn({ topic: normalizedTopic, err: error.message }, 'interview knowledge retrieval failed; continuing without retrieved context');
    return { found: false, chunks: [], sources: [] };
  }
}

function buildHybridPrompt({ topic, difficulty, company, role, previousPerformance, numberOfQuestions, knowledge }) {
  const companyStyle = company === 'Generic' ? 'a strong industry interview' : `${company} interview style`;
  const questionTypes = ['MCQ', 'Theory', 'Coding', 'Scenario Based', 'Behavioral', 'HR', 'Follow-up'];

  if (knowledge.found) {
    return `You are CareerIQ Interview AI. Use ONLY the provided interview knowledge as grounding. Do not copy sentences verbatim.
Generate ${numberOfQuestions} realistic ${companyStyle} questions for ${role || 'the candidate'} about ${topic}.
Difficulty: ${difficulty}
Previous performance: ${previousPerformance ?? 'not available'}
Question types to vary intelligently: ${questionTypes.join(', ')}
Context:
${knowledge.chunks.map((chunk, index) => `[${index + 1}] ${chunk.content}`).join('\n\n')}

Return JSON: {"questions":[{"question":string,"category":string,"type":string,"difficulty":"beginner"|"medium"|"hard","reasoning":string}]}`;
  }

  return `Generate ${numberOfQuestions} professional interview questions for ${topic || 'the requested interview topic'}.
Use ${companyStyle} quality and tailor them to the role "${role || 'candidate'}".
Difficulty: ${difficulty}
Previous performance: ${previousPerformance ?? 'not available'}
Vary these question types intelligently: ${questionTypes.join(', ')}.
Do not mention missing documents or retrieval.

Return JSON: {"questions":[{"question":string,"category":string,"type":string,"difficulty":"beginner"|"medium"|"hard","reasoning":string}]}`;
}

export async function generateHybridInterview({
  topic,
  difficulty,
  company,
  role,
  previousPerformance,
  numberOfQuestions = 1,
} = {}) {
  const normalizedTopic = String(topic || '').trim();
  if (!normalizedTopic) throw new Error('Interview topic is required');
  const selectedDifficulty = difficulty || getAdaptiveDifficulty(previousPerformance);
  const knowledge = await searchInterviewKnowledge(normalizedTopic);
  const promptOptions = {
    topic: normalizedTopic,
    difficulty: selectedDifficulty,
    company: normalizeCompany(company),
    role,
    previousPerformance,
    numberOfQuestions: Math.max(1, Math.min(Number(numberOfQuestions) || 1, 10)),
    knowledge,
  };
  let result;
  let mode = knowledge.found ? 'rag' : 'local';
  try {
    result = await generateJSON(buildHybridPrompt(promptOptions), {
      feature: knowledge.found ? 'hybridInterviewRAG' : 'hybridInterviewLocal',
    });
  } catch (error) {
    if (!knowledge.found) throw error;
    mode = 'local';
    logger.warn({ topic: normalizedTopic, err: error.message }, 'grounded interview generation failed; retrying without retrieved context');
    result = await generateJSON(buildHybridPrompt({ ...promptOptions, knowledge: { found: false, chunks: [] } }), {
      feature: 'hybridInterviewLocalRetry',
    });
  }
  const questions = normalizeQuestions(result.data);

  logger.info({
    mode: mode === 'rag' ? 'RAG' : 'Local AI',
    topic: normalizedTopic,
    chunksRetrieved: knowledge.chunks.length,
    similarity: knowledge.similarity,
  }, '[InterviewAI]');

  return {
    mode,
    questions,
    sources: knowledge.sources,
    similarity: knowledge.similarity,
    difficulty: selectedDifficulty,
  };
}

export async function evaluateInterviewAnswer({ question, answer }) {
  const result = await generateJSON(`Evaluate this interview answer professionally.
Question: ${question}
Answer: ${answer}

Return JSON exactly as:
{"score":number,"strengths":string[],"weaknesses":string[],"idealAnswer":string,"improvementTips":string[],"confidence_score":number,"grammar_score":number,"technical_score":number,"feedback":string}
Use score 0-10 for the answer and the other scores 0-100.`, { feature: 'interviewAnswerEvaluation' });
  const evaluation = result.data;
  const fillerWordCount = (String(answer).toLowerCase().match(/\b(um|uh|like|you know|basically)\b/g) || []).length;
  return {
    score: Number(evaluation.score ?? 0),
    strengths: evaluation.strengths || [],
    weaknesses: evaluation.weaknesses || [],
    idealAnswer: evaluation.idealAnswer || '',
    improvementTips: evaluation.improvementTips || [],
    confidence_score: Number(evaluation.confidence_score ?? 0),
    grammar_score: Number(evaluation.grammar_score ?? 0),
    technical_score: Number(evaluation.technical_score ?? (Number(evaluation.score ?? 0) * 10)),
    answer_quality_score: Number(evaluation.score ?? 0) * 10,
    filler_word_count: fillerWordCount,
    feedback: evaluation.feedback || evaluation.improvementTips?.join(' ') || '',
  };
}

export function buildInterviewAnalytics(evaluations = []) {
  const answered = evaluations.filter(Boolean);
  if (!answered.length) return { accuracy: 0, confidence: 0, communication: 0, technical_depth: 0, weak_topics: [], recommended_next_topic: null };
  const average = (key) => Math.round(answered.reduce((sum, item) => sum + Number(item[key] || 0), 0) / answered.length);
  const weakTopics = answered.filter((item) => Number(item.score) < 6).flatMap((item) => item.weaknesses || []).slice(0, 5);
  return {
    accuracy: average('answer_quality_score'),
    confidence: average('confidence_score'),
    communication: average('grammar_score'),
    technical_depth: average('technical_score'),
    weak_topics: weakTopics,
    recommended_next_topic: weakTopics[0] || null,
  };
}