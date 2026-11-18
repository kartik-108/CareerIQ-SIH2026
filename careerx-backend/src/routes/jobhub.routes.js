import { Router } from 'express';
import * as jobHubController from '../controllers/jobhub.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { jobHubQuerySchema } from '../validators/jobmatch.validator.js';

const router = Router();

router.get('/search', requireAuth, validate(jobHubQuerySchema), jobHubController.search);
router.get('/recommendations', requireAuth, jobHubController.recommendations);
router.post('/:jobId/bookmark', requireAuth, jobHubController.bookmark);
router.delete('/:jobId/bookmark', requireAuth, jobHubController.removeBookmark);
router.get('/bookmarks', requireAuth, jobHubController.listBookmarks);

export default router;
