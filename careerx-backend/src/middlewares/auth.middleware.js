import { supabase } from '../config/supabase.js';
import { env } from '../config/env.js';
import { UnauthorizedError, ForbiddenError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// Development helper
const DEV_BYPASS = env.NODE_ENV === 'development' && env.ALLOW_DEV_AUTH_BYPASS;

export const requireAuth = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  // ==========================
  // DEV MODE (Thunder Client / Local Testing)
  // ==========================
  if (!token && DEV_BYPASS) {
    req.user = {
      id: process.env.DEV_USER_ID || '84c0e541-a01c-438d-9514-530000000000',
      email: 'dev@careeriq.ai',
      name: 'CareerIQ Developer',
      role: 'student',
    };

    return next();
  }

  // Production
  if (!token) throw new UnauthorizedError('Missing access token');

  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data?.user) {
    throw new UnauthorizedError('Invalid or expired access token');
  }

  req.user = toRequestUser(data.user);
  next();
});

export const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) throw new UnauthorizedError();

  if (!roles.includes(req.user.role)) {
    throw new ForbiddenError(`Requires one of roles: ${roles.join(', ')}`);
  }

  next();
};

export const optionalAuth = async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (token) {
    try {
      const { data, error } = await supabase.auth.getUser(token);

      if (!error && data?.user) {
        req.user = toRequestUser(data.user);
      }
    } catch {
      // ignore invalid token
    }
  }

  next();
};

function toRequestUser(user) {
  return {
    id: user.id,
    email: user.email,
    name:
      user.user_metadata?.full_name ||
      user.email?.split('@')[0] ||
      'CareerIQ User',
    role:
      user.app_metadata?.role ||
      'student',
  };
}