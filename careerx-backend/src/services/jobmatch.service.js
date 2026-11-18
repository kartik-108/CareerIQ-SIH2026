import { generateJSON } from './ai/provider.js';
import { buildJobMatchPrompt } from '../prompts/jobmatch.prompt.js';
import * as resumeRepo from '../repositories/resume.repository.js';
import * as jobRepo from '../repositories/job.repository.js';
import * as visionRepo from '../repositories/vision.repository.js';
import { AIError } from '../utils/ApiError.js';
import { logger } from '../config/logger.js';

function normalizeMatch(result = {}) {
  const score = (value) => Math.max(0, Math.min(100, Number(value) || 0));
  return {
    ...result,
    ats_compatibility_score: score(result.ats_compatibility_score ?? result.match_percentage),
    resume_match_score: score(result.resume_match_score ?? result.match_percentage),
    keyword_match_score: score(result.keyword_match_score),
    technical_skills_match: score(result.technical_skills_match),
    soft_skills_match: score(result.soft_skills_match),
    experience_match: score(result.experience_match),
    education_match: score(result.education_match),
    projects_match: score(result.projects_match),
    certifications_match: score(result.certifications_match),
    match_percentage: score(result.match_percentage ?? result.resume_match_score),
    matching_keywords: Array.isArray(result.matching_keywords) ? result.matching_keywords : [],
    missing_keywords: Array.isArray(result.missing_keywords || result.missing_skills) ? (result.missing_keywords || result.missing_skills) : [],
    missing_skills: Array.isArray(result.missing_skills) ? result.missing_skills : [],
    resume_strengths: Array.isArray(result.resume_strengths) ? result.resume_strengths : [],
    resume_weaknesses: Array.isArray(result.resume_weaknesses) ? result.resume_weaknesses : [],
    priority_improvements: Array.isArray(result.priority_improvements) ? result.priority_improvements : [],
    action_verb_suggestions: Array.isArray(result.action_verb_suggestions) ? result.action_verb_suggestions : [],
    partial_matches: Array.isArray(result.partial_matches) ? result.partial_matches : [],
    resume_evidence: Array.isArray(result.resume_evidence) ? result.resume_evidence : [],
  };
}

function addDeterministicEvidence(result, resumeText, jobDescription) {
  const resumeLower = resumeText.toLowerCase();
  const jobTerms = [...new Set((jobDescription.match(/[a-z][a-z0-9+#./-]{2,}/gi) || []).map((term) => term.toLowerCase()))];
  const matched = jobTerms.filter((term) => resumeLower.includes(term));
  const matching = [...new Set(result.matching_keywords.filter((item) => matched.includes(String(item).toLowerCase()) || resumeLower.includes(String(item).toLowerCase())))];
  const missing = [...new Set(result.missing_keywords.filter((item) => !resumeLower.includes(String(item).toLowerCase())))];
  const evidence = matching.map((keyword) => {
    const line = resumeText.split(/\r?\n/).find((candidate) => candidate.toLowerCase().includes(String(keyword).toLowerCase()));
    return line ? { keyword, text: line.trim().slice(0, 240) } : null;
  }).filter(Boolean);
  return { ...result, matching_keywords: matching, missing_keywords: missing, resume_evidence: evidence };
}

async function generateMatch(resumeText, jobDescription) {
  const prompt = buildJobMatchPrompt({ resumeText, jobDescription });
  try {
    return normalizeMatch((await generateJSON(prompt, { feature: 'resumeJobMatch', temperature: 0.1 })).data);
  } catch (error) {
    logger.warn({ err: error.message }, 'AI job matching unavailable; using deterministic full-text matching');
    return deterministicMatch(resumeText, jobDescription);
  }
}

function deterministicMatch(resumeText, jobDescription) {
  const resume = String(resumeText || '');
  const resumeLower = resume.toLowerCase();
  const terms = [...new Set((String(jobDescription || '').match(/[a-z][a-z0-9+#./-]{2,}/gi) || [])
    .map((term) => term.toLowerCase())
    .filter((term) => !JOB_MATCH_STOP_WORDS.has(term)))];
  const matching = terms.filter((term) => resumeLower.includes(term));
  const missing = terms.filter((term) => !resumeLower.includes(term));
  const coverage = terms.length ? Math.round((matching.length / terms.length) * 100) : 0;
  return normalizeMatch({
    ats_compatibility_score: coverage,
    resume_match_score: coverage,
    keyword_match_score: coverage,
    technical_skills_match: coverage,
    soft_skills_match: coverage,
    experience_match: resumeLower.includes('experience') ? 100 : 0,
    education_match: resumeLower.includes('education') ? 100 : 0,
    projects_match: resumeLower.includes('project') ? 100 : 0,
    certifications_match: resumeLower.includes('certif') ? 100 : 0,
    match_percentage: coverage,
    matching_keywords: matching,
    missing_keywords: missing,
    missing_skills: missing,
    resume_strengths: matching.length ? [`Matched ${matching.length} job-description terms in the complete resume text.`] : [],
    resume_weaknesses: missing.length ? [`The resume does not contain ${missing.length} job-description terms.`] : [],
    priority_improvements: missing.slice(0, 8).map((term) => `Add relevant evidence for "${term}" only if it accurately reflects your experience.`),
    partial_matches: [],
    resume_evidence: [],
    summary_rewrite: 'Deterministic matching was used because the AI matching provider was unavailable.',
  });
}

const JOB_MATCH_STOP_WORDS = new Set([
  'and', 'the', 'for', 'with', 'from', 'this', 'that', 'your', 'you',
  'are', 'our', 'will', 'have', 'has', 'using', 'into', 'about', 'seeking',
  'candidate', 'role', 'job', 'years', 'year', 'work', 'working',
]);

export async function matchResumeToJob(userId, { resume_id, job_description, job_id }) {
  const resume = await resumeRepo.findResumeById(resume_id, userId);
  if (!resume.extracted_text) throw new AIError('Resume text not available yet');

  const result = await generateMatch(resume.extracted_text, job_description);

  return jobRepo.saveJobMatch({
    user_id: userId,
    job_id: job_id || null,
    resume_id,
    match_percentage: result.match_percentage,
    missing_skills: result.missing_skills,
    salary_estimate: result.salary_estimate,
    recommended_projects: result.recommended_projects,
    recommended_certifications: result.recommended_certifications,
    interview_probability: result.interview_probability,
  });
}

export async function matchVisionAnalysisToJob(userId, { analysis_id, job_description }) {
  const analysis = await visionRepo.getAnalysisById(userId, analysis_id);
  const resumeText = analysis.analysis_json?.raw_text || analysis.analysis_json?.extraction?.raw_text || '';
  if (!resumeText.trim()) throw new AIError('Resume analysis text is not available yet');
  const result = addDeterministicEvidence(await generateMatch(resumeText, job_description), resumeText, job_description);
  const saved = await jobRepo.saveResumeAnalysisMatch({ user_id: userId, analysis_id, job_description, report: result, ats_score: result.ats_compatibility_score });
  return { ...result, id: saved.id, analysis_id, created_at: saved.created_at };
}
