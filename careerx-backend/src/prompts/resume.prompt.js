// Prompt: Resume Analysis
// Output schema is enforced downstream by validators/resume.validator.js
export const RESUME_ANALYSIS_PROMPT_VERSION = 'v1';

export function buildResumeAnalysisPrompt({ resumeText, targetRole }) {
  return `
You are a deterministic resume information extractor. Extract only facts supported by the resume.

Analyze the following resume${targetRole ? ` for the target role: "${targetRole}"` : ''}.

RESUME TEXT:
"""
${resumeText}
"""

Return a JSON object with EXACTLY this shape. Do not calculate or return any score, rating, ranking, or percentage:
{
  "candidate_name": string, "email": string, "phone": string, "linkedin": string, "github": string, "portfolio": string,
  "skills": string[], "soft_skills": string[], "keywords": string[],
  "ats_keywords_found": string[], "ats_keywords_missing": string[],
  "education": [{ "degree": string, "institution": string, "college": string, "gpa": string, "start_year": string, "end_year": string, "year": string }],
  "projects": [{ "title": string, "description": string, "technologies": string[], "metrics": string[], "github_url": string }],
  "experience": [{ "role": string, "company": string, "location": string, "duration": string, "dates": string, "highlights": string[], "metrics": string[] }],
  "certifications": [], "achievements": [], "strengths": [], "weaknesses": [], "improvements": [], "summary": string
}

Rules:
- Be specific and actionable in "improvements" (e.g. "Add measurable outcomes to Project X", not "improve projects").
- Treat each company and each project as a separate record. Include every role and project present in the source.
- Put an item in "projects" only when the resume explicitly presents it as a project. Companies, roles, business ventures, and products are not projects.
- For education, separate degree, institution/college, GPA or CGPA, and start/end years when present. Preserve an exact year range in "year".
- For experience, keep company, role, location, dates, and each resume bullet distinct. Copy quantified outcomes into both the relevant highlight and metrics array.
- For projects, extract the title, stack, description, quantified outcomes, and GitHub URL when present.
- Normalize common skill aliases to canonical names: NodeJS to Node.js, REST API to REST APIs, and OpenSearch to Elasticsearch.
- Only report a keyword as missing when it is not present in the resume. Do not invent a role-specific missing keyword list when no target role is supplied.
- If a section is not present in the resume (e.g. no experience), return an empty array.
- Do not invent information not present or reasonably inferable from the resume text.
`.trim();
}
