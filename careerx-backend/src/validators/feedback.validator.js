import { z } from 'zod';

export const feedbackSchema = z.object({
  body: z.object({
    category: z.string().optional(),
    message: z.string().min(3).max(2000),
    rating: z.number().int().min(1).max(5).optional(),
  }),
});
