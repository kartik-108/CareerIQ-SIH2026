import { supabase } from '../config/supabase.js';
import { logger } from '../config/logger.js';

// Fire-and-forget audit logging for authenticated write actions.
// Attach as: router.post('/x', requireAuth, logActivity('resume_upload'), controller)
export const logActivity = (action) => (req, res, next) => {
  res.on('finish', () => {
    if (res.statusCode >= 400) return;
    supabase
      .from('activity_logs')
      .insert({
        user_id: req.user?.id ?? null,
        action,
        metadata: { path: req.originalUrl, method: req.method },
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
      })
      .then(({ error }) => {
        if (error) logger.error({ err: error.message }, 'activity log insert failed');
      });
  });
  next();
};
