import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import pinoHttp from 'pino-http';

import { env } from './config/env.js';
import { logger, genReqId } from './config/logger.js';
import { apiLimiter } from './middlewares/rateLimit.middleware.js';
import { errorMiddleware, notFoundMiddleware } from './middlewares/error.middleware.js';
import healthRoutes from './routes/health.routes.js';
import aiRoutes from './routes/ai.routes.js';
import mentorRoutes from './routes/mentor.routes.js';
import apiRoutes from './routes/index.js';

const app = express();

// --- Security & core middleware ---
app.use(helmet());
const configuredOrigins = env.CORS_ALLOWED_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean);
const allowedOrigins = env.NODE_ENV === 'production'
  ? configuredOrigins
  : [...new Set([...configuredOrigins, 'http://127.0.0.1:5500', 'http://localhost:5500'])];
const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  credentials: true,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(compression({
  filter: (req, res) => {
    if (req.path === '/api/mentor/chat' || req.path === '/mentor/chat') return false;
    return compression.filter(req, res);
  },
}));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(pinoHttp({
  logger,
  genReqId,
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
    censor: '[REDACTED]',
  },
}));

// Health/readiness at root, unauthenticated, not rate-limited — used by
// Railway/Render/K8s liveness & readiness probes.
app.use('/', healthRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/mentor', mentorRoutes);
app.use(`${env.API_BASE_PATH}`, healthRoutes);

// --- Rate limiting (applies to everything under the API base path) ---
app.use(env.API_BASE_PATH, apiLimiter);

// --- API routes ---
app.use(env.API_BASE_PATH, apiRoutes);

// --- 404 + error handling (must be last) ---
app.use(notFoundMiddleware);
app.use(errorMiddleware);

export default app;
