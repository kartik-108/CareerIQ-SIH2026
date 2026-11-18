import { Router } from 'express';
import * as notificationController from '../controllers/notification.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';

const router = Router();

router.get('/', requireAuth, notificationController.list);
router.patch('/:id/read', requireAuth, notificationController.markRead);

export default router;
