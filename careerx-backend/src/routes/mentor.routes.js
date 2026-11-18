import { Router } from "express";

import * as controller from "../controllers/mentor.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { aiLimiter } from "../middlewares/rateLimit.middleware.js";
import { uploadCareerDocument } from "../middlewares/upload.middleware.js";

const router = Router();

router.use(requireAuth);

router.post("/chat", aiLimiter, controller.chat);

router.get("/status", controller.status);

router.get("/conversations", controller.history);

router.get("/conversation/:id", controller.conversation);

router.patch("/conversation/:id", controller.rename);

router.delete("/conversation/:id", controller.removeConversation);

router.get("/documents", controller.documents);

router.post("/documents", uploadCareerDocument, controller.upload);

router.delete("/documents/:id", controller.removeDocument);

export default router;