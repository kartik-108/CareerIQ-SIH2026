import { Router } from 'express';
import * as roadmapController from '../controllers/roadmap.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { aiLimiter } from '../middlewares/rateLimit.middleware.js';
import { generateRoadmapSchema, updateRoadmapProgressSchema } from '../validators/roadmap.validator.js';

const router = Router();

router.post('/generate', requireAuth, aiLimiter, validate(generateRoadmapSchema), roadmapController.generate);
router.get('/', requireAuth, roadmapController.list);
router.get('/:id', requireAuth, roadmapController.getById);
router.patch('/:id/progress', requireAuth, validate(updateRoadmapProgressSchema), roadmapController.updateProgress);

export default router;
