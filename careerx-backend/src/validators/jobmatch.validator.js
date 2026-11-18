import { z } from 'zod';

export const jobMatchSchema = z.object({
  body: z.object({
    resume_id: z.string().uuid().optional(),
    analysis_id: z.string().uuid().optional(),
    job_description: z.string().min(20),
    job_id: z.string().uuid().optional(),
  }).refine(({ resume_id, analysis_id }) => Boolean(resume_id || analysis_id), 'resume_id or analysis_id is required'),
});

export const jobHubQuerySchema = z.object({
  query: z.object({
    location: z.string().optional(),
    remote: z.coerce.boolean().optional(),
    min_salary: z.coerce.number().optional(),
    role: z.string().optional(),
    experience: z.string().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  }),
});
