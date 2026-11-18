export const ROADMAP_PROMPT_VERSION = 'v1';

export function buildRoadmapPrompt({ targetRole, currentSkills, missingSkills, weeks = 12 }) {
  return `
You are an AI career coach. Build a structured ${weeks}-week career readiness roadmap for a student
targeting the role: "${targetRole}".

CURRENT SKILLS: ${JSON.stringify(currentSkills)}
SKILLS TO ACQUIRE: ${JSON.stringify(missingSkills)}

Return a JSON object with EXACTLY this shape:
{
  "weekly_plan": [{ "week": number, "focus": string, "tasks": string[], "xp": number }],
  "monthly_plan": [{ "month": number, "theme": string, "goals": string[] }],
  "quarter_milestones": [{ "quarter": number, "milestone": string, "success_criteria": string[] }],
  "projects": [{ "title": string, "description": string, "skills_practiced": string[], "difficulty": "beginner"|"intermediate"|"advanced" }],
  "certifications": [{ "name": string, "provider_hint": string, "priority": "high"|"medium"|"low" }],
  "interview_goals": [{ "week": number, "goal": string }],
  "xp_map": { "total_xp": number, "levels": [{ "level": number, "xp_required": number, "title": string }] }
}

Rules:
- Weekly plan length must equal ${weeks}.
- Difficulty should ramp up gradually across weeks.
- xp values should be small per-task rewards that sum sensibly toward xp_map.total_xp.
`.trim();
}
