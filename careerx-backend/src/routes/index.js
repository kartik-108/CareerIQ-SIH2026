import { Router } from 'express';

import healthRoutes from './health.routes.js';
import authRoutes from './auth.routes.js';
import resumeRoutes from './resume.routes.js';
import skillgapRoutes from './skillgap.routes.js';
import roadmapRoutes from './roadmap.routes.js';
import interviewRoutes from './interview.routes.js';
import careerdnaRoutes from './careerdna.routes.js';
import jobmatchRoutes from './jobmatch.routes.js';
import jobhubRoutes from './jobhub.routes.js';
import dashboardRoutes from './dashboard.routes.js';
import ragRoutes from './rag.routes.js';
import feedbackRoutes from './feedback.routes.js';
import notificationRoutes from './notification.routes.js';
import visionRoutes from './vision.routes.js';
import visionArtifactRoutes from './visionArtifact.routes.js';
import careerLabRoutes from './careerLabRoutes.js';
import aiRoutes from './ai.routes.js';
import mentorRoutes from './mentor.routes.js';
import debugRoutes from './debug.routes.js';

const router = Router();

// Health/readiness are mounted at root (no /api/v1 prefix) by app.js as well,
// but also exposed here for convenience behind the API base path.
router.use('/', healthRoutes);
router.use('/auth', authRoutes);
router.use('/resumes', resumeRoutes);
router.use('/skill-gap', skillgapRoutes);
router.use('/roadmaps', roadmapRoutes);
router.use('/interviews', interviewRoutes);
router.use('/interview', interviewRoutes);
router.use('/career-dna', careerdnaRoutes);
router.use('/job-match', jobmatchRoutes);
router.use('/jobs', jobhubRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/rag', ragRoutes);
router.use('/feedback', feedbackRoutes);
router.use('/notifications', notificationRoutes);
router.use('/vision', visionRoutes);
router.use('/vision', visionArtifactRoutes);
router.use('/career-lab', careerLabRoutes);
router.use('/ai', aiRoutes);
router.use('/mentor', mentorRoutes);
router.use('/debug', debugRoutes);

export default router;
