import crypto from 'node:crypto';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { uploadToBucket, buckets, getSignedUrl } from '../config/supabase.js';
import { generateVisionJSON } from './ai/provider.js';
import { preprocessResumeFile } from '../utils/imagePreprocess.js';
import * as artifactRepo from '../repositories/visionArtifact.repository.js';

const PROMPTS = {
  certificate: `Inspect this certificate image or PDF and return ONLY JSON with these keys: certificate_name, issuer, issue_date, expiry_date, credential_id, skills (string[]), organization, description, confidence_score (0-100), career_value, matching_job_roles (string[]), relevance_score (0-100). Use empty values when evidence is absent and never invent facts.`,
  portfolio: `Inspect this portfolio PDF or screenshot and return ONLY JSON with these keys: projects (array of objects with title, description, links, technologies), tech_stack (string[]), frameworks (string[]), languages (string[]), ui_quality_score (0-100), github_links (string[]), portfolio_links (string[]), experience (string[]), achievements (string[]), portfolio_score (0-100), technical_score (0-100), project_quality_score (0-100), readability_score (0-100), design_consistency_score (0-100), missing_projects (string[]), improvement_suggestions (string[]), recommended_projects (string[]), recommended_technologies (string[]), career_readiness_score (0-100). Use empty values when evidence is absent and never invent facts.`,
};

function scoreFor(type, analysis) {
  return type === 'certificate' ? Number(analysis.relevance_score || analysis.confidence_score || 0) : Number(analysis.portfolio_score || 0);
}

export async function analyze(userId, type, file) {
  const fileHash = crypto.createHash('sha256').update(file.buffer).digest('hex');
  const existing = await artifactRepo.findByHash(userId, type, fileHash);
  if (existing) return { ...existing.analysis_json, id: existing.id, created_at: existing.created_at, file_name: existing.file_name, cached: true };
  const prepared = await preprocessResumeFile(file);
  const result = (await generateVisionJSON(PROMPTS[type], prepared.parts, { feature: `document${type}` })).data;
  const storagePath = await uploadToBucket(buckets.resumes, userId, `${type}-${file.originalname}`, file.buffer, file.mimetype);
  const saved = await artifactRepo.saveArtifact({ userId, type, fileUrl: storagePath, storagePath, fileName: file.originalname, mimeType: file.mimetype, size: file.size, fileHash, analysisJson: result, score: scoreFor(type, result) });
  return { ...result, id: saved.id, created_at: saved.created_at, file_name: saved.file_name };
}

export const history = (userId, type) => artifactRepo.listArtifacts(userId, type);
export const getById = (userId, type, id) => artifactRepo.getArtifact(userId, id, type);
export const remove = (userId, type, id) => artifactRepo.deleteArtifact(userId, id, type);

export async function report(userId, type, id) {
  const artifact = await artifactRepo.getArtifact(userId, id, type);
  const document = await PDFDocument.create();
  const page = document.addPage([595, 842]);
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const navy = rgb(0.05, 0.07, 0.14);
  page.drawText('CareerIQ', { x: 42, y: 795, size: 22, font: bold, color: navy });
  page.drawText(`${type === 'certificate' ? 'Certificate' : 'Portfolio'} Analysis Report`, { x: 42, y: 770, size: 16, font: bold, color: navy });
  page.drawText(artifact.file_name, { x: 42, y: 742, size: 11, font: regular, color: navy });
  const lines = JSON.stringify(artifact.analysis_json, null, 2).replace(/[^\u0000-\u007F]/g, '').split('\n');
  lines.slice(0, 48).forEach((line, index) => page.drawText(line.slice(0, 105), { x: 42, y: 710 - index * 14, size: 9, font: regular, color: navy }));
  const bytes = await document.save();
  const filename = `vision-${type}-report-${artifact.id}.pdf`;
  const storagePath = await uploadToBucket(buckets.reports, userId, filename, Buffer.from(bytes), 'application/pdf');
  return { storagePath, url: await getSignedUrl(buckets.reports, storagePath, 86400), bytes: bytes.length };
}
