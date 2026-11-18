import { z } from 'zod';

export const skillGapSchema = z.object({
  body: z.object({
    resume_id: z.string().uuid().optional(),
    target_role: z.string().min(2),
    current_skills: z.array(z.string()).optional(),
  }),
});
