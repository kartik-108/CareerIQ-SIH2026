import { Router } from 'express';
import * as skillGapController from '../controllers/skillgap.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { aiLimiter } from '../middlewares/rateLimit.middleware.js';
import { skillGapSchema } from '../validators/skillgap.validator.js';

const router = Router();

router.post('/analyze', requireAuth, aiLimiter, validate(skillGapSchema), skillGapController.analyze);

export default router;
