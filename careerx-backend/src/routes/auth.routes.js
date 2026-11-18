import { Router } from 'express';
import * as authController from '../controllers/auth.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { authLimiter } from '../middlewares/rateLimit.middleware.js';
import { registerSchema, loginSchema, updateProfileSchema, refreshTokenSchema } from '../validators/auth.validator.js';
import { uploadAvatar } from '../middlewares/upload.middleware.js';

const router = Router();

router.post('/register', authLimiter, validate(registerSchema), authController.register);
router.post('/login', authLimiter, validate(loginSchema), authController.login);
router.post('/refresh', authLimiter, validate(refreshTokenSchema), authController.refreshToken);
router.post('/logout', requireAuth, authController.logout);
router.get('/profile', requireAuth, authController.getProfile);
router.put('/profile', requireAuth, validate(updateProfileSchema), authController.updateProfile);
router.post('/avatar', requireAuth, uploadAvatar, authController.uploadAvatar);
router.delete('/account', requireAuth, authController.deleteAccount);

export default router;
