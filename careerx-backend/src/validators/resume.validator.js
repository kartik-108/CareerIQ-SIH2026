import { z } from 'zod';

export const analyzeResumeSchema = z.object({
  body: z.object({
    resume_id: z.string().uuid(),
    target_role: z.string().optional(),
  }),
});

// Output-side schema used to sanity-check local AI JSON before persisting.
export const resumeAnalysisOutputSchema = z.object({
  overall_score: z.number().min(0).max(100),
  ats_score: z.number().min(0).max(100),
  grammar: z.object({ score: z.number(), issues: z.array(z.string()) }),
  technical_skills: z.array(z.string()),
  soft_skills: z.array(z.string()),
  missing_keywords: z.array(z.string()),
  strong_keywords: z.array(z.string()),
  education: z.array(z.record(z.any())),
  projects: z.array(z.record(z.any())),
  experience: z.array(z.record(z.any())),
  improvements: z.array(z.string()),
  summary: z.string(),
});
