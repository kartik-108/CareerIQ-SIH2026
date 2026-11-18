import { NotFoundError, ValidationError } from '../utils/ApiError.js';
import { awardXP } from './achievement.service.js';
import { careerLabModel } from '../models/careerLabModel.js';
import { generateDna, generateRoadmap, generateSkillAnalysis } from './careerLabAi.service.js';

export const TARGET_ROLES = ['Frontend Developer', 'Backend Developer', 'Full Stack Developer', 'Data Scientist', 'AIML Engineer', 'UI UX Designer', 'DevOps Engineer', 'Android Developer'];
const CACHE_WINDOW_MS = 24 * 60 * 60 * 1000;
const number = (value, fallback = 0) => Math.max(0, Math.min(100, Number(value) || fallback));
const array = (value) => (Array.isArray(value) ? value : []);
const fresh = (value) => value && Date.now() - new Date(value.updated_at || 0).getTime() < CACHE_WINDOW_MS;

function roleOrThrow(role) {
  if (!TARGET_ROLES.includes(role)) throw new ValidationError('Select a supported target role');
  return role;
}

function normalizeSkills(raw, targetRole) {
  return { targetRole, matchScore: number(raw.matchScore), matchedSkills: array(raw.matchedSkills), missingSkills: array(raw.missingSkills), prioritySkills: array(raw.prioritySkills), radarScores: raw.radarScores || {}, learningSuggestions: array(raw.learningSuggestions) };
}

function normalizeRoadmap(raw, targetRole) {
  return { targetRole, progress: number(raw.progress), timeline: array(raw.timeline), weeklyGoals: array(raw.weeklyGoals), monthlyGoals: array(raw.monthlyGoals), quarterlyMilestones: array(raw.quarterlyMilestones), projects: array(raw.projects), certifications: array(raw.certifications) };
}

function normalizeDna(raw) {
  return { communication: number(raw.communication), leadership: number(raw.leadership), creativity: number(raw.creativity), problemSolving: number(raw.problemSolving ?? raw.problem_solving), technicalStrength: number(raw.technicalStrength ?? raw.technical_strength), learningStyle: raw.learningStyle || raw.learning_style || 'Not available', careerPersonality: raw.careerPersonality || raw.career_personality || 'Not available', growthOpportunities: array(raw.growthOpportunities || raw.growth_opportunities) };
}

async function requireResume(userId) {
  const context = await careerLabModel.getResumeContext(userId);
  if (!context) {
    const error = new NotFoundError('Please upload a resume first.');
    error.code = 'NO_RESUME';
    throw error;
  }
  return context;
}

export async function getStatus(userId) {
  const [skills, roadmap, dna] = await Promise.all([careerLabModel.getSkills(userId), careerLabModel.getRoadmap(userId), careerLabModel.getDna(userId)]);
  return { hasResume: Boolean(await careerLabModel.getResumeContext(userId)), skills: Boolean(skills), roadmap: Boolean(roadmap), dna: Boolean(dna), targetRoles: TARGET_ROLES };
}

export async function getSkills(userId) { return careerLabModel.getSkills(userId); }
export async function getRoadmap(userId) { return careerLabModel.getRoadmap(userId); }
export async function getDna(userId) { return careerLabModel.getDna(userId); }

export async function analyzeSkills(userId, targetRole) {
  roleOrThrow(targetRole);
  if (!userId) throw new ValidationError('Authenticated user is required');
  const existing = await careerLabModel.getSkills(userId);
  if (fresh(existing) && existing.target_role === targetRole) return existing;
  const context = await requireResume(userId);
  try {
    const result = normalizeSkills(await generateSkillAnalysis(context, targetRole), targetRole);
    return careerLabModel.upsertSkills({ user_id: userId, target_role: targetRole, match_score: result.matchScore, matched_skills: result.matchedSkills, missing_skills: result.missingSkills, priority_skills: result.prioritySkills, radar_scores: result.radarScores, learning_resources: result.learningSuggestions });
  } catch (error) {
    if (existing) return existing;
    throw new ValidationError(`Analysis failed: ${error.message || 'Unable to analyze resume'}`);
  }
}

export async function generateRoadmapForUser(userId, targetRole) {
  const skills = await careerLabModel.getSkills(userId);
  if (!skills) throw new NotFoundError('Analyze your skill gap before generating a roadmap.');
  roleOrThrow(targetRole || skills.target_role);
  const existing = await careerLabModel.getRoadmap(userId);
  if (fresh(existing) && existing.target_role === targetRole) return existing;
  const context = await requireResume(userId);
  try {
    const result = normalizeRoadmap(await generateRoadmap(context, targetRole || skills.target_role, skills), targetRole || skills.target_role);
    return careerLabModel.upsertRoadmap({ user_id: userId, target_role: result.targetRole, progress: result.progress, timeline: result.timeline, weekly_goals: result.weeklyGoals, monthly_goals: result.monthlyGoals, quarterly_milestones: result.quarterlyMilestones, weekly_plan: result.weeklyGoals, monthly_plan: result.monthlyGoals, quarter_milestones: result.quarterlyMilestones, projects: result.projects, certifications: result.certifications });
  } catch (error) {
    if (existing) return existing;
    throw error;
  }
}

export async function analyzeDna(userId) {
  const existing = await careerLabModel.getDna(userId);
  if (fresh(existing)) return existing;
  const context = await requireResume(userId);
  try {
    const result = normalizeDna(await generateDna(context, await careerLabModel.getDnaSignals(userId)));
    return careerLabModel.upsertDna({ user_id: userId, communication: result.communication, leadership: result.leadership, creativity: result.creativity, problem_solving: result.problemSolving, technical_strength_score: result.technicalStrength, learning_style: result.learningStyle, career_personality: result.careerPersonality, growth_opportunities: result.growthOpportunities });
  } catch (error) {
    if (existing) return existing;
    throw error;
  }
}

export async function updateRoadmap(userId, { weeklyGoals, monthlyGoals, projects, certifications, progress }) {
  const current = await careerLabModel.getRoadmap(userId);
  if (!current) throw new NotFoundError('Generate a roadmap before updating goals.');
  const nextWeekly = array(weeklyGoals).length ? weeklyGoals : current.weekly_goals || [];
  const nextMonthly = array(monthlyGoals).length ? monthlyGoals : current.monthly_goals || [];
  const nextProjects = array(projects).length ? projects : current.projects || [];
  const nextCertifications = array(certifications).length ? certifications : current.certifications || [];
  const completedBefore = [...array(current.weekly_goals), ...array(current.monthly_goals), ...array(current.projects), ...array(current.certifications)].filter((goal) => goal.status === 'completed' || goal.done).length;
  const completedAfter = [...nextWeekly, ...nextMonthly, ...nextProjects, ...nextCertifications].filter((goal) => goal.status === 'completed' || goal.done).length;
  const updated = await careerLabModel.upsertRoadmap({ user_id: userId, target_role: current.target_role, progress: number(progress, current.progress), timeline: current.timeline || [], weekly_goals: nextWeekly, monthly_goals: nextMonthly, quarterly_milestones: current.quarterly_milestones || [], weekly_plan: nextWeekly, monthly_plan: nextMonthly, quarter_milestones: current.quarterly_milestones || [], projects: nextProjects, certifications: nextCertifications });
  if (completedAfter > completedBefore) await awardXP(userId, (completedAfter - completedBefore) * 10);
  return updated;
}