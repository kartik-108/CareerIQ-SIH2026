export const SKILLGAP_PROMPT_VERSION = 'v1';

export function buildSkillGapPrompt({ resumeSkills, targetRole, marketSkills }) {
  return `
You are a career-skills analyst. Compare a candidate's current skills against what the job market
demands for a target role, and produce a prioritized learning plan.

CANDIDATE CURRENT SKILLS:
${JSON.stringify(resumeSkills)}

TARGET ROLE:
${targetRole}

IN-DEMAND MARKET SKILLS FOR THIS ROLE:
${JSON.stringify(marketSkills)}

Return a JSON object with EXACTLY this shape:
{
  "match_score": number (0-100),
  "missing_skills": string[],
  "priority_skills": [{ "skill": string, "priority": "high"|"medium"|"low", "reason": string }],
  "learning_sequence": [{ "order": number, "skill": string, "estimated_days": number }],
  "estimated_completion_weeks": number,
  "resources": [{ "skill": string, "resource_title": string, "resource_type": "course"|"article"|"project"|"documentation", "url_hint": string }]
}

Rules:
- Order "learning_sequence" so foundational skills come before advanced/dependent ones.
- "estimated_completion_weeks" should assume ~10-15 focused hours per week.
- Do not fabricate real URLs; use "url_hint" as a descriptive search phrase instead (e.g. "freeCodeCamp Node.js course").
`.trim();
}
