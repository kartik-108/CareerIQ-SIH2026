import { cacheGet, cacheSet } from '../config/redis.js';
import { env } from '../config/env.js';
import { generateVisionJSON } from './ai/provider.js';
import { preprocessResumeFile } from '../utils/imagePreprocess.js';

const COMMON_MISSPELLINGS = new Map([
  ['teh', 'the'], ['recieve', 'receive'], ['seperate', 'separate'], ['occured', 'occurred'],
  ['definately', 'definitely'], ['acheive', 'achieve'], ['managment', 'management'],
  ['experiance', 'experience'], ['responsibilites', 'responsibilities'], ['enviroment', 'environment'],
]);

function normalizeText(text) {
  return String(text || '').replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim();
}

function countSyllables(word) {
  const normalized = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!normalized) return 0;
  const groups = normalized.match(/[aeiouy]+/g);
  return Math.max(1, groups ? groups.length - (normalized.endsWith('e') && groups.length > 1 ? 1 : 0) : 1);
}

export function analyzeGrammarText(text) {
  const normalized = normalizeText(text);
  const words = normalized.toLowerCase().match(/[a-z']+/g) || [];
  const sentences = normalized.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((sentence) => sentence.trim()).filter(Boolean) || [];
  const spellingErrors = [...new Set(words.filter((word) => COMMON_MISSPELLINGS.has(word)).map((word) => `${word} -> ${COMMON_MISSPELLINGS.get(word)}`))];
  const punctuationErrors = sentences.filter((sentence) => /[a-z0-9)]$/.test(sentence)).map((sentence) => 'Sentence is missing ending punctuation.');
  const longSentenceCount = sentences.filter((sentence) => sentence.split(/\s+/).length > 35).length;
  const wordCount = words.length;
  const sentenceCount = Math.max(1, sentences.length);
  const syllables = words.reduce((total, word) => total + countSyllables(word), 0);
  const readabilityScore = Math.max(0, Math.min(100, Math.round(206.835 - 1.015 * (wordCount / sentenceCount) - 84.6 * (syllables / Math.max(1, wordCount)))));
  const grammarIssues = [
    ...spellingErrors.map((error) => `Possible spelling error: ${error}`),
    ...punctuationErrors,
    ...(longSentenceCount ? [`${longSentenceCount} sentence(s) may be difficult to read.`] : []),
  ];
  const grammarScore = Math.max(0, Math.min(100, 100 - spellingErrors.length * 8 - punctuationErrors.length * 3 - longSentenceCount * 2));
  return {
    grammar_score: grammarScore,
    grammar_issues_count: grammarIssues.length,
    spelling_errors: spellingErrors,
    punctuation_errors: punctuationErrors,
    readability_score: readabilityScore,
    grammar_suggestions: grammarIssues.length ? ['Review the flagged spelling, punctuation, and sentence-length issues.'] : ['Grammar and punctuation look consistent.'],
    issues: grammarIssues,
    source: 'text',
    grammar_status: 'Available',
  };
}

const GRAMMAR_PROMPT = `Inspect the supplied resume image or PDF and return ONLY JSON with these keys: grammar_score (0-100), grammar_issues_count (integer), spelling_errors (string[]), punctuation_errors (string[]), readability_score (0-100), grammar_suggestions (string[]), issues (string[]). Analyze all columns and pages. Do not analyze ATS score. Use empty arrays when no issue is supported by the document.`;

function isQuotaError(error) {
  const status = error?.status ?? error?.response?.status;
  const message = `${String(error?.message || '')} ${JSON.stringify(error?.details || '')}`.toLowerCase();
  return status === 429 || message.includes('quota') || message.includes('resource exhausted') || message.includes('rate limit');
}

export async function analyzeResumeGrammar(file, resumeHash) {
  const cacheKey = `vision_grammar:${resumeHash}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return { ...cached, cached: true };
  try {
    if (file.mimetype === 'application/pdf') {
      const pdfParse = (await import('pdf-parse')).default;
      const parsed = await pdfParse(file.buffer);
      const result = analyzeGrammarText(parsed.text);
      await cacheSet(cacheKey, result, env.CACHE_TTL_RESUME_ANALYSIS);
      return result;
    }
    if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const mammoth = await import('mammoth');
      const parsed = await mammoth.extractRawText({ buffer: file.buffer });
      const result = analyzeGrammarText(parsed.value);
      await cacheSet(cacheKey, result, env.CACHE_TTL_RESUME_ANALYSIS);
      return result;
    }
    const prepared = await preprocessResumeFile(file);
    const result = (await generateVisionJSON(GRAMMAR_PROMPT, prepared.parts, { temperature: 0, feature: 'resumeGrammar' })).data;
    const normalized = {
      grammar_score: Math.max(0, Math.min(100, Number(result.grammar_score) || 0)),
      grammar_issues_count: Array.isArray(result.issues) ? result.issues.length : Number(result.grammar_issues_count) || 0,
      spelling_errors: Array.isArray(result.spelling_errors) ? result.spelling_errors : [],
      punctuation_errors: Array.isArray(result.punctuation_errors) ? result.punctuation_errors : [],
      readability_score: Math.max(0, Math.min(100, Number(result.readability_score) || 0)),
      grammar_suggestions: Array.isArray(result.grammar_suggestions) ? result.grammar_suggestions : [],
      issues: Array.isArray(result.issues) ? result.issues : [],
      source: 'vision',
      grammar_status: 'Available',
    };
    await cacheSet(cacheKey, normalized, env.CACHE_TTL_RESUME_ANALYSIS);
    return normalized;
  } catch (error) {
    return { grammar_score: null, grammar_issues_count: 0, spelling_errors: [], punctuation_errors: [], readability_score: null, grammar_suggestions: [], issues: [], grammar_status: 'Unavailable', grammar_reason: isQuotaError(error) ? 'Local AI request failed' : 'Grammar analysis unavailable', status: 'unavailable' };
  }
}
