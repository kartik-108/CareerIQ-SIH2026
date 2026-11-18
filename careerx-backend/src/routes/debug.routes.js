import { Router } from 'express';
import { env } from '../config/env.js';
import * as debugController from '../controllers/debug.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';

const router = Router();

router.get('/vector-status', (req, res, next) => {
  if (env.NODE_ENV !== 'development') return res.sendStatus(404);
  next();
}, requireAuth, debugController.vectorStatus);

export default router;