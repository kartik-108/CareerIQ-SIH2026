import { ApiError } from '../utils/ApiError.js';
import { logger } from '../config/logger.js';
import { isProd } from '../config/env.js';

// Catches everything forwarded via next(err), including from asyncHandler.
// Must be registered LAST, after all routes.
export function errorMiddleware(err, req, res, next) { // eslint-disable-line no-unused-vars
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal server error';
  let details = err.details || null;

  // Known third-party error shapes we want to normalize.
  if (err.name === 'ZodError') {
    statusCode = 400;
    message = err.issues?.find((issue) => issue.message)?.message || 'Validation failed';
    details = err.flatten?.() ?? err.errors;
  } else if (err.code === '23505') {
    // Postgres unique_violation
    statusCode = 409;
    message = 'Resource already exists';
  } else if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Invalid or expired token';
  } else if (err.name === 'MulterError') {
    // multer file upload errors (file too large, unexpected field, etc.)
    statusCode = 400;
    message =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'File is too large.'
        : err.message || 'File upload failed';
  } else if (err.name === 'AIProviderError' || String(err.code || '').startsWith('OLLAMA_')) {
    statusCode = 502;
    message = err.message || 'Ollama AI provider failed';
    details = { provider: 'ollama', reason: err.code || 'OLLAMA_ERROR' };
  }

  const isOperational = err instanceof ApiError || statusCode < 500;

  logger.error(
    {
      requestId: req.id,
      path: req.path,
      method: req.method,
      statusCode,
      isOperational,
      err: isProd && !isOperational ? undefined : err.stack,
    },
    message
  );

  res.status(statusCode).json({
    success: false,
    ...(err.code ? { code: err.code } : {}),
    message: isProd && !isOperational ? 'Something went wrong' : message,
    ...(details ? { details } : {}),
  });
}

export function notFoundMiddleware(req, res) {
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.originalUrl} not found` });
}
