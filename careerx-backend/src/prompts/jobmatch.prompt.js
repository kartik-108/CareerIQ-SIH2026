export const JOBMATCH_PROMPT_VERSION = 'v1';

export function buildJobMatchPrompt({ resumeText, jobDescription }) {
  return `
You are a job-fit analyst. Compare the candidate resume against the job description.

RESUME: """
${resumeText}
"""

JOB DESCRIPTION: """
${jobDescription}
"""

Return a JSON object with EXACTLY this shape:
{
  "ats_compatibility_score": number (0-100),
  "resume_match_score": number (0-100),
  "keyword_match_score": number (0-100),
  "technical_skills_match": number (0-100),
  "soft_skills_match": number (0-100),
  "experience_match": number (0-100),
  "education_match": number (0-100),
  "projects_match": number (0-100),
  "certifications_match": number (0-100),
  "matching_keywords": string[],
  "missing_keywords": string[],
  "action_verb_suggestions": string[],
  "resume_strengths": string[],
  "resume_weaknesses": string[],
  "priority_improvements": string[],
  "summary_rewrite": string,
  "experience_rewrites": string[],
  "project_rewrites": string[],
  "recommended_certifications": string[],
  "match_percentage": number (0-100),
  "missing_skills": string[],
  "salary_estimate": { "min": number, "max": number, "currency": "INR", "confidence": "low"|"medium"|"high" },
  "recommended_projects": string[],
  "recommended_certifications": string[],
  "interview_probability": number (0-100)
}

Rules:
- Salary estimate should reflect the Indian market unless the job description clearly states otherwise.
- "interview_probability" reflects likelihood of getting an interview call, not of getting hired.
- Use only evidence present in the resume and job description. Do not invent employers, credentials, or metrics.
`.trim();
}
