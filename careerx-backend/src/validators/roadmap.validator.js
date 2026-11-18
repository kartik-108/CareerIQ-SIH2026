import { z } from 'zod';

export const generateRoadmapSchema = z.object({
  body: z.object({
    target_role: z.string().min(2),
    weeks: z.number().int().min(4).max(52).default(12),
  }),
});

export const updateRoadmapProgressSchema = z.object({
  body: z.object({
    progress: z.number().min(0).max(100),
  }),
  params: z.object({
    id: z.string().uuid(),
  }),
});
