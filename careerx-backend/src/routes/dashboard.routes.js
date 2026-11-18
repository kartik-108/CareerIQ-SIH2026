import { Router } from 'express';
import * as dashboardController from '../controllers/dashboard.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';

const router = Router();

router.get('/', requireAuth, dashboardController.getDashboard);
router.get('/analytics', requireAuth, dashboardController.getAnalytics);

export default router;
