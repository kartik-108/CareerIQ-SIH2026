import { Router } from 'express';
import * as interviewController from '../controllers/interview.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { aiLimiter } from '../middlewares/rateLimit.middleware.js';
import { startInterviewSchema, studioStartInterviewSchema, submitAnswerSchema } from '../validators/interview.validator.js';

const router = Router();

router.post('/start', requireAuth, aiLimiter, validate(startInterviewSchema), interviewController.start);
router.post('/session', requireAuth, aiLimiter, validate(studioStartInterviewSchema), interviewController.startStudio);
router.get('/:sessionId/next-question', requireAuth, aiLimiter, interviewController.getNextQuestion);
router.post('/:sessionId/answer', requireAuth, aiLimiter, validate(submitAnswerSchema), interviewController.submitAnswer);
router.post('/:sessionId/end', requireAuth, aiLimiter, interviewController.endInterview);
router.get('/status', requireAuth, interviewController.status);
router.get('/history', requireAuth, interviewController.history);
router.get('/report/:id', requireAuth, interviewController.report);
router.post('/question', requireAuth, aiLimiter, interviewController.studioQuestion);
router.post('/answer', requireAuth, aiLimiter, interviewController.studioAnswer);
router.post('/end', requireAuth, aiLimiter, interviewController.studioEnd);

export default router;
