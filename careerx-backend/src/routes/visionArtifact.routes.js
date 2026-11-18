import { Router } from 'express';
import * as controller from '../controllers/visionArtifact.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';
import { uploadVisionArtifact } from '../middlewares/upload.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { visionIdSchema } from '../validators/vision.validator.js';

const router = Router();

router.post('/certificates/analyze', requireAuth, uploadVisionArtifact, controller.analyzeCertificate);
router.get('/certificates/history', requireAuth, controller.history('certificate'));
router.get('/certificates/history/:id', requireAuth, validate(visionIdSchema), controller.getById('certificate'));
router.delete('/certificates/history/:id', requireAuth, validate(visionIdSchema), controller.remove('certificate'));
router.get('/certificates/report/:id', requireAuth, validate(visionIdSchema), controller.report('certificate'));
router.post('/portfolio/analyze', requireAuth, uploadVisionArtifact, controller.analyzePortfolio);
router.get('/portfolio/history', requireAuth, controller.history('portfolio'));
router.get('/portfolio/history/:id', requireAuth, validate(visionIdSchema), controller.getById('portfolio'));
router.delete('/portfolio/history/:id', requireAuth, validate(visionIdSchema), controller.remove('portfolio'));
router.get('/portfolio/report/:id', requireAuth, validate(visionIdSchema), controller.report('portfolio'));

export default router;
