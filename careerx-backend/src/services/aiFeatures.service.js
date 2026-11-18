import { generateJSON, generateText, generateEmbedding, generateVisionJSON } from './ai/provider.js';

export const generateTextResponse = (prompt, options = {}) => generateText(prompt, options);
export const generateJsonResponse = (prompt, options = {}) => generateJSON(prompt, options);
export const generateEmbeddingResponse = (text, options = {}) => generateEmbedding(text, options);
export const generateVisionJsonResponse = (prompt, parts = [], options = {}) => generateVisionJSON(prompt, parts, options);

export async function analyzeResumeATS(prompt, options = {}) {
  return generateJsonResponse(prompt, { ...options, feature: 'resumeAtsAnalysis' });
}

export async function analyzeSkillGap(prompt, options = {}) {
  return generateJsonResponse(prompt, { ...options, feature: 'skillGapAnalysis' });
}

export async function generateCareerRoadmap(prompt, options = {}) {
  return generateJsonResponse(prompt, { ...options, feature: 'careerRoadmap' });
}

export async function runMockInterview(prompt, options = {}) {
  return generateJsonResponse(prompt, { ...options, feature: 'mockInterview' });
}

export async function askCareerMentor(prompt, options = {}) {
  return generateTextResponse(prompt, { ...options, feature: 'careerMentorRAG' });
}

export async function explainJobRecommendation(prompt, options = {}) {
  return generateTextResponse(prompt, { ...options, feature: 'jobRecommendationExplanation' });
}
