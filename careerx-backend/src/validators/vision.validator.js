import { z } from 'zod';

export const visionIdSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
});

export const cameraFrameSchema = z.object({
  body: z.object({
    session_id: z.string().uuid(),
    timestamp: z.coerce.number().nonnegative().optional(),
    face_present: z.boolean().default(false),
    face_count: z.number().int().min(0).max(10).default(0),
    landmarks: z.array(z.object({ x: z.number(), y: z.number(), z: z.number().optional() })).max(468).default([]),
    analytics: z.object({
      eye_contact: z.number().min(0).max(100).optional(),
      gaze: z.enum(['camera', 'left', 'right', 'down', 'away']).optional(),
      blink: z.boolean().optional(), blink_rate: z.number().min(0).optional(), looking_away_duration: z.number().min(0).optional(),
      yaw: z.number().optional(), pitch: z.number().optional(), roll: z.number().optional(), posture: z.number().min(0).max(100).optional(),
      emotion: z.enum(['happy', 'neutral', 'confused', 'surprised', 'sad', 'angry', 'focused', 'nervous']).optional(),
      confidence: z.number().min(0).max(100).optional(), smile: z.number().min(0).max(100).optional(), speaking: z.boolean().optional(),
      face_distance: z.number().min(0).optional(), head_box: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }).optional(), low_light: z.boolean().optional(),
    }).default({}),
  }),
});

export const cameraStartSchema = z.object({ body: z.object({ interview_session_id: z.string().uuid().optional(), target_role: z.string().max(160).optional() }) });
export const cameraEndSchema = z.object({ body: z.object({ session_id: z.string().uuid(), answers: z.array(z.object({ question: z.string(), answer: z.string() })).default([]) }) });

// Model output is coerced rather than rejected: a string list may arrive as a string or as objects,
// and unknown keys are ignored. A single shape variation must not discard an otherwise useful result.
const toStringList = (value) => {
  const list = Array.isArray(value) ? value : (value == null || value === '' ? [] : [value]);
  return list
    .map((item) => {
      if (typeof item === 'string') return item.trim();
      if (item && typeof item === 'object') return String(item.name || item.title || item.skill || item.text || item.description || '').trim();
      return item == null ? '' : String(item).trim();
    })
    .filter(Boolean);
};
const stringList = z.preprocess(toStringList, z.array(z.string()).default([]));
const text = z.preprocess((value) => (value == null ? '' : String(value)), z.string().default(''));

export const visionExtractionSchema = z.object({
  candidate_name: text, email: text, phone: text, linkedin: text, github: text, portfolio: text,
  education: z.array(z.any()).default([]), skills: stringList, projects: z.array(z.any()).default([]), experience: z.array(z.any()).default([]), certifications: z.array(z.any()).default([]), achievements: z.array(z.any()).default([]), awards: z.array(z.any()).default([]), quantified_achievements: stringList, keywords: stringList, section_names: stringList,
  core_strengths: stringList,
  soft_skills: stringList, ats_keywords_found: stringList, ats_keywords_missing: stringList, strengths: stringList, weaknesses: stringList, improvements: stringList, summary: text,
});
