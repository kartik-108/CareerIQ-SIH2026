import { generateJSON } from './ai/provider.js';
import { buildRoadmapPrompt } from '../prompts/roadmap.prompt.js';
import { cacheSet } from '../config/redis.js';
import { env } from '../config/env.js';
import * as roadmapRepo from '../repositories/roadmap.repository.js';
import { supabase } from '../config/supabase.js';

export async function generateRoadmap(userId, { target_role, weeks }) {
  // Pull the user's most recent skill-gap analysis, if any, to ground the roadmap.
  const { data: latestSkillAnalysis } = await supabase
    .from('skill_analysis')
    .select('missing_skills, learning_sequence')
    .eq('user_id', userId)
    .eq('target_role', target_role)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const currentSkills = []; // could be sourced from the latest resume analysis
  const missingSkills = latestSkillAnalysis?.missing_skills || [];

  const prompt = buildRoadmapPrompt({ targetRole: target_role, currentSkills, missingSkills, weeks });
  const result = await generateJSON(prompt);

  const roadmap = await roadmapRepo.createRoadmap({
    user_id: userId,
    target_role,
    weekly_plan: result.weekly_plan,
    monthly_plan: result.monthly_plan,
    quarter_milestones: result.quarter_milestones,
    projects: result.projects,
    certifications: result.certifications,
    interview_goals: result.interview_goals,
    xp_map: result.xp_map,
  });

  await cacheSet(`roadmap:${roadmap.id}`, roadmap, env.CACHE_TTL_ROADMAP);
  return roadmap;
}

export async function listRoadmaps(userId) {
  return roadmapRepo.listRoadmapsByUser(userId);
}

export async function getRoadmap(id, userId) {
  return roadmapRepo.findRoadmapById(id, userId);
}

export async function updateProgress(id, userId, progress) {
  return roadmapRepo.updateRoadmapProgress(id, userId, progress);
}
