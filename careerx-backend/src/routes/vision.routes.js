import { Router } from 'express';
import * as visionController from '../controllers/vision.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';
import { uploadVisionResume } from '../middlewares/upload.middleware.js';
import { aiLimiter } from '../middlewares/rateLimit.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { cameraEndSchema, cameraFrameSchema, cameraStartSchema, visionIdSchema } from '../validators/vision.validator.js';

const router = Router();

router.post('/analyze', requireAuth, aiLimiter, uploadVisionResume, visionController.analyze);
router.get('/history', requireAuth, visionController.history);
router.get('/history/:id', requireAuth, validate(visionIdSchema), visionController.getById);
router.delete('/history/:id', requireAuth, validate(visionIdSchema), visionController.remove);
router.post('/interview/start-camera', requireAuth, aiLimiter, validate(cameraStartSchema), visionController.startCamera);
router.post('/interview/frame', requireAuth, validate(cameraFrameSchema), visionController.cameraFrame);
router.post('/interview/end', requireAuth, aiLimiter, validate(cameraEndSchema), visionController.endCamera);
router.get('/report/:id', requireAuth, validate(visionIdSchema), visionController.report);

export default router;
