import { generateJSON } from './ai/provider.js';
import { logger } from '../config/logger.js';

const json = (value) => JSON.stringify(value || {}, null, 2);
const ROLE_SKILLS = {
  'Frontend Developer': ['HTML', 'CSS', 'JavaScript', 'React', 'TypeScript', 'Accessibility', 'Testing'],
  'Backend Developer': ['Node.js', 'JavaScript', 'REST APIs', 'SQL', 'PostgreSQL', 'Authentication', 'Testing'],
  'Full Stack Developer': ['HTML', 'CSS', 'JavaScript', 'React', 'Node.js', 'REST APIs', 'SQL', 'Testing'],
  'Data Scientist': ['Python', 'SQL', 'Statistics', 'Pandas', 'Machine Learning', 'Data Visualization'],
  'AIML Engineer': ['Python', 'Machine Learning', 'Deep Learning', 'SQL', 'APIs', 'MLOps'],
  'UI UX Designer': ['UX Research', 'Wireframing', 'Prototyping', 'Figma', 'Accessibility', 'Communication'],
  'DevOps Engineer': ['Linux', 'Git', 'Docker', 'Kubernetes', 'CI/CD', 'Cloud', 'Monitoring'],
  'Android Developer': ['Kotlin', 'Android SDK', 'Java', 'REST APIs', 'SQLite', 'Testing'],
};
const AXES = ['Frontend', 'Backend', 'Database', 'Cloud', 'DSA', 'DevOps', 'Soft Skills', 'AI/ML'];
const normalize = (value) => String(value || '').toLowerCase();
const resumeText = (context) => {
  const analysis = context?.analysis || {};
  const extraction = analysis.extraction || context?.parsedResume || {};
  return [context?.resume?.extracted_text, analysis.summary, extraction.summary, ...(analysis.technical_skills || []), ...(analysis.soft_skills || []), ...(extraction.skills || []), ...(extraction.soft_skills || []), ...(extraction.keywords || []), ...(extraction.projects || []), ...(extraction.education || []), ...(extraction.experience || [])].filter(Boolean).join(' ');
};
const hasSkill = (text, skill) => normalize(text).includes(normalize(skill));

function localSkillAnalysis(context, targetRole) {
  const text = resumeText(context);
  const required = ROLE_SKILLS[targetRole] || ROLE_SKILLS['Frontend Developer'];
  const matchedSkills = required.filter((skill) => hasSkill(text, skill)).map((name) => ({ name, level: 75 }));
  const missingSkills = required.filter((skill) => !hasSkill(text, skill)).map((name) => ({ name, importance: 'High', reason: `Common requirement for ${targetRole}`, estimatedWeeks: 2 }));
  const matched = new Set(matchedSkills.map((skill) => normalize(skill.name)));
  const radarScores = Object.fromEntries(AXES.map((axis) => {
    const axisSkills = { Frontend: ['html', 'css', 'javascript', 'react'], Backend: ['node', 'api', 'backend'], Database: ['sql', 'postgres', 'database'], Cloud: ['cloud', 'aws', 'azure'], DSA: ['algorithm', 'data structure', 'dsa'], DevOps: ['docker', 'kubernetes', 'ci/cd', 'linux'], 'Soft Skills': ['communication', 'leadership', 'team'], 'AI/ML': ['machine learning', 'python', 'ai', 'ml'] }[axis];
    const hits = axisSkills.filter((skill) => hasSkill(text, skill)).length;
    return [axis, Math.min(100, hits * 25 + (matched.size ? 10 : 0))];
  }));
  const matchScore = required.length ? Math.round((matchedSkills.length / required.length) * 100) : 0;
  return { matchScore, matchedSkills, missingSkills, prioritySkills: missingSkills.slice(0, 5).map((skill) => ({ name: skill.name, weeks: skill.estimatedWeeks, difficulty: 'Intermediate' })), radarScores, learningSuggestions: missingSkills.slice(0, 6).map((skill) => ({ title: `Build ${skill.name}`, provider: 'CareerIQ practice plan', duration: `${skill.estimatedWeeks} weeks`, type: 'Project' })), provider: 'local' };
}

