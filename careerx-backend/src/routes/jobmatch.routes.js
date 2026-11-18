import { Router } from 'express';
import * as jobMatchController from '../controllers/jobmatch.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { aiLimiter } from '../middlewares/rateLimit.middleware.js';
import { jobMatchSchema } from '../validators/jobmatch.validator.js';

const router = Router();

router.post('/', requireAuth, aiLimiter, validate(jobMatchSchema), jobMatchController.match);

export default router;
