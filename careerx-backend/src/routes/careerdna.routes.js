import { Router } from 'express';
import * as careerDnaController from '../controllers/careerdna.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';
import { aiLimiter } from '../middlewares/rateLimit.middleware.js';

const router = Router();

router.post('/generate', requireAuth, aiLimiter, careerDnaController.generate);
router.get('/latest', requireAuth, careerDnaController.getLatest);

export default router;
