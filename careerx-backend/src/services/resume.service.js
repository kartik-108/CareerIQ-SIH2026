import crypto from 'node:crypto';
import { uploadToBucket, buckets, getSignedUrl } from '../config/supabase.js';
import { generateJSON } from './ai/provider.js';
import { buildResumeAnalysisPrompt } from '../prompts/resume.prompt.js';
import * as resumeRepo from '../repositories/resume.repository.js';
import { cacheGet, cacheSet } from '../config/redis.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { AIError } from '../utils/ApiError.js';
import { calculateATSScore, normalizeResumeExtraction } from './resumeVision.service.js';
import { visionExtractionSchema } from '../validators/vision.validator.js';

async function extractText(buffer, mimetype) {
  if (mimetype === 'application/pdf') {
    const pdfParse = (await import('pdf-parse')).default;
    const parsed = await pdfParse(buffer);
    return parsed.text;
  }
  if (mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const mammoth = await import('mammoth');
    const parsed = await mammoth.extractRawText({ buffer });
    return parsed.value;
  }
  // For image resumes (PNG/JPEG), a full local OCR pipeline is still needed for
  // Tesseract) would go here. Kept as an explicit extension point.
  throw new AIError('Image resume OCR not yet implemented — upload a PDF for now.');
}

export async function uploadResume(userId, file) {
  const path = await uploadToBucket(buckets.resumes, userId, file.originalname, file.buffer, file.mimetype);
  const resume = await resumeRepo.createResume({
    userId,
    fileUrl: path,
    fileType: file.mimetype,
    originalFilename: file.originalname,
    version: 1,
  });

  try {
    const text = await extractText(file.buffer, file.mimetype);
    await resumeRepo.updateResumeText(resume.id, text);
    resume.extracted_text = text;
  } catch (err) {
    // Upload succeeds even if extraction fails; analysis can be retried later.
    resume.status = 'failed';
  }

  return resume;
}

export async function getResumeDownloadUrl(userId, resumeId) {
  const resume = await resumeRepo.findResumeById(resumeId, userId);
  return getSignedUrl(buckets.resumes, resume.file_url);
}

export async function analyzeResume(userId, resumeId, targetRole) {
  const resume = await resumeRepo.findResumeById(resumeId, userId);
  if (!resume.extracted_text) {
    throw new AIError('Resume text has not been extracted yet. Re-upload as a PDF.');
  }

  const normalizedText = resume.extracted_text.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
  const resumeHash = crypto.createHash('sha256').update(normalizedText).digest('hex');
  const cacheKey = `resume_analysis_deterministic:resume-studio-v3:${userId}:${resumeId}:${targetRole || 'general'}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return cached;

  const prompt = buildResumeAnalysisPrompt({ resumeText: resume.extracted_text, targetRole });
  let aiUsed = true;
  let parsedData;
  try {
    const raw = (await generateJSON(prompt, {
      temperature: 0,
      maxTokens: 1200,
      contextTokens: 4096,
      feature: 'resumeStructuredExtraction',
    })).data;
    const parsed = visionExtractionSchema.safeParse(raw);
    if (!parsed.success) {
      throw new AIError('AI returned an unexpected resume analysis shape', parsed.error.flatten());
    }
    parsedData = parsed.data;
  } catch (error) {
    aiUsed = false;
    logger.warn({ err: error?.code || error?.message, resumeId }, 'resume AI analysis unavailable; using deterministic extraction');
  }

  const extraction = normalizeResumeExtraction(parsedData || {}, resume.extracted_text);
  const ats = calculateATSScore({ extraction, raw_text: resume.extracted_text });
  logger.info({ resumeHash, cacheHit: false, scoreRecalculated: true, categories: ats.categories, atsScore: ats.overall_score }, 'resume ATS score returned');
  const analysis = await resumeRepo.saveResumeAnalysis({
    resume_id: resumeId,
    user_id: userId,
    overall_score: ats.overall_score,
    ats_score: ats.overall_score,
    grammar: null,
    technical_skills: extraction.skills,
    soft_skills: extraction.soft_skills,
    missing_keywords: extraction.ats_keywords_missing,
    strong_keywords: extraction.ats_keywords_found,
    education: extraction.education,
    projects: extraction.projects,
    experience: extraction.experience,
    improvements: extraction.improvements,
    summary: extraction.summary,
    raw_ai_response: { extraction, ats_score: ats, resume_hash: resumeHash, ai_used: aiUsed },
  });

  await cacheSet(cacheKey, analysis, env.CACHE_TTL_RESUME_ANALYSIS);
  return analysis;
}

export async function listResumes(userId) {
  return resumeRepo.listResumesByUser(userId);
}

export async function getLatestAnalysis(userId, resumeId) {
  await resumeRepo.findResumeById(resumeId, userId);
  return resumeRepo.getLatestAnalysis(resumeId, userId);
}
