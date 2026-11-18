import { generateJSON } from './ai/provider.js';
import { buildCareerDNAPrompt } from '../prompts/careerdna.prompt.js';
import { supabase } from '../config/supabase.js';

export async function generateCareerDNA(userId) {
  const { data: latestResume } = await supabase
    .from('resumes')
    .select('extracted_text')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: interviewReports } = await supabase
    .from('interview_reports')
    .select('overall_score, communication_score, confidence_score, technical_score, strengths, weaknesses')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(5);

  const { data: roadmaps } = await supabase
    .from('career_roadmaps')
    .select('target_role, progress, status')
    .eq('user_id', userId);

  const prompt = buildCareerDNAPrompt({
    resumeText: latestResume?.extracted_text,
    interviewHistory: interviewReports || [],
    roadmapProgress: roadmaps || {},
  });

  const result = await generateJSON(prompt);

  const { data, error } = await supabase
    .from('career_dna')
    .insert({
      user_id: userId,
      communication: result.communication,
      problem_solving: result.problem_solving,
      creativity: result.creativity,
      leadership: result.leadership,
      learning_style: result.learning_style,
      technical_strength: result.technical_strength,
      career_personality: result.career_personality,
      risk_areas: result.risk_areas,
      growth_opportunities: result.growth_opportunities,
      raw_ai_response: result,
    })
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

export async function getLatestCareerDNA(userId) {
  const { data, error } = await supabase
    .from('career_dna')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}
