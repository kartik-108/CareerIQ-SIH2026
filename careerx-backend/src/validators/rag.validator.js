import { z } from 'zod';

export const ragQuerySchema = z.object({
  body: z.object({
    question: z.string().min(3),
    category: z.string().optional(),
    role: z.string().optional(),
  }),
});
