import { uploadToBucket, buckets, supabase } from '../config/supabase.js';
import * as visionRepo from '../repositories/vision.repository.js';
import * as resumeRepo from '../repositories/resume.repository.js';
import { analyzeResumeVision, getResumeContentHash, RESUME_PARSER_VERSION } from './resumeVision.service.js';
import { logger } from '../config/logger.js';
import { generateResumePdfReport } from './visionReport.service.js';
import { cacheDel, cacheGet, cacheSet } from '../config/redis.js';
import { env } from '../config/env.js';
import { analyzeResumeGrammar } from './grammar.service.js';
import { ValidationError } from '../utils/ApiError.js';

export async function analyze(userId, file) {
  const start = Date.now();
  if (!file?.buffer?.length) throw new ValidationError('The uploaded resume is empty.');
  const previous = await visionRepo.getHistory(userId);
  const storagePath = await uploadToBucket(buckets.resumes, userId, file.originalname, file.buffer, file.mimetype);
  logger.info({ userId, storagePath }, 'vision storage upload success');
  const resume = await resumeRepo.createResume({ userId, fileUrl: storagePath, fileType: file.mimetype, originalFilename: file.originalname, version: 1 });
  const resumeHash = await getResumeContentHash(file);
  let result;
  try {
    result = await ensureGrammar(await analyzeResumeVision(file, { cacheScope: `${userId}:${resume.id}` }), file, resumeHash);
  } catch (error) {
    await supabase.from('resumes').delete().eq('id', resume.id).eq('user_id', userId);
    await supabase.storage.from(buckets.resumes).remove([storagePath]);
    throw error;
  }
  if (!result.raw_text?.trim()) {
    await supabase.from('resumes').delete().eq('id', resume.id).eq('user_id', userId);
    await supabase.storage.from(buckets.resumes).remove([storagePath]);
    throw new ValidationError('We could not extract readable text from this resume. Please upload a valid PDF, DOCX, or image.');
  }
  const analysisJson = { ...result, parser_version: RESUME_PARSER_VERSION, resumeHash, grammar_score: result.grammar?.grammar_score ?? null };
  await resumeRepo.updateResumeText(resume.id, analysisJson.raw_text || analysisJson.extraction?.raw_text || '');
  const saved = await visionRepo.saveAnalysis({ userId, resumeId: resume.id, resumeUrl: storagePath, storagePath, fileName: file.originalname, mimeType: file.mimetype, size: file.size, resumeHash, analysisJson, atsScore: analysisJson.ats_score.overall_score, grammarScore: analysisJson.grammar_score, confidenceScore: analysisJson.strength_analyzer?.confidence_score, processingTime: Date.now() - start, cacheHit: false });
  for (const old of previous) {
    if (old.id === saved.id) continue;
    await removeAnalysisArtifacts(userId, old.id);
  }
  return { ...analysisJson, id: saved.id, resumeId: resume.id, created_at: saved.created_at, resume_url: storagePath, cached: false };
}

async function ensureGrammar(analysisJson, file, resumeHash) {
  if (analysisJson.grammar && (analysisJson.grammar.grammar_score != null || analysisJson.grammar.grammar_status === 'Unavailable')) return { ...analysisJson, grammar_score: analysisJson.grammar.grammar_score ?? null, grammar_status: analysisJson.grammar.grammar_status, grammar_reason: analysisJson.grammar.grammar_reason };
  const grammar = await analyzeResumeGrammar(file, resumeHash);
  return { ...analysisJson, grammar, grammar_score: grammar.grammar_score, grammar_status: grammar.grammar_status, grammar_reason: grammar.grammar_reason };
}

// Additive fields: stored analyses from an earlier parser version are flagged so the UI can ask for a re-analysis.
function withParserStatus(row) {
  if (!row) return row;
  const version = row.analysis_json?.parser_version ?? null;
  return { ...row, parser_version: version, parser_is_current: version === RESUME_PARSER_VERSION };
}
export const getHistory = async (userId) => (await visionRepo.getHistory(userId)).map(withParserStatus);
export const getAnalysisById = async (userId, id) => withParserStatus(await visionRepo.getAnalysisById(userId, id));
export async function deleteAnalysis(userId, id) {
  const deleted = await removeAnalysisArtifacts(userId, id);
  return deleted;
}

async function removeAnalysisArtifacts(userId, id) {
  const deleted = await visionRepo.deleteAnalysis(userId, id);
  if (deleted.storage_path) {
    const { error } = await supabase.storage.from(buckets.resumes).remove([deleted.storage_path]);
    if (error) logger.warn({ userId, analysisId: id, err: error.message }, 'resume storage cleanup failed');
  }
  await cacheDel(`vision_report:${userId}:${id}`);
  return deleted;
}

export async function generateReport(userId, id) {
  const cacheKey = `vision_report:${userId}:${id}`;
  const cached = await cacheGet(cacheKey);
  if (cached) {
    logger.info({ userId, analysisId: id }, 'vision report cache hit');
    return { ...cached, cached: true };
  }
  const analysis = await visionRepo.getAnalysisById(userId, id);
  const report = await generateResumePdfReport(userId, { ...analysis.analysis_json, id: analysis.id });
  await visionRepo.updateAnalysisReport(userId, id, { pdfUrl: report.url, processingTime: report.processingTime || 0 });
  await cacheSet(cacheKey, report, env.CACHE_TTL_VISION_REPORT);
  logger.info({ userId, analysisId: id }, 'pdf generated');
  return report;
}
