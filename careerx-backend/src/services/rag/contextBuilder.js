import { supabase } from "../../config/supabase.js";
import { searchRelevantChunks } from "./vectorSearch.js";
import { logger } from '../../config/logger.js';

const MAX_CONTEXT_CHARS = 12000;

async function latest(table, userId, columns, limit = 3) {
  const { data, error } = await supabase
    .from(table)
    .select(columns)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return [];
  return data || [];
}

export async function buildMentorContext(query, userId) {
  // --------- Fetch user data ----------
  const [profile, resumes, analyses, interviews, roadmaps] =
    await Promise.all([
      supabase
        .from("profiles")
        .select(
          "full_name,target_role,bio,college,degree,branch,graduation_year,location"
        )
        .eq("user_id", userId)
        .maybeSingle(),

      latest("resumes", userId, "id,original_filename,extracted_text,created_at", 1),

      latest(
        "vision_analyses",
        userId,
        "id,file_name,analysis_json,ats_score,created_at",
        3
      ),

      latest(
        "interviews",
        userId,
        "id,target_role,company_name,feedback,overall_score,created_at",
        3
      ),

      latest(
        "career_roadmaps",
        userId,
        "target_role,weekly_plan,monthly_plan,progress,created_at",
        1
      ),
    ]);

  // --------- RAG Search (Safe Mode) ----------
  let chunks = [];

  try {
    chunks = await searchRelevantChunks(query, userId, 8);
    logger.info({ userId, count: chunks.length }, '[RAG] mentor context retrieved');
  } catch (err) {
    logger.warn({ userId, err: err.stack }, '[RAG] mentor context search skipped');
    chunks = [];
  }

  // --------- Build Context ----------
  const sections = [
    ["PROFILE", profile.data || {}],
    ["RESUME", resumes],
    ["ATS_ANALYSES", analyses],
    ["INTERVIEW_REPORTS", interviews],
    ["ROADMAP", roadmaps],
    ["RAG_DOCUMENTS", chunks],
  ];

  let context = "";

  for (const [name, value] of sections) {
    const section = `\n### ${name}\n${JSON.stringify(value, null, 2)}\n`;

    if (context.length + section.length > MAX_CONTEXT_CHARS) break;

    context += section;
  }

  return {
    text: context,
    citations: chunks.map((chunk) => ({
      id: chunk.id,
      document_id: chunk.document_id,
      file_name: chunk.file_name || chunk.metadata?.file_name,
      page_number: chunk.page_number || null,
      title:
        chunk.file_name ||
        chunk.metadata?.title ||
        "Career Document",
      sourceType: chunk.mime_type || chunk.category || "knowledge-base",
      similarity: chunk.similarity,
    })),
    retrievalMode: chunks.retrievalMode || 'none',
    embeddingModel: process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text',
  };
}