function localRoadmap(context, targetRole, skills) {
  const missing = (skills?.missingSkills || skills?.missing_skills || []).slice(0, 6);
  return { progress: 0, currentLevel: (skills?.matchScore || 0) >= 70 ? 'Intermediate' : 'Beginner', estimatedCompletionWeeks: Math.max(4, missing.length * 2), timeline: [{ month: 'Month 1', title: 'Core foundations', completed: false }, { month: 'Month 2', title: `${targetRole} projects`, completed: false }], weeklyGoals: missing.slice(0, 4).map((skill) => ({ title: `Practice ${skill.name}`, status: 'pending', xp: 10 })), monthlyGoals: [{ title: `Ship one ${targetRole} portfolio project`, status: 'pending', xp: 50 }], quarterlyMilestones: [{ title: 'Demonstrate role-ready skills', progress: 0, targetDate: 'Within 12 weeks' }], projects: [{ title: `${targetRole} portfolio project`, difficulty: 'Intermediate', skills: missing.map((skill) => skill.name), duration: '4 weeks' }], certifications: [], provider: 'local' };
}

function localDna(context) {
  const text = resumeText(context);
  const technicalStrength = Math.min(100, 35 + (context?.analysis?.technical_skills?.length || 0) * 8);
  return { communication: hasSkill(text, 'communication') ? 75 : 60, leadership: hasSkill(text, 'leadership') ? 75 : 55, creativity: (context?.analysis?.projects?.length || 0) > 1 ? 75 : 60, problemSolving: 65, technicalStrength, learningStyle: 'Project-based learner', careerPersonality: technicalStrength >= 70 ? 'Builder and problem solver' : 'Curious developing technologist', growthOpportunities: [{ title: 'Strengthen role-specific depth', reason: 'Practice missing skills through a shipped project.' }], provider: 'local' };
}

export async function generateSkillAnalysis(context, targetRole) {
  try {
    const result = await generateJSON(`Analyze this resume for the target role "${targetRole}". Return JSON only with matchScore (0-100), matchedSkills [{name,level}], missingSkills [{name,importance,reason,estimatedWeeks}], prioritySkills [{name,weeks,difficulty}], radarScores {Frontend,Backend,Database,Cloud,DSA,DevOps,"Soft Skills","AI/ML"}, and learningSuggestions [{title,provider,duration,type}]. Base every claim on the resume. Resume analysis: ${json(context.analysis)}. Resume text: ${context.resume.extracted_text || 'Unavailable'}`, { feature: 'careerLabSkillAnalysis', temperature: 0.2, timeout: 15000 });
    return { ...result.data, provider: result.provider || 'ollama' };
  } catch (error) { logger.warn({ err: error.stack, targetRole }, '[CareerLab] AI unavailable; using local skill analysis'); return localSkillAnalysis(context, targetRole); }
}

export async function generateRoadmap(context, targetRole, skillAnalysis) {
  try {
    const result = await generateJSON(`Generate a personalized career roadmap for "${targetRole}" using this resume context and skill analysis. Return JSON only with progress (0-100), timeline [{month,title,completed}], weeklyGoals [{title,status,xp}], monthlyGoals [{title,status,xp}], quarterMilestones [{title,progress,targetDate}], projects [{title,difficulty,skills,duration}], and certifications [{title,provider,duration}]. Resume analysis: ${json(context.analysis)}. Skill analysis: ${json(skillAnalysis)}`, { feature: 'careerLabRoadmap', temperature: 0.35, timeout: 15000 });
    return { ...result.data, provider: result.provider || 'ollama' };
  } catch (error) { logger.warn({ err: error.stack, targetRole }, '[CareerLab] AI unavailable; using local roadmap'); return localRoadmap(context, targetRole, skillAnalysis); }
}

export async function generateDna(context, signals) {
  try {
    const result = await generateJSON(`Analyze this candidate's Career DNA from the resume, interview history, and activity signals. Return JSON only with communication, leadership, creativity, problemSolving, technicalStrength (0-100), learningStyle, careerPersonality, and growthOpportunities [{title,reason,activity}]. Resume analysis: ${json(context.analysis)}. Interview history: ${json(signals.interviews)}. Streak: ${json(signals.streak)}`, { feature: 'careerLabDna', temperature: 0.3, timeout: 15000 });
    return { ...result.data, provider: result.provider || 'ollama' };
  } catch (error) { logger.warn({ err: error.stack }, '[CareerLab] AI unavailable; using deterministic Career DNA'); return localDna(context); }
}
