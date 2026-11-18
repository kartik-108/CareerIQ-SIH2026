import { generateJSON } from './ai/provider.js';
import { buildSkillGapPrompt } from '../prompts/skillgap.prompt.js';
import { supabase } from '../config/supabase.js';
import { getLatestAnalysis } from './resume.service.js';

// In production, "market skills" would come from a live job-market feed;
// for now we ship a compact heuristic table covering common target roles
// and fall back to a generic full-stack skill set for unknown roles.
const MARKET_SKILLS_BY_ROLE = {
  'frontend developer': ['React', 'TypeScript', 'CSS', 'Testing (Jest/RTL)', 'Web Performance', 'Accessibility'],
  'backend developer': ['Node.js', 'REST API design', 'SQL', 'Docker', 'System Design', 'Authentication/Authorization'],
  'full stack developer': ['React', 'Node.js', 'SQL', 'REST/GraphQL APIs', 'Docker', 'CI/CD'],
  'data analyst': ['SQL', 'Python', 'Excel', 'Power BI/Tableau', 'Statistics', 'Data Cleaning'],
  'data scientist': ['Python', 'Pandas', 'Scikit-learn', 'SQL', 'Statistics', 'Machine Learning'],
  'devops engineer': ['Docker', 'Kubernetes', 'CI/CD', 'AWS/Azure/GCP', 'Terraform', 'Linux'],
  default: ['Git', 'Problem Solving', 'Communication', 'System Design Basics', 'Testing', 'Cloud Fundamentals'],
};

function getMarketSkills(targetRole) {
  const key = targetRole.trim().toLowerCase();
  return MARKET_SKILLS_BY_ROLE[key] || MARKET_SKILLS_BY_ROLE.default;
}

export async function analyzeSkillGap(userId, { resume_id, target_role, current_skills }) {
  let resumeSkills = current_skills || [];

  if (!resumeSkills.length && resume_id) {
    const analysis = await getLatestAnalysis(resume_id);
    if (analysis) resumeSkills = [...(analysis.technical_skills || []), ...(analysis.soft_skills || [])];
  }

  const marketSkills = getMarketSkills(target_role);
  const prompt = buildSkillGapPrompt({ resumeSkills, targetRole: target_role, marketSkills });
  const result = await generateJSON(prompt);

  const { data, error } = await supabase
    .from('skill_analysis')
    .insert({
      user_id: userId,
      resume_id: resume_id || null,
      target_role,
      match_score: result.match_score,
      missing_skills: result.missing_skills,
      priority_skills: result.priority_skills,
      learning_sequence: result.learning_sequence,
      estimated_weeks: result.estimated_completion_weeks,
      resources: result.resources,
    })
    .select('*')
    .single();

  if (error) throw error;
  return data;
}
