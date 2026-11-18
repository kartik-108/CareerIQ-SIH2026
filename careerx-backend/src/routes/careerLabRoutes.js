import { Router } from 'express';
import * as controller from '../controllers/careerLabController.js';
import { requireAuth } from '../middlewares/auth.middleware.js';
import { aiLimiter } from '../middlewares/rateLimit.middleware.js';

const router = Router();
router.use(requireAuth);
router.get('/status', controller.status);
router.get('/skills', controller.skills);
router.post('/skills/analyze', aiLimiter, controller.analyzeSkills);
router.get('/roadmap', controller.roadmap);
router.post('/roadmap/generate', aiLimiter, controller.generateRoadmap);
router.patch('/roadmap', controller.updateRoadmap);
router.get('/dna', controller.dna);
router.post('/dna/analyze', aiLimiter, controller.analyzeDna);

export default router;