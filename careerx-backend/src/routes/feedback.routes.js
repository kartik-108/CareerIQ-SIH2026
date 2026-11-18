import { Router } from 'express';
import * as feedbackController from '../controllers/feedback.controller.js';
import { optionalAuth } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { feedbackSchema } from '../validators/feedback.validator.js';
import { feedbackLimiter } from '../middlewares/rateLimit.middleware.js';

const router = Router();

router.post('/', feedbackLimiter, optionalAuth, validate(feedbackSchema), feedbackController.submit);

export default router;
