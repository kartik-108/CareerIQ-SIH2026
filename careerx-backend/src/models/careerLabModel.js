import { supabase } from '../config/supabase.js';
import { DatabaseError } from '../utils/ApiError.js';

async function readOne(table, userId) {
  const { data, error } = await supabase.from(table).select('*').eq('user_id', userId).maybeSingle();
  if (error) throw new DatabaseError(error.message);
  return data;
}

export const careerLabModel = {
  getSkills: (userId) => readOne('career_skill_analysis', userId),
  getRoadmap: (userId) => readOne('career_roadmaps', userId),
  getDna: (userId) => readOne('career_dna', userId),

  async upsertSkills(payload) {
    const { data, error } = await supabase.from('career_skill_analysis').upsert(payload, { onConflict: 'user_id' }).select('*').single();
    if (error) throw new DatabaseError(error.message);
    return data;
  },

  async upsertRoadmap(payload) {
    const { data, error } = await supabase.from('career_roadmaps').upsert(payload, { onConflict: 'user_id' }).select('*').single();
    if (error) throw new DatabaseError(error.message);
    return data;
  },

  async upsertDna(payload) {
    const { data, error } = await supabase.from('career_dna').upsert(payload, { onConflict: 'user_id' }).select('*').single();
    if (error) throw new DatabaseError(error.message);
    return data;
  },

  async getResumeContext(userId) {
    const { data: analysis, error: analysisError } = await supabase
      .from('resume_analysis')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (analysisError) throw new DatabaseError(analysisError.message);

    const { data: resume, error: resumeError } = await supabase
      .from('resumes')
      .select('id, extracted_text, original_filename, created_at')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (resumeError) throw new DatabaseError(resumeError.message);
    const { data: visionAnalysis, error: visionError } = await supabase
      .from('vision_analyses')
      .select('id, file_name, analysis_json, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (visionError && visionError.code !== 'PGRST205') throw new DatabaseError(visionError.message);
    if (!analysis && !resume?.extracted_text && !visionAnalysis) return null;
    const visionParsed = visionAnalysis?.analysis_json || {};
    const parsedResume = analysis || visionParsed.extraction || visionParsed;
    return {
      analysis: analysis || visionParsed,
      resume: resume || { id: visionAnalysis?.id, original_filename: visionAnalysis?.file_name, created_at: visionAnalysis?.created_at },
      parsedResume,
    };
  },

  async getDnaSignals(userId) {
    const [interviews, streak] = await Promise.all([
      supabase.from('interview_reports').select('overall_score, communication_score, confidence_score, technical_score, strengths, weaknesses').eq('user_id', userId).order('created_at', { ascending: false }).limit(5),
      supabase.from('streaks').select('current_streak, longest_streak').eq('user_id', userId).maybeSingle(),
    ]);
    if (interviews.error) throw new DatabaseError(interviews.error.message);
    if (streak.error) throw new DatabaseError(streak.error.message);
    return { interviews: interviews.data || [], streak: streak.data || {} };
  },
};