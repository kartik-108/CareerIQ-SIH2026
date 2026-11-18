export const CAREERDNA_PROMPT_VERSION = 'v1';

export function buildCareerDNAPrompt({ resumeText, interviewHistory, roadmapProgress }) {
  return `
You are a career psychologist and skills analyst. Based on the signals below, construct a
"Career DNA" profile for this candidate.

RESUME TEXT (may be partial): """
${resumeText || 'N/A'}
"""

INTERVIEW HISTORY SUMMARY: ${JSON.stringify(interviewHistory || [])}
ROADMAP PROGRESS SUMMARY: ${JSON.stringify(roadmapProgress || {})}

Return a JSON object with EXACTLY this shape:
{
  "communication": number (0-100),
  "problem_solving": number (0-100),
  "creativity": number (0-100),
  "leadership": number (0-100),
  "learning_style": "visual"|"auditory"|"kinesthetic"|"reading_writing"|"mixed",
  "technical_strength": { "primary_stack": string[], "proficiency_notes": string },
  "career_personality": string,
  "risk_areas": string[],
  "growth_opportunities": string[]
}

Rules:
- Base every score on evidence in the inputs; if evidence is thin for a trait, default toward 50 and note it in risk_areas.
- "career_personality" should be a short descriptive label (e.g. "Analytical Builder", "Collaborative Communicator").
`.trim();
}
