import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { uploadToBucket, buckets, getSignedUrl } from '../config/supabase.js';

function safeText(value) { return String(value || '').replace(/[^\u0000-\u007F]/g, ''); }

function drawWrapped(page, text, x, y, font, size, color, maxWidth) {
  const words = safeText(text).split(/\s+/); let line = ''; let cursor = y;
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > maxWidth && line) { page.drawText(line, { x, y: cursor, size, font, color }); line = word; cursor -= size + 5; } else line = next;
  }
  if (line) page.drawText(line, { x, y: cursor, size, font, color });
  return cursor - size - 12;
}

export async function generateResumePdfReport(userId, analysis) {
  const startedAt = Date.now();
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica); const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const navy = rgb(0.05, 0.07, 0.14); const cyan = rgb(0.12, 0.75, 0.82); const muted = rgb(0.35, 0.39, 0.48);
  let page = document.addPage([595, 842]); let y = 770;
  page.drawRectangle({ x: 0, y: 760, width: 595, height: 82, color: navy });
  page.drawText('CareerIQ', { x: 42, y: 795, size: 22, font: bold, color: rgb(1, 1, 1) });
  page.drawText('Resume Analysis Report', { x: 42, y: 775, size: 11, font: regular, color: cyan }); y = 720;
  const extraction = analysis.extraction || {};
  page.drawText(safeText(extraction.candidate_name || 'Candidate'), { x: 42, y, size: 24, font: bold, color: navy }); y -= 38;
  page.drawText(`ATS Score: ${analysis.ats_score?.overall_score ?? 0}/100`, { x: 42, y, size: 16, font: bold, color: cyan }); y -= 35;
  y = drawWrapped(page, extraction.summary || 'No summary detected.', 42, y, regular, 11, muted, 510);
  const sections = [['Skills', (extraction.skills || []).join(', ')], ['Projects', (extraction.projects || []).map((item) => typeof item === 'string' ? item : item.title || item.name).join(' | ')], ['Experience', (extraction.experience || []).map((item) => typeof item === 'string' ? item : item.role || item.title).join(' | ')], ['Strengths', (analysis.strength_analyzer?.top_strengths || extraction.strengths || []).join(' | ')], ['Weaknesses', (analysis.strength_analyzer?.top_weaknesses || extraction.weaknesses || []).join(' | ')], ['Missing Keywords', (analysis.improvements?.missing_keywords || extraction.ats_keywords_missing || []).join(', ')], ['Recommendations', (analysis.improvements?.improvements || []).concat(analysis.improvements?.project_suggestions || []).join(' | ')]];
  for (const [title, content] of sections) { if (y < 85) { page = document.addPage([595, 842]); y = 780; } page.drawText(title, { x: 42, y, size: 14, font: bold, color: navy }); y -= 21; y = drawWrapped(page, content || 'None detected.', 42, y, regular, 10, muted, 510); y -= 8; }
  const bytes = await document.save(); const filename = `vision-report-${analysis.id || Date.now()}.pdf`; const storagePath = `${userId}/${filename}`;
  const uploadedPath = await uploadToBucket(buckets.reports, userId, filename, Buffer.from(bytes), 'application/pdf');
  return { storagePath: uploadedPath, url: await getSignedUrl(buckets.reports, uploadedPath, 86400), bytes: bytes.length, processingTime: Date.now() - startedAt };
}