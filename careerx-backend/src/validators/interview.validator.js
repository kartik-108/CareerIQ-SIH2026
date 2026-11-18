import { z } from 'zod';

export const INTERVIEW_TYPES = ['Technical', 'HR', 'Behavioral', 'Mixed', 'Aptitude'];

const canonicalValue = (value, allowed) => {
  const normalized = String(value ?? '').trim().toLowerCase();
  return allowed.find((item) => item.toLowerCase() === normalized) || null;
};

const normalizeRole = (value) => {
  const words = String(value).trim().split(/([\s&\-/]+)/);
  const acronyms = new Set(['ai', 'aiml', 'api', 'aws', 'css', 'devops', 'html', 'ios', 'qa', 'sql', 'ui', 'ux', 'vr', 'xr']);
  return words.map((word) => {
    const lower = word.toLowerCase();
    if (acronyms.has(lower)) return lower.toUpperCase();
    return /^[\s&\-/]+$/.test(word) ? word : `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`;
  }).join('');
};

const optionalText = z.string().trim().optional();

export const studioStartInterviewSchema = z.object({
  body: z.object({
    interviewType: z.string().trim().min(1, 'Interview type is required'),
    targetRole: z.string().trim().min(2, 'Target role is required').max(100, 'Target role is too long'),
    difficulty: z.enum(['beginner', 'easy', 'medium', 'hard']).optional().default('easy'),
    resumeId: z.string().uuid().optional(),
    experience: z.string().trim().max(500).optional(),
  }).superRefine((value, context) => {
    if (!canonicalValue(value.interviewType, INTERVIEW_TYPES)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['interviewType'], message: `Unsupported interview type: ${value.interviewType}` });
  }).transform((value) => ({ ...value, _studioRequest: true })),
});

export const startInterviewSchema = z.object({
  body: z.object({
    interviewType: optionalText,
    interview_type: optionalText,
    targetRole: optionalText,
    target_role: optionalText,
    companyName: optionalText,
    company_name: optionalText,
    difficulty: z.enum(['beginner', 'easy', 'medium', 'hard']).optional().default('easy'),
    numberOfQuestions: z.number().int().min(1).max(10).optional(),
    number_of_questions: z.number().int().min(1).max(10).optional(),
  }).superRefine((value, context) => {
    const interviewType = value.interviewType ?? value.interview_type ?? 'Technical';
    const targetRole = value.targetRole ?? value.target_role;
    if (!canonicalValue(interviewType, INTERVIEW_TYPES)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['interviewType'], message: `Unsupported interview type: ${String(interviewType).trim()}` });
    if (!targetRole) context.addIssue({ code: z.ZodIssueCode.custom, path: ['targetRole'], message: 'Target role is required' });
    else if (targetRole.length < 2 || targetRole.length > 60) context.addIssue({ code: z.ZodIssueCode.custom, path: ['targetRole'], message: 'Target role must be between 2 and 60 characters' });
    else if (!/^[A-Za-z0-9 &\-/]+$/.test(targetRole)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['targetRole'], message: 'Target role may contain only letters, numbers, spaces, &, -, and /' });
  }).transform((value) => {
    const interviewType = canonicalValue(value.interviewType ?? value.interview_type ?? 'Technical', INTERVIEW_TYPES) || 'Technical';
    const targetRole = normalizeRole(value.targetRole ?? value.target_role ?? '');
    const companyName = value.companyName ?? value.company_name;
    const numberOfQuestions = value.numberOfQuestions ?? value.number_of_questions;
    return {
      ...value,
      interviewType,
      targetRole,
      interview_type: interviewType.toLowerCase(),
      target_role: targetRole,
      company_name: companyName,
      number_of_questions: numberOfQuestions,
      _studioRequest: value.interviewType !== undefined || value.targetRole !== undefined,
    };
  }),
});

export const submitAnswerSchema = z.object({
  body: z.object({
    question_id: z.string().uuid(),
    transcript: z.string().min(1),
    time_taken_seconds: z.number().int().optional(),
  }),
  params: z.object({
    sessionId: z.string().uuid(),
  }),
});
