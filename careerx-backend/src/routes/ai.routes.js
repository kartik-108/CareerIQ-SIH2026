import { Router } from 'express';
import { getHealth } from '../services/ai/health.js';

const router = Router();

router.get('/health', async (req, res, next) => {
  try {
    res.status(200).json(await getHealth());
  } catch (error) {
    next(error);
  }
});

export default router;
