import { Router } from 'express';
import * as ragController from '../controllers/rag.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { aiLimiter } from '../middlewares/rateLimit.middleware.js';
import { ragQuerySchema } from '../validators/rag.validator.js';

const router = Router();

router.post(
	'/ask',
	requireAuth,
	aiLimiter,
	validate(ragQuerySchema),
	ragController.ask
);

export default router;
