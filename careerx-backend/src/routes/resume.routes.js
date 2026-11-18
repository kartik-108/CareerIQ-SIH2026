import { Router } from 'express';
import * as resumeController from '../controllers/resume.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { uploadResume } from '../middlewares/upload.middleware.js';
import { aiLimiter } from '../middlewares/rateLimit.middleware.js';
import { logActivity } from '../middlewares/activityLogger.middleware.js';
import { analyzeResumeSchema } from '../validators/resume.validator.js';

const router = Router();

router.post('/upload', requireAuth, uploadResume, logActivity('resume_upload'), resumeController.upload);
router.post('/analyze', requireAuth, aiLimiter, validate(analyzeResumeSchema), logActivity('resume_analyze'), resumeController.analyze);
router.get('/', requireAuth, resumeController.list);
router.get('/:id/download-url', requireAuth, resumeController.downloadUrl);
router.get('/:id/analysis', requireAuth, resumeController.latestAnalysis);

export default router;
