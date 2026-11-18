import { z } from 'zod';

export const registerSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    full_name: z.string().min(2).max(100),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(1),
  }),
});

export const updateProfileSchema = z.object({
  body: z.object({
    full_name: z.string().min(2).max(100).optional(),
    phone: z.string().optional(),
    college: z.string().optional(),
    degree: z.string().optional(),
    branch: z.string().optional(),
    graduation_year: z.number().int().optional(),
    target_role: z.string().optional(),
    bio: z.string().max(1000).optional(),
    location: z.string().optional(),
  }),
});

export const refreshTokenSchema = z.object({
  body: z.object({
    refresh_token: z.string().min(1),
  }),
});